import {
	moveValueByNormalisedDelta,
	normaliseCurveName,
	normalisedKeyboardStep,
	normalisedPositionToValue,
	valueToNormalisedPosition,
} from "./parameter-scale.js";
import {
	beginParameterGesture,
	clamp,
	editParameterGesture,
	endParameterGesture,
	formatValue,
	snap,
} from "./utils.js";

const EDITOR_SELECTOR = "input, textarea, select, [contenteditable]";
const TAP_MOVEMENT = 4;
const DOUBLE_CLICK_MS = 380;

function finite(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function setAttribute(element, name, value) {
	if (value === null) element.removeAttribute?.(name);
	else element.setAttribute?.(name, String(value));
}

function eventIsFromEditor(event, element) {
	const target = event.composedPath?.()[0] ?? event.target;
	return target !== element && Boolean(target?.closest?.(EDITOR_SELECTOR));
}

function parameterKind(value) {
	return ["continuous", "discrete", "trigger"].includes(value)
		? value
		: "continuous";
}

export function createValueControl(element, options = {}) {
	if (!element?.addEventListener || !element?.setAttribute) {
		throw new TypeError("createValueControl needs a semantic HTML element.");
	}

	const eventTarget = options.eventTarget ?? element;
	const pointerTarget =
		options.pointerTarget === undefined ? element : options.pointerTarget;
	const ownerDocument = element.ownerDocument ?? globalThis.document;
	const ownerWindow =
		ownerDocument?.defaultView ?? globalThis.window ?? globalThis;
	const originalAttributes = new Map(
		[
			"role",
			"tabindex",
			"aria-label",
			"aria-valuemin",
			"aria-valuemax",
			"aria-valuenow",
			"aria-valuetext",
			"aria-orientation",
			"aria-disabled",
		].map((name) => [name, element.getAttribute?.(name) ?? null]),
	);

	let disposed = false;
	let settling = false;
	let revision = 0;
	let focused = ownerDocument?.activeElement === element;
	let pointer = null;
	let lastClick = null;
	let draw = typeof options.draw === "function" ? options.draw : () => {};
	let valueFormatter =
		typeof options.formatValue === "function" ? options.formatValue : null;
	let valueText = options.text ?? "";
	let displayFractionDigits = options.displayFractionDigits ?? null;
	let minLabel = options.minLabel ?? "";
	let maxLabel = options.maxLabel ?? "";
	let role = options.role ?? "slider";
	let ariaLabel = options.ariaLabel ?? null;
	let editorOptions = options.editor ?? null;
	let editorState = null;
	let suppressDoubleClickUntil = 0;
	let rawValue = 0;
	let rawEmpty = Boolean(options.allowEmpty && options.value === null);
	let rawDisabled = Boolean(options.disabled ?? options.readOnly);
	let orientation =
		options.orientation === "horizontal" ||
		(options.orientation === undefined && options.drag?.axis === "x")
			? "horizontal"
			: "vertical";
	let drag = {
		axis: options.drag?.axis === "x" ? "x" : "y",
		mode: options.drag?.mode === "position" ? "position" : "relative",
		distance: Math.max(1, finite(options.drag?.distance, 180)),
		fineScale: Math.max(0, finite(options.drag?.fineScale, 0.1)),
		scale: Math.max(0, finite(options.drag?.scale, 1)),
		pointerLock: Boolean(options.drag?.pointerLock),
	};

	const control = {
		element,
		eventTarget,
		pointerTarget,
		parameterID: String(options.parameterID ?? ""),
		parameterKind: parameterKind(options.parameterKind ?? options.kind),
		parameterValues: null,
		allowEmpty: Boolean(options.allowEmpty),
		placeholder: String(options.placeholder ?? ""),
		keyboardMode: options.keyboardMode === "value" ? "value" : "normalised",
		get empty() {
			return rawEmpty;
		},
		get editing() {
			return Boolean(editorState);
		},
		name: String(
			options.name ?? options.label ?? options.parameterID ?? "Parameter",
		),
		label: String(
			options.label ?? options.name ?? options.parameterID ?? "Parameter",
		),
		min: finite(options.min, 0),
		max: finite(options.max, 1),
		mid: options.mid == null ? null : finite(options.mid, null),
		curve: normaliseCurveName(options.curve),
		shape:
			options.shape == null
				? null
				: Math.max(Number.EPSILON, finite(options.shape, 1)),
		positionStep:
			options.positionStep == null
				? null
				: Math.max(0, finite(options.positionStep, 0)),
		step: Math.max(0, finite(options.step, 0)),
		unit: String(options.unit ?? ""),
		resetValue: finite(
			options.resetValue ?? options.defaultValue ?? options.value,
			(finite(options.min, 0) + finite(options.max, 1)) / 2,
		),
		setValue(nextValue, shouldEmit = false, source = "external") {
			if (disposed || (shouldEmit && (control.disabled || settling))) return;
			if (!shouldEmit && editorState) finishEditor(false);
			const isEmpty =
				control.allowEmpty &&
				(nextValue === null || nextValue === undefined || nextValue === "");
			if (!isEmpty) {
				const numericValue = Number(nextValue);
				if (!Number.isFinite(numericValue)) return;
			}
			const value = isEmpty ? null : normaliseValue(Number(nextValue));
			if (value === control.value && rawEmpty === isEmpty) return;
			const editRevision = revision;
			if (shouldEmit) {
				beginParameterGesture(eventAdapter, control.value, { source });
				if (disposed || settling || revision !== editRevision) return;
			}
			rawEmpty = isEmpty;
			if (!isEmpty) rawValue = value;
			if (shouldEmit && pointer && !isEmpty) pointer.lastAppliedValue = value;
			refresh();
			if (shouldEmit && !disposed && !settling && revision === editRevision)
				editParameterGesture(eventAdapter, value, { source });
		},

		configure(next = {}) {
			if (disposed || settling) return control;
			const interactionChanged = configurationChangesInteraction(next);
			const valueChanged = next.value !== undefined || next.empty === true;
			if (interactionChanged) {
				settling = true;
				revision += 1;
				finishEditor(false);
				cancelPointer();
				if (eventAdapter._parameterGestureActive) {
					endParameterGesture(eventAdapter, control.value, { cancelled: true });
				}
			}

			if (next.parameterID !== undefined)
				control.parameterID = String(next.parameterID);
			if (next.parameterKind !== undefined || next.kind !== undefined) {
				control.parameterKind = parameterKind(next.parameterKind ?? next.kind);
			}
			if (next.name !== undefined) control.name = String(next.name);
			if (next.label !== undefined || next.name !== undefined) {
				control.label = String(next.label ?? next.name);
			}
			if (next.min !== undefined) control.min = finite(next.min, control.min);
			if (next.max !== undefined) control.max = finite(next.max, control.max);
			if (control.min > control.max)
				[control.min, control.max] = [control.max, control.min];
			if (next.mid !== undefined)
				control.mid = next.mid == null ? null : finite(next.mid, control.mid);
			if (next.curve !== undefined)
				control.curve = normaliseCurveName(next.curve);
			if (next.shape !== undefined) {
				control.shape =
					next.shape == null
						? null
						: Math.max(Number.EPSILON, finite(next.shape, control.shape ?? 1));
			}
			if (next.positionStep !== undefined) {
				control.positionStep =
					next.positionStep == null
						? null
						: Math.max(0, finite(next.positionStep, control.positionStep ?? 0));
			}
			if (next.step !== undefined)
				control.step = Math.max(0, finite(next.step, control.step));
			if (next.unit !== undefined) control.unit = String(next.unit);
			if (next.resetValue !== undefined || next.defaultValue !== undefined) {
				control.resetValue = finite(
					next.resetValue ?? next.defaultValue,
					control.resetValue,
				);
			}
			if (next.disabled !== undefined || next.readOnly !== undefined) {
				rawDisabled = Boolean(next.disabled ?? next.readOnly);
			}
			if (next.allowEmpty !== undefined) {
				control.allowEmpty = Boolean(next.allowEmpty);
				if (!control.allowEmpty && rawEmpty)
					control.setValue(control.min, false);
			}
			if (next.placeholder !== undefined)
				control.placeholder = String(next.placeholder ?? "");
			if (next.orientation !== undefined) {
				orientation =
					next.orientation === "horizontal" ? "horizontal" : "vertical";
			}
			if (next.drag) {
				drag = {
					axis:
						next.drag.axis === "x"
							? "x"
							: next.drag.axis === "y"
								? "y"
								: drag.axis,
					mode:
						next.drag.mode === "position" || next.drag.mode === "relative"
							? next.drag.mode
							: drag.mode,
					distance: Math.max(1, finite(next.drag.distance, drag.distance)),
					fineScale: Math.max(0, finite(next.drag.fineScale, drag.fineScale)),
					scale: Math.max(0, finite(next.drag.scale, drag.scale)),
					pointerLock:
						next.drag.pointerLock === undefined
							? drag.pointerLock
							: Boolean(next.drag.pointerLock),
				};
				if (next.orientation === undefined && next.drag.axis !== undefined) {
					orientation = drag.axis === "x" ? "horizontal" : "vertical";
				}
			}
			if (next.draw !== undefined)
				draw = typeof next.draw === "function" ? next.draw : () => {};
			if (next.formatValue !== undefined) {
				valueFormatter =
					typeof next.formatValue === "function" ? next.formatValue : null;
			}
			if (next.text !== undefined) valueText = next.text;
			if (next.displayFractionDigits !== undefined)
				displayFractionDigits = next.displayFractionDigits;
			if (next.minLabel !== undefined) minLabel = String(next.minLabel);
			if (next.maxLabel !== undefined) maxLabel = String(next.maxLabel);
			if (next.role !== undefined) role = String(next.role);
			if (next.ariaLabel !== undefined) ariaLabel = next.ariaLabel;
			if (next.editor !== undefined) {
				editorOptions?.target?.removeEventListener?.(
					"click",
					handleEditorClick,
				);
				editorOptions = next.editor;
				if (editorOptions?.triggers?.click)
					editorOptions.target?.addEventListener?.("click", handleEditorClick);
			}
			if (next.keyboardMode !== undefined)
				control.keyboardMode =
					next.keyboardMode === "value" ? "value" : "normalised";

			control.resetValue = normaliseValue(control.resetValue);
			if (valueChanged && !interactionChanged && editorState)
				finishEditor(false);
			if (interactionChanged || valueChanged)
				control.setValue(
					next.empty === true
						? null
						: next.value === undefined
							? control.value
							: next.value,
					false,
					"configure",
				);
			if (interactionChanged) settling = false;
			refresh();
			return control;
		},

		beginGesture(source = "control") {
			if (!disposed && !settling && !control.disabled)
				beginParameterGesture(eventAdapter, control.value, { source });
		},

		editValue(nextValue, source = "control") {
			if (!disposed && !settling && !control.disabled) {
				control.beginGesture(source);
				control.setValue(nextValue, true, source);
			}
		},

		beginEdit(initialValue, selectValue = true, gestureAlreadyBegun = false) {
			return beginEditor(initialValue, selectValue, gestureAlreadyBegun);
		},

		finishEdit(commit = true, restoreFocus = false) {
			finishEditor(commit, restoreFocus);
		},

		endGesture(cancelled = false, source = "control") {
			if (!disposed)
				endParameterGesture(eventAdapter, control.value, { cancelled, source });
		},

		reset(source = "control") {
			if (disposed || settling || control.disabled) return;
			control.beginGesture(source);
			control.editValue(control.resetValue, source);
			control.endGesture(false, source);
		},

		startPointerDrag(event) {
			if (
				disposed ||
				settling ||
				control.disabled ||
				editorState ||
				pointer ||
				(event.button !== undefined && event.button !== 0)
			) {
				return false;
			}

			event.preventDefault?.();
			element.focus?.({ preventScroll: true });
			const pointerID = event.pointerId;
			const x = finite(event.clientX, 0);
			const y = finite(event.clientY, 0);
			const now = performance.now();
			const fineCandidate =
				lastClick &&
				now - lastClick.time < DOUBLE_CLICK_MS &&
				Math.hypot(x - lastClick.x, y - lastClick.y) <= TAP_MOVEMENT;
			const activeTarget =
				pointerTarget ?? event.currentTarget ?? event.target ?? element;
			pointer = {
				pointerID,
				target: activeTarget,
				startX: x,
				startY: y,
				lastX: x,
				lastY: y,
				moved: false,
				fineCandidate,
				relative: drag.mode === "relative" || Boolean(event.shiftKey),
				locked: false,
				rawPosition:
					control.empty || control.value === null
						? 0
						: valueToNormalisedPosition(control.value, scaleOptions()),
				lastAppliedValue: control.value ?? control.min,
				pointerType: event.pointerType,
			};
			const gesture = pointer;
			const gestureRevision = revision;
			try {
				activeTarget?.setPointerCapture?.(pointerID);
			} catch {
				// Synthetic events and a lost native pointer cannot be captured.
			}
			addPointerListeners();
			control.beginGesture();
			if (
				disposed ||
				settling ||
				pointer !== gesture ||
				revision !== gestureRevision
			)
				return false;
			refresh();

			if (drag.mode === "position" && !fineCandidate && !event.shiftKey) {
				editFromPosition(event);
			}
			if (
				disposed ||
				settling ||
				pointer !== gesture ||
				revision !== gestureRevision
			)
				return false;
			if (drag.pointerLock) requestPointerLock();
			return true;
		},

		dispose() {
			if (disposed || settling) return;
			settling = true;
			revision += 1;
			finishEditor(false);
			cancelPointer();
			if (eventAdapter._parameterGestureActive) {
				endParameterGesture(eventAdapter, control.value, { cancelled: true });
			}
			disposed = true;
			element.removeEventListener("keydown", handleKey);
			element.removeEventListener("focus", handleFocus);
			element.removeEventListener("blur", handleFocus);
			editorOptions?.target?.removeEventListener?.("click", handleEditorClick);
			pointerTarget?.removeEventListener?.(
				"pointerdown",
				control.startPointerDrag,
			);
			pointerTarget?.removeEventListener?.("dblclick", handleDoubleClick);
			for (const [name, value] of originalAttributes)
				setAttribute(element, name, value);
			settling = false;
		},
	};
	Object.defineProperty(control, "value", {
		enumerable: true,
		get: () => (rawEmpty ? null : rawValue),
		set: (value) => control.setValue(value, false),
	});
	Object.defineProperty(control, "disabled", {
		enumerable: true,
		get: () => rawDisabled,
		set: (value) => control.configure({ disabled: value }),
	});
	Object.defineProperty(control, "readOnly", {
		enumerable: true,
		get: () => rawDisabled,
		set: (value) => control.configure({ readOnly: value }),
	});

	const eventAdapter = {
		get parameterID() {
			return control.parameterID;
		},
		get parameterKind() {
			return control.parameterKind;
		},
		get value() {
			return control.value;
		},
		setValue: control.setValue,
		dispatchEvent: (event) => eventTarget.dispatchEvent(event),
	};

	function scaleOptions() {
		return {
			min: control.min,
			max: control.max,
			mid: control.mid,
			curve: control.curve,
			shape: control.shape,
		};
	}

	function normaliseValue(value) {
		const clamped = clamp(value, control.min, control.max);
		if (!control.step) return clamped;
		const stepCount = (control.max - control.min) / control.step;
		const lastStep = Math.floor(
			stepCount + Number.EPSILON * Math.max(1, Math.abs(stepCount)) * 4,
		);
		return clamp(
			control.min + snap(clamped - control.min, control.step),
			control.min,
			Math.min(control.max, control.min + lastStep * control.step),
		);
	}

	function formattedValue() {
		if (control.empty) return control.placeholder || "empty";
		return valueFormatter
			? String(valueFormatter(control.value, control))
			: formatValue(
					control.value,
					control.step,
					control.unit,
					valueText,
					displayFractionDigits,
					{
						min: control.min,
						max: control.max,
						minLabel,
						maxLabel,
					},
				);
	}

	function refresh() {
		if (disposed) return;
		const text = formattedValue();
		element.tabIndex = control.disabled ? -1 : 0;
		setAttribute(element, "role", role);
		setAttribute(element, "aria-label", ariaLabel ?? control.label);
		setAttribute(element, "aria-valuemin", control.min);
		setAttribute(element, "aria-valuemax", control.max);
		setAttribute(
			element,
			"aria-valuenow",
			control.empty ? null : control.value,
		);
		setAttribute(element, "aria-valuetext", text);
		setAttribute(element, "aria-orientation", orientation);
		setAttribute(element, "aria-disabled", control.disabled ? "true" : "false");
		draw({
			value: control.value,
			position: control.empty
				? 0
				: valueToNormalisedPosition(control.value, scaleOptions()),
			valueText: text,
			focused,
			dragging: Boolean(pointer),
			disabled: control.disabled,
		});
	}

	function handleFocus(event) {
		focused = event.type === "focus";
		refresh();
	}

	function handleKey(event) {
		if (disposed || control.disabled || eventIsFromEditor(event, element))
			return;
		if (editorState) return;
		const editor = editorOptions;
		if (
			editor?.triggers?.keydown &&
			(!editor.enabled || editor.enabled(control))
		) {
			if (
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				(event.key === "Enter" || /^[0-9.+-]$/u.test(event.key))
			) {
				event.preventDefault?.();
				beginEditor(
					event.key === "Enter" ? undefined : event.key,
					event.key === "Enter",
					false,
				);
				return;
			}
		}
		if (event.key === "Escape" && pointer) {
			event.preventDefault();
			cancelPointer();
			return;
		}
		if (pointer) return;

		const small = keyboardStep();
		const large = keyboardLargeStep(small);
		const arrow = event.altKey ? large : small;
		const delta = {
			ArrowUp: arrow,
			ArrowRight: arrow,
			ArrowDown: -arrow,
			ArrowLeft: -arrow,
			PageUp: large,
			PageDown: -large,
		}[event.key];
		let nextValue = null;
		if (event.key === "Home") nextValue = control.min;
		else if (event.key === "End") nextValue = control.max;
		else if (delta !== undefined) {
			const currentValue = control.value ?? control.min;
			nextValue =
				control.keyboardMode === "value"
					? currentValue + delta
					: moveValueByNormalisedDelta(currentValue, delta, scaleOptions());
		} else if (["Escape", "Delete", "Backspace"].includes(event.key)) {
			event.preventDefault();
			control.reset();
			return;
		} else return;

		event.preventDefault();
		control.beginGesture();
		control.editValue(nextValue);
		control.endGesture();
	}

	function keyboardStep() {
		if (control.keyboardMode === "value") {
			return control.step > 0
				? control.step
				: Math.abs(control.max - control.min) / 100 || 0.01;
		}
		return normalisedKeyboardStep({
			...scaleOptions(),
			step: control.step,
			positionStep: control.positionStep,
		});
	}

	function keyboardLargeStep(small) {
		return control.keyboardMode === "value"
			? Math.max(
					small * 10,
					Math.abs(control.max - control.min) / 100 || small * 10,
				)
			: Math.min(1, small * 10);
	}

	function pointerCoordinate(event) {
		return drag.axis === "x"
			? finite(event.clientX, 0)
			: -finite(event.clientY, 0);
	}

	function editFromPosition(event) {
		const gesture = pointer;
		const bounds = pointer?.target?.getBoundingClientRect?.();
		if (!bounds) return;
		const extent = drag.axis === "x" ? bounds.width : bounds.height;
		const offset =
			drag.axis === "x"
				? finite(event.clientX, bounds.left) - bounds.left
				: bounds.bottom - finite(event.clientY, bounds.bottom);
		if (extent > 0) {
			const position = clamp(offset / extent, 0, 1);
			gesture.rawPosition = position;
			control.editValue(normalisedPositionToValue(position, scaleOptions()));
			if (pointer !== gesture) return;
		}
	}

	function handlePointerMove(event) {
		if (!pointer || event.pointerId !== pointer.pointerID || pointer.locked)
			return;
		const gesture = pointer;
		const x = finite(event.clientX, gesture.lastX);
		const y = finite(event.clientY, gesture.lastY);
		const total = Math.hypot(x - gesture.startX, y - gesture.startY);
		if (total > TAP_MOVEMENT) gesture.moved = true;
		if (!gesture.moved && gesture.fineCandidate) return;

		if (event.shiftKey && !gesture.relative) {
			gesture.relative = true;
			gesture.lastX = x;
			gesture.lastY = y;
			return;
		}
		if (!gesture.relative) editFromPosition(event);
		else {
			const previous = drag.axis === "x" ? gesture.lastX : -gesture.lastY;
			const delta = pointerCoordinate(event) - previous;
			const fine = gesture.fineCandidate || event.shiftKey;
			if (gesture.lastAppliedValue !== control.value) {
				gesture.rawPosition =
					control.empty || control.value === null
						? 0
						: valueToNormalisedPosition(control.value, scaleOptions());
			}
			gesture.rawPosition = clamp(
				gesture.rawPosition +
					(delta / drag.distance) * drag.scale * (fine ? drag.fineScale : 1),
				0,
				1,
			);
			control.editValue(
				normalisedPositionToValue(gesture.rawPosition, scaleOptions()),
			);
		}
		if (pointer !== gesture) return;
		gesture.lastX = x;
		gesture.lastY = y;
		event.preventDefault?.();
	}

	function finishPointer(event, cancelled = false) {
		if (
			!pointer ||
			(event?.pointerId !== undefined && event.pointerId !== pointer.pointerID)
		)
			return;
		const active = pointer;
		pointer = null;
		clearTimeout(active.lockFallbackTimer);
		removePointerListeners(active.target);
		if (active.target?.hasPointerCapture?.(active.pointerID)) {
			try {
				active.target.releasePointerCapture(active.pointerID);
			} catch {
				// Capture may have been lost between the check and release.
			}
		}
		exitPointerLock(active.target);
		refresh();

		if (cancelled) {
			lastClick = null;
			control.endGesture(true);
			return;
		}
		if (!active.moved) {
			const now = performance.now();
			if (active.fineCandidate) {
				lastClick = null;
				suppressDoubleClickUntil = now + DOUBLE_CLICK_MS;
				control.editValue(control.resetValue);
				control.endGesture();
				return;
			}
			if (
				active.pointerType === "touch" &&
				(editorOptions?.touchTap || editorOptions?.triggers?.touchTap)
			) {
				lastClick = null;
				beginEditor(undefined, true, true);
				return;
			}
			lastClick = { time: now, x: active.startX, y: active.startY };
		} else lastClick = null;
		control.endGesture();
	}

	function cancelPointer() {
		finishPointer(null, true);
	}

	function handleLostCapture(event) {
		finishPointer(event, true);
	}

	function addPointerListeners() {
		ownerWindow?.addEventListener?.("pointermove", handlePointerMove);
		ownerWindow?.addEventListener?.("pointerup", finishPointer);
		ownerWindow?.addEventListener?.("pointercancel", handleLostCapture);
		ownerWindow?.addEventListener?.("blur", cancelPointer);
		pointer?.target?.addEventListener?.(
			"lostpointercapture",
			handleLostCapture,
		);
		ownerDocument?.addEventListener?.("mousemove", handleLockedMove);
		ownerDocument?.addEventListener?.("mouseup", handleLockedMouseUp);
		ownerDocument?.addEventListener?.(
			"pointerlockchange",
			handlePointerLockChange,
		);
		ownerDocument?.addEventListener?.(
			"pointerlockerror",
			handlePointerLockError,
		);
	}

	function removePointerListeners(activeTarget = pointer?.target) {
		ownerWindow?.removeEventListener?.("pointermove", handlePointerMove);
		ownerWindow?.removeEventListener?.("pointerup", finishPointer);
		ownerWindow?.removeEventListener?.("pointercancel", handleLostCapture);
		ownerWindow?.removeEventListener?.("blur", cancelPointer);
		activeTarget?.removeEventListener?.(
			"lostpointercapture",
			handleLostCapture,
		);
		ownerDocument?.removeEventListener?.("mousemove", handleLockedMove);
		ownerDocument?.removeEventListener?.("mouseup", handleLockedMouseUp);
		ownerDocument?.removeEventListener?.(
			"pointerlockchange",
			handlePointerLockChange,
		);
		ownerDocument?.removeEventListener?.(
			"pointerlockerror",
			handlePointerLockError,
		);
	}

	function configurationChangesInteraction(next) {
		if (
			next.parameterID !== undefined &&
			String(next.parameterID) !== control.parameterID
		)
			return true;
		if (next.parameterKind !== undefined || next.kind !== undefined) {
			if (
				parameterKind(next.parameterKind ?? next.kind) !== control.parameterKind
			)
				return true;
		}
		if (
			next.orientation !== undefined &&
			(next.orientation === "horizontal" ? "horizontal" : "vertical") !==
				orientation
		)
			return true;
		if (next.drag !== undefined) {
			const nextAxis =
				next.drag.axis === "x" ? "x" : next.drag.axis === "y" ? "y" : drag.axis;
			const nextMode =
				next.drag.mode === "position" || next.drag.mode === "relative"
					? next.drag.mode
					: drag.mode;
			const nextDistance = Math.max(
				1,
				finite(next.drag.distance, drag.distance),
			);
			const nextFineScale = Math.max(
				0,
				finite(next.drag.fineScale, drag.fineScale),
			);
			const nextScale = Math.max(0, finite(next.drag.scale, drag.scale));
			const nextPointerLock =
				next.drag.pointerLock === undefined
					? drag.pointerLock
					: Boolean(next.drag.pointerLock);
			if (
				nextAxis !== drag.axis ||
				nextMode !== drag.mode ||
				nextDistance !== drag.distance ||
				nextFineScale !== drag.fineScale ||
				nextScale !== drag.scale ||
				nextPointerLock !== drag.pointerLock
			)
				return true;
		}
		if (
			(next.disabled !== undefined || next.readOnly !== undefined) &&
			Boolean(next.disabled ?? next.readOnly) !== rawDisabled
		)
			return true;
		if (next.min !== undefined && finite(next.min, control.min) !== control.min)
			return true;
		if (next.max !== undefined && finite(next.max, control.max) !== control.max)
			return true;
		if (
			next.mid !== undefined &&
			(next.mid == null ? null : finite(next.mid, control.mid)) !== control.mid
		)
			return true;
		if (
			next.curve !== undefined &&
			normaliseCurveName(next.curve) !== control.curve
		)
			return true;
		if (next.shape !== undefined) {
			const nextShape =
				next.shape == null
					? null
					: Math.max(Number.EPSILON, finite(next.shape, control.shape ?? 1));
			if (nextShape !== control.shape) return true;
		}
		if (next.positionStep !== undefined) {
			const nextPositionStep =
				next.positionStep == null
					? null
					: Math.max(0, finite(next.positionStep, control.positionStep ?? 0));
			if (nextPositionStep !== control.positionStep) return true;
		}
		if (
			next.step !== undefined &&
			Math.max(0, finite(next.step, control.step)) !== control.step
		)
			return true;
		if (
			next.allowEmpty !== undefined &&
			Boolean(next.allowEmpty) !== control.allowEmpty
		)
			return true;
		if (
			next.keyboardMode !== undefined &&
			(next.keyboardMode === "value" ? "value" : "normalised") !==
				control.keyboardMode
		)
			return true;
		if (next.editor !== undefined && editorInteractionChanged(next.editor))
			return true;
		if (next.resetValue !== undefined || next.defaultValue !== undefined) {
			const nextReset = finite(
				next.resetValue ?? next.defaultValue,
				control.resetValue,
			);
			if (normaliseValue(nextReset) !== control.resetValue) return true;
		}
		return false;
	}

	function editorInteractionChanged(nextEditor) {
		if (nextEditor === editorOptions) return false;
		if (!nextEditor || !editorOptions) return true;
		return (
			nextEditor.target !== editorOptions.target ||
			nextEditor.triggers?.click !== editorOptions.triggers?.click ||
			nextEditor.triggers?.keydown !== editorOptions.triggers?.keydown ||
			nextEditor.triggers?.touchTap !== editorOptions.triggers?.touchTap ||
			nextEditor.touchTap !== editorOptions.touchTap
		);
	}

	function beginEditor(initialValue, selectValue, gestureAlreadyBegun) {
		const editor = editorOptions;
		if (
			disposed ||
			!editor ||
			editorState ||
			control.disabled ||
			(editor.enabled && !editor.enabled(control))
		)
			return false;
		const target = editor.target;
		if (!target?.replaceChildren) return false;
		const input =
			ownerDocument?.createElement?.("input") ??
			globalThis.document?.createElement?.("input");
		if (!input) return false;
		if (!gestureAlreadyBegun) control.beginGesture("control");
		const text =
			initialValue ??
			editor.initialValue?.(control) ??
			editor.format?.(control.value, control) ??
			formattedValue();
		input.className = editor.className ?? "value-editor";
		if (editor.part) input.setAttribute("part", editor.part);
		input.type = "text";
		input.inputMode = editor.inputMode ?? "decimal";
		input.min = String(control.min);
		input.max = String(control.max);
		input.step = String(control.step);
		input.value = String(text);
		if (editor.ariaLabel)
			input.setAttribute("aria-label", String(editor.ariaLabel(control)));
		const state = { input };
		editorState = state;
		editor.onStateChange?.(true, control);
		const finish = (commit, restoreFocus = false) =>
			finishEditor(commit, restoreFocus, state);
		input.addEventListener("keydown", (event) => {
			event.stopPropagation?.();
			if (event.key === "Enter") {
				event.preventDefault?.();
				finish(true, true);
			} else if (event.key === "Escape") {
				event.preventDefault?.();
				finish(false, true);
			}
		});
		input.addEventListener("blur", () => finish(true));
		target.replaceChildren(input);
		input.focus?.();
		if (selectValue) input.select?.();
		else input.setSelectionRange?.(input.value.length, input.value.length);
		return true;
	}

	function finishEditor(commit, restoreFocus, state = editorState) {
		if (!state || state !== editorState) return;
		editorState = null;
		const editor = editorOptions;
		const parsed = editor?.parse?.(state.input.value, control) ?? {
			valid: Number.isFinite(Number(state.input.value)),
			value: Number(state.input.value),
		};
		editor?.onStateChange?.(false, control);
		if (commit && parsed.valid) {
			control.editValue(parsed.value, "control");
			control.endGesture(false, "control");
		} else {
			refresh();
			control.endGesture(true, "control");
		}
		if (restoreFocus) editor?.restoreFocus?.(control);
	}

	function isPointerLockedTarget(target) {
		if (!target) return false;
		const root = target.getRootNode?.();
		return (
			ownerDocument?.pointerLockElement === target ||
			root?.pointerLockElement === target ||
			(root?.host && ownerDocument?.pointerLockElement === root.host)
		);
	}

	function isPointerLocked() {
		return isPointerLockedTarget(pointer?.target);
	}

	function requestPointerLock() {
		try {
			const gesture = pointer;
			const request = gesture?.target?.requestPointerLock?.();
			request?.then?.(() => {
				if (pointer !== gesture && isPointerLockedTarget(gesture?.target)) {
					ownerDocument?.exitPointerLock?.();
				}
			});
			request?.catch?.(() => {
				if (pointer === gesture) handlePointerLockError();
				else exitPointerLock(gesture?.target);
			});
		} catch {
			handlePointerLockError();
		}
	}

	function handlePointerLockError() {
		if (pointer) {
			clearTimeout(pointer.lockFallbackTimer);
			pointer.locked = false;
		}
		if (isPointerLocked()) ownerDocument?.exitPointerLock?.();
	}

	function handlePointerLockChange() {
		if (!pointer) {
			if (isPointerLocked()) ownerDocument?.exitPointerLock?.();
			return;
		}
		if (isPointerLocked()) {
			pointer.locked = true;
			pointer.lockDeltaEvents = 0;
			clearTimeout(pointer.lockFallbackTimer);
			pointer.lockFallbackTimer = setTimeout(() => {
				if (pointer?.locked && pointer.lockDeltaEvents === 0) {
					pointer.locked = false;
					exitPointerLock(pointer.target);
				}
			}, 350);
		} else if (pointer.locked)
			finishPointer({ pointerId: pointer.pointerID }, true);
	}

	function handleLockedMove(event) {
		if (!pointer?.locked || !isPointerLocked()) return;
		const gesture = pointer;
		const movement = finite(
			drag.axis === "x" ? event.movementX : -event.movementY,
			0,
		);
		if (movement !== 0) {
			gesture.moved = true;
			gesture.lockDeltaEvents += 1;
		}
		if (gesture.lastAppliedValue !== control.value) {
			gesture.rawPosition =
				control.empty || control.value === null
					? 0
					: valueToNormalisedPosition(control.value, scaleOptions());
		}
		gesture.rawPosition = clamp(
			gesture.rawPosition +
				(movement / drag.distance) *
					drag.scale *
					(event.shiftKey ? drag.fineScale : 1),
			0,
			1,
		);
		control.editValue(
			normalisedPositionToValue(gesture.rawPosition, scaleOptions()),
		);
	}

	function handleLockedMouseUp(event) {
		if (pointer?.locked && (event.button === undefined || event.button === 0)) {
			finishPointer({ pointerId: pointer.pointerID });
		}
	}

	function exitPointerLock(target = pointer?.target) {
		if (isPointerLockedTarget(target)) ownerDocument?.exitPointerLock?.();
	}

	function handleEditorClick(event) {
		event.preventDefault?.();
		event.stopPropagation?.();
		beginEditor(undefined, true, false);
	}

	function handleDoubleClick(event) {
		if (performance.now() < suppressDoubleClickUntil) {
			event.preventDefault?.();
			return;
		}
		event.preventDefault?.();
		lastClick = null;
		control.reset();
	}

	if (control.min > control.max)
		[control.min, control.max] = [control.max, control.min];
	control.resetValue = normaliseValue(control.resetValue);
	rawValue = control.resetValue;
	if (options.allowEmpty && options.value === null) rawEmpty = true;
	else control.setValue(options.value ?? control.resetValue, false);
	element.addEventListener("keydown", handleKey);
	element.addEventListener("focus", handleFocus);
	element.addEventListener("blur", handleFocus);
	pointerTarget?.addEventListener?.("pointerdown", control.startPointerDrag);
	pointerTarget?.addEventListener?.("dblclick", handleDoubleClick);
	if (editorOptions?.triggers?.click)
		editorOptions.target?.addEventListener?.("click", handleEditorClick);
	refresh();
	return control;
}
