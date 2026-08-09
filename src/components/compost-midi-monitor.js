import { channelFromMessage, controllerFromMessage, controllerValueFromMessage, isControlChangeMessage, isNoteOffMessage, isNoteOnMessage, noteFromMessage, noteName, unpackMIDIMessage } from '../midi.js';
import { defineElement, numberAttr } from '../utils.js';

export class MIDIMonitor extends HTMLElement {
  static get observedAttributes() {
    return ['for', 'max-lines', 'announce'];
  }

  constructor() {
    super();

    this.lines = [];
    this._midi = null;
    this.handleMIDIEvent = this.handleMIDIEvent.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-midi-monitor-bg: #ffffff;
          --compost-midi-monitor-border: #111111;
          --compost-midi-monitor-text: #111111;
          --compost-midi-monitor-muted: #555555;
          --compost-midi-monitor-color-scheme: light;
          color-scheme: var(--compost-midi-monitor-color-scheme);
          display: block;
          color: var(--compost-midi-monitor-text);
          font: inherit;
        }
        .panel {
          display: grid;
          gap: 7px;
        }
        .label {
          color: var(--compost-midi-monitor-muted);
          font-size: 12px;
          opacity: 0.72;
        }
        pre {
          min-height: var(--compost-midi-monitor-height, 150px);
          max-height: var(--compost-midi-monitor-max-height, 260px);
          overflow: auto;
          margin: 0;
          padding: 10px;
          border: 1px solid var(--compost-midi-monitor-border);
          border-radius: 4px;
          background: var(--compost-midi-monitor-bg);
          color: var(--compost-midi-monitor-text);
          font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
          white-space: pre-wrap;
        }
        .entry {
          display: block;
        }
      </style>
      <div class="panel" part="panel">
        <span class="label" part="label">MIDI Monitor</span>
        <pre part="log" role="log" aria-label="MIDI message log" aria-live="off" aria-atomic="false" aria-relevant="additions"></pre>
      </div>`;

    this.logElement = this.root.querySelector('pre');
  }

  connectedCallback() {
    this.attachConfiguredMIDI();
    this.refresh();
  }

  disconnectedCallback() {
    this.detachMIDI();
  }

  attributeChangedCallback() {
    this.attachConfiguredMIDI();
    this.trim();
    this.refresh();
  }

  get midi() {
    return this._midi;
  }

  set midi(value) {
    this.detachMIDI();
    this._midi = value;
    this._midi?.addEventListener?.('midi-message', this.handleMIDIEvent);
  }

  get maxLines() {
    return Math.max(1, numberAttr(this, 'max-lines', 12));
  }

  attachConfiguredMIDI() {
    const id = this.getAttribute('for');
    if (!id || !this.isConnected) return;

    this.midi = document.getElementById(id);
  }

  detachMIDI() {
    this._midi?.removeEventListener?.('midi-message', this.handleMIDIEvent);
    this._midi = null;
  }

  handleMIDIEvent(event) {
    this.handleMIDIMessage(event.detail?.message ?? event.detail?.data ?? event);
  }

  handleMIDIMessage(message) {
    const line = `${new Date().toLocaleTimeString()}  ${this.formatMessage(message)}`;
    this.lines.unshift(line);
    this.trim();
    this.logElement.prepend(this.createEntry(line));
    while (this.logElement.children.length > this.maxLines) {
      this.logElement.lastElementChild.remove();
    }
  }

  clear() {
    this.lines = [];
    this.refresh();
  }

  trim() {
    this.lines = this.lines.slice(0, this.maxLines);
  }

  formatMessage(message) {
    const [status, data1, data2] = unpackMIDIMessage(message);
    const channel = channelFromMessage(message) + 1;

    if (isNoteOnMessage(message)) {
      const note = noteFromMessage(message);
      return `ch ${channel} note on  ${noteName(note)} (${note}) vel ${data2}`;
    }

    if (isNoteOffMessage(message)) {
      const note = noteFromMessage(message);
      return `ch ${channel} note off ${noteName(note)} (${note})`;
    }

    if (isControlChangeMessage(message)) {
      return `ch ${channel} CC ${controllerFromMessage(message)} = ${controllerValueFromMessage(message)}`;
    }

    return `0x${status.toString(16).padStart(2, '0')} ${data1} ${data2}`;
  }

  refresh() {
    this.logElement.setAttribute('aria-live', this.hasAttribute('announce') ? 'polite' : 'off');
    this.logElement.replaceChildren(...this.lines.map((line) => this.createEntry(line)));
  }

  createEntry(line) {
    const entry = document.createElement('span');
    entry.className = 'entry';
    entry.textContent = line;
    return entry;
  }
}

defineElement('compost-midi-monitor', MIDIMonitor);
