import { createMIDILearnUI } from '../midi-learn-ui.js';
import { defineElement } from '../utils.js';
import './compost-number-box.js';

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function mappingSortKey(mapping) {
  return [
    mapping.label || mapping.name || '',
    mapping.parameterID || '',
  ].join('\u0000').toLowerCase();
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(6)));
}

export class MIDIMappingsEditor extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'heading', 'label'];
  }

  constructor() {
    super();

    this._mappings = null;
    this.controller = null;
    this.pendingFocusRequest = null;
    this.handleMappingChange = this.handleMappingChange.bind(this);
    this.handleFieldChange = this.handleFieldChange.bind(this);
    this.handleRowClick = this.handleRowClick.bind(this);
    this.handleRowKeyDown = this.handleRowKeyDown.bind(this);
    this.handleRowPointerDown = this.handleRowPointerDown.bind(this);
    this.clearMappings = this.clearMappings.bind(this);
    this.instructionsID = `compost-midi-mappings-instructions-${Math.random().toString(36).slice(2)}`;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-midi-mappings-bg: transparent;
          --compost-midi-mappings-border: color-mix(in srgb, currentColor 30%, transparent);
          --compost-midi-mappings-text: currentColor;
          --compost-midi-mappings-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-midi-mappings-row-bg: Canvas;
          --compost-midi-mappings-head-bg: color-mix(in srgb, currentColor 10%, transparent);
          --compost-midi-mappings-head-text: currentColor;
          --compost-midi-mappings-field-fill: color-mix(in srgb, var(--compost-accent, AccentColor) 18%, transparent);
          --compost-midi-mappings-focus-color: currentColor;
          --compost-midi-mappings-action-bg: transparent;
          --compost-midi-mappings-action-text: var(--compost-midi-mappings-text);
          --compost-midi-mappings-action-border: var(--compost-midi-mappings-border);
          --compost-midi-mappings-learn-color: var(--compost-accent, AccentColor);
          --compost-midi-mappings-table-width: 100%;
          color: var(--compost-midi-mappings-text);
          display: block;
          font: inherit;
        }
        .panel {
          display: grid;
          gap: 0.5em;
          padding: 0;
          background: var(--compost-midi-mappings-bg);
        }
        .header {
          display: block;
        }
        .table-scroll {
          overflow-x: auto;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5em;
        }
        button {
          min-height: 2em;
          border: 1px solid var(--compost-midi-mappings-action-border);
          border-radius: 0;
          background: var(--compost-midi-mappings-action-bg);
          color: var(--compost-midi-mappings-action-text);
          cursor: pointer;
          font: inherit;
          font-size: 0.85em;
          padding: 0.25em 0.75em;
        }
        button.clear-button {
          background: transparent;
        }
        button[data-midi-learn-state="selecting"],
        button[data-midi-learn-state="learning"] {
          outline: 2px solid var(--compost-midi-mappings-learn-color);
          outline-offset: 2px;
        }
        button:disabled {
          cursor: default;
          opacity: 0.45;
        }
        button:focus-visible {
          outline: 2px solid var(--compost-midi-mappings-focus-color);
          outline-offset: 2px;
        }
        h2 {
          margin: 0;
          font: inherit;
          font-size: 1em;
          font-weight: 700;
        }
        .empty,
        .status,
        .meta {
          color: var(--compost-midi-mappings-muted);
          font-size: 0.9em;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        table {
          border-collapse: collapse;
          table-layout: fixed;
          width: min(100%, var(--compost-midi-mappings-table-width));
          min-width: min(24em, 100%);
          border: 1px solid var(--compost-midi-mappings-border);
          -webkit-user-select: none;
          user-select: none;
        }
        col.channel {
          width: 4.5em;
        }
        col.cc {
          width: 3.5em;
        }
        col.min,
        col.max {
          width: 4em;
        }
        thead {
          background: var(--compost-midi-mappings-head-bg);
          color: var(--compost-midi-mappings-head-text);
          font-size: 0.7em;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        table {
          /* the UA gives tables their own font, which would cut the component
             off from the host typography every other size here is relative to */
          font: inherit;
        }
        th {
          text-align: left;
          text-transform: uppercase;
        }
        th,
        td {
          height: 1.5em;
          padding: 0 0.25em;
          border-left: 1px solid var(--compost-midi-mappings-border);
          vertical-align: middle;
        }
        td.field {
          padding: 0;
        }
        th:first-child,
        td:first-child {
          border-left: 0;
        }
        tr {
          border-top: 1px solid var(--compost-midi-mappings-border);
          background: var(--compost-midi-mappings-row-bg);
        }
        tbody tr:hover,
        tbody tr:focus-within {
          background: color-mix(in srgb, currentColor 10%, var(--compost-midi-mappings-row-bg));
        }
        tbody tr:first-child {
          border-top: 0;
        }
        tr:focus-visible {
          outline: 2px solid var(--compost-midi-mappings-focus-color);
          outline-offset: -2px;
        }
        .name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 700;
          font-size: 0.78em;
          line-height: 1;
        }
        .cell {
          display: grid;
          align-items: center;
          min-width: 0;
          min-height: 1.5em;
        }
        .control {
          gap: 0.0625em;
        }
        .control-cell {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.3em;
          align-items: center;
          min-width: 0;
        }
        button.row-delete {
          min-width: 1.75em;
          min-height: 1.5em;
          border: 0;
          background: transparent;
          padding: 0;
        }
        button.row-delete:hover {
          background: color-mix(in srgb, currentColor 10%, transparent);
        }
        compost-number-box {
          --number-box-width: 100%;
          --number-box-height: 1.5em;
          --number-box-font-size: 0.72em;
          --number-box-font-weight: 700;
          --number-box-padding: 0 0.2em;
          --number-box-text-align: right;
          display: block;
          inline-size: 100%;
          -webkit-user-select: none;
          user-select: none;
        }
        compost-number-box::part(box) {
          border: 0;
          background: transparent;
        }
        caption {
          text-align: left;
        }
        code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9em;
        }
        [hidden] {
          display: none !important;
        }
      </style>
      <section class="panel" part="panel" aria-labelledby="compost-midi-mappings-heading" aria-describedby="${this.instructionsID}">
        <div class="header">
          <h2 id="compost-midi-mappings-heading" part="heading" data-heading></h2>
        </div>
        <div class="toolbar">
          <button class="map-button" type="button" aria-pressed="false" aria-keyshortcuts="M Delete Backspace Escape">Map MIDI</button>
          <button class="clear-button" type="button">Clear MIDI Mappings</button>
        </div>
        <p class="sr-only" id="${this.instructionsID}" data-instructions>
          MIDI mappings editor. This table lists learned MIDI mappings.
          Edit channel, CC, minimum, and maximum fields. Leave channel blank for any channel.
          Use its remove button, or focus a mapping row and press Delete or Backspace, to clear it.
        </p>
        <p class="empty" data-empty>No MIDI mappings yet.</p>
        <div class="table-scroll" data-table-scroll>
          <table data-table>
            <caption class="sr-only" data-caption>MIDI mappings editor</caption>
            <colgroup>
              <col class="channel">
              <col class="cc">
              <col class="control">
              <col class="min">
              <col class="max">
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">CC</th>
                <th scope="col">Control</th>
                <th scope="col">Min</th>
                <th scope="col">Max</th>
              </tr>
            </thead>
            <tbody data-list></tbody>
          </table>
        </div>
        <div class="status" data-status aria-live="polite" aria-atomic="true"></div>
      </section>`;

    this.heading = this.root.querySelector('[data-heading]');
    this.mapButton = this.root.querySelector('.map-button');
    this.clearButton = this.root.querySelector('.clear-button');
    this.empty = this.root.querySelector('[data-empty]');
    this.tableScroll = this.root.querySelector('[data-table-scroll]');
    this.table = this.root.querySelector('[data-table]');
    this.caption = this.root.querySelector('[data-caption]');
    this.list = this.root.querySelector('[data-list]');
    this.status = this.root.querySelector('[data-status]');

    this.list.addEventListener('parameter-end', this.handleFieldChange);
    this.list.addEventListener('click', this.handleRowClick);
    this.list.addEventListener('keydown', this.handleRowKeyDown);
    this.list.addEventListener('pointerdown', this.handleRowPointerDown);
    this.clearButton.addEventListener('click', this.clearMappings);
  }

  connectedCallback() {
    this.connectMappings();
    this.connectController();
    this.refresh();
  }

  disconnectedCallback() {
    this.disconnectController();
    this.disconnectMappings();
  }

  attributeChangedCallback() {
    this.refresh();
  }

  get mappings() {
    return this._mappings;
  }

  set mappings(value) {
    if (this._mappings === value) return;

    this.disconnectController();
    this.disconnectMappings();
    this._mappings = value;
    this.connectMappings();
    this.connectController();
    this.refresh();
  }

  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { this.toggleAttribute('disabled', Boolean(value)); }

  connectController() {
    if (!this.isConnected || !this._mappings) return;

    this.disconnectController();
    this.controller = createMIDILearnUI({
      mappings: this._mappings,
      root: document,
      button: this.mapButton,
      status: this.status,
      onStateChange: (state) => {
        this.dispatchEvent(new CustomEvent('midi-map-mode-change', {
          detail: { active: state !== 'idle', state },
        }));
      },
    });
  }

  disconnectController() {
    this.controller?.disconnect();
    this.controller = null;
  }

  connectMappings() {
    if (!this.isConnected || !this._mappings) return;

    ['midi-map', 'midi-unmap', 'midi-learn-begin', 'midi-learn-cancel'].forEach((type) => {
      this._mappings.addEventListener?.(type, this.handleMappingChange);
    });
  }

  disconnectMappings() {
    if (!this._mappings) return;

    ['midi-map', 'midi-unmap', 'midi-learn-begin', 'midi-learn-cancel'].forEach((type) => {
      this._mappings.removeEventListener?.(type, this.handleMappingChange);
    });
  }

  listMappings() {
    return [...(this._mappings?.all?.() || [])]
      .sort((a, b) => mappingSortKey(a).localeCompare(mappingSortKey(b)));
  }

  handleMappingChange(event) {
    if (event.type === 'midi-map') {
      this.announce(`${event.detail?.label || event.detail?.parameterID || 'Control'} mapped to ${event.detail?.mappingLabel || 'MIDI CC'}.`);
    } else if (event.type === 'midi-unmap') {
      this.announce(`${event.detail?.label || event.detail?.parameterID || 'Control'} mapping cleared.`);
    } else if (event.type === 'midi-learn-begin') {
      this.announce(`Move a MIDI CC to map ${event.detail?.label || event.detail?.parameterID || 'the selected control'}.`);
    }

    const focusRequest = event.type === 'midi-map' ? this.pendingFocusRequest : null;
    const focusDescriptor = focusRequest?.descriptor || null;
    if (focusRequest) {
      focusRequest.handled = true;
      this.pendingFocusRequest = null;
    }
    this.refresh({ focusDescriptor });
  }

  handleFieldChange(event) {
    if (event.detail?.cancelled) return;

    const control = event.target.closest?.('compost-number-box[data-field]');
    if (!control) return;

    const row = control.closest('[data-parameter-id]');
    const parameterID = row?.dataset.parameterId;
    if (!parameterID) return;

    const ccBox = row.querySelector('compost-number-box[data-field="cc"]');
    const channelBox = row.querySelector('compost-number-box[data-field="channel"]');
    const minBox = row.querySelector('compost-number-box[data-field="min"]');
    const maxBox = row.querySelector('compost-number-box[data-field="max"]');
    const cc = Number(ccBox.value);
    const channel = channelBox.value === null ? null : Number(channelBox.value);
    const min = Number(minBox.value);
    const max = Number(maxBox.value);
    const focusDescriptor = event.detail?.restoreFocus === false ? null : this.focusDescriptorFor(control);

    if (!Number.isInteger(cc) || cc < 0 || cc > 127) {
      this.announce('CC must be a number from 0 to 127.');
      this.refresh({ focusDescriptor });
      return;
    }

    if (channel !== null && (!Number.isInteger(channel) || channel < 1 || channel > 16)) {
      this.announce('Channel must be blank or a number from 1 to 16.');
      this.refresh({ focusDescriptor });
      return;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      this.announce('Min and max must be numbers.');
      this.refresh({ focusDescriptor });
      return;
    }

    const mapping = this.mappingFor(parameterID);
    const focusRequest = { descriptor: focusDescriptor, handled: false };
    this.pendingFocusRequest = focusRequest;
    const didMap = this._mappings?.requestSet?.({ parameterID, cc, channel, min, max });
    if (this.pendingFocusRequest === focusRequest) {
      this.pendingFocusRequest = null;
    }
    if (didMap && !focusRequest.handled) {
      this.refresh({ focusDescriptor });
    }
    if (didMap) {
      this.announce(`${mapping?.label || parameterID} mapped to ${channel === null ? `CC ${cc}` : `ch ${channel} CC ${cc}`} from ${formatNumber(min)} to ${formatNumber(max)}.`);
    }
  }

  handleRowKeyDown(event) {
    if (event.target?.closest?.('compost-number-box, input, button')) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (this.hasAttribute('disabled') || !this._mappings) return;

    const row = event.target.closest?.('[data-parameter-id]');
    const parameterID = row?.dataset.parameterId;
    if (!parameterID) return;

    event.preventDefault();
    this.clearMapping(parameterID);
  }

  handleRowClick(event) {
    const button = event.target?.closest?.('button[data-clear-mapping]');
    const parameterID = button?.dataset.clearMapping;
    if (!parameterID || this.hasAttribute('disabled') || !this._mappings) return;

    this.clearMapping(parameterID);
  }

  handleRowPointerDown(event) {
    if (event.target?.closest?.('compost-number-box, input, button')) return;
    event.target.closest?.('[data-parameter-id]')?.focus();
  }

  clearMapping(parameterID) {
    const mapping = this.mappingFor(parameterID);
    if (this._mappings?.requestClear?.(parameterID)) {
      this.announce(`${mapping?.label || parameterID} mapping cleared.`);
      this.refresh();
    }
  }

  clearMappings() {
    const mappings = this.listMappings();
    for (const mapping of mappings) this._mappings?.requestClear?.(mapping.parameterID);
    this.announce(mappings.length ? 'MIDI mappings cleared.' : 'No MIDI mappings to clear.');
  }

  mappingFor(parameterID) {
    return this.listMappings().find((mapping) => mapping.parameterID === parameterID) || null;
  }

  parameterBoundsFor(mapping) {
    const definition = this._mappings?.parameterProvider?.definition?.(mapping.parameterID);
    const definitionMin = Number(definition?.min);
    const definitionMax = Number(definition?.max);
    return {
      min: Number.isFinite(definitionMin) ? Math.min(definitionMin, mapping.min) : mapping.min,
      max: Number.isFinite(definitionMax) ? Math.max(definitionMax, mapping.max) : mapping.max,
    };
  }

  announce(message) {
    this.status.textContent = message;
  }

  focusDescriptorFor(control) {
    const row = control?.closest?.('[data-parameter-id]');
    const parameterID = row?.dataset.parameterId;
    const field = control?.dataset.field;
    return parameterID && field ? { parameterID, field } : null;
  }

  restoreFocus(descriptor) {
    if (!descriptor) return;

    queueMicrotask(() => {
      if (!this.isConnected) return;

      const row = [...this.list.querySelectorAll('[data-parameter-id]')]
        .find((candidate) => candidate.dataset.parameterId === descriptor.parameterID);
      const control = [...(row?.querySelectorAll('compost-number-box[data-field]') || [])]
        .find((candidate) => candidate.dataset.field === descriptor.field);
      control?.focus?.({ preventScroll: true });
    });
  }

  refresh({ focusDescriptor = null } = {}) {
    const disabled = this.hasAttribute('disabled') || !this._mappings;
    const mappings = this.listMappings();
    const hasMappings = mappings.length > 0;
    const disabledAttr = disabled ? ' disabled' : '';

    this.mapButton.disabled = disabled;
    this.clearButton.disabled = disabled || !hasMappings;
    if (!this.controller || this.controller.state === 'idle') {
      this.mapButton.textContent = 'Map MIDI';
    }
    this.heading.textContent = this.getAttribute('heading') || this.getAttribute('label') || 'MIDI mappings';
    this.caption.textContent = `${this.heading.textContent} editor table`;
    this.empty.hidden = hasMappings;
    this.tableScroll.hidden = !hasMappings;
    this.table.hidden = !hasMappings;
    this.list.innerHTML = mappings.map((mapping) => {
      const bounds = this.parameterBoundsFor(mapping);
      return `
      <tr tabindex="0" data-parameter-id="${escapeHTML(mapping.parameterID)}" aria-label="${escapeHTML(this.rowLabel(mapping))}">
        <td class="field">
          <compost-number-box data-field="channel" label="${escapeHTML(mapping.label || mapping.parameterID)} mapping channel" min="1" max="16" step="1" placeholder="all" allow-empty value="${mapping.channel === null ? '' : escapeHTML(mapping.channel)}"${disabledAttr}></compost-number-box>
        </td>
        <td class="field">
          <compost-number-box data-field="cc" label="${escapeHTML(mapping.label || mapping.parameterID)} mapping CC" min="0" max="127" step="1" value="${escapeHTML(mapping.cc)}"${disabledAttr}></compost-number-box>
        </td>
        <td class="control" title="${escapeHTML(mapping.parameterID)}">
          <div class="control-cell">
            <div class="name">${escapeHTML(mapping.label || mapping.name || mapping.parameterID)}</div>
            <button class="row-delete" type="button" data-clear-mapping="${escapeHTML(mapping.parameterID)}"
              aria-label="Remove ${escapeHTML(mapping.label || mapping.name || mapping.parameterID)} mapping"${disabledAttr}>&times;</button>
          </div>
        </td>
        <td class="field">
          <compost-number-box data-field="min" label="${escapeHTML(mapping.label || mapping.parameterID)} mapped minimum" min="${escapeHTML(bounds.min)}" max="${escapeHTML(mapping.max)}" step="${escapeHTML(mapping.step || 0.001)}" value="${escapeHTML(formatNumber(mapping.min))}"${disabledAttr}></compost-number-box>
        </td>
        <td class="field">
          <compost-number-box data-field="max" label="${escapeHTML(mapping.label || mapping.parameterID)} mapped maximum" min="${escapeHTML(mapping.min)}" max="${escapeHTML(bounds.max)}" step="${escapeHTML(mapping.step || 0.001)}" value="${escapeHTML(formatNumber(mapping.max))}"${disabledAttr}></compost-number-box>
        </td>
      </tr>`;
    }).join('');
    this.restoreFocus(focusDescriptor);
  }

  rowLabel(mapping) {
    const name = mapping.label || mapping.name || mapping.parameterID || 'Control';
    const channel = mapping.channel === null ? 'any channel' : `channel ${mapping.channel}`;
    const range = `${formatNumber(mapping.min)} to ${formatNumber(mapping.max)}`;
    const action = this.hasAttribute('disabled') || !this._mappings
      ? ''
      : ' Use the remove button, or focus this row and press Delete or Backspace, to clear this mapping.';

    return `${name}. ${channel}, CC ${mapping.cc}, maps incoming MIDI values to ${range}.${action}`;
  }
}

defineElement('compost-midi-mappings', MIDIMappingsEditor);
