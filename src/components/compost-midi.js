import { packMIDIMessage, unpackMIDIMessage } from "../midi.js";
import { defineElement } from "../utils.js";
import "./compost-select.js";

const ALL_INPUTS = "*";
const NO_INPUT = "__none__";

export class CompostMIDI extends HTMLElement {
	static get observedAttributes() {
		return ["input-id", "output-id", "input-only", "output-only"];
	}

	constructor() {
		super();

		this.midiAccess = null;
		this.inputs = [];
		this.outputs = [];
		this.selectedInputID = NO_INPUT;
		this.selectedOutputID = "";
		this.currentInputs = [];
		this.inputListeners = new Map();
		this.connectVersion = 0;
		this.attachVersion = 0;
		this.status = "Connecting";
		this.inputSelectID = `compost-midi-input-${Math.random().toString(36).slice(2)}`;
		this.outputSelectID = `compost-midi-output-${Math.random().toString(36).slice(2)}`;
		this.inputLabelID = `${this.inputSelectID}-label`;
		this.outputLabelID = `${this.outputSelectID}-label`;
		this.inputHelpID = `${this.inputSelectID}-help`;
		this.outputHelpID = `${this.outputSelectID}-help`;

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --compost-midi-text: currentColor;
          --compost-midi-muted: color-mix(in srgb, currentColor 65%, transparent);
          color: var(--compost-midi-text);
          display: block;
          font: inherit;
        }
        .panel {
          display: grid;
          gap: 0.75em;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: inherit;
          font: inherit;
        }
        .row {
          display: grid;
          grid-template-columns: var(--compost-midi-columns, repeat(auto-fit, minmax(min(100%, 8em), 1fr)));
          gap: 1em;
        }
        .field { display: grid; gap: 0.35em; }
        .field[hidden] { display: none !important; }
        label { display: block; font-size: 0.85em; }
        compost-select {
          min-width: 0;
          width: 100%;
        }
        .status { color: var(--compost-midi-muted); font-size: 0.85em; }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }
      </style>
      <div class="panel" part="panel">
        <div class="row">
          <div class="field" part="field input-field" data-input-field>
            <label part="label input-label" data-input-label>MIDI In</label>
            <compost-select part="select input-select" data-input></compost-select>
            <span class="sr-only" data-input-help>Choose a MIDI input device.</span>
          </div>
          <div class="field" part="field output-field" data-output-field>
            <label part="label output-label" data-output-label>MIDI Out</label>
            <compost-select part="select output-select" data-output></compost-select>
            <span class="sr-only" data-output-help>Choose a MIDI output device.</span>
          </div>
        </div>
        <div class="status" part="status" aria-live="polite" aria-atomic="true"></div>
      </div>`;

		this.inputSelect = this.root.querySelector("[data-input]");
		this.outputSelect = this.root.querySelector("[data-output]");
		this.inputLabel = this.root.querySelector("[data-input-label]");
		this.outputLabel = this.root.querySelector("[data-output-label]");
		this.inputField = this.root.querySelector("[data-input-field]");
		this.outputField = this.root.querySelector("[data-output-field]");
		this.inputHelp = this.root.querySelector("[data-input-help]");
		this.outputHelp = this.root.querySelector("[data-output-help]");
		this.statusElement = this.root.querySelector(".status");

		this.inputSelect.id = this.inputSelectID;
		this.outputSelect.id = this.outputSelectID;
		this.inputLabel.id = this.inputLabelID;
		this.outputLabel.id = this.outputLabelID;
		this.inputLabel.setAttribute("for", this.inputSelectID);
		this.outputLabel.setAttribute("for", this.outputSelectID);
		this.inputHelp.id = this.inputHelpID;
		this.outputHelp.id = this.outputHelpID;
		this.inputSelect.setAttribute("aria-labelledby", this.inputLabelID);
		this.outputSelect.setAttribute("aria-labelledby", this.outputLabelID);
		this.inputSelect.setAttribute("aria-describedby", this.inputHelpID);
		this.outputSelect.setAttribute("aria-describedby", this.outputHelpID);
		this.inputSelect.setAttribute("aria-label", "MIDI In");
		this.outputSelect.setAttribute("aria-label", "MIDI Out");
		this.inputSelect.setAttribute(
			"aria-description",
			"Choose a MIDI input device.",
		);
		this.outputSelect.setAttribute(
			"aria-description",
			"Choose a MIDI output device.",
		);

		this.handleInputSelection = () => this.requestInput(this.inputSelect.value);
		this.handleOutputSelection = () =>
			this.requestOutput(this.outputSelect.value);
		this.handleAccessStateChange = () => void this.refreshDevices();
		this.inputSelect.addEventListener("change", this.handleInputSelection);
		this.outputSelect.addEventListener("change", this.handleOutputSelection);
	}

	connectedCallback() {
		this.selectedInputID = this.getAttribute("input-id") || NO_INPUT;
		this.selectedOutputID =
			this.getAttribute("output-id") || this.selectedOutputID;
		void this.connect();
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue === newValue) return;

		if (
			name === "input-only" &&
			newValue !== null &&
			this.hasAttribute("output-only")
		) {
			this.removeAttribute("output-only");
		}

		if (
			name === "output-only" &&
			newValue !== null &&
			this.hasAttribute("input-only")
		) {
			this.removeAttribute("input-only");
		}

		if (name === "input-id") {
			this.selectedInputID = newValue || NO_INPUT;
			if (this.midiAccess) {
				void this.attachInput().then(() => this.refresh());
				return;
			}
		}

		if (name === "output-id") {
			this.selectedOutputID = newValue || "";
			if (this.midiAccess) {
				this.refresh();
				return;
			}
		}

		this.applyVisibility();
		if (this.shouldHideInput()) {
			this.detachInput();
		} else if (this.midiAccess) {
			void this.attachInput().then(() => this.refresh());
			return;
		}
		this.refresh();
	}

	disconnectedCallback() {
		this.connectVersion += 1;
		this.detachInput();

		if (this.midiAccess) {
			this.midiAccess.removeEventListener(
				"statechange",
				this.handleAccessStateChange,
			);
		}
		this.midiAccess = null;
	}

	async connect() {
		if (!navigator.requestMIDIAccess) {
			this.status = "Web MIDI is not available in this browser";
			this.refresh();
			return;
		}

		const version = ++this.connectVersion;
		try {
			const access = await navigator.requestMIDIAccess({
				sysex: this.hasAttribute("sysex"),
				software: true,
			});
			if (!this.isConnected || version !== this.connectVersion) return;

			this.midiAccess?.removeEventListener(
				"statechange",
				this.handleAccessStateChange,
			);
			this.midiAccess = access;
			this.midiAccess.addEventListener(
				"statechange",
				this.handleAccessStateChange,
			);
			await this.refreshDevices();
			if (!this.isConnected || version !== this.connectVersion) return;
			this.dispatchEvent(
				new CustomEvent("midi-ready", {
					bubbles: true,
					composed: true,
					detail: this.deviceState(),
				}),
			);
		} catch (error) {
			this.status = `Could not open MIDI: ${error instanceof Error ? error.message : String(error)}`;
			this.refresh();
		}
	}

	async refreshDevices() {
		if (!this.midiAccess) return;
		this.inputs = [...this.midiAccess.inputs.values()].filter(
			(device) => device.state === "connected",
		);
		this.outputs = [...this.midiAccess.outputs.values()].filter(
			(device) => device.state === "connected",
		);
		this.applyVisibility();
		await this.attachInput();
		this.refresh();

		this.dispatchEvent(
			new CustomEvent("midi-devices-changed", {
				bubbles: true,
				composed: true,
				detail: this.deviceState(),
			}),
		);
	}

	deviceState() {
		return {
			inputs: [...this.inputs],
			outputs: [...this.outputs],
			inputID: this.selectedInputID === NO_INPUT ? "" : this.selectedInputID,
			outputID: this.selectedOutputID,
			input: this.getSelectedInput(),
			output: this.getSelectedOutput(),
			inputConnected:
				this.selectedInputID === ALL_INPUTS
					? this.inputs.length > 0
					: this.selectedInputID === NO_INPUT ||
						Boolean(this.getSelectedInput()),
			outputConnected:
				!this.selectedOutputID || Boolean(this.getSelectedOutput()),
		};
	}

	restoreSelection({
		inputID = "",
		outputID = "",
		inputName = "",
		outputName = "",
	} = {}) {
		const input = this.findDevice(this.inputs, inputID, inputName);
		const output = this.findDevice(this.outputs, outputID, outputName);

		if (input) {
			this.selectInput(input.id);
		} else if (inputName || inputID) {
			this.selectInput(inputID || NO_INPUT);
		} else {
			this.selectInput(NO_INPUT);
		}

		if (output) {
			this.selectOutput(output.id);
		} else if (outputName || outputID) {
			this.selectOutput(outputID);
		}

		return {
			input: this.getSelectedInput(),
			output: this.getSelectedOutput(),
		};
	}

	findDevice(devices, id, name) {
		return (
			devices.find((device) => id && device.id === id) ||
			devices.find((device) => name && device.name === name) ||
			null
		);
	}

	selectInput(id) {
		if (id && id !== NO_INPUT) this.setAttribute("input-id", id);
		else this.removeAttribute("input-id");
	}

	selectOutput(id) {
		if (id) this.setAttribute("output-id", id);
		else this.removeAttribute("output-id");
	}

	requestInput(id) {
		this.dispatchSelectionEvent(
			"midi-input-selected",
			id === NO_INPUT ? "" : id,
			this.inputs.find((input) => input.id === id) || null,
		);
		this.refresh();
	}

	requestOutput(id) {
		this.dispatchSelectionEvent(
			"midi-output-selected",
			id || "",
			this.outputs.find((output) => output.id === id) || null,
		);
		this.refresh();
	}

	dispatchSelectionEvent(type, id, device) {
		this.dispatchEvent(
			new CustomEvent(type, {
				bubbles: true,
				composed: true,
				detail: { id, device },
			}),
		);
	}

	getSelectedInput() {
		if (
			this.selectedInputID === ALL_INPUTS ||
			this.selectedInputID === NO_INPUT
		)
			return null;
		return (
			this.inputs.find((input) => input.id === this.selectedInputID) || null
		);
	}

	getSelectedOutput() {
		return (
			this.outputs.find((output) => output.id === this.selectedOutputID) || null
		);
	}

	async attachInput() {
		this.detachInput();
		const version = this.attachVersion;

		if (this.shouldHideInput()) {
			return;
		}

		const inputs =
			this.selectedInputID === ALL_INPUTS
				? this.inputs
				: this.selectedInputID === NO_INPUT
					? []
					: [this.getSelectedInput()].filter(Boolean);
		const opened = [];
		const errors = [];
		for (const input of inputs) {
			try {
				await input.open?.();
				if (input.connection && input.connection !== "open") {
					throw new Error(
						`Could not open MIDI input: ${input.name || input.id}`,
					);
				}
				opened.push(input);
			} catch (error) {
				errors.push(error);
			}
		}
		if (version !== this.attachVersion) return;
		for (const input of opened) {
			const listener = (event) => this.handleMIDIMessage(event, input);
			input.addEventListener("midimessage", listener);
			this.inputListeners.set(input, listener);
		}
		this.currentInputs = opened;
		this.status = errors.length
			? `Could not open MIDI: ${errors[0] instanceof Error ? errors[0].message : String(errors[0])}`
			: "";
	}

	detachInput() {
		this.attachVersion += 1;
		for (const [input, listener] of this.inputListeners) {
			input.removeEventListener("midimessage", listener);
		}
		this.inputListeners.clear();
		this.currentInputs = [];
	}

	handleMIDIMessage(event, input = this.getSelectedInput()) {
		const data = [...event.data];
		const message = packMIDIMessage(data);
		const receivedAt =
			typeof performance !== "undefined" &&
			typeof performance.now === "function"
				? performance.now()
				: Date.now();

		this.dispatchEvent(
			new CustomEvent("midi-message", {
				bubbles: true,
				composed: true,
				detail: {
					data,
					message,
					timestamp: event.timeStamp ?? null,
					receivedAt,
					input,
				},
			}),
		);
	}

	send(data) {
		if (this.shouldHideOutput()) {
			return;
		}

		const output = this.getSelectedOutput();
		if (output) {
			output.send(data);
		}
	}

	sendPackedMessage(message) {
		this.send(unpackMIDIMessage(message));
	}

	refresh() {
		this.applyVisibility();
		this.fillSelect(
			this.inputSelect,
			this.inputs,
			this.selectedInputID,
			"No device",
			"All devices",
		);
		this.fillSelect(
			this.outputSelect,
			this.outputs,
			this.selectedOutputID,
			"No device",
		);

		if (!this.midiAccess) {
			this.statusElement.textContent = this.status;
			this.statusElement.hidden = !this.status;
			return;
		}

		const waitingInput =
			this.selectedInputID !== ALL_INPUTS &&
			this.selectedInputID !== NO_INPUT &&
			!this.getSelectedInput();
		const waitingOutput = this.selectedOutputID && !this.getSelectedOutput();
		const status =
			this.status ||
			(waitingInput
				? `Waiting for MIDI input ${this.selectedInputID}`
				: waitingOutput
					? `Waiting for MIDI output ${this.selectedOutputID}`
					: "");
		this.statusElement.textContent = status;
		this.statusElement.hidden = !status;
	}

	fillSelect(select, devices, selectedID, emptyLabel, allLabel = null) {
		select.replaceChildren();
		if (allLabel !== null) {
			select.append(new Option("None", NO_INPUT));
			select.append(new Option(allLabel, ALL_INPUTS));
		} else select.append(new Option(emptyLabel, ""));

		for (const device of devices) {
			select.append(new Option(device.name || device.id, device.id));
		}

		if (
			selectedID &&
			selectedID !== ALL_INPUTS &&
			selectedID !== NO_INPUT &&
			!devices.some((device) => device.id === selectedID)
		) {
			select.append(new Option(`Unavailable: ${selectedID}`, selectedID));
		}

		select.value = selectedID || "";
		select.disabled = devices.length === 0 && allLabel === null && !selectedID;
	}

	shouldHideInput() {
		return this.hasAttribute("output-only");
	}

	shouldHideOutput() {
		return this.hasAttribute("input-only");
	}

	applyVisibility() {
		const hideInput = this.shouldHideInput();
		const hideOutput = this.shouldHideOutput();

		if (this.inputField) {
			this.inputField.hidden = hideInput;
		}

		if (this.outputField) {
			this.outputField.hidden = hideOutput;
		}

		if (hideInput) {
			this.detachInput();
		}
	}
}

defineElement("compost-midi", CompostMIDI);
