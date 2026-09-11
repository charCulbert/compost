import { normaliseCurveName } from "../parameter-scale.js";
import { defineElement, formatNumber, numberAttr } from "../utils.js";
import { createValueControl } from "../value-control.js";

let nextKnobID = 1;

export class CompostKnob extends HTMLElement {
	static get observedAttributes() {
		return [
			"name",
			"parameter-id",
			"label",
			"section",
			"min",
			"max",
			"mid",
			"curve",
			"shape",
			"position-step",
			"step",
			"display-fraction-digits",
			"value",
			"text",
			"editable",
			"unit",
			"reset-value",
			"min-label",
			"max-label",
			"disabled",
			"pointer-lock",
		];
	}

	constructor() {
		super();

		this.name = "";
		this.parameterID = "";
		this.label = "Parameter";
		this.section = "";
		this.min = 0;
		this.max = 1;
		this.mid = null;
		this.curve = "linear";
		this.shape = 1;
		this.positionStep = null;
		this.step = 0;
		this.displayFractionDigits = null;
		this.unit = "";
		this.valueText = "";
		this.disconnectedValue = 0.5;
		this.resetValue = 0.5;
		this.minLabel = "";
		this.maxLabel = "";
		this.inputID = `compost-knob-${nextKnobID++}`;
		this.labelID = `${this.inputID}-label`;
		this.lastUpdateSource = "control";
		this.valueControl = null;

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --knob-scale: 1;
          --knob-dial-size: 4.75em;
          --knob-ring-width: 0.45em;
          --knob-ring-stroke-width: calc(var(--knob-ring-width) * var(--knob-scale));
          --knob-cap-size: calc(var(--knob-dial-size) - (var(--knob-ring-width) * 2));
          --knob-cap-inset: calc(((var(--knob-dial-size) - var(--knob-cap-size)) / 2) * var(--knob-scale));
          --knob-indicator-width: 1px;
          --knob-indicator-inset: calc(0.3em * var(--knob-scale));
          --knob-indicator-length: calc(0.8em * var(--knob-scale));
          --_accent: var(--compost-accent, AccentColor);
          --_muted: color-mix(in srgb, currentColor 65%, transparent);
          --_track: color-mix(in srgb, currentColor 30%, transparent);
          display: inline-block;
          vertical-align: top;
          -webkit-user-select: none;
          user-select: none;
        }
        :host(:focus-visible) {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"]) {
          outline: 2px solid var(--_accent);
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"][midi-map-state~="pulse"]) {
          outline-offset: 4px;
        }
        .knob {
          display: grid;
          justify-items: center;
          gap: calc(0.6em * var(--knob-scale));
          position: relative;
        }
        .dial {
          --arc-ratio: 0;
          --arc: 0deg;
          width: calc(var(--knob-dial-size) * var(--knob-scale));
          height: calc(var(--knob-dial-size) * var(--knob-scale));
          border-radius: 50%;
          display: grid;
          place-items: center;
          cursor: ns-resize;
          touch-action: none;
          position: relative;
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            conic-gradient(from -135deg,
              var(--_accent) 0deg var(--arc),
              var(--_track) var(--arc) 270deg,
              transparent 270deg);
          -webkit-mask:
            radial-gradient(farthest-side,
              transparent calc(100% - var(--knob-ring-stroke-width)),
              #000 calc(100% - var(--knob-ring-stroke-width)));
          mask:
            radial-gradient(farthest-side,
              transparent calc(100% - var(--knob-ring-stroke-width)),
              #000 calc(100% - var(--knob-ring-stroke-width)));
          pointer-events: none;
        }
        :host([disabled]) .knob {
          opacity: 0.45;
        }
        :host([disabled]) .dial,
        :host([disabled]) .value {
          cursor: default;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 2;
          max-width: calc(100% - 10px);
          color: var(--_accent);
          font-size: 0.65em;
          font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
          line-height: 1;
          overflow: hidden;
          pointer-events: none;
          text-overflow: ellipsis;
          transform: translate(-50%, -50%);
          white-space: nowrap;
        }
        .cap {
          box-sizing: border-box;
          position: absolute;
          inset: var(--knob-cap-inset);
          border: 1px solid currentColor;
          border-radius: 50%;
          z-index: 1;
        }
        .cap::before {
          content: "";
          position: absolute;
          left: 50%;
          top: var(--knob-indicator-inset);
          width: var(--knob-indicator-width);
          height: var(--knob-indicator-length);
          background: currentColor;
          transform: translateX(-50%);
        }
        .midi-map-label {
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
          z-index: 2;
        }
        .label {
          font-size: calc(0.8125em * var(--knob-scale));
          line-height: 1.2;
          text-align: center;
          overflow-wrap: anywhere;
        }
        .value {
          color: var(--_muted);
          font-size: calc(0.75em * var(--knob-scale));
          font-variant-numeric: lining-nums tabular-nums;
          min-block-size: 1.3em;
          min-inline-size: calc(var(--knob-value-editor-width, 4.5em) * var(--knob-scale));
          position: relative;
          text-align: center;
        }
        :host([editable]:not([disabled])) .value {
          cursor: text;
          padding: 1px 4px;
        }
        .value-editor {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 4;
          width: calc(var(--knob-value-editor-width, 4.5em) * var(--knob-scale));
          border: 1px solid currentColor;
          border-radius: 0;
          background: Field;
          color: inherit;
          font: inherit;
          text-align: center;
          transform: translate(-50%, -50%);
          -webkit-user-select: text;
          user-select: text;
        }
      </style>
      <div class="knob" part="panel">
        <div class="dial" part="dial">
          <span class="ring" part="ring track fill" aria-hidden="true"></span>
          <span class="cap" part="cap"></span>
          <span class="midi-map-label" aria-hidden="true"></span>
        </div>
        <div class="label" part="label"></div>
        <div class="value" part="value"></div>
      </div>`;

		this.dial = this.root.querySelector(".dial");
		this.cap = this.root.querySelector(".cap");
		this.labelElement = this.root.querySelector(".label");
		this.valueElement = this.root.querySelector(".value");

		this.valueElement.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.beginValueEdit();
		});
		this.dial.addEventListener("pointerdown", () => this.syncValueControl());
		this.addEventListener("keydown", (event) => {
			this.syncValueControl();
			this.handleValueEditKey(event);
		});
	}

	connectedCallback() {
		this.connectValueControl();
		this.readAttributes();
	}

	disconnectedCallback() {
		if (!this.valueControl) return;
		this.finishValueEdit?.(false);
		this.valueControl.dispose();
		this.disconnectedValue = this.valueControl.value;
		this.valueControl = null;
	}

	attributeChangedCallback(name) {
		this.readAttributes(name);
	}

	get value() {
		return this.valueControl?.value ?? this.disconnectedValue;
	}

	set value(value) {
		this.setValue(value, false);
	}

	readAttributes(changedAttribute = null) {
		this.finishValueEdit?.(false);
		this.name = this.getAttribute("name") || this.name;
		this.parameterID = this.getAttribute("parameter-id") || "";
		this.label = this.getAttribute("label") || this.label;
		this.section = this.getAttribute("section") || "";
		this.unit = this.getAttribute("unit") || this.unit;
		this.min = numberAttr(this, "min", this.min);
		this.max = numberAttr(this, "max", this.max);
		this.mid = this.hasAttribute("mid")
			? numberAttr(
					this,
					"mid",
					this.mid ?? this.min + (this.max - this.min) / 2,
				)
			: null;
		this.curve = normaliseCurveName(this.getAttribute("curve"));
		this.shape = this.hasAttribute("shape")
			? numberAttr(this, "shape", this.shape ?? 1)
			: null;
		this.positionStep = this.hasAttribute("position-step")
			? numberAttr(this, "position-step", null)
			: null;
		this.step = numberAttr(this, "step", this.step);
		this.displayFractionDigits = this.hasAttribute("display-fraction-digits")
			? numberAttr(this, "display-fraction-digits", null)
			: null;
		this.valueText = this.getAttribute("text") ?? "";
		this.resetValue = numberAttr(this, "reset-value", this.resetValue);
		this.minLabel = this.getAttribute("min-label") ?? "";
		this.maxLabel = this.getAttribute("max-label") ?? "";
		const value = numberAttr(this, "value", this.value);
		if (!this.valueControl) {
			this.disconnectedValue = value;
			return;
		}

		this.valueControl.configure(
			this.valueControlOptions(
				changedAttribute === "value" ? value : undefined,
			),
		);
		this.valueControlConfigurationKey = this.configurationKey();
	}

	valueControlOptions(value) {
		return {
			parameterID: this.parameterID,
			parameterKind: this.parameterKind,
			name: this.name,
			label: this.label,
			min: this.min,
			max: this.max,
			mid: this.mid,
			curve: this.curve,
			shape: this.shape,
			positionStep: this.positionStep,
			step: this.step,
			...(value === undefined ? {} : { value }),
			resetValue: this.resetValue,
			unit: this.unit,
			text: this.valueText,
			displayFractionDigits: this.displayFractionDigits,
			minLabel: this.minLabel,
			maxLabel: this.maxLabel,
			disabled: this.disabled,
			orientation: "vertical",
			pointerTarget: this.dial,
			drag: {
				axis: "y",
				mode: "relative",
				distance: 180,
				fineScale: 0.1,
				pointerLock: this.hasAttribute("pointer-lock"),
			},
			draw: (state) => this.refresh(state),
		};
	}

	connectValueControl() {
		if (this.valueControl) return;
		this.valueControl = createValueControl(
			this,
			this.valueControlOptions(this.disconnectedValue),
		);
		this.valueControlConfigurationKey = this.configurationKey();
	}

	configurationKey() {
		return JSON.stringify([
			this.parameterID,
			this.parameterKind,
			this.name,
			this.label,
			this.min,
			this.max,
			this.mid,
			this.curve,
			this.shape,
			this.positionStep,
			this.step,
			this.resetValue,
			this.unit,
			this.valueText,
			this.displayFractionDigits,
			this.minLabel,
			this.maxLabel,
			this.disabled,
			this.hasAttribute("pointer-lock"),
		]);
	}

	syncValueControl() {
		if (!this.valueControl) return;
		const key = this.configurationKey();
		if (key === this.valueControlConfigurationKey) return;
		this.valueControl.configure(this.valueControlOptions());
		this.valueControlConfigurationKey = key;
	}

	get editable() {
		return this.hasAttribute("editable");
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set disabled(value) {
		this.toggleAttribute("disabled", Boolean(value));
	}

	get parameterKind() {
		return this.getAttribute("parameter-kind") || "continuous";
	}

	setValue(value, shouldEmit = true, source = "control") {
		if (!this.valueControl) {
			const numericValue = Number(value);
			if (Number.isFinite(numericValue)) this.disconnectedValue = numericValue;
			return;
		}
		this.syncValueControl();
		const previousValue = this.value;
		if (shouldEmit) this.valueControl.editValue(value, source);
		else this.valueControl.setValue(value, false, source);
		if (this.value !== previousValue) this.lastUpdateSource = source;
	}

	handleValueEditKey(event) {
		if (
			!this.editable ||
			this.isEditingValue ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey
		) {
			return false;
		}

		if (event.key === "Enter") {
			event.preventDefault();
			this.beginValueEdit(this.editableValueText(), true);
			return true;
		}

		if (!/^[0-9.+-]$/u.test(event.key)) return false;
		event.preventDefault();
		this.beginValueEdit(event.key, false);
		return true;
	}

	reset() {
		this.syncValueControl();
		this.valueControl?.reset();
	}

	editableValueText() {
		return formatNumber(this.value, this.step, this.displayFractionDigits);
	}

	beginValueEdit(initialValue = this.editableValueText(), selectValue = true) {
		if (
			this.disabled ||
			!this.editable ||
			this.isEditingValue ||
			!this.valueControl
		)
			return;

		this.isEditingValue = true;
		this.valueControl.beginGesture();

		const input = document.createElement("input");
		input.className = "value-editor";
		input.type = "text";
		input.inputMode = "decimal";
		input.value = initialValue;
		input.min = String(this.min);
		input.max = String(this.max);
		input.step = String(this.step);
		input.setAttribute("aria-label", `Set ${this.label} value`);

		const finish = (commit, restoreFocus = false) => {
			if (!this.isEditingValue) return;

			const nextValue = Number(input.value);
			this.isEditingValue = false;
			this.finishValueEdit = null;

			if (commit && input.value.trim() !== "" && Number.isFinite(nextValue)) {
				this.valueControl.editValue(nextValue);
				this.valueControl.endGesture();
			} else {
				this.refresh();
				this.valueControl.endGesture(true);
			}

			if (restoreFocus) {
				queueMicrotask(() =>
					HTMLElement.prototype.focus.call(this, { preventScroll: true }),
				);
			}
		};
		this.finishValueEdit = finish;

		input.addEventListener("keydown", (event) => {
			event.stopPropagation();

			if (event.key === "Enter") {
				event.preventDefault();
				finish(true, true);
			}

			if (event.key === "Escape") {
				event.preventDefault();
				finish(false, true);
			}
		});
		input.addEventListener("blur", () => finish(true));

		this.valueElement.replaceChildren(input);
		input.focus();
		if (selectValue) {
			input.select();
		} else {
			input.setSelectionRange(input.value.length, input.value.length);
		}
	}

	refresh(state = this.valueState) {
		if (!this.dial) {
			return;
		}
		if (state) this.valueState = state;
		else return;

		const normalised = state.position;
		const arcRatio = Math.min(1, Math.max(0, normalised));
		this.dial.style.setProperty("--arc-ratio", String(arcRatio));
		this.dial.style.setProperty("--arc", `${arcRatio * 270}deg`);
		this.cap.style.transform = `rotate(${-135 + normalised * 270}deg)`;
		this.labelElement.textContent = this.label;
		this.labelElement.id = this.labelID;
		if (!this.isEditingValue) {
			this.valueElement.textContent = state.valueText;
		}
		this.refreshEditableValue();
	}

	refreshEditableValue() {
		if (!this.editable) {
			this.valueElement.removeAttribute("role");
			this.valueElement.removeAttribute("tabindex");
			this.valueElement.removeAttribute("aria-label");
			this.valueElement.removeAttribute("title");
			return;
		}

		this.valueElement.removeAttribute("role");
		this.valueElement.removeAttribute("tabindex");
		this.valueElement.removeAttribute("aria-label");
		this.valueElement.removeAttribute("title");
	}
}

defineElement("compost-knob", CompostKnob);
