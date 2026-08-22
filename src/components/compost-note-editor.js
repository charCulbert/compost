import { isNaturalNote, noteName } from '../midi.js';
import {
  MIN_DURATION,
  duplicatedNotes,
  gridStep,
  movedNotes,
  normaliseNotes,
  notesInBox,
  quantizedNotes,
  resizedNotes,
  selectionSpan,
  snapBeats,
  snapDuration,
  trimmedNotes,
  velocityShiftedNotes,
} from '../piano-roll-model.js';
export { rulerLabels } from '../time-ruler.js';
import { rulerLabels } from '../time-ruler.js';
import { clamp, defineElement, numberAttr } from '../utils.js';

let nextEditorID = 1;
const HOLD_FOR_VELOCITY_MS = 300;
const DRAG_THRESHOLD = 3;
const MIN_ROWS = 4;
const MAX_ROWS = 72;
const MIN_PX_PER_BEAT = 8;
const MAX_PX_PER_BEAT = 600;

/** @typedef {import('../piano-roll-model.js').RollNote} RollNote */

const TRIM_LEFT = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'17\' height=\'17\'><path d=\'M10.5 2.5h-4v12h4\' fill=\'none\' stroke=\'white\' stroke-width=\'3.4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/><path d=\'M10.5 2.5h-4v12h4\' fill=\'none\' stroke=\'black\' stroke-width=\'1.4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>") 8 8, col-resize';
const TRIM_RIGHT = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'17\' height=\'17\'><path d=\'M6.5 2.5h4v12h-4\' fill=\'none\' stroke=\'white\' stroke-width=\'3.4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/><path d=\'M6.5 2.5h4v12h-4\' fill=\'none\' stroke=\'black\' stroke-width=\'1.4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>") 8 8, col-resize';

/** A length in beats, written the way a musician reads it. */
/** @param {number} duration */
export function lengthText(duration) {
  if (duration >= 1) {
    const whole = Math.floor(duration);
    const sixteenths = Math.round((duration - whole) * 4 * 100) / 100;
    return `${whole}${sixteenths ? `.${sixteenths}` : ''} beat${duration >= 2 ? 's' : ''}`;
  }
  return `${Math.round(duration * 1000) / 1000} beat`;
}

/**
 * A MIDI note editor: pitch down the side on real piano keys, time across
 * the top under a loop region with draggable ends, notes on a grid that
 * snaps unless told not to. Notes move, trim from either edge, take
 * velocity from an Alt-drag or a press-and-hold, marquee-select, nudge from
 * the keyboard, duplicate one span later and quantize. It edits a note list
 * and draws the playhead position it is given; it neither plays nor
 * schedules anything.
 */
export class CompostNoteEditor extends HTMLElement {
  static get observedAttributes() {
    return [
      'label', 'beats', 'beats-per-bar', 'grid', 'snap', 'loop-start', 'loop-end',
      'root-note', 'note-count', 'beat-width', 'fold', 'draw', 'playhead',
      'velocity', 'channel', 'lock-loop-start', 'readonly', 'disabled',
    ];
  }

  constructor() {
    super();

    this.label = 'Notes';
    this.beatsPerBar = 4;
    this.grid = 16;
    this.snapMode = 'grid';
    this.loopStart = 0;
    this.loopEnd = 8;
    this.rootNote = 48;
    this.noteCount = 25;
    this.beatWidth = 0;
    /** @type {number|null} */ this.playhead = null;
    this.defaultVelocity = 100;
    this.defaultChannel = 0;
    this.explicitBeats = false;
    this.beats = 16;
    this.offset = 0;
    this.zoomPxPerBeat = 0;
    /** @type {RollNote[]} */ this._notes = [];
    /** @type {Set<string>} */ this.selection = new Set();
    /** @type {number[]} */ this.visibleKeys = [];
    /** @type {any} */ this.drag = null;
    /** @type {any} */ this.loopDrag = null;
    this.editorID = `compost-note-editor-${nextEditorID++}`;
    this.handleModifierKey = this.handleModifierKey.bind(this);
    this.handleWindowBlur = () => { this.removeAttribute('data-velmod'); this.removeAttribute('data-copymod'); };
    this.refresh = this.refresh.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-note-editor-bg: #ffffff;
          --compost-note-editor-text: #111111;
          --compost-note-editor-muted: #6a6a6a;
          --compost-note-editor-faint: #8a8a8a;
          --compost-note-editor-line: rgba(17, 17, 17, 0.16);
          --compost-note-editor-bar-line: #6a6a6a;
          --compost-note-editor-row: rgba(128, 128, 128, 0.055);
          --compost-note-editor-signal: #c45a2c;
          --compost-note-editor-select: #2f6da8;
          --compost-note-editor-marquee: rgba(47, 109, 168, 0.12);
          --compost-note-editor-wash: rgba(196, 90, 44, 0.15);
          --compost-note-editor-past: rgba(255, 255, 255, 0.62);
          --compost-note-editor-keys-bg: #d8d6ce;
          --compost-note-editor-white-key: #e8e6de;
          --compost-note-editor-white-key-text: #3a3a34;
          --compost-note-editor-white-key-edge: #a8a6a0;
          --compost-note-editor-black-key: #141412;
          --compost-note-editor-black-key-text: #8a8a82;
          --compost-note-editor-playhead: #111111;
          --compost-note-editor-tip-bg: #ffffff;
          --compost-note-editor-key-width: 5.3em;
          --compost-note-editor-min-row: 1.1em;
          --compost-note-editor-ruler-height: 2.36em;
          --compost-note-editor-numeral-font: ui-monospace, SFMono-Regular, Menlo, monospace;
          --compost-note-editor-color-scheme: light;
          color-scheme: var(--compost-note-editor-color-scheme);
          display: block;
          box-sizing: border-box;
          min-height: 0;
          background: var(--compost-note-editor-bg);
          color: var(--compost-note-editor-text);
          font: inherit;
          outline: none;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([disabled]) { opacity: 0.55; pointer-events: none; }
        :host(:focus-visible) { box-shadow: inset 0 0 0 1px var(--compost-note-editor-select); }
        .frame {
          display: grid;
          grid-template-columns: var(--compost-note-editor-key-width) minmax(0, 1fr);
          grid-template-rows: var(--compost-note-editor-ruler-height) minmax(0, 1fr);
          height: 100%;
          min-height: 0;
        }
        .corner { grid-column: 1; grid-row: 1; }
        .rulerwrap { grid-column: 2; grid-row: 1; position: relative; overflow: hidden; }
        .ruler { position: absolute; top: 0; bottom: 0; left: 0; }
        .ruler .bn {
          position: absolute;
          top: 1px;
          height: 0.73em;
          padding-left: 3px;
          border-left: 1px solid var(--compost-note-editor-line);
          font-family: var(--compost-note-editor-numeral-font);
          font-size: 0.73em;
          color: var(--compost-note-editor-muted);
          line-height: 1;
          white-space: nowrap;
        }
        .region {
          position: absolute;
          top: 1.09em;
          height: 1em;
          left: 0;
          background: var(--compost-note-editor-wash);
          box-shadow: inset 0 0 0 1px var(--compost-note-editor-signal);
          cursor: grab;
          touch-action: none;
        }
        .handle {
          position: absolute;
          top: 1.09em;
          height: 1em;
          width: 1em;
          cursor: col-resize;
          z-index: 3;
          touch-action: none;
        }
        .handle::before { content: ""; position: absolute; top: 0; bottom: 0; width: 3px; background: var(--compost-note-editor-signal); }
        .handle.start::before { left: 0; }
        .handle.end::before { right: 0; }
        .handle:hover::before, .handle[data-on]::before { width: 4px; }
        /* a host whose clips always start at zero keeps the start where it is */
        :host([lock-loop-start]) .handle.start { display: none; }
        :host([lock-loop-start]) .region { cursor: default; }
        .keys {
          grid-column: 1; grid-row: 2;
          position: relative;
          overflow: hidden;
          background: var(--compost-note-editor-keys-bg);
          cursor: ns-resize;
        }
        .key {
          position: absolute;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          box-sizing: border-box;
          padding-right: 0.45em;
          font-family: var(--compost-note-editor-numeral-font);
          font-size: 0.73em;
          letter-spacing: 0;
          cursor: pointer;
        }
        .key.white { right: 0; background: var(--compost-note-editor-white-key); color: var(--compost-note-editor-white-key-text);
          box-shadow: inset 0 -1px 0 var(--compost-note-editor-white-key-edge); }
        .key.black { width: 62%; background: var(--compost-note-editor-black-key); color: var(--compost-note-editor-black-key-text); z-index: 2;
          box-shadow: inset -1px 0 0 #000, 0 1px 2px rgba(0, 0, 0, 0.5); }
        .key[data-on] { background: var(--compost-note-editor-signal); color: var(--compost-note-editor-bg); }
        .key.octave { box-shadow: inset 0 -1px 0 #6e6c66; }
        .gridwrap { grid-column: 2; grid-row: 2; position: relative; overflow: hidden; }
        .grid { position: absolute; top: 0; bottom: 0; left: 0; cursor: default; touch-action: none; }
        :host([draw]) .grid { cursor: crosshair; }
        .gl { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-note-editor-line); opacity: 0.35; }
        .gl.beat { opacity: 0.6; }
        .gl.bar { opacity: 1; background: var(--compost-note-editor-bar-line); }
        .rl { position: absolute; left: 0; right: 0; height: 1px; background: var(--compost-note-editor-line); opacity: 0.28; }
        .rw { position: absolute; left: 0; right: 0; background: var(--compost-note-editor-row); }
        .note { position: absolute; background: var(--compost-note-editor-signal); cursor: grab; box-sizing: border-box; }
        .note[data-selected] { outline: 1px solid var(--compost-note-editor-select); outline-offset: 1px; }
        .note[data-out] { opacity: 0.28 !important; }
        /* velocity reads twice: the note's weight, and a line running across it */
        .note .vl { position: absolute; left: 0; right: 0; height: 1px; background: var(--compost-note-editor-bg); opacity: 0.55; pointer-events: none; }
        .note[data-hold] { cursor: ns-resize; outline: 1px solid var(--compost-note-editor-select); outline-offset: 1px; }
        .note .ve { position: absolute; left: 6px; right: 6px; top: 0; bottom: 0; cursor: grab; }
        .note .rs { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; cursor: ${TRIM_LEFT}; }
        .note .re { position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: ${TRIM_RIGHT}; }
        /* what the drag will do is always on the pointer: move, trim, or velocity */
        :host([data-drag="move"]) .note, :host([data-drag="move"]) .note .ve { cursor: grabbing; }
        :host([data-velmod]) .note, :host([data-velmod]) .note .rs, :host([data-velmod]) .note .re,
        :host([data-velmod]) .note .ve, :host([data-drag="vel"]) .note, :host([data-drag="vel"]) .note .ve { cursor: ns-resize; }
        :host([data-copymod]) .note .ve, :host([data-drag="copy"]) .note, :host([data-drag="copy"]) .note .ve { cursor: copy; }
        .past { position: absolute; top: 0; bottom: 0; background: var(--compost-note-editor-past); pointer-events: none; z-index: 1; }
        .playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-note-editor-playhead);
          box-shadow: 0 0 0 0.5px var(--compost-note-editor-bg), 0 0 5px rgba(0, 0, 0, 0.5); pointer-events: none; z-index: 6; display: none; }
        .marquee { position: absolute; border: 1px solid var(--compost-note-editor-select); background: var(--compost-note-editor-marquee); pointer-events: none; display: none; }
        .tip {
          position: fixed;
          z-index: 50;
          padding: 2px 5px;
          background: var(--compost-note-editor-tip-bg);
          box-shadow: 0 0 0 1px var(--compost-note-editor-line);
          color: var(--compost-note-editor-text);
          font-family: var(--compost-note-editor-numeral-font);
          font-size: 0.82em;
          white-space: nowrap;
          pointer-events: none;
        }
        .tip[hidden] { display: none; }
        .division {
          position: absolute;
          right: 0.55em;
          bottom: 0.36em;
          font-family: var(--compost-note-editor-numeral-font);
          font-size: 0.82em;
          color: var(--compost-note-editor-muted);
          pointer-events: none;
        }
      </style>
      <div class="frame" part="frame">
        <div class="corner" part="corner"></div>
        <div class="rulerwrap" part="ruler">
          <div class="ruler">
            <div class="region" part="loop"></div>
            <div class="handle start" part="loop-start"></div>
            <div class="handle end" part="loop-end"></div>
          </div>
        </div>
        <div class="keys" part="keys"></div>
        <div class="gridwrap" part="grid">
          <div class="grid">
            <div class="past"></div>
            <div class="playhead" part="playhead"></div>
            <div class="marquee"></div>
          </div>
          <div class="division" part="division"></div>
        </div>
      </div>
      <div class="tip" hidden></div>`;

    /** @param {string} selector @returns {HTMLElement} */
    const part = (selector) => /** @type {HTMLElement} */ (this.root.querySelector(selector));
    this.rulerWrap = part('.rulerwrap');
    this.ruler = part('.ruler');
    this.region = part('.region');
    this.startHandle = part('.handle.start');
    this.endHandle = part('.handle.end');
    this.keys = part('.keys');
    this.gridWrap = part('.gridwrap');
    this.gridElement = part('.grid');
    this.past = part('.past');
    this.playheadElement = part('.playhead');
    this.marquee = part('.marquee');
    this.tip = part('.tip');
    this.division = part('.division');

    this.gridElement.addEventListener('pointerdown', (event) => this.startPointer(event));
    this.gridElement.addEventListener('pointermove', (event) => this.movePointer(event));
    this.gridElement.addEventListener('pointerup', (event) => this.endPointer(event));
    this.gridElement.addEventListener('pointercancel', (event) => this.endPointer(event));
    this.gridElement.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    this.gridElement.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
    this.keys.addEventListener('pointerdown', (event) => this.previewFromKey(event));
    this.gridWrap.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.keys.addEventListener('wheel', (event) => this.handleKeysWheel(event), { passive: false });
    for (const [node, kind] of [[this.endHandle, 'end'], [this.startHandle, 'start'], [this.region, 'move']]) {
      node.addEventListener('pointerdown', (event) => this.startLoopDrag(event, kind));
      node.addEventListener('pointermove', (event) => this.moveLoopDrag(event));
      node.addEventListener('pointerup', (event) => this.endLoopDrag(event));
      node.addEventListener('pointercancel', (event) => this.endLoopDrag(event));
    }
    this.addEventListener('keydown', (event) => this.handleKey(event));
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.refresh) : null;
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.setAttribute('role', 'group');
    this.syncAttributes();
    this.refresh();
    this.resizeObserver?.observe(this);
    window.addEventListener('keydown', this.handleModifierKey, true);
    window.addEventListener('keyup', this.handleModifierKey, true);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.handleModifierKey, true);
    window.removeEventListener('keyup', this.handleModifierKey, true);
    window.removeEventListener('blur', this.handleWindowBlur);
    clearTimeout(this.drag?.hold);
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.syncAttributes();
    this.refresh();
  }

  syncAttributes() {
    this.label = this.getAttribute('label') ?? this.label;
    this.setAttribute('aria-label', this.label);
    this.beatsPerBar = Math.max(1, Math.round(numberAttr(this, 'beats-per-bar', this.beatsPerBar)));
    this.grid = Math.max(1, numberAttr(this, 'grid', this.grid));
    this.snapMode = this.getAttribute('snap') === 'off' ? 'off' : 'grid';
    this.loopStart = Math.max(0, numberAttr(this, 'loop-start', this.loopStart));
    this.loopEnd = Math.max(this.loopStart + MIN_DURATION, numberAttr(this, 'loop-end', this.loopEnd));
    this.explicitBeats = this.hasAttribute('beats');
    this.beats = this.explicitBeats
      ? Math.max(this.loopEnd, numberAttr(this, 'beats', this.beats)) : Math.max(this.loopEnd + 8, 16);
    this.rootNote = clamp(Math.round(numberAttr(this, 'root-note', this.rootNote)), 0, 127);
    this.noteCount = clamp(Math.round(numberAttr(this, 'note-count', this.noteCount)), MIN_ROWS, 128);
    this.beatWidth = Math.max(0, numberAttr(this, 'beat-width', 0));
    this.playhead = this.hasAttribute('playhead') ? numberAttr(this, 'playhead', 0) : null;
    this.defaultVelocity = clamp(Math.round(numberAttr(this, 'velocity', this.defaultVelocity)), 1, 127);
    this.defaultChannel = clamp(Math.round(numberAttr(this, 'channel', this.defaultChannel)), 0, 15);
  }

  // ---- Public API -------------------------------------------------------------

  get notes() {
    return this._notes.map((note) => ({ ...note }));
  }

  set notes(value) {
    this.setNotes(value, false);
  }

  /** Replaces the note list. Silent by default so a host can push state back. */
  /** @param {any[]} notes @param {boolean} [shouldEmit] */
  setNotes(notes, shouldEmit = false) {
    this._notes = normaliseNotes(notes, this.beats).map((note) => (
      note.id ? note : { ...note, id: crypto.randomUUID() }
    ));
    const ids = new Set(this._notes.map((note) => note.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
    this.refresh();
    if (shouldEmit) this.emitChange();
  }

  get step() {
    return gridStep(this.grid, this.beatsPerBar);
  }

  get readonly() {
    return this.hasAttribute('readonly') || this.hasAttribute('disabled');
  }

  get selectedIds() {
    return [...this.selection];
  }

  /** Sets the loop region, in beats. */
  /** @param {number} start @param {number} end @param {boolean} [shouldEmit] */
  setLoop(start, end, shouldEmit = false) {
    const nextStart = Math.max(0, Number(start) || 0);
    const nextEnd = Math.max(nextStart + MIN_DURATION, Number(end) || 0);
    if (nextStart === this.loopStart && nextEnd === this.loopEnd) return;
    this.setAttribute('loop-start', String(nextStart));
    this.setAttribute('loop-end', String(nextEnd));
    if (shouldEmit) this.emitLoop();
  }

  /** Snaps the selection, or everything when nothing is selected. */
  /** @param {{lengths?: boolean, division?: number}} [options] */
  quantize({ lengths = false, division = this.grid } = {}) {
    if (this.readonly) return;
    const ids = this.selection.size > 0 ? [...this.selection] : null;
    this.commit(quantizedNotes(this._notes, gridStep(division, this.beatsPerBar),
      /** @type {any} */ ({ ids, lengths, beats: this.beats })));
  }

  selectAll() {
    this.selection = new Set(this._notes.map((note) => note.id));
    this.renderNotes();
    this.emitSelection();
  }

  clearSelection() {
    this.selection.clear();
    this.renderNotes();
    this.emitSelection();
  }

  deleteSelection() {
    if (this.readonly || this.selection.size === 0) return;
    const next = this._notes.filter((note) => !this.selection.has(note.id));
    this.selection.clear();
    this.commit(next);
  }

  /** Copies the selection one span later and selects the copies. */
  duplicateSelection() {
    if (this.readonly || this.selection.size === 0) return;
    const copies = duplicatedNotes(this._notes, [...this.selection], this.step, this.beats,
      () => crypto.randomUUID(), this.snapMode);
    if (!copies.length) return;
    this.selection = new Set(copies.map((note) => note.id));
    this.commit([...this._notes, ...copies]);
  }

  /** Adds one note without a pointer: at the loop start, or just after the
   * selection, on the middle visible row. Selects it and reports the change. */
  addNote() {
    if (this.readonly) return null;
    const span = selectionSpan(this._notes, this.selection.size ? [...this.selection] : null);
    const raw = this.selection.size && span ? span.end : this.loopStart;
    const start = clamp(this.snapBeat(raw, false), 0, Math.max(0, this.beats - this.step));
    const created = {
      id: crypto.randomUUID(),
      note: this.visibleKeys[Math.floor(this.visibleKeys.length / 2)] ?? this.rootNote,
      start,
      duration: Math.max(this.step, MIN_DURATION),
      velocity: this.defaultVelocity,
      channel: this.defaultChannel,
    };
    this.selection = new Set([created.id]);
    this.commit([...this._notes, created]);
    this.preview(created.note);
    return created;
  }

  /** Sets the loop to the selection's span. */
  loopToSelection() {
    const span = selectionSpan(this._notes, this.selection.size ? [...this.selection] : null);
    if (!span) return;
    this.zoomPxPerBeat = 0;
    this.offset = 0;
    const locked = this.hasAttribute('lock-loop-start');
    this.setLoop(locked ? 0 : span.start, span.end, true);
  }

  zoomReset() {
    this.zoomPxPerBeat = 0;
    this.offset = 0;
    this.setAttribute('note-count', '25');
    this.refresh();
  }

  // ---- Geometry -----------------------------------------------------------------

  get pxPerBeat() {
    if (this.zoomPxPerBeat > 0) return this.zoomPxPerBeat;
    if (this.beatWidth > 0) return this.beatWidth;
    const width = this.gridWrap?.clientWidth || 400;
    return width / Math.max(8, this.loopEnd + 4);
  }

  /** @param {number} beat */
  beatToX(beat) { return beat * this.pxPerBeat; }

  /** @param {number} x */
  xToBeat(x) { return x / this.pxPerBeat; }

  get rowHeight() {
    return (this.gridWrap?.clientHeight || 300) / Math.max(1, this.visibleKeys.length);
  }

  /** The height a row will not go below, from `--compost-note-editor-min-row`.
   * A landscape phone has too little height for 25 rows at a readable size, so
   * the editor shows fewer of them rather than squeezing all of them. */
  get minRowHeight() {
    const style = getComputedStyle(this);
    const fontSize = parseFloat(style.fontSize) || 12;
    const raw = style.getPropertyValue('--compost-note-editor-min-row').trim();
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return fontSize * 1.1;
    return raw.endsWith('em') ? value * fontSize : raw.endsWith('rem')
      ? value * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) : value;
  }

  /** How many rows the height can hold without going under the floor. */
  get rowCapacity() {
    const height = this.gridWrap?.clientHeight || 300;
    return clamp(Math.floor(height / Math.max(1, this.minRowHeight)), MIN_ROWS, 128);
  }

  /** @param {number} note */
  noteToY(note) {
    const index = this.visibleKeys.indexOf(note);
    return index < 0 ? -999 : index * this.rowHeight;
  }

  /** @param {number} y */
  yToNote(y) {
    const index = clamp(Math.floor(y / this.rowHeight), 0, this.visibleKeys.length - 1);
    return this.visibleKeys[index] ?? this.rootNote;
  }

  computeVisibleKeys() {
    const capacity = this.rowCapacity;
    if (this.hasAttribute('fold')) {
      const used = [...new Set(this._notes.map((note) => note.note))].sort((a, b) => b - a);
      if (used.length && used.length <= capacity) return used;
      // too many pitches in use for the height: keep the ones around the middle
      if (used.length) {
        const from = clamp(Math.round((used.length - capacity) / 2), 0, used.length - capacity);
        return used.slice(from, from + capacity);
      }
    }
    const count = Math.min(this.noteCount, capacity);
    // fewer rows, still centred on the range the host asked for
    const middle = this.rootNote + this.noteCount / 2;
    const lo = clamp(Math.round(middle - count / 2), 0, 128 - count);
    return Array.from({ length: count }, (_, index) => lo + count - 1 - index);
  }

  /** Pointer position in grid pixels. */
  /** @param {{clientX: number, clientY: number}} event */
  gridPoint(event) {
    const bounds = this.gridElement.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /** @param {number} beat @param {boolean} free */
  snapBeat(beat, free) {
    return free || this.snapMode === 'off' ? Math.max(0, beat) : snapBeats(beat, this.step, 'grid');
  }

  // ---- Rendering ----------------------------------------------------------------

  refresh() {
    if (!this.gridElement || !this.isConnected) return;
    this.visibleKeys = this.computeVisibleKeys();
    const px = this.pxPerBeat;
    const width = this.beats * px;
    const maxOffset = Math.max(0, width - this.gridWrap.clientWidth);
    this.offset = clamp(this.offset, 0, maxOffset);
    this.gridElement.style.width = `${width}px`;
    this.gridElement.style.transform = `translateX(${-this.offset}px)`;
    this.renderRuler();
    this.renderKeys();
    this.renderGrid();
    this.renderNotes();
    this.renderPlayhead();
    this.division.textContent = `1/${this.grid}`;
  }

  renderRuler() {
    const px = this.pxPerBeat;
    this.ruler.style.width = `${this.beats * px}px`;
    this.ruler.style.transform = `translateX(${-this.offset}px)`;
    this.region.style.left = `${this.loopStart * px}px`;
    this.region.style.width = `${(this.loopEnd - this.loopStart) * px}px`;
    const handle = this.startHandle.offsetWidth || 11;
    this.startHandle.style.left = `${this.loopStart * px - 1}px`;
    this.endHandle.style.left = `${this.loopEnd * px - handle + 1}px`;
    for (const label of this.ruler.querySelectorAll('.bn')) label.remove();
    const fragment = document.createDocumentFragment();
    for (const { beat, text } of rulerLabels(this.beats, this.beatsPerBar, px)) {
      const label = document.createElement('div');
      label.className = 'bn';
      label.textContent = text;
      label.style.left = `${beat * px}px`;
      fragment.append(label);
    }
    this.ruler.append(fragment);
    // the tail past the loop stays visible but reads as outside
    this.past.style.left = `${this.loopEnd * px}px`;
    this.past.style.width = `${Math.max(0, (this.beats - this.loopEnd) * px)}px`;
  }

  renderKeys() {
    const height = this.rowHeight;
    const fold = this.hasAttribute('fold');
    const markup = [];
    this.visibleKeys.forEach((note, index) => {
      const accidental = !isNaturalNote(note);
      const classes = `key ${accidental ? 'black' : 'white'}${note % 12 === 11 ? ' octave' : ''}`;
      const name = height >= 9 && (fold || note % 12 === 0) ? noteName(note) : '';
      markup.push(`<div class="${classes}" data-note="${note}" style="top:${(index * height).toFixed(2)}px;height:${Math.max(2, height - (accidental ? 1 : 0)).toFixed(2)}px">${name}</div>`);
    });
    this.keys.innerHTML = markup.join('');
  }

  renderGrid() {
    for (const node of this.gridElement.querySelectorAll('.gl,.rl,.rw')) node.remove();
    const height = this.rowHeight;
    const px = this.pxPerBeat;
    const markup = [];
    this.visibleKeys.forEach((note, index) => {
      const top = index * height;
      if (!isNaturalNote(note)) markup.push(`<div class="rw" style="top:${top.toFixed(2)}px;height:${height.toFixed(2)}px"></div>`);
      markup.push(`<div class="rl" style="top:${(top + height).toFixed(2)}px"></div>`);
    });
    const step = this.step;
    if (step > 0) {
      for (let beat = 0; beat <= this.beats + 1e-9; beat += step) {
        const isBar = Math.abs(beat % this.beatsPerBar) < 1e-9;
        const isBeat = Math.abs(beat % 1) < 1e-9;
        markup.push(`<div class="gl${isBar ? ' bar' : isBeat ? ' beat' : ''}" style="left:${(beat * px).toFixed(2)}px"></div>`);
      }
    }
    this.past.insertAdjacentHTML('beforebegin', markup.join(''));
  }

  renderNotes() {
    for (const element of this.gridElement.querySelectorAll('.note')) element.remove();
    const height = this.rowHeight;
    const px = this.pxPerBeat;
    const fragment = document.createDocumentFragment();
    const holdId = this.drag?.mode === 'vel' && this.drag.hold === null ? this.drag.note?.id : null;
    for (const note of this._notes) {
      const y = this.noteToY(note.note);
      if (y < 0) continue;
      const element = document.createElement('div');
      element.className = 'note';
      element.part.add('note');
      element.dataset.id = note.id;
      if (this.selection.has(note.id)) element.dataset.selected = '';
      if (note.start < this.loopStart || note.start >= this.loopEnd) element.dataset.out = '';
      if (holdId === note.id) element.dataset.hold = '';
      element.style.left = `${(note.start * px).toFixed(2)}px`;
      element.style.width = `${Math.max(3, note.duration * px).toFixed(2)}px`;
      element.style.top = `${(y + 1).toFixed(2)}px`;
      element.style.height = `${Math.max(3, height - 2).toFixed(2)}px`;
      element.style.opacity = (0.3 + 0.7 * (note.velocity / 127)).toFixed(2);
      element.setAttribute('aria-label',
        `${noteName(note.note)}, beat ${(note.start + 1).toFixed(2)}, length ${note.duration.toFixed(2)}, velocity ${note.velocity}`);
      element.innerHTML = `<div class="vl" style="bottom:${((note.velocity / 127) * (height - 3)).toFixed(1)}px"></div>`
        + '<div class="ve"></div><div class="rs"></div><div class="re"></div>';
      fragment.append(element);
    }
    this.gridElement.insertBefore(fragment, this.past);
  }

  renderPlayhead() {
    if (this.playhead === null) {
      this.playheadElement.style.display = 'none';
      return;
    }
    this.playheadElement.style.display = 'block';
    this.playheadElement.style.left = `${(this.playhead * this.pxPerBeat).toFixed(1)}px`;
  }

  // ---- Emitting ----------------------------------------------------------------

  /** @param {any[]} notes */
  commit(notes) {
    this._notes = normaliseNotes(notes, this.beats);
    this.refresh();
    this.emitChange();
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent('notes-change', {
      bubbles: true, composed: true, detail: { notes: this.notes },
    }));
  }

  emitLoop() {
    this.dispatchEvent(new CustomEvent('loop-change', {
      bubbles: true, composed: true, detail: { start: this.loopStart, end: this.loopEnd },
    }));
  }

  emitSelection() {
    this.dispatchEvent(new CustomEvent('selection-change', {
      bubbles: true, composed: true, detail: { ids: this.selectedIds },
    }));
  }

  /** @param {number} note */
  preview(note) {
    this.dispatchEvent(new CustomEvent('note-preview', {
      bubbles: true, composed: true,
      detail: { note, velocity: this.defaultVelocity, channel: this.defaultChannel },
    }));
  }

  /** @param {PointerEvent} event */
  previewFromKey(event) {
    const key = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('key'));
    if (!(key instanceof HTMLElement)) return;
    const note = Number(key.dataset.note);
    if (!Number.isInteger(note)) return;
    key.setAttribute('data-on', '');
    setTimeout(() => key.removeAttribute('data-on'), 160);
    this.preview(note);
  }

  /** @param {string} text @param {{clientX: number, clientY: number}} event */
  showTip(text, event) {
    this.tip.hidden = false;
    this.tip.textContent = text;
    this.tip.style.left = `${event.clientX + 12}px`;
    this.tip.style.top = `${event.clientY - 16}px`;
  }

  // ---- Note gestures ------------------------------------------------------------

  /** @param {Event} event @returns {HTMLElement|null} */
  noteElementFrom(event) {
    const found = event.composedPath().find((node) =>
      node instanceof HTMLElement && node.classList.contains('note'));
    return found instanceof HTMLElement ? found : null;
  }

  /** @param {PointerEvent} event */
  startPointer(event) {
    if (this.readonly || event.button !== 0 || this.drag) return;
    const element = this.noteElementFrom(event);
    const point = this.gridPoint(event);
    this.focus({ preventScroll: true });
    if (!element) {
      event.preventDefault();
      if (this.hasAttribute('draw')) {
        const start = this.snapBeat(this.xToBeat(point.x), event.altKey);
        const created = {
          id: crypto.randomUUID(), note: this.yToNote(point.y),
          start: Math.min(start, Math.max(0, this.beats - this.step)),
          duration: Math.max(this.step, MIN_DURATION),
          velocity: this.defaultVelocity, channel: this.defaultChannel,
        };
        this._notes = normaliseNotes([...this._notes, created], this.beats);
        this.selection = new Set([created.id]);
        this.drag = { pointerId: event.pointerId, mode: 'len', note: created, moved: true, hold: null,
          origin: undefined, ids: [created.id] };
        this.preview(created.note);
      } else {
        if (!event.shiftKey) this.selection.clear();
        this.drag = { pointerId: event.pointerId, mode: 'marq', x0: point.x, y0: point.y,
          base: new Set(this.selection), hold: null };
        this.marquee.style.display = 'block';
        Object.assign(this.marquee.style, { left: `${point.x}px`, top: `${point.y}px`, width: '0px', height: '0px' });
      }
      this.gridElement.setPointerCapture(event.pointerId);
      this.renderNotes();
      return;
    }
    const note = this._notes.find((entry) => entry.id === element.dataset.id);
    if (!note) return;
    event.preventDefault();
    if (!event.shiftKey && !this.selection.has(note.id)) this.selection = new Set([note.id]);
    else this.selection.add(note.id);
    const target = /** @type {HTMLElement} */ (event.composedPath()[0]);
    const onEdge = target.classList.contains('re') || target.classList.contains('rs');
    const copying = event.altKey && !onEdge;
    const selectionBefore = [...this.selection];
    let grabbed = note;
    if (copying) {
      // Alt-drag moves copies of the whole selection, which become the selection
      const copies = this._notes.filter((entry) => this.selection.has(entry.id))
        .map((entry) => ({ ...entry, id: crypto.randomUUID() }));
      const copyOfGrabbed = copies[this._notes.filter((entry) => this.selection.has(entry.id)).findIndex((entry) => entry.id === note.id)];
      this._notes = normaliseNotes([...this._notes, ...copies], this.beats);
      this.selection = new Set(copies.map((entry) => entry.id));
      grabbed = copyOfGrabbed ?? copies[0];
    }
    const mode = target.classList.contains('re') ? 'len'
      : target.classList.contains('rs') ? 'lenL'
        : (event.metaKey || event.ctrlKey) ? 'vel' : 'move';
    this.drag = {
      pointerId: event.pointerId, mode, note: grabbed, x: event.clientX, y: event.clientY,
      origin: this._notes.map((entry) => ({ ...entry })), ids: [...this.selection],
      moved: false, hold: null, copy: copying, selectionBefore,
    };
    if (mode === 'move' && !copying) {
      this.preview(note.note);
      // hold still for a moment and the drag becomes velocity
      this.drag.hold = setTimeout(() => {
        if (!this.drag || this.drag.moved) return;
        this.drag.mode = 'vel';
        this.drag.hold = null;
        this.drag.y = event.clientY;
        this.setAttribute('data-drag', 'vel');
        this.showTip(`vel ${note.velocity}`, event);
        this.renderNotes();
      }, HOLD_FOR_VELOCITY_MS);
    }
    this.setAttribute('data-drag', copying ? 'copy' : mode);
    this.gridElement.setPointerCapture(event.pointerId);
    this.renderNotes();
    this.emitSelection();
  }

  /** @param {PointerEvent} event */
  movePointer(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = this.gridPoint(event);
    if (drag.mode === 'marq') {
      const x = Math.min(drag.x0, point.x);
      const y = Math.min(drag.y0, point.y);
      const width = Math.abs(point.x - drag.x0);
      const height = Math.abs(point.y - drag.y0);
      Object.assign(this.marquee.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
      const rowHeight = this.rowHeight;
      const fromNote = this.yToNote(y + height);
      const toNote = this.yToNote(y);
      const box = { fromBeat: this.xToBeat(x), toBeat: this.xToBeat(x + width), fromNote, toNote };
      this.selection = new Set(drag.base);
      for (const note of notesInBox(this._notes, box)) {
        // a folded view has gaps between rows; only rows that are shown count
        const top = this.noteToY(note.note);
        if (top >= 0 && top + rowHeight > y && top < y + height) this.selection.add(note.id);
      }
      this.renderNotes();
      return;
    }
    if (drag.hold && drag.mode === 'move'
      && (Math.abs(event.clientX - drag.x) > DRAG_THRESHOLD || Math.abs(event.clientY - drag.y) > DRAG_THRESHOLD)) {
      clearTimeout(drag.hold);
      drag.hold = null;
      drag.moved = true;
    }
    this.setAttribute('data-drag', drag.mode);
    const free = event.altKey;
    if (drag.mode === 'vel') {
      const delta = (drag.y - event.clientY) * (event.shiftKey ? 0.25 : 1);
      this._notes = velocityShiftedNotes(drag.origin, drag.ids, delta);
      const current = this._notes.find((entry) => entry.id === drag.note.id);
      if (current) this.showTip(`vel ${current.velocity}`, event);
    } else if (drag.mode === 'len') {
      const origin = (drag.origin ?? this._notes).find((/** @type {RollNote} */ entry) => entry.id === drag.note.id);
      if (!origin) return;
      const raw = this.xToBeat(point.x) - origin.start;
      const duration = free || this.snapMode === 'off' ? Math.max(MIN_DURATION, raw) : snapDuration(raw, this.step, 'grid');
      // every selected note takes the same change of length as the one being dragged
      this._notes = resizedNotes(drag.origin ?? this._notes, drag.ids ?? [origin.id],
        duration - origin.duration, this.beats, this.step, 'off');
      this.showTip(lengthText(Math.min(duration, this.beats - origin.start)), event);
    } else if (drag.mode === 'lenL') {
      const origin = drag.origin.find((/** @type {RollNote} */ entry) => entry.id === drag.note.id);
      if (!origin) return;
      let start = this.xToBeat(point.x);
      if (!free && this.snapMode !== 'off') start = snapBeats(start, this.step, 'grid');
      this._notes = trimmedNotes(drag.origin, drag.ids, start - origin.start, this.beats, this.step, free ? 'off' : this.snapMode);
      const current = this._notes.find((entry) => entry.id === drag.note.id);
      if (current) this.showTip(lengthText(current.duration), event);
    } else {
      drag.moved = true;
      this.setAttribute('data-drag', drag.copy ? 'copy' : 'move');
      const deltaBeats = this.xToBeat(event.clientX - drag.x);
      const deltaRows = Math.round((drag.y - event.clientY) / this.rowHeight);
      const origin = drag.origin.find((/** @type {RollNote} */ entry) => entry.id === drag.note.id);
      if (!origin) return;
      const target = this.snapBeat(origin.start + deltaBeats, free && !drag.copy);
      const shiftBeats = target - origin.start;
      // pitch moves through the visible rows, so a folded view steps between used pitches
      const originRow = this.visibleKeys.indexOf(origin.note);
      const targetRow = clamp(originRow - deltaRows, 0, this.visibleKeys.length - 1);
      const shiftNote = originRow >= 0 ? (this.visibleKeys[targetRow] ?? origin.note) - origin.note : 0;
      this._notes = movedNotes(drag.origin, drag.ids, shiftBeats, shiftNote, this.beats, this.step, 'off');
    }
    this.renderNotes();
  }

  /** @param {PointerEvent} event */
  endPointer(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    clearTimeout(drag.hold);
    this.drag = null;
    this.tip.hidden = true;
    this.marquee.style.display = 'none';
    this.removeAttribute('data-drag');
    if (drag.mode === 'marq') {
      this.renderNotes();
      this.emitSelection();
      return;
    }
    if (drag.copy && !drag.moved) {
      // a press with Alt that went nowhere leaves nothing behind
      const copies = new Set(drag.ids);
      this._notes = this._notes.filter((entry) => !copies.has(entry.id));
      this.selection = new Set(drag.selectionBefore ?? []);
      this.renderNotes();
      this.emitSelection();
      return;
    }
    const changed = JSON.stringify(this._notes) !== JSON.stringify(drag.origin ?? null);
    if (changed || drag.mode === 'len' && drag.origin === undefined || drag.copy) this.commit(this._notes);
    else this.renderNotes();
  }

  /** @param {MouseEvent} event */
  handleDoubleClick(event) {
    if (this.readonly || this.noteElementFrom(event)) return;
    const point = this.gridPoint(event);
    const start = this.snapBeat(this.xToBeat(point.x), event.altKey);
    const created = {
      id: crypto.randomUUID(), note: this.yToNote(point.y),
      start: Math.min(start, Math.max(0, this.beats - this.step)),
      duration: Math.max(this.step, MIN_DURATION),
      velocity: this.defaultVelocity, channel: this.defaultChannel,
    };
    this.selection = new Set([created.id]);
    this.commit([...this._notes, created]);
    this.preview(created.note);
  }

  /** @param {MouseEvent} event */
  handleContextMenu(event) {
    const element = this.noteElementFrom(event);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent('note-context', {
      bubbles: true, composed: true,
      detail: { id: element.dataset.id, clientX: event.clientX, clientY: event.clientY },
    }));
  }

  /** A held Alt (or Cmd/Ctrl) says the next drag sets velocity; the cursor says so too. */
  /** @param {KeyboardEvent} event */
  handleModifierKey(event) {
    this.toggleAttribute('data-velmod', event.metaKey || event.ctrlKey);
    this.toggleAttribute('data-copymod', event.altKey && !event.metaKey && !event.ctrlKey);
  }

  // ---- Loop region ----------------------------------------------------------------

  /** @param {PointerEvent} event @param {string} kind */
  startLoopDrag(event, kind) {
    if (this.readonly || event.button !== 0) return;
    if (kind !== 'end' && this.hasAttribute('lock-loop-start')) return;
    event.preventDefault();
    event.stopPropagation();
    this.zoomPxPerBeat = this.pxPerBeat;   // pin the scale for the drag
    this.loopDrag = { pointerId: event.pointerId, kind, x: event.clientX,
      start: this.loopStart, end: this.loopEnd, px: this.pxPerBeat, node: event.currentTarget };
    /** @type {HTMLElement} */ (event.currentTarget).setAttribute('data-on', '');
    /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
  }

  /** @param {PointerEvent} event */
  moveLoopDrag(event) {
    const drag = this.loopDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const free = event.altKey || this.snapMode === 'off';
    const step = this.step;
    const quantise = (/** @type {number} */ value) => (free ? Math.max(0, value) : Math.round(value / step) * step);
    const deltaBeats = (event.clientX - drag.x) / drag.px;
    let start = drag.start;
    let end = drag.end;
    if (drag.kind === 'end') end = Math.max(start + (free ? MIN_DURATION : step), quantise(drag.end + deltaBeats));
    else if (drag.kind === 'start') start = clamp(quantise(drag.start + deltaBeats), 0, end - (free ? MIN_DURATION : step));
    else {
      start = Math.max(0, quantise(drag.start + deltaBeats));
      end = start + (drag.end - drag.start);
    }
    this.setLoop(start, end, false);
    this.dispatchEvent(new CustomEvent('loop-input', {
      bubbles: true, composed: true, detail: { start: this.loopStart, end: this.loopEnd },
    }));
  }

  /** @param {PointerEvent} event */
  endLoopDrag(event) {
    const drag = this.loopDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.loopDrag = null;
    /** @type {HTMLElement} */ (drag.node).removeAttribute('data-on');
    this.zoomPxPerBeat = 0;
    this.refresh();
    if (drag.start !== this.loopStart || drag.end !== this.loopEnd) this.emitLoop();
  }

  // ---- Keyboard and wheel ---------------------------------------------------------

  /** @param {KeyboardEvent} event */
  handleKey(event) {
    if (this.readonly || event.composedPath()[0] !== this) return;
    const meta = event.metaKey || event.ctrlKey;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
    } else if (meta && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
    } else if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicateSelection();
    } else if (!meta && !event.altKey && event.key === 'n') {
      event.preventDefault();
      this.addNote();
    } else if (meta && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      this.loopToSelection();
    } else if (meta && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      this.quantize({ lengths: event.shiftKey });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!this.selection.size) return;
      event.preventDefault();
      const delta = (event.key === 'ArrowUp' ? 1 : -1) * (event.altKey ? 12 : 1);
      this.commit(movedNotes(this._notes, [...this.selection], 0, delta, this.beats, this.step, 'off'));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!this.selection.size) return;
      event.preventDefault();
      const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.altKey ? this.step / 4 : this.step);
      this.commit(movedNotes(this._notes, [...this.selection], delta, 0, this.beats, this.step, 'off'));
    }
  }

  /** Wheel scrolls pitch; Shift (or a sideways wheel) scrolls time; Cmd/Ctrl zooms. */
  /** @param {WheelEvent} event */
  handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY;
    const width = this.gridWrap.clientWidth;
    if (event.metaKey || event.ctrlKey) {
      if (event.shiftKey) {
        this.setAttribute('note-count', String(clamp(Math.round(this.noteCount + (delta > 0 ? 2 : -2)), MIN_ROWS, MAX_ROWS)));
        return;
      }
      const at = (this.offset + width / 2) / this.pxPerBeat;
      this.zoomPxPerBeat = clamp(this.pxPerBeat * (delta > 0 ? 0.86 : 1.16), MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
      this.offset = clamp(at * this.pxPerBeat - width / 2, 0, Math.max(0, this.beats * this.pxPerBeat - width));
    } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(delta)) {
      this.offset = clamp(this.offset + (event.deltaX || delta), 0, Math.max(0, this.beats * this.pxPerBeat - width));
    } else {
      const lo = clamp(this.rootNote + (delta > 0 ? -1 : 1) * (event.altKey ? 12 : 1), 0, 128 - this.noteCount);
      this.setAttribute('root-note', String(lo));
      return;
    }
    this.refresh();
  }

  /** The key column's wheel changes how many rows are shown, about the middle. */
  /** @param {WheelEvent} event */
  handleKeysWheel(event) {
    event.preventDefault();
    const middle = this.rootNote + this.noteCount / 2;
    const rows = clamp(Math.round(this.noteCount + (event.deltaY > 0 ? 2 : -2)), MIN_ROWS, MAX_ROWS);
    this.setAttribute('note-count', String(rows));
    this.setAttribute('root-note', String(clamp(Math.round(middle - rows / 2), 0, 128 - rows)));
  }
}

defineElement('compost-note-editor', CompostNoteEditor);
