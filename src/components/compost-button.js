import {
	beginParameterGesture,
	defineElement,
	editParameterGesture,
	endParameterGesture,
	numberAttr,
} from "../utils.js";

export class CompostButton extends HTMLElement {
	static get observedAttributes() {
		return [
			"label",
			"mode",
			"name",
			"parameter-id",
			"section",
			"pressed",
			"value",
			"disabled",
			"aria-label",
			"aria-description",
		];
	}

	constructor() {
		super();
		this.flashTimer = 0;

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          display: inline-block;
          --compost-button-flash-ms: 180ms;
          --_accent: var(--compost-accent, AccentColor);
          font: inherit;
          -webkit-user-select: none;
          user-select: none;
        }
        button {
          box-sizing: border-box;
          width: var(--compost-button-width, var(--compost-button-size, 4em));
          height: var(--compost-button-height, var(--compost-button-size, 4em));
          border: 1px solid currentColor;
          border-radius: 0;
          background: Canvas;
          color: inherit;
          cursor: pointer;
          font: inherit;
          display: grid;
          place-items: center;
          padding: 0;
          text-align: center;
          touch-action: manipulation;
          position: relative;
        }
        :host([pressed]) button,
        :host([data-active-flash]) button {
          background: var(--_accent);
          color: AccentColorText;
        }
        button:disabled {
          cursor: default;
          opacity: 0.45;
        }
        button:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"]) button {
          outline: 2px solid var(--_accent);
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"][midi-map-state~="pulse"]) button {
          outline-offset: 4px;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          bottom: 0.55em;
          z-index: 2;
          max-width: calc(100% - 0.625em);
          color: var(--_accent);
          font-size: 0.65em;
          font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
          line-height: 1;
          overflow: hidden;
          pointer-events: none;
          text-overflow: ellipsis;
          transform: translateX(-50%);
          white-space: nowrap;
        }
        .content {
          grid-area: 1 / 1;
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          padding: var(--compost-button-label-padding, 0 8px);
          pointer-events: none;
          font-size: var(--compost-button-label-size, 0.75em);
          text-align: center;
          line-height: 1;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .content {
          transform: translateY(-0.45em);
        }
        slot {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          line-height: 1.05;
          overflow-wrap: normal;
          word-break: normal;
          white-space: normal;
        }
        .midi-map-label {
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
          z-index: 2;
        }
        .fallback {
          display: block;
          line-height: 1.05;
          max-width: var(--compost-button-label-max-width, calc(100% - 0.75em));
          overflow: visible;
          overflow-wrap: normal;
          text-overflow: clip;
          word-break: normal;
          white-space: normal;
        }
        ::slotted(*) {
          display: block;
          line-height: 1.05;
          max-width: var(--compost-button-label-max-width, calc(100% - 0.75em));
          overflow-wrap: normal;
          word-break: normal;
          white-space: normal;
        }
      </style>
      <button part="button" type="button">
        <span class="content" part="label"><slot><span class="fallback"></span></slot></span>
        <span class="midi-map-label" part="midi-map-label" aria-hidden="true"></span>
      </button>`;

		this.button = this.root.querySelector("button");
		this.fallback = this.root.querySelector(".fallback");

		this.button.addEventListener("click", () => {
			if (this.mode !== "switch") {
				this.trigger("control");
				return;
			}

			beginParameterGesture(this, this.value);
			this.pressed = !this.pressed;
			editParameterGesture(this, this.value);
			this.dispatchEvent(
				new Event("change", {
					bubbles: true,
					composed: true,
				}),
			);
			endParameterGesture(this, this.value);
		});
	}

	connectedCallback() {
		this.refresh();
	}

	disconnectedCallback() {
		clearTimeout(this.flashTimer);
	}

	focus(options) {
		this.button?.focus(options);
	}

	blur() {
		this.button?.blur();
	}

	attributeChangedCallback(name) {
		// `pressed` is the canonical switch state; a `value` attribute is accepted
		// for symmetry with the other parameter controls and maps onto it.
		if (name === "value")
			this.setValue(numberAttr(this, "value", this.value), false);
		this.refresh();
	}

	get mode() {
		return this.getAttribute("mode") === "switch" ? "switch" : "trigger";
	}

	get pressed() {
		return this.hasAttribute("pressed");
	}

	set pressed(value) {
		this.toggleAttribute("pressed", Boolean(value));
	}

	get value() {
		return this.pressed ? 1 : 0;
	}

	set value(value) {
		this.setValue(value, false);
	}

	get parameterID() {
		return this.getAttribute("parameter-id") || "";
	}

	get parameterKind() {
		return this.mode === "switch" ? "discrete" : "trigger";
	}

	get transientParameter() {
		return this.mode !== "switch";
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set disabled(value) {
		this.toggleAttribute("disabled", Boolean(value));
	}

	setValue(value, shouldEmit = true, source = "api") {
		const active = Number(value) >= 0.5;

		if (this.mode !== "switch") {
			if (shouldEmit && active) {
				this.trigger(source);
			}
			return;
		}

		if (this.pressed === active) return;

		this.pressed = active;

		if (shouldEmit) {
			beginParameterGesture(this, active ? 0 : 1, { source });
			editParameterGesture(this, this.value, { source });
			this.dispatchEvent(
				new Event("change", {
					bubbles: true,
					composed: true,
				}),
			);
			endParameterGesture(this, this.value, { source });
		}
	}

	trigger(source = "control") {
		if (this.mode !== "switch") {
			this.flashActive();
		}

		this.dispatchEvent(
			new CustomEvent("button-trigger", {
				bubbles: true,
				composed: true,
				detail: {
					name: this.getAttribute("name") || "",
					parameterID: this.parameterID,
					value: 1,
					source,
				},
			}),
		);
		beginParameterGesture(this, 0, { source });
		editParameterGesture(this, 1, { source });
		editParameterGesture(this, 0, { source });
		endParameterGesture(this, 0, { source });
	}

	flashActive() {
		clearTimeout(this.flashTimer);
		this.setAttribute("data-active-flash", "");

		const duration = this.readDurationCSS("--compost-button-flash-ms", 180);
		this.flashTimer = setTimeout(() => {
			this.removeAttribute("data-active-flash");
			this.flashTimer = 0;
		}, duration);
	}

	readDurationCSS(name, fallback) {
		const raw = getComputedStyle(this).getPropertyValue(name).trim();
		if (!raw) return fallback;

		if (raw.endsWith("ms")) return Number.parseFloat(raw) || fallback;
		if (raw.endsWith("s"))
			return (Number.parseFloat(raw) || fallback / 1000) * 1000;

		const value = Number.parseFloat(raw);
		return Number.isFinite(value) ? value : fallback;
	}

	refresh() {
		const label = this.getAttribute("label") || "";
		this.fallback.textContent = label;
		this.button.disabled = this.disabled;
		this.button.setAttribute(
			"aria-label",
			this.getAttribute("aria-label") ||
				label ||
				this.textContent.trim() ||
				"Button",
		);

		if (this.hasAttribute("aria-description")) {
			this.button.setAttribute(
				"aria-description",
				this.getAttribute("aria-description"),
			);
		} else {
			this.button.removeAttribute("aria-description");
		}

		if (this.mode === "switch") {
			this.button.setAttribute("aria-pressed", String(this.pressed));
		} else {
			this.button.removeAttribute("aria-pressed");
		}
	}
}

defineElement("compost-button", CompostButton);
