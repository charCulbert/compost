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
	let suppressDoubleClickUntil = 0;
	let rawValue = 0;
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
		pointerLock: Boolean(options.drag?.pointerLock),
	};

	const control = {
		element,
		eventTarget,
		pointerTarget,
		parameterID: String(options.parameterID ?? ""),
		parameterKind: parameterKind(options.parameterKind ?? options.kind),
		parameterValues: null,
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
			const numericValue = Number(nextValue);
			if (!Number.isFinite(numericValue)) return;
			const value = normaliseValue(numericValue);
			if (value === control.value) return;
			const editRevision = revision;
			if (shouldEmit) {
				beginParameterGesture(eventAdapter, control.value, { source });
				if (disposed || settling || revision !== editRevision) return;
			}
			rawValue = value;
			if (shouldEmit && pointer) pointer.lastAppliedValue = value;
			refresh();
			if (shouldEmit && !disposed && !settling && revision === editRevision)
				editParameterGesture(eventAdapter, value, { source });
		},

		configure(next = {}) {
			if (disposed || settling) return control;
			settling = true;
			revision += 1;
			cancelPointer();
			if (eventAdapter._parameterGestureActive) {
				endParameterGesture(eventAdapter, control.value, { cancelled: true });
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

			control.resetValue = normaliseValue(control.resetValue);
			control.setValue(
				next.value === undefined ? control.value : next.value,
				false,
				"configure",
			);
			settling = false;
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
				rawPosition: valueToNormalisedPosition(control.value, scaleOptions()),
				lastAppliedValue: control.value,
			};
			const gesture = pointer;
			const gestureRevision = revision;
			activeTarget?.setPointerCapture?.(pointerID);
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
			cancelPointer();
			if (eventAdapter._parameterGestureActive) {
				endParameterGesture(eventAdapter, control.value, { cancelled: true });
			}
			disposed = true;
			element.removeEventListener("keydown", handleKey);
			element.removeEventListener("focus", handleFocus);
			element.removeEventListener("blur", handleFocus);
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
		get: () => rawValue,
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
		setAttribute(element, "role", "slider");
		setAttribute(element, "aria-label", control.label);
		setAttribute(element, "aria-valuemin", control.min);
		setAttribute(element, "aria-valuemax", control.max);
		setAttribute(element, "aria-valuenow", control.value);
		setAttribute(element, "aria-valuetext", text);
		setAttribute(element, "aria-orientation", orientation);
		setAttribute(element, "aria-disabled", control.disabled ? "true" : "false");
		draw({
			value: control.value,
			position: valueToNormalisedPosition(control.value, scaleOptions()),
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
		if (event.key === "Escape" && pointer) {
			event.preventDefault();
			cancelPointer();
			return;
		}
		if (pointer) return;

		const small = normalisedKeyboardStep({
			...scaleOptions(),
			step: control.step,
			positionStep: control.positionStep,
		});
		const large = Math.min(1, small * 10);
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
			nextValue = moveValueByNormalisedDelta(
				control.value,
				delta,
				scaleOptions(),
			);
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
				gesture.rawPosition = valueToNormalisedPosition(
					control.value,
					scaleOptions(),
				);
			}
			gesture.rawPosition = clamp(
				gesture.rawPosition +
					(delta / drag.distance) * (fine ? drag.fineScale : 1),
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
			active.target.releasePointerCapture(active.pointerID);
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

	function isPointerLocked() {
		return ownerDocument?.pointerLockElement === pointer?.target;
	}

	function requestPointerLock() {
		try {
			const gesture = pointer;
			const request = gesture?.target?.requestPointerLock?.();
			request?.then?.(() => {
				if (
					pointer !== gesture &&
					ownerDocument?.pointerLockElement === gesture?.target
				) {
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
			gesture.rawPosition = valueToNormalisedPosition(
				control.value,
				scaleOptions(),
			);
		}
		gesture.rawPosition = clamp(
			gesture.rawPosition +
				(movement / drag.distance) * (event.shiftKey ? drag.fineScale : 1),
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
		if (ownerDocument?.pointerLockElement === target)
			ownerDocument?.exitPointerLock?.();
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
	control.setValue(options.value ?? control.resetValue, false);
	element.addEventListener("keydown", handleKey);
	element.addEventListener("focus", handleFocus);
	element.addEventListener("blur", handleFocus);
	pointerTarget?.addEventListener?.("pointerdown", control.startPointerDrag);
	pointerTarget?.addEventListener?.("dblclick", handleDoubleClick);
	refresh();
	return control;
}
