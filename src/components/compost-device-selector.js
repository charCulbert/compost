import {
  deviceSettingsDetailFromSnapshot,
  normaliseDeviceSelectorSnapshot,
} from '../device-settings.js';
import { defineElement } from '../utils.js';
import './compost-select.js';

let nextDeviceSelectorID = 1;

function formatSampleRate(value) {
  return `${value} Hz`;
}

function formatBufferSize(value) {
  return `${value} samples`;
}

function checkedValues(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value);
}

function errorMessage(error) {
  return error?.message || String(error || 'Unknown device settings error.');
}

export class CompostDeviceSelector extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'heading', 'busy', 'disabled', 'error'];
  }

  constructor() {
    super();

    this._snapshot = normaliseDeviceSelectorSnapshot({});
    this.requestId = 0;
    this.hostConnection = null;
    this.idBase = `compost-device-selector-${nextDeviceSelectorID++}`;
    this.handleOpenClick = this.handleOpenClick.bind(this);
    this.handleCloseClick = this.handleCloseClick.bind(this);
    this.handleRefreshClick = this.handleRefreshClick.bind(this);
    this.handleSettingChange = this.handleSettingChange.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-device-selector-bg: Canvas;
          --compost-device-selector-text: currentColor;
          --compost-device-selector-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-device-selector-border: color-mix(in srgb, currentColor 30%, transparent);
          --compost-device-selector-control-bg: Canvas;
          --compost-device-selector-control-border: currentColor;
          --compost-device-selector-button-bg: Canvas;
          --compost-device-selector-button-text: currentColor;
          --compost-device-selector-error: currentColor;
          --compost-device-selector-focus-color: currentColor;
          color: var(--compost-device-selector-text);
          display: inline-block;
          font: inherit;
        }
        button {
          box-sizing: border-box;
          min-height: 2em;
          border: 1px solid var(--compost-device-selector-control-border);
          border-radius: 0;
          background: var(--compost-device-selector-button-bg);
          color: var(--compost-device-selector-button-text);
          cursor: pointer;
          padding: 0.25em 0.75em;
          font: inherit;
          white-space: nowrap;
        }
        button:disabled {
          cursor: default;
          opacity: 0.55;
        }
        button:focus-visible,
        input:focus-visible,
        :host(:focus-visible) [data-open] {
          outline: 2px solid var(--compost-device-selector-focus-color);
          outline-offset: 2px;
        }
        dialog {
          box-sizing: border-box;
          inline-size: min(42em, calc(100vw - 2em));
          max-block-size: calc(100vh - 2em);
          border: 1px solid var(--compost-device-selector-control-border);
          border-radius: 0;
          padding: 0;
          background: var(--compost-device-selector-bg);
          color: var(--compost-device-selector-text);
          font: inherit;
        }
        dialog::backdrop {
          background: color-mix(in srgb, CanvasText 45%, transparent);
        }
        .panel {
          display: grid;
          gap: 1em;
          padding: 1em;
        }
        .header,
        .footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75em;
        }
        h2 {
          margin: 0;
          font: inherit;
          font-size: 1em;
          font-weight: 700;
        }
        .settings {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75em 1em;
        }
        .field {
          display: grid;
          gap: 0.35em;
          min-width: 0;
        }
        .field[hidden] {
          display: none !important;
        }
        label,
        legend {
          color: var(--compost-device-selector-muted);
          font-size: 0.85em;
          font-weight: inherit;
        }
        compost-select {
          inline-size: 100%;
        }
        fieldset {
          display: grid;
          gap: 0.5em;
          min-width: 0;
          margin: 0;
          border: 1px solid var(--compost-device-selector-border);
          border-radius: 0;
          padding: 0.75em;
        }
        .midi-devices {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
          gap: 0.5em 1em;
        }
        .midi-devices label {
          display: flex;
          align-items: center;
          gap: 0.5em;
          min-width: 0;
          color: var(--compost-device-selector-text);
          font-size: 0.92em;
          font-weight: inherit;
        }
        .midi-devices input {
          margin: 0;
          accent-color: var(--compost-accent, AccentColor);
        }
        .empty {
          color: var(--compost-device-selector-muted);
          font-size: 0.92em;
        }
        .status {
          min-height: 1.25em;
          color: var(--compost-device-selector-muted);
          font-size: 0.92em;
        }
        .status[data-error] {
          color: var(--compost-device-selector-error);
        }
        [hidden] {
          display: none !important;
        }
        @media (max-width: 560px) {
          .settings {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <button type="button" part="open-button" data-open></button>
      <dialog data-dialog>
        <section class="panel" part="panel" aria-busy="false">
          <div class="header">
            <h2 data-heading></h2>
            <button type="button" part="close-button" data-close>Close</button>
          </div>
          <div class="settings">
            <div class="field" data-audio-api-field>
              <label data-audio-api-label>Audio system</label>
              <compost-select data-setting="audio.api"></compost-select>
            </div>
            <div class="field" data-output-field>
              <label data-output-label>Audio output</label>
              <compost-select data-setting="audio.outputDeviceId"></compost-select>
            </div>
            <div class="field" data-input-field>
              <label data-input-label>Audio input</label>
              <compost-select data-setting="audio.inputDeviceId"></compost-select>
            </div>
            <div class="field" data-sample-rate-field>
              <label data-sample-rate-label>Sample rate</label>
              <compost-select data-setting="audio.sampleRate"></compost-select>
            </div>
            <div class="field" data-buffer-size-field>
              <label data-buffer-size-label>Buffer size</label>
              <compost-select data-setting="audio.bufferSize"></compost-select>
            </div>
          </div>
          <fieldset data-midi-input-field>
            <legend>MIDI inputs</legend>
            <div class="midi-devices" data-midi-inputs></div>
          </fieldset>
          <fieldset data-midi-output-field>
            <legend>MIDI outputs</legend>
            <div class="midi-devices" data-midi-outputs></div>
          </fieldset>
          <div class="status" part="status" role="status" aria-live="polite" aria-atomic="true"></div>
          <div class="footer">
            <button type="button" part="refresh-button" data-refresh>Refresh</button>
          </div>
        </section>
      </dialog>`;

    this.openButton = this.root.querySelector('[data-open]');
    this.dialog = this.root.querySelector('[data-dialog]');
    this.panel = this.root.querySelector('.panel');
    this.closeButton = this.root.querySelector('[data-close]');
    this.refreshButton = this.root.querySelector('[data-refresh]');
    this.heading = this.root.querySelector('[data-heading]');
    this.statusElement = this.root.querySelector('.status');
    this.midiInputs = this.root.querySelector('[data-midi-inputs]');
    this.midiOutputs = this.root.querySelector('[data-midi-outputs]');
    this.fields = {
      audioSystem: this.root.querySelector('[data-audio-api-field]'),
      input: this.root.querySelector('[data-input-field]'),
      output: this.root.querySelector('[data-output-field]'),
      sampleRate: this.root.querySelector('[data-sample-rate-field]'),
      bufferSize: this.root.querySelector('[data-buffer-size-field]'),
      midiInput: this.root.querySelector('[data-midi-input-field]'),
      midiOutput: this.root.querySelector('[data-midi-output-field]'),
    };
    this.selects = {
      audioSystem: this.root.querySelector('[data-setting="audio.api"]'),
      input: this.root.querySelector('[data-setting="audio.inputDeviceId"]'),
      output: this.root.querySelector('[data-setting="audio.outputDeviceId"]'),
      sampleRate: this.root.querySelector('[data-setting="audio.sampleRate"]'),
      bufferSize: this.root.querySelector('[data-setting="audio.bufferSize"]'),
    };
    this.labels = {
      audioSystem: this.root.querySelector('[data-audio-api-label]'),
      input: this.root.querySelector('[data-input-label]'),
      output: this.root.querySelector('[data-output-label]'),
      sampleRate: this.root.querySelector('[data-sample-rate-label]'),
      bufferSize: this.root.querySelector('[data-buffer-size-label]'),
    };
    this.heading.id = `${this.idBase}-heading`;
    this.dialog.setAttribute('aria-labelledby', this.heading.id);

    Object.entries(this.selects).forEach(([key, select]) => {
      const id = `${this.idBase}-${key}`;
      select.id = id;
      this.labels[key].id = `${id}-label`;
      this.labels[key].setAttribute('for', id);
      select.setAttribute('aria-label', this.labels[key].textContent.trim());
      select.addEventListener('change', this.handleSettingChange);
    });
    this.midiInputs.addEventListener('change', this.handleSettingChange);
    this.midiOutputs.addEventListener('change', this.handleSettingChange);
    this.openButton.addEventListener('click', this.handleOpenClick);
    this.closeButton.addEventListener('click', this.handleCloseClick);
    this.refreshButton.addEventListener('click', this.handleRefreshClick);
    this.dialog.addEventListener('close', () => {
      this.refresh();
      this.openButton.focus({ preventScroll: true });
    });
  }

  connectedCallback() {
    this.refresh();
  }

  disconnectedCallback() {
    this.disconnectHost();
  }

  attributeChangedCallback() {
    this.refresh();
  }

  get snapshot() {
    return this._snapshot;
  }

  set snapshot(value) {
    this._snapshot = normaliseDeviceSelectorSnapshot(value);
    this.refresh();
  }

  get busy() {
    return this.hasAttribute('busy');
  }

  set busy(value) {
    this.toggleAttribute('busy', Boolean(value));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  get error() {
    return this.getAttribute('error') || '';
  }

  set error(value) {
    const text = String(value ?? '');
    if (text) {
      this.setAttribute('error', text);
    } else {
      this.removeAttribute('error');
    }
  }

  open() {
    if (this.disabled) return;
    if (typeof this.dialog.showModal === 'function') {
      if (!this.dialog.open) this.dialog.showModal();
    } else {
      this.dialog.setAttribute('open', '');
    }
    this.refresh();
    queueMicrotask(() => this.closeButton.focus({ preventScroll: true }));
  }

  close() {
    if (typeof this.dialog.close === 'function') {
      this.dialog.close();
    } else {
      this.dialog.removeAttribute('open');
      this.refresh();
      this.openButton.focus({ preventScroll: true });
    }
  }

  focus(options) {
    this.openButton?.focus(options);
  }

  applySnapshot(snapshot, { requestId = null } = {}) {
    if (requestId !== null && requestId !== undefined && Number(requestId) < this.requestId) {
      return false;
    }

    this.snapshot = snapshot;
    return true;
  }

  async connectHost({ getSnapshot, applySettings } = {}) {
    if (typeof getSnapshot !== 'function') {
      throw new TypeError('connectHost() requires getSnapshot().');
    }
    if (typeof applySettings !== 'function') {
      throw new TypeError('connectHost() requires applySettings().');
    }

    this.disconnectHost();

    const host = { connected: true };

    host.loadSnapshot = async (event = null) => {
      const requestId = Number(event?.detail?.requestId ?? ++this.requestId);
      this.busy = true;
      this.error = '';

      try {
        const snapshot = await getSnapshot();
        if (!host.connected || requestId < this.requestId) return null;

        this.applySnapshot(snapshot, { requestId });
        return this.snapshot;
      } catch (error) {
        if (host.connected && requestId >= this.requestId) {
          this.error = errorMessage(error);
        }
        return null;
      } finally {
        if (host.connected && requestId >= this.requestId) {
          this.busy = false;
        }
      }
    };

    host.applySettings = async (event) => {
      const request = event.detail;
      const requestId = Number(request?.requestId ?? ++this.requestId);
      this.busy = true;
      this.error = '';

      try {
        const snapshot = await applySettings(request);
        if (!host.connected || requestId < this.requestId) return null;

        this.applySnapshot(snapshot, { requestId });
        return this.snapshot;
      } catch (error) {
        if (host.connected && requestId >= this.requestId) {
          this.error = errorMessage(error);
          this.refresh();
        }
        return null;
      } finally {
        if (host.connected && requestId >= this.requestId) {
          this.busy = false;
        }
      }
    };

    this.addEventListener('device-settings-refresh', host.loadSnapshot);
    this.addEventListener('device-settings-input', host.applySettings);
    this.hostConnection = host;

    return host.loadSnapshot();
  }

  disconnectHost() {
    const host = this.hostConnection;
    if (!host) return;

    host.connected = false;
    this.removeEventListener('device-settings-refresh', host.loadSnapshot);
    this.removeEventListener('device-settings-input', host.applySettings);
    this.hostConnection = null;
  }

  handleOpenClick() {
    this.open();
  }

  handleCloseClick() {
    this.close();
  }

  handleRefreshClick() {
    if (this.disabled || this.busy) return;

    const requestId = ++this.requestId;
    this.dispatchEvent(new CustomEvent('device-settings-refresh', {
      bubbles: true,
      composed: true,
      detail: {
        requestId,
        snapshot: this._snapshot,
      },
    }));
  }

  handleSettingChange(event) {
    if (this.disabled || this.busy) return;

    const changed = event.target?.dataset?.setting || 'midi.inputDeviceIds';
    const detail = this.settingsDetail(changed);

    this.dispatchEvent(new CustomEvent('device-settings-input', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  settingsDetail(changed = '') {
    const requestId = ++this.requestId;
    return deviceSettingsDetailFromSnapshot(this._snapshot, {
      requestId,
      changed,
      audio: {
        api: this.selects.audioSystem.value,
        inputDeviceId: this.selects.input.value,
        outputDeviceId: this.selects.output.value,
        sampleRate: Number(this.selects.sampleRate.value),
        bufferSize: Number(this.selects.bufferSize.value),
      },
      midi: {
        inputDeviceIds: checkedValues(this.midiInputs),
        outputDeviceIds: checkedValues(this.midiOutputs),
      },
    });
  }

  refresh() {
    if (!this.root) return;

    const snapshot = this._snapshot;
    const { audio, midi } = snapshot;
    const disabled = this.disabled || this.busy;
    const label = this.getAttribute('label') || 'Device settings';
    const heading = this.getAttribute('heading') || label;

    this.openButton.textContent = label;
    this.openButton.disabled = this.disabled;
    this.openButton.setAttribute('aria-haspopup', 'dialog');
    this.openButton.setAttribute('aria-expanded', this.dialog.open ? 'true' : 'false');
    this.heading.textContent = heading;
    this.panel.setAttribute('aria-busy', this.busy ? 'true' : 'false');

    this.fillStringSelect(this.selects.audioSystem, audio.apis, audio.api, 'Default');
    this.fillDeviceSelect(this.selects.output, audio.outputDevices, audio.outputDeviceId, 'System default');
    this.fillDeviceSelect(this.selects.input, audio.inputDevices, audio.inputDeviceId, 'System default');
    this.fillNumberSelect(this.selects.sampleRate, audio.sampleRates, audio.sampleRate, formatSampleRate);
    this.fillNumberSelect(this.selects.bufferSize, audio.bufferSizes, audio.bufferSize, formatBufferSize);
    this.renderMIDICheckboxes(this.midiInputs, midi.inputDevices, midi.inputDeviceIds, {
      setting: 'midi.inputDeviceIds',
      emptyLabel: 'No MIDI inputs.',
      idPrefix: 'midi-input',
    });
    this.renderMIDICheckboxes(this.midiOutputs, midi.outputDevices, midi.outputDeviceIds, {
      setting: 'midi.outputDeviceIds',
      emptyLabel: 'No MIDI outputs.',
      idPrefix: 'midi-output',
    });

    this.fields.audioSystem.hidden = !audio.api && audio.apis.length === 0;
    this.fields.input.hidden = audio.requiredInputChannels === 0;
    this.fields.output.hidden = audio.requiredOutputChannels === 0;
    this.fields.sampleRate.hidden = !audio.sampleRate && audio.sampleRates.length === 0;
    this.fields.bufferSize.hidden = !audio.bufferSize && audio.bufferSizes.length === 0;
    this.fields.midiInput.hidden = midi.inputDevices.length === 0;
    this.fields.midiOutput.hidden = midi.outputDevices.length === 0;

    Object.values(this.selects).forEach((select) => {
      select.disabled = disabled || select.optionElements().length === 0;
    });
    this.midiInputs.querySelectorAll('input').forEach((input) => {
      input.disabled = disabled;
    });
    this.midiOutputs.querySelectorAll('input').forEach((input) => {
      input.disabled = disabled;
    });
    this.refreshButton.disabled = disabled;
    this.closeButton.disabled = false;
    this.renderStatus(snapshot);
  }

  renderStatus(snapshot) {
    const error = this.error;

    if (error) {
      this.statusElement.textContent = error;
      this.statusElement.setAttribute('data-error', '');
      return;
    }

    this.statusElement.removeAttribute('data-error');

    if (this.busy) {
      this.statusElement.textContent = 'Applying device settings.';
      return;
    }

    if (!snapshot.raw || Object.keys(snapshot.raw).length === 0) {
      this.statusElement.textContent = 'No device snapshot loaded.';
      return;
    }

    this.statusElement.textContent = 'Device settings loaded.';
  }

  fillDeviceSelect(select, devices, selected, emptyLabel) {
    select.replaceChildren(this.option('', emptyLabel));

    for (const device of devices) {
      select.append(this.option(device.id, device.name));
    }

    if (selected && !devices.some((device) => device.id === selected)) {
      select.append(this.option(selected, selected));
    }

    this.selectValue(select, selected);
  }

  fillStringSelect(select, values, selected, emptyLabel) {
    select.replaceChildren(this.option('', emptyLabel));

    for (const value of values) {
      select.append(this.option(value, value));
    }

    if (selected && !values.includes(selected)) {
      select.append(this.option(selected, selected));
    }

    this.selectValue(select, selected);
  }

  fillNumberSelect(select, values, selected, formatter) {
    select.replaceChildren();

    const options = [...new Set([selected, ...values])]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    for (const value of options) {
      select.append(this.option(String(value), formatter(value)));
    }

    this.selectValue(select, String(selected || ''));
  }

  renderMIDICheckboxes(container, devices, selectedIds, { setting, emptyLabel, idPrefix }) {
    const selected = new Set(selectedIds);
    container.replaceChildren();

    if (!devices.length) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = emptyLabel;
      container.append(empty);
      return;
    }

    devices.forEach((device, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = device.id;
      input.id = `${this.idBase}-${idPrefix}-${index}`;
      input.checked = selected.has(device.id);
      input.dataset.setting = setting;
      label.setAttribute('for', input.id);
      label.append(input, document.createTextNode(device.name));
      container.append(label);
    });
  }

  option(value, label) {
    const option = document.createElement('option');
    option.value = String(value ?? '');
    option.textContent = String(label ?? value ?? '');
    return option;
  }

  selectValue(select, value) {
    const selected = String(value ?? '');

    const options = select.optionElements();
    if (options.some((option) => option.value === selected)) {
      select.value = selected;
    } else if (options.length) {
      select.value = options[0].value;
    }
  }
}

defineElement('compost-device-selector', CompostDeviceSelector);
