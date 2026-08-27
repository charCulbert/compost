import {
  chroma,
  isNaturalNote,
  isNoteOffMessage,
  isNoteOnMessage,
  noteFromMessage,
  noteName,
} from '../midi.js';
import { defineElement, numberAttr } from '../utils.js';

const DEFAULT_KEY_MAP =
  'KeyA KeyW KeyS KeyE KeyD KeyF KeyT KeyG KeyY KeyH KeyU KeyJ KeyK KeyO KeyL KeyP Semicolon';

export class PianoKeyboard extends HTMLElement {
  static get observedAttributes() {
    return ['root-note', 'note-count', 'key-map', 'dock', 'inline'];
  }

  constructor({
    naturalNoteWidth = 20,
    accidentalWidth = 12,
    accidentalPercentageHeight = 66,
  } = {}) {
    super();

    this.naturalWidth = naturalNoteWidth;
    this.accidentalWidth = accidentalWidth;
    this.accidentalPercentageHeight = accidentalPercentageHeight;
    this.root = this.attachShadow({ mode: 'open' });

    this.draggedNote = -1;
    this.isDragging = false;
    this.externalNotes = new Set();
    this.keyboardNotes = new Set();
    this.touchNotes = new Map();
    this.notes = [];
    this.keyboardWidth = 0;

    this.root.addEventListener('mousedown', (event) => this.handleMouse(event, true, false));
    this.root.addEventListener('mouseup', (event) => this.handleMouse(event, false, true));
    this.root.addEventListener('mousemove', (event) => this.handleMouse(event, false, false));
    this.root.addEventListener('mouseenter', (event) => this.handleMouse(event, false, false));
    this.root.addEventListener('mouseout', (event) => this.handleMouse(event, false, false));
    this.addEventListener('keydown', (event) => this.handleKey(event, true));
    this.addEventListener('keyup', (event) => this.handleKey(event, false));
    this.addEventListener('focusout', () => this.handleFocusOut());
  }

  connectedCallback() {
    this.refreshHTML();
  }

  disconnectedCallback() {
    this.allNotesOff();
  }

  attributeChangedCallback() {
    this.refreshHTML();
  }

  get config() {
    const rootNote = Math.max(0, Math.min(127, numberAttr(this, 'root-note', 36)));
    const noteCount = numberAttr(this, 'note-count', 61);

    return {
      noteCount: Math.max(1, Math.min(128 - rootNote, noteCount)),
      rootNote,
      keyMap: this.getAttribute('key-map') || DEFAULT_KEY_MAP,
    };
  }

  getNoteLabel(note) {
    return chroma(note) === 0 ? noteName(note) : '';
  }

  handleMIDIMessage(message) {
    if (isNoteOnMessage(message)) {
      this.externalNotes.add(noteFromMessage(message));
    } else if (isNoteOffMessage(message)) {
      this.externalNotes.delete(noteFromMessage(message));
    }

    this.refreshActiveNotes();
  }

  handleExternalMIDI(message) {
    this.handleMIDIMessage(message);
  }

  allNotesOff() {
    this.setDraggedNote(-1);

    for (const note of [...this.keyboardNotes]) {
      this.removeKeyboardNote(note);
    }

    this.externalNotes.clear();
    this.refreshActiveNotes();
  }

  handleFocusOut() {
    this.allNotesOff();
  }

  setDraggedNote(note) {
    if (!this.isPlayableNote(note)) {
      note = -1;
    }

    if (note === this.draggedNote) {
      return;
    }

    if (this.draggedNote >= 0) {
      this.sendNoteOff(this.draggedNote);
    }

    this.draggedNote = note;

    if (this.draggedNote >= 0) {
      this.sendNoteOn(this.draggedNote);
    }

    this.refreshActiveNotes();
  }

  addKeyboardNote(note) {
    if (!this.isPlayableNote(note) || this.keyboardNotes.has(note)) {
      return;
    }

    this.keyboardNotes.add(note);
    this.sendNoteOn(note);
    this.refreshActiveNotes();
  }

  removeKeyboardNote(note) {
    if (!this.keyboardNotes.has(note)) {
      return;
    }

    this.keyboardNotes.delete(note);
    this.sendNoteOff(note);
    this.refreshActiveNotes();
  }

  isNoteActive(note) {
    return note === this.draggedNote || this.keyboardNotes.has(note) || this.externalNotes.has(note);
  }

  isPlayableNote(note) {
    const { rootNote, noteCount } = this.config;
    return Number.isInteger(note)
      && note >= rootNote
      && note < rootNote + noteCount
      && note >= 0
      && note <= 127;
  }

  sendNoteOn(note) {
    this.dispatchEvent(new CustomEvent('note-down', {
      bubbles: true,
      composed: true,
      detail: { note },
    }));
  }

  sendNoteOff(note) {
    this.dispatchEvent(new CustomEvent('note-up', {
      bubbles: true,
      composed: true,
      detail: { note },
    }));
  }

  handleMouse(event, isDown, isUp) {
    if (isDown) {
      this.isDragging = true;
      HTMLElement.prototype.focus.call(this, { preventScroll: true });
    }

    if (this.isDragging) {
      let note = -1;

      if (event.buttons !== 0 && event.type !== 'mouseout') {
        note = this.getNoteFromElement(event.target);
      }

      this.setDraggedNote(note);

      if (!isDown) {
        event.preventDefault();
      }
    }

    if (isUp) {
      this.isDragging = false;
    }
  }

  handleTouchStart(event) {
    for (const touch of event.changedTouches) {
      const note = Number(touch.target.id.substring(4));
      if (!Number.isNaN(note)) {
        this.touchNotes.set(touch.identifier, note);
        this.addKeyboardNote(note);
      }
    }

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  handleTouchEnd(event) {
    for (const touch of event.changedTouches) {
      const note = this.touchNotes.get(touch.identifier);
      this.touchNotes.delete(touch.identifier);

      if (note !== undefined) {
        this.removeKeyboardNote(note);
      }
    }

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  handleTouchMove(event) {
    for (const touch of event.changedTouches) {
      const previousNote = this.touchNotes.get(touch.identifier);
      const element = this.root.elementFromPoint?.(touch.clientX, touch.clientY);
      const note = this.getNoteFromElement(element);

      if (note === previousNote) continue;

      if (previousNote !== undefined) this.removeKeyboardNote(previousNote);
      this.touchNotes.delete(touch.identifier);

      if (this.isPlayableNote(note)) {
        this.touchNotes.set(touch.identifier, note);
        this.addKeyboardNote(note);
      }
    }

    if (event.cancelable) event.preventDefault();
  }

  handleKey(event, isDown) {
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    const index = this.config.keyMap.split(' ').indexOf(event.code);
    if (index < 0) {
      return;
    }

    const base = this.keyboardBaseNote();
    const note = base + index;

    if (isDown) {
      this.addKeyboardNote(note);
    } else {
      this.removeKeyboardNote(note);
    }

    event.preventDefault();
  }

  keyboardBaseNote() {
    const config = this.config;
    return Math.floor((config.rootNote + config.noteCount / 4 + 11) / 12) * 12;
  }

  getNoteFromElement(element) {
    const noteElement = element?.closest?.('.note');
    return noteElement ? Number(noteElement.dataset.note) : -1;
  }

  refreshHTML() {
    this.root.innerHTML = `<style>${this.getCSS()}</style>${this.getNoteElements()}`;
    this.tabIndex = 0;
    this.setAttribute('role', 'group');
    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Piano keyboard');
    }
    for (const child of this.root.children) {
      child.addEventListener('touchstart', (event) => this.handleTouchStart(event), { passive: false });
      child.addEventListener('touchmove', (event) => this.handleTouchMove(event), { passive: false });
      child.addEventListener('touchend', (event) => this.handleTouchEnd(event));
      child.addEventListener('touchcancel', (event) => this.handleTouchEnd(event));
    }

    this.notes = [];

    for (let note = 0; note < 128; note += 1) {
      this.notes.push({
        note,
        element: this.root.getElementById(`note${note}`),
      });
    }

    this.refreshActiveNotes();
  }

  refreshActiveNotes() {
    for (const { note, element } of this.notes) {
      if (element) {
        const active = this.isNoteActive(note);
        const keyPart = element.classList.contains('natural-note') ? 'key natural-key' : 'key accidental-key';
        element.classList.toggle('active', active);
        element.setAttribute('part', active ? `${keyPart} active-key` : keyPart);
      }
    }
  }

  getAccidentalOffset(note) {
    const negativeOffset = -this.accidentalWidth / 16;
    const positiveOffset = 3 * this.accidentalWidth / 16;
    const offsets = [0, negativeOffset, 0, positiveOffset, 0, 0, negativeOffset, 0, 0, 0, positiveOffset, 0];

    return this.naturalWidth - this.accidentalWidth / 2 + offsets[chroma(note)];
  }

  getNoteElements() {
    const config = this.config;
    let naturals = '';
    let accidentals = '';
    let x = 0;
    let rightEdge = 0;

    for (let i = 0; i < config.noteCount; i += 1) {
      const note = config.rootNote + i;

      if (isNaturalNote(note)) {
        const left = x + 1;
        rightEdge = Math.max(rightEdge, left + this.naturalWidth);
        naturals += `
          <div class="natural-note note" part="key natural-key" id="note${note}" data-note="${note}" style="left: ${left / 16}em">
            <p part="label">${this.getNoteLabel(note)}</p>
          </div>`;
      } else {
        const left = x + this.getAccidentalOffset(note);
        rightEdge = Math.max(rightEdge, left + this.accidentalWidth);
        accidentals += `
        <div class="accidental-note note" part="key accidental-key" id="note${note}" data-note="${note}" style="left: ${left / 16}em"></div>`;
      }

      if (isNaturalNote(note + 1) || i === config.noteCount - 1) {
        x += this.naturalWidth;
      }
    }

    this.keyboardWidth = Math.ceil(Math.max(x + 1, rightEdge + 1));
    const docked = this.hasAttribute('dock') || !this.hasAttribute('inline');
    this.toggleAttribute('data-docked', docked);
    this.style.width = docked ? 'max-content' : '100%';
    this.style.maxWidth = docked
      ? 'calc(100% - 2em)'
      : `${this.keyboardWidth / 16}em`;

    return `
      <div
        tabindex="-1"
        class="note-holder"
        part="keys"
        role="group"
        aria-label="Piano keyboard"
        aria-describedby="keyboard-help"
        style="width: ${this.keyboardWidth / 16}em"
      >
        <span id="keyboard-help" class="sr-only">Use the mapped computer keyboard keys to play notes.</span>
        ${naturals}
        ${accidentals}
      </div>`;
  }

  getCSS() {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        user-select: none;
        -webkit-user-select: none;
      }

      :host {
        --compost-piano-dock-offset: 0px;
        --compost-piano-height: 7.875em;
        --compost-piano-muted: color-mix(in srgb, CanvasText 65%, transparent);
        --compost-piano-line: color-mix(in srgb, CanvasText 30%, transparent);
        --compost-piano-accent: var(--compost-accent, AccentColor);
        display: block;
        width: 100%;
        height: var(--compost-piano-height);
        overflow-x: auto;
        overflow-y: hidden;
        position: relative;
        text-align: center;
        background: transparent;
        border: 0;
      }

      :host([data-docked]) {
        position: fixed;
        left: calc(50% + var(--compost-piano-dock-offset));
        right: auto;
        bottom: 0;
        z-index: 10;
        width: max-content;
        transform: translateX(-50%);
      }

      .note-holder {
        color-scheme: light;
        position: relative;
        display: inline-block;
        text-align: initial;
        height: 100%;
        outline: none;
      }

      .note-holder:focus-visible,
      :host(:focus-visible) .note-holder {
        outline: 2px solid CanvasText;
        outline-offset: -2px;
      }

      .natural-note {
        position: absolute;
        bottom: 0;
        width: ${this.naturalWidth / 16}em;
        height: 100%;
        border: 1px solid var(--compost-piano-line);
        background: Canvas;
        display: flex;
        align-items: end;
        justify-content: center;
      }

      .accidental-note {
        position: absolute;
        top: 0;
        width: ${this.accidentalWidth / 16}em;
        height: ${this.accidentalPercentageHeight}%;
        border: 1px solid CanvasText;
        background: CanvasText;
      }

      .active {
        background: var(--compost-piano-accent);
        border-color: var(--compost-piano-accent);
      }

      p {
        pointer-events: none;
        color: var(--compost-piano-muted);
        font-size: 0.7em;
        text-align: center;
      }

      .active p {
        color: AccentColorText;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `;
  }

}

defineElement('compost-piano', PianoKeyboard);
