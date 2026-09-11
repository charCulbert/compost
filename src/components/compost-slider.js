import { normaliseCurveName } from "../parameter-scale.js";
import { defineElement, formatNumber, numberAttr } from "../utils.js";
import { createValueControl } from "../value-control.js";

let nextSliderID = 1;

export class CompostSlider extends HTMLElement {
	static get observedAttributes() {
		return [
			"name",
			"parameter-id",
			"label",
			"section",
			"orientation",
			"interaction",
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
		this.inputID = `compost-slider-${nextSliderID++}`;
		this.labelID = `${this.inputID}-label`;
		this.lastUpdateSource = "control";
		this.valueControl = null;

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --slider-track-height: 3px;
          --slider-thumb-size: 1.125em;
          --slider-label-gap: 0.75em;
          --slider-row-gap: 0.75em;
          --slider-label-size: 0.8125em;
          --slider-vertical-length: 9em;
          --slider-vertical-width: 4.5em;
          --slider-vertical-row-gap: 2px;
          --slider-percent: 0%;
          --_accent: var(--compost-accent, AccentColor);
          --_muted: color-mix(in srgb, currentColor 65%, transparent);
          --_track: color-mix(in srgb, currentColor 30%, transparent);
          display: block;
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
        .panel {
          display: grid;
          gap: var(--slider-label-gap);
          font-size: var(--slider-label-size);
          position: relative;
        }
        .row { display: flex; justify-content: space-between; gap: var(--slider-row-gap); }
        output {
          color: var(--_muted);
          font-variant-numeric: lining-nums tabular-nums;
          min-block-size: 1.3em;
          min-inline-size: var(--slider-value-width, var(--slider-value-editor-width, 4.5em));
          position: relative;
          text-align: right;
        }
        :host([editable]:not([disabled])) output {
          cursor: text;
          padding: 1px 4px;
        }
        .value-editor {
          position: absolute;
          right: 0;
          top: 50%;
          z-index: 4;
          width: var(--slider-value-editor-width, 4.5em);
          border: 1px solid currentColor;
          border-radius: 0;
          background: Field;
          color: inherit;
          font: inherit;
          text-align: center;
          transform: translateY(-50%);
          -webkit-user-select: text;
          user-select: text;
        }
        .range-input {
          position: relative;
          box-sizing: border-box;
          width: 100%;
          height: var(--slider-thumb-size);
          margin: 0;
          cursor: pointer;
          touch-action: none;
        }
        .track,
        .fill {
          position: absolute;
          left: 0;
          top: calc(50% - var(--slider-track-height) / 2);
          height: var(--slider-track-height);
        }
        .track {
          width: 100%;
          background: var(--_track);
        }
        .fill {
          width: var(--slider-percent);
          background: var(--_accent);
        }
        .thumb {
          position: absolute;
          left: var(--slider-percent);
          top: 50%;
          box-sizing: border-box;
          width: 2px;
          height: var(--slider-thumb-size);
          background: currentColor;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        :host([orientation="vertical"]) {
          display: inline-block;
          inline-size: var(--slider-vertical-width);
        }
        :host([orientation="vertical"]) .row {
          align-items: center;
          flex-direction: column;
          gap: var(--slider-vertical-row-gap);
          order: 1;
        }
        :host([orientation="vertical"]) .label,
        :host([orientation="vertical"]) output {
          box-sizing: border-box;
          inline-size: 100%;
          min-inline-size: 0;
          text-align: center;
        }
        :host([orientation="vertical"]) .range-input {
          width: var(--slider-thumb-size);
          height: var(--slider-vertical-length);
          margin-inline: auto;
        }
        :host([orientation="vertical"]) .track,
        :host([orientation="vertical"]) .fill {
          left: calc(50% - var(--slider-track-height) / 2);
          top: auto;
          bottom: 0;
          width: var(--slider-track-height);
        }
        :host([orientation="vertical"]) .track {
          height: 100%;
        }
        :host([orientation="vertical"]) .fill {
          height: var(--slider-percent);
        }
        :host([orientation="vertical"]) .thumb {
          left: 50%;
          top: calc(100% - var(--slider-percent));
          width: var(--slider-thumb-size);
          height: 2px;
        }
        :host([disabled]) .panel {
          opacity: 0.45;
        }
        :host([disabled]) .range-input,
        :host([disabled]) output {
          cursor: default;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          bottom: calc(var(--slider-thumb-size) / 2 - 2px);
          z-index: 2;
          width: min(90%, 7em);
          color: var(--_accent);
          font-size: 0.65em;
          font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
          line-height: 1;
          overflow: hidden;
          pointer-events: none;
          text-overflow: ellipsis;
          text-align: left;
          transform: translate(-50%, 50%);
          white-space: nowrap;
        }
      </style>
      <div class="panel" part="panel">
        <span class="row" part="row"><span class="label" part="label"></span><output part="value"></output></span>
        <div class="range-input" part="input" aria-hidden="true">
          <span class="track" part="track"></span>
          <span class="fill" part="fill"></span>
          <span class="thumb" part="thumb"></span>
        </div>
        <span class="midi-map-label" aria-hidden="true"></span>
      </div>`;

		this.labelElement = this.root.querySelector(".label");
		this.output = this.root.querySelector("output");
		this.input = this.root.querySelector(".range-input");

		this.input.addEventListener("pointerdown", () =>
			this.refreshDragDistance(),
		);
		this.addEventListener("keydown", (event) => {
			this.syncValueControl();
			this.handleValueEditKey(event);
		});
		this.output.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.beginValueEdit();
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
			orientation: this.orientation,
			pointerTarget: this.input,
			drag: {
				axis: this.orientation === "vertical" ? "y" : "x",
				mode: this.interaction,
				distance: 180,
				fineScale: 0.1,
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
			this.orientation,
			this.interaction,
		]);
	}

	syncValueControl() {
		if (!this.valueControl) return;
		const key = this.configurationKey();
		if (key === this.valueControlConfigurationKey) return;
		this.valueControl.configure(this.valueControlOptions());
		this.valueControlConfigurationKey = key;
	}

	refreshDragDistance() {
		if (!this.valueControl || this.interaction !== "relative") return;
		this.syncValueControl();
		const bounds = this.input.getBoundingClientRect();
		const distance =
			this.orientation === "vertical" ? bounds.height : bounds.width;
		this.valueControl.configure({ drag: { distance: distance || 180 } });
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

	get orientation() {
		return this.getAttribute("orientation") === "vertical"
			? "vertical"
			: "horizontal";
	}

	get interaction() {
		return this.getAttribute("interaction") === "relative"
			? "relative"
			: "position";
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
					HTMLElement.prototype.focus?.call(this, { preventScroll: true }),
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

		this.output.replaceChildren(input);
		input.focus();
		if (selectValue) {
			input.select();
		} else {
			input.setSelectionRange(input.value.length, input.value.length);
		}
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

		if (!/^[0-9.+-]$/u.test(event.key)) {
			return false;
		}

		event.preventDefault();
		this.beginValueEdit(event.key, false);
		return true;
	}

	refresh(state = this.valueState) {
		if (!this.input) {
			return;
		}
		if (state) this.valueState = state;
		else return;

		this.labelElement.textContent = this.label;
		this.labelElement.id = this.labelID;
		if (!this.isEditingValue) {
			this.output.textContent = state.valueText;
		}
		this.style.setProperty("--slider-percent", `${state.position * 100}%`);
		this.refreshEditableValue();
	}

	refreshEditableValue() {
		if (!this.editable) {
			this.output.removeAttribute("role");
			this.output.removeAttribute("tabindex");
			this.output.removeAttribute("aria-label");
			this.output.removeAttribute("title");
			return;
		}

		this.output.removeAttribute("role");
		this.output.removeAttribute("tabindex");
		this.output.removeAttribute("aria-label");
		this.output.removeAttribute("title");
	}

	getPercent() {
		return this.getPosition() * 100;
	}

	getPosition() {
		return this.valueState?.position ?? 0;
	}
}

defineElement("compost-slider", CompostSlider);
