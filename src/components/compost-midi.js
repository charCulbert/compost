import { packMIDIMessage, unpackMIDIMessage } from '../midi.js';
import { defineElement } from '../utils.js';
import './compost-select.js';

const ALL_INPUTS = '*';
const NO_INPUT = '__none__';

export class WebMIDI extends HTMLElement {
  static get observedAttributes() {
    return ['input-id', 'output-id', 'input-only', 'output-only'];
  }

  constructor() {
    super();

    this.midiAccess = null;
    this.inputs = [];
    this.outputs = [];
    this.selectedInputID = ALL_INPUTS;
    this.selectedOutputID = '';
    this.status = 'Connecting';
    this.inputSelectID = `compost-midi-input-${Math.random().toString(36).slice(2)}`;
    this.outputSelectID = `compost-midi-output-${Math.random().toString(36).slice(2)}`;
    this.inputLabelID = `${this.inputSelectID}-label`;
    this.outputLabelID = `${this.outputSelectID}-label`;
    this.inputHelpID = `${this.inputSelectID}-help`;
    this.outputHelpID = `${this.outputSelectID}-help`;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-midi-panel-bg: transparent;
          --compost-midi-border: transparent;
          --compost-midi-text: #111111;
          --compost-midi-muted: #555555;
          --compost-midi-control-bg: #ffffff;
          --compost-midi-control-border: #111111;
          --compost-midi-focus-color: #111111;
          --compost-midi-color-scheme: light;
          color-scheme: var(--compost-midi-color-scheme);
          display: block;
        }
        .panel {
          display: grid;
          gap: 12px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: var(--compost-midi-text);
          font-size: 13px;
        }
        .row {
          display: grid;
          grid-template-columns: var(--compost-midi-columns, repeat(auto-fit, minmax(min(100%, 130px), 1fr)));
          gap: 12px;
        }
        .field { display: grid; gap: 7px; }
        .field[hidden] { display: none !important; }
        label { display: block; }
        compost-select {
          --compost-select-bg: var(--compost-midi-control-bg);
          --compost-select-border: var(--compost-midi-control-border);
          --compost-select-text: var(--compost-midi-text);
          --compost-select-active-bg: var(--compost-midi-focus-color);
          --compost-select-active-text: var(--compost-midi-active-text, var(--compost-midi-control-bg));
          --compost-select-hover-bg: color-mix(in srgb, var(--compost-midi-control-bg) 82%, var(--compost-midi-text));
          --compost-select-focus: var(--compost-midi-focus-color);
          --compost-select-height: 30px;
          min-width: 0;
          width: 100%;
        }
        .status { color: var(--compost-midi-muted); font-size: 12px; opacity: 0.72; }
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

    this.inputSelect = this.root.querySelector('[data-input]');
    this.outputSelect = this.root.querySelector('[data-output]');
    this.inputLabel = this.root.querySelector('[data-input-label]');
    this.outputLabel = this.root.querySelector('[data-output-label]');
    this.inputField = this.root.querySelector('[data-input-field]');
    this.outputField = this.root.querySelector('[data-output-field]');
    this.inputHelp = this.root.querySelector('[data-input-help]');
    this.outputHelp = this.root.querySelector('[data-output-help]');
    this.statusElement = this.root.querySelector('.status');

    this.inputSelect.id = this.inputSelectID;
    this.outputSelect.id = this.outputSelectID;
    this.inputLabel.id = this.inputLabelID;
    this.outputLabel.id = this.outputLabelID;
    this.inputLabel.setAttribute('for', this.inputSelectID);
    this.outputLabel.setAttribute('for', this.outputSelectID);
    this.inputHelp.id = this.inputHelpID;
    this.outputHelp.id = this.outputHelpID;
    this.inputSelect.setAttribute('aria-labelledby', this.inputLabelID);
    this.outputSelect.setAttribute('aria-labelledby', this.outputLabelID);
    this.inputSelect.setAttribute('aria-describedby', this.inputHelpID);
    this.outputSelect.setAttribute('aria-describedby', this.outputHelpID);
    this.inputSelect.setAttribute('aria-label', 'MIDI In');
    this.outputSelect.setAttribute('aria-label', 'MIDI Out');
    this.inputSelect.setAttribute('aria-description', 'Choose a MIDI input device.');
    this.outputSelect.setAttribute('aria-description', 'Choose a MIDI output device.');

    this.inputSelect.addEventListener('change', () => this.selectInput(this.inputSelect.value));
    this.outputSelect.addEventListener('change', () => this.selectOutput(this.outputSelect.value));
  }

  connectedCallback() {
    if (this.hasAttribute('input-id')) {
      this.selectedInputID = this.getAttribute('input-id') || NO_INPUT;
    }
    this.selectedOutputID = this.getAttribute('output-id') || this.selectedOutputID;
    this.connect();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'input-only' && newValue !== null && this.hasAttribute('output-only')) {
      this.removeAttribute('output-only');
    }

    if (name === 'output-only' && newValue !== null && this.hasAttribute('input-only')) {
      this.removeAttribute('input-only');
    }

    if (name === 'input-id') {
      this.selectedInputID = newValue === null ? ALL_INPUTS : newValue || NO_INPUT;
      if (this.midiAccess) {
        this.selectInput(this.selectedInputID);
        return;
      }
    }

    if (name === 'output-id') {
      this.selectedOutputID = newValue || '';
      if (this.midiAccess) {
        this.selectOutput(this.selectedOutputID);
        return;
      }
    }

    this.applyVisibility();
    if (this.shouldHideInput()) {
      this.detachInput();
    } else if (this.midiAccess) {
      this.attachInput();
    }
    this.refresh();
  }

  disconnectedCallback() {
    this.detachInput();

    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
    }
  }

  async connect() {
    if (!navigator.requestMIDIAccess) {
      this.status = 'Web MIDI is not available in this browser';
      this.refresh();
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({
        sysex: this.hasAttribute('sysex'),
        software: true,
      });

      this.midiAccess.onstatechange = () => this.refreshDevices();
      this.refreshDevices();
      this.dispatchEvent(new CustomEvent('midi-ready', { bubbles: true, composed: true }));
    } catch (error) {
      this.status = `Could not open MIDI: ${error.message}`;
      this.refresh();
    }
  }

  refreshDevices() {
    this.inputs = [...this.midiAccess.inputs.values()].filter((device) => device.state === 'connected');
    this.outputs = [...this.midiAccess.outputs.values()].filter((device) => device.state === 'connected');
    this.selectedInputID = this.keepInput(this.selectedInputID, this.inputs);
    this.selectedOutputID = this.keepDevice(this.selectedOutputID, this.outputs);
    this.applyVisibility();
    this.attachInput();
    this.refresh();

    this.dispatchEvent(new CustomEvent('midi-devices-changed', {
      bubbles: true,
      composed: true,
      detail: {
        inputs: this.inputs,
        outputs: this.outputs,
        input: this.getSelectedInput(),
        output: this.getSelectedOutput(),
      },
    }));
  }

  restoreSelection({ inputID = '', outputID = '', inputName = '', outputName = '' } = {}) {
    const input = this.findDevice(this.inputs, inputID, inputName);
    const output = this.findDevice(this.outputs, outputID, outputName);

    if (input) {
      this.selectInput(input.id);
    } else if (inputName || inputID) {
      this.selectInput(inputID || NO_INPUT);
    } else {
      this.selectInput(ALL_INPUTS);
    }

    if (output) {
      this.selectOutput(output.id);
    }

    return {
      input: this.getSelectedInput(),
      output: this.getSelectedOutput(),
    };
  }

  findDevice(devices, id, name) {
    return devices.find((device) => id && device.id === id)
      || devices.find((device) => name && device.name === name)
      || null;
  }

  keepInput(id, devices) {
    if (id === ALL_INPUTS || id === NO_INPUT) return id;
    return devices.some((device) => device.id === id) ? id : ALL_INPUTS;
  }

  keepDevice(id, devices) {
    return devices.some((device) => device.id === id) ? id : '';
  }

  selectInput(id) {
    this.selectedInputID = id || NO_INPUT;
    this.attachInput();
    this.refresh();
    this.dispatchSelectionEvent('midi-input-selected', this.getSelectedInput());
  }

  selectOutput(id) {
    this.selectedOutputID = id;
    this.refresh();
    this.dispatchSelectionEvent('midi-output-selected', this.getSelectedOutput());
  }

  dispatchSelectionEvent(type, device) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { device },
    }));
  }

  getSelectedInput() {
    if (this.selectedInputID === ALL_INPUTS || this.selectedInputID === NO_INPUT) return null;
    return this.inputs.find((input) => input.id === this.selectedInputID) || null;
  }

  getSelectedOutput() {
    return this.outputs.find((output) => output.id === this.selectedOutputID) || null;
  }

  attachInput() {
    this.detachInput();

    if (this.shouldHideInput()) {
      return;
    }

    const inputs = this.selectedInputID === ALL_INPUTS
      ? this.inputs
      : this.selectedInputID === NO_INPUT
        ? []
        : [this.getSelectedInput()].filter(Boolean);
    for (const input of inputs) {
      input.onmidimessage = event => this.handleMIDIMessage(event, input);
    }
    this.currentInputs = inputs;
  }

  detachInput() {
    for (const input of this.currentInputs || []) input.onmidimessage = null;
    this.currentInputs = [];
  }

  handleMIDIMessage(event, input = this.getSelectedInput()) {
    const data = [...event.data];
    const message = packMIDIMessage(data);
    const receivedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

    this.dispatchEvent(new CustomEvent('midi-message', {
      bubbles: true,
      composed: true,
      detail: {
        data,
        message,
        timestamp: event.timeStamp ?? null,
        receivedAt,
        input,
      },
    }));
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
    this.fillSelect(this.inputSelect, this.inputs, this.selectedInputID, 'No device', 'All devices');
    this.fillSelect(this.outputSelect, this.outputs, this.selectedOutputID, 'No device');

    if (!this.midiAccess) {
      this.statusElement.textContent = this.status;
      this.statusElement.hidden = !this.status;
      return;
    }

    this.statusElement.textContent = '';
    this.statusElement.hidden = true;
  }

  fillSelect(select, devices, selectedID, emptyLabel, allLabel = null) {
    select.replaceChildren();
    if (allLabel !== null) {
      select.append(new Option('None', NO_INPUT));
      select.append(new Option(allLabel, ALL_INPUTS));
    }
    else select.append(new Option(emptyLabel, ''));

    if (devices.length === 0) {
      select.disabled = true;
      return;
    }

    select.disabled = false;

    for (const device of devices) {
      select.append(new Option(device.name || device.id, device.id));
    }

    select.value = selectedID || '';
  }

  shouldHideInput() {
    return this.hasAttribute('output-only');
  }

  shouldHideOutput() {
    return this.hasAttribute('input-only');
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

defineElement('compost-midi', WebMIDI);
