import {
	beginParameterGesture,
	defineElement,
	editParameterGesture,
	endParameterGesture,
} from "../utils.js";

let nextSelectID = 1;

/**
 * A native select with the same discrete-parameter contract as Compost's
 * continuous controls. Option values stay strings for normal HTML use; the
 * parameter surface is numeric when `parameter-id` is present.
 */
export class CompostSelect extends HTMLElement {
	static get observedAttributes() {
		return [
			"value",
			"disabled",
			"label",
			"name",
			"parameter-id",
			"aria-label",
			"aria-labelledby",
			"aria-description",
			"aria-describedby",
		];
	}

	constructor() {
		super();

		this.parameterID = "";
		this.lastUpdateSource = "control";
		const id = `compost-select-${nextSelectID++}`;

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --_accent: var(--compost-accent, AccentColor);
          display: inline-grid;
          gap: 0.4em;
          min-inline-size: 0;
          color: inherit;
          font: inherit;
        }
        label {
          font-size: 0.8125em;
          line-height: 1.2;
        }
        label:empty { display: none; }
        select {
          min-inline-size: 8em;
          font: inherit;
        }
        :host([midi-map-state~="active"]) select {
          outline: 2px solid var(--_accent);
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"][midi-map-state~="pulse"]) select {
          outline-offset: 4px;
        }
        .midi-map-label {
          display: none;
          min-inline-size: 0;
          overflow: hidden;
          color: var(--_accent);
          font-size: 0.65em;
          font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
          line-height: 1;
          pointer-events: none;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .midi-map-label {
          display: block;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .midi-map-label::after {
          content: var(--midi-map-label);
        }
        slot { display: none; }
      </style>
      <label part="label"></label>
      <select part="input"></select>
      <span class="midi-map-label" part="midi-map-label" aria-hidden="true"></span>
      <slot></slot>`;

		this.labelElement = this.root.querySelector("label");
		this.select = this.root.querySelector("select");
		this.labelElement.htmlFor = id;
		this.select.id = id;
		this.select.addEventListener("change", (event) => this.handleChange(event));

		this.observer =
			typeof MutationObserver === "function"
				? new MutationObserver(() => this.refresh())
				: null;
	}

	connectedCallback() {
		this.observer?.observe(this, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ["disabled", "label", "selected", "value"],
		});
		this.refresh();
	}

	disconnectedCallback() {
		this.observer?.disconnect();
	}

	attributeChangedCallback() {
		this.refresh();
	}

	get value() {
		return this.getAttribute("value") ?? "";
	}

	set value(value) {
		this.setValue(value, false);
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set disabled(value) {
		this.toggleAttribute("disabled", Boolean(value));
	}

	get parameterKind() {
		return "discrete";
	}

	get parameterValues() {
		const values = this.optionElements()
			.map((option) => Number(option.value))
			.filter(Number.isFinite);
		return values.length ? values : null;
	}

	get min() {
		return Math.min(...(this.parameterValues ?? [0]));
	}

	get max() {
		return Math.max(...(this.parameterValues ?? [1]));
	}

	get step() {
		return 0;
	}

	getParameterValue() {
		const value = Number(this.value);
		return Number.isFinite(value) ? value : 0;
	}

	optionElements() {
		return [...this.children].filter((child) => child.tagName === "OPTION");
	}

	refresh() {
		if (!this.select) return;

		this.parameterID = this.getAttribute("parameter-id") || "";
		const options = this.optionElements();
		if (!this.hasAttribute("value")) {
			const initial =
				options.find((option) => option.selected && !option.disabled) ||
				options.find((option) => !option.disabled);
			if (initial) this.setAttribute("value", initial.value);
		}

		this.select.replaceChildren(
			...options.map((option) => option.cloneNode(true)),
		);
		this.select.value = this.value;
		this.select.disabled = this.disabled;
		this.select.name = this.getAttribute("name") || "";

		const label = this.getAttribute("label") || "";
		this.labelElement.textContent = label;
		this.copyAriaAttribute("aria-label", label || "Select");
		this.copyAriaAttribute("aria-labelledby");
		this.copyAriaAttribute("aria-description");
		this.copyAriaAttribute("aria-describedby");
	}

	copyAriaAttribute(name, fallback = "") {
		const value = this.getAttribute(name) || fallback;
		if (value) this.select.setAttribute(name, value);
		else this.select.removeAttribute(name);
	}

	setValue(value, shouldEmit = true, source = "control") {
		const requestedValue = Number(value);
		const option = this.optionElements().find(
			(candidate) =>
				candidate.value === String(value) ||
				(this.parameterID &&
					Number.isFinite(requestedValue) &&
					Number(candidate.value) === requestedValue),
		);
		if (!option || option.disabled || option.value === this.value) return false;

		this.lastUpdateSource = source;
		this.setAttribute("value", option.value);
		if (shouldEmit)
			editParameterGesture(this, this.getParameterValue(), { source });
		return true;
	}

	handleChange(event) {
		event.stopPropagation();
		const value = this.select.value;
		if (this.parameterID) {
			beginParameterGesture(this, this.getParameterValue());
			this.setValue(value, true, "control");
			endParameterGesture(this, this.getParameterValue());
		} else {
			this.setValue(value, false, "control");
		}
		this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
	}
}

defineElement("compost-select", CompostSelect);
