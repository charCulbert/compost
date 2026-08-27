import { isNaturalNote, noteName } from '../midi.js';
import {
  MIN_DURATION,
  duplicatedNotes,
  gridStep,
  movedNotes,
  normaliseNotes,
  notesInBox,
  resolveOverlaps,
  resizedNotes,
  selectionSpan,
  snapBeats,
  snapWithOffset,
  trimmedNotes,
  velocityShiftedNotes,
} from '../piano-roll-model.js';
import { extendSelectionRegion, normalizeSelectionRegion } from '../selection-region.js';
export { rulerLabels } from '../time-ruler.js';
import { rulerLabels } from '../time-ruler.js';
import { createLongPress, DOUBLE_TAP_DISTANCE, DRAG_SLOP } from '../internal/gestures.js';
import { installTouchDoubleClick } from '../internal/touch-double-click.js';
import { clamp, defineElement, numberAttr } from '../utils.js';

let nextEditorID = 1;
const MIN_ROWS = 13;
const MAX_ROWS = 128;
const MAX_PX_PER_BEAT = 600;
const DOUBLE_CLICK_MS = 500;

/** @typedef {import('../piano-roll-model.js').RollNote} RollNote */

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

/** The musical name of a grid expressed as cells per bar. */
/** @param {number} division @param {number} [beatsPerBar] */
export function gridText(division, beatsPerBar = 4) {
  if (Math.abs(division - 1) < 1e-9) return '1 bar';
  for (const denominator of [4, 8, 16, 32]) {
    const straight = beatsPerBar * denominator / 4;
    if (Math.abs(division - straight) < 1e-9) return `1/${denominator}`;
    if (Math.abs(division - straight * 1.5) < 1e-9) return `1/${denominator}T`;
  }
  return `${division}/bar`;
}

/**
 * A MIDI note editor: pitch down the side on real piano keys, time across
 * the top under independent playback and loop ranges with draggable ends, notes on a grid that
 * snaps unless told not to. Notes move, trim from either edge, take
 * velocity from a Command/Ctrl-drag, marquee-select, nudge from
 * the keyboard, duplicate one span later and quantize. It edits a note list
 * and draws the playhead position it is given; it neither plays nor
 * schedules anything.
 */
export class CompostNoteEditor extends HTMLElement {
  static get observedAttributes() {
    return [
      'label', 'beats', 'beats-per-bar', 'grid', 'snap', 'start', 'end', 'loop-start', 'loop-end',
      'root-note', 'note-count', 'beat-width', 'fold', 'draw', 'playhead', 'scale', 'root',
      'velocity', 'channel', 'grid-lines', 'loop', 'lock-loop-start', 'readonly', 'disabled',
    ];
  }

  constructor() {
    super();

    this.label = 'Notes';
    this.beatsPerBar = 4;
    this.grid = 16;
    this.gridLines = true;
    this.snapMode = 'grid';
    this.rangeStart = 0;
    this.rangeEnd = 8;
    this.loopStart = 0;
    this.loopEnd = 8;
    this.loopEnabled = false;
    this.scale = [];
    this.scaleRoot = null;
    this.rootNote = 48;
    this.noteCount = 25;
    this.beatWidth = 0;
    /** @type {number|null} */ this.playhead = null;
    this.defaultVelocity = 100;
    this.defaultChannel = 0;
    /** Caller-owned allocator for durable note identity. @type {(() => string)|null} */
    this.noteIdFactory = null;
    this.explicitBeats = false;
    this.beats = 16;
    this.offset = 0;
    this.zoomPxPerBeat = 0;
    /** @type {RollNote[]} */ this._notes = [];
    /** @type {RollNote[]|null} */ this._preview = null;
    /** @type {Set<string>} */ this.selection = new Set();
    /** @type {number[]} */ this.visibleKeys = [];
    /** @type {any} */ this.drag = null;
    this.longPress = createLongPress();
    /** The last marquee's extent, kept so a duplicate can space itself by the
     * selected time. Pitch bounds mean a box; their absence means time only.
     * @type {{start: number, end: number, pitches?: number[]}|null} */
    this.selectionRegion = null;
    /** @type {any} */ this.loopDrag = null;
    /** @type {any} */ this.keyPan = null;
    /** @type {{id: string, time: number}|null} */ this.modifiedClick = null;
    /** @type {{beat: number, note: number, x: number, y: number, time: number}|null} */ this.pendingEmptyClick = null;
    /** @type {ReturnType<typeof setTimeout>|null} */ this.emptySelectionTimer = null;
    this.ignoreDoubleClick = false;
    this.editorID = `compost-note-editor-${nextEditorID++}`;
    this.handleModifierKey = this.handleModifierKey.bind(this);
    this.handleWindowBlur = () => { this.removeAttribute('data-velmod'); this.removeAttribute('data-copymod'); };
    this.refresh = this.refresh.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-note-editor-bg: Canvas;
          --compost-note-editor-text: currentColor;
          --compost-note-editor-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-note-editor-line: color-mix(in srgb, currentColor 18%, transparent);
          --compost-note-editor-bar-line: var(--compost-note-editor-muted);
          --compost-note-editor-row: color-mix(in srgb, currentColor 5%, transparent);
          --compost-note-editor-signal: var(--compost-accent, AccentColor);
          --compost-note-editor-range: var(--compost-note-editor-text);
          --compost-note-editor-loop: var(--compost-note-editor-signal);
          --compost-note-editor-select: var(--compost-note-editor-signal);
          --compost-note-editor-marquee: color-mix(in srgb, var(--compost-note-editor-select) 14%, transparent);
          --compost-note-editor-time-selection: color-mix(in srgb, var(--compost-note-editor-select) 10%, transparent);
          --compost-note-editor-past: color-mix(in srgb, currentColor 13%, transparent);
          --compost-note-editor-playhead: var(--compost-note-editor-text);
          --compost-note-editor-tip-bg: Canvas;
          --compost-note-editor-key-width: 3em;
          --compost-note-editor-ruler-height: 3em;
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
        :host(:focus-visible) { outline: 2px solid currentColor; outline-offset: -2px; }
        .frame {
          position: relative;
          display: grid;
          grid-template-columns: var(--compost-note-editor-key-width) minmax(0, 1fr);
          grid-template-rows: var(--compost-note-editor-ruler-height) minmax(0, 1fr);
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          border: 1px solid currentColor;
          overflow: hidden;
        }
        .corner { grid-column: 1; grid-row: 1; }
        .rulerwrap { grid-column: 2; grid-row: 1; position: relative; overflow: hidden; }
        .ruler { position: absolute; top: 0; bottom: 0; left: 0; }
        .ruler::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.15em;
          background: color-mix(in srgb, currentColor 5%, Canvas);
          border-bottom: 1px solid var(--compost-note-editor-line);
          pointer-events: none;
        }
        .ruler .bn {
          position: absolute;
          top: 0.15em;
          height: 0.73em;
          padding: 0.05em 0.25em 0.05em 0.2em;
          background: color-mix(in srgb, currentColor 5%, Canvas);
          font-size: 0.73em;
          color: var(--compost-note-editor-text);
          line-height: 1;
          white-space: nowrap;
          z-index: 2;
        }
        .ruler .rt { position: absolute; top: 1.15em; bottom: 0; width: 1px; background: var(--compost-note-editor-line); pointer-events: none; }
        .ruler .rt.beat { top: 0.9em; background: color-mix(in srgb, currentColor 50%, transparent); }
        .ruler .rt.bar { top: 0.75em; background: color-mix(in srgb, currentColor 70%, transparent); }
        .region {
          position: absolute;
          top: 1.35em;
          height: 0.7em;
          left: 0;
          background: var(--compost-note-editor-loop);
          box-shadow: inset 0 0 0 1px currentColor;
          cursor: grab;
          touch-action: none;
        }
        .time-selection-ruler {
          position: absolute;
          bottom: 0.15em;
          height: 0.45em;
          box-sizing: border-box;
          border: solid var(--compost-note-editor-select);
          border-width: 0 1px 1px;
          pointer-events: none;
          display: none;
          z-index: 3;
        }
        .handle {
          position: absolute;
          top: 1.25em;
          height: 0.9em;
          width: 1em;
          cursor: col-resize;
          z-index: 3;
          touch-action: none;
        }
        .range-handle { top: 2em; height: 0.9em; z-index: 4; }
        .range-handle::after { content: ""; position: absolute; top: 0.16em; width: 0; height: 0; border-top: 0.28em solid transparent; border-bottom: 0.28em solid transparent; }
        .range-handle.start::after { left: 1px; border-left: 0.45em solid var(--compost-note-editor-range); }
        .range-handle.end::after { right: 1px; border-right: 0.45em solid var(--compost-note-editor-range); }
        /* a host whose clips always start at zero keeps the start where it is */
        :host([lock-loop-start]) .loop-handle.start { display: none; }
        :host([lock-loop-start]) .region { cursor: default; }
        :host(:not([loop])) .region, :host(:not([loop])) .loop-handle,
        :host(:not([loop])) .timeline-line.loop { display: none; }
        .keys {
          grid-column: 1; grid-row: 2;
          position: relative;
          overflow: hidden;
          color-scheme: light;
          background: Canvas;
          color: CanvasText;
          cursor: grab;
          touch-action: none;
        }
        .keys[data-pan] { cursor: grabbing; }
        .keys[data-axis="scroll"] { cursor: ns-resize; }
        .keys[data-axis="zoom"] { cursor: ew-resize; }
        .key {
          position: absolute;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          box-sizing: border-box;
          padding-right: 0.45em;
          font-size: 0.73em;
          letter-spacing: 0;
          cursor: inherit;
        }
        .key.white { right: 0; background-color: Canvas; color: CanvasText; }
        .key.black { width: 100%; background: CanvasText; color: Canvas; z-index: 2; }
        .key[data-on] { background: var(--compost-note-editor-signal); color: AccentColorText; }
        .key[data-scale] { background-image: linear-gradient(color-mix(in srgb, currentColor 6%, transparent), color-mix(in srgb, currentColor 6%, transparent)); }
        .key[data-root] { background-image: linear-gradient(color-mix(in srgb, currentColor 12%, transparent), color-mix(in srgb, currentColor 12%, transparent)); }
        .key[data-hover] { background-image: linear-gradient(color-mix(in srgb, currentColor 18%, transparent), color-mix(in srgb, currentColor 18%, transparent)); }
        .key::before { content: attr(data-name); display: none; }
        .key[data-label]::before, .key[data-hover]::before { display: block; }
        .key.octave { box-shadow: inset 0 1px 0 color-mix(in srgb, CanvasText 65%, transparent); }
        .gridwrap { grid-column: 2; grid-row: 2; position: relative; overflow: hidden; }
        .grid { position: absolute; top: 0; bottom: 0; left: 0; cursor: default; touch-action: none; }
        :host([draw]) .grid { cursor: crosshair; }
        .gl { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-note-editor-line); }
        .gl.beat { background: color-mix(in srgb, currentColor 30%, transparent); }
        .gl.bar { background: var(--compost-note-editor-bar-line); }
        .rl { position: absolute; left: 0; right: 0; height: 1px; background: var(--compost-note-editor-line); }
        .rl.octave { background: color-mix(in srgb, currentColor 30%, transparent); }
        .rw { position: absolute; left: 0; right: 0; background: var(--compost-note-editor-row); }
        .note { position: absolute; z-index: 2; background: var(--note-fill, var(--compost-note-editor-signal)); color: var(--compost-note-editor-text); border: 1px solid currentColor; cursor: grab; box-sizing: border-box; }
        .note[data-selected] { border-width: 2px; }
        .note[data-out] { background: color-mix(in srgb, var(--note-fill) 28%, transparent); }
        .note .nn { position: absolute; left: 0.3em; top: 50%; z-index: 1; color: AccentColorText; font-size: 0.73em; line-height: 1; transform: translateY(-50%); pointer-events: none; }
        .note[data-vel] { cursor: ns-resize; }
        .note .ve { position: absolute; left: 0.4em; right: 0.4em; top: 0; bottom: 0; cursor: grab; }
        .note .rs { position: absolute; left: 0; top: 0; bottom: 0; width: 0.4em; cursor: col-resize; }
        .note .re { position: absolute; right: 0; top: 0; bottom: 0; width: 0.4em; cursor: col-resize; }
        /* what the drag will do is always on the pointer: move, trim, or velocity */
        :host([data-drag="move"]) .note, :host([data-drag="move"]) .note .ve { cursor: grabbing; }
        :host([data-velmod]) .note, :host([data-velmod]) .note .rs, :host([data-velmod]) .note .re,
        :host([data-velmod]) .note .ve, :host([data-drag="vel"]) .note, :host([data-drag="vel"]) .note .ve { cursor: ns-resize; }
        :host([data-copymod]) .note .ve, :host([data-drag="copy"]) .note, :host([data-drag="copy"]) .note .ve { cursor: copy; }
        .outside { position: absolute; top: 0; bottom: 0; background: var(--compost-note-editor-past); pointer-events: none; z-index: 1; }
        .timeline-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-note-editor-range); z-index: 5; pointer-events: none; }
        .timeline-line.loop { width: 2px; background: var(--compost-note-editor-loop); }
        .marker-guide { position: absolute; top: 0; bottom: 0; width: 1px; z-index: 5; pointer-events: none; display: none; }
        .marker-guide[data-on] { display: block; }
        .marker-guide[data-scope="range"] { background: var(--compost-note-editor-range); }
        .marker-guide[data-scope="loop"] { background: var(--compost-note-editor-loop); }
        .playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-note-editor-playhead);
          box-shadow: -1px 0 Canvas, 1px 0 Canvas; pointer-events: none; z-index: 6; display: none; }
        .marquee { position: absolute; border: 1px solid var(--compost-note-editor-select); background: var(--compost-note-editor-marquee); pointer-events: none; display: none; }
        .time-selection {
          position: absolute;
          top: 0;
          bottom: 0;
          box-sizing: border-box;
          border: solid var(--compost-note-editor-select);
          border-width: 0 1px;
          background: var(--compost-note-editor-time-selection);
          pointer-events: none;
          display: none;
        }
        .time-selection[data-box] { border-width: 1px; }
        .tip {
          position: fixed;
          z-index: 50;
          padding: 0.15em 0.35em;
          background: var(--compost-note-editor-tip-bg);
          box-shadow: 0 0 0 1px var(--compost-note-editor-line);
          color: var(--compost-note-editor-text);
          font-size: 0.82em;
          white-space: nowrap;
          pointer-events: none;
        }
        .tip[hidden] { display: none; }
        .division {
          position: absolute;
          right: 0.55em;
          bottom: 0.36em;
          font-size: 0.82em;
          color: var(--compost-note-editor-muted);
          pointer-events: none;
        }
      </style>
      <div class="frame" part="frame">
        <div class="corner" part="corner"></div>
        <div class="rulerwrap" part="ruler">
          <div class="ruler">
            <div class="handle start range-handle" part="range-start"></div>
            <div class="handle end range-handle" part="range-end"></div>
            <div class="region" part="loop"></div>
            <div class="handle start loop-handle" part="loop-start"></div>
            <div class="handle end loop-handle" part="loop-end"></div>
            <div class="time-selection-ruler" part="time-selection-ruler"></div>
          </div>
        </div>
        <div class="keys" part="keys"></div>
        <div class="gridwrap" part="grid">
          <div class="grid">
            <div class="outside before" part="before"></div>
            <div class="time-selection" part="time-selection"></div>
            <div class="outside past" part="past"></div>
            <div class="marker-guide" part="marker-guide"></div>
            <div class="playhead" part="playhead"></div>
            <div class="marquee" part="marquee"></div>
          </div>
          <div class="division" part="division"></div>
        </div>
        <div class="timeline-line range-start-line" part="range-start-line"></div>
        <div class="timeline-line range-end-line" part="range-end-line"></div>
        <div class="timeline-line loop loop-start-line" part="loop-start-line"></div>
        <div class="timeline-line loop loop-end-line" part="loop-end-line"></div>
      </div>
      <div class="tip" part="tip" hidden></div>`;

    /** @param {string} selector @returns {HTMLElement} */
    const part = (selector) => /** @type {HTMLElement} */ (this.root.querySelector(selector));
    this.rulerWrap = part('.rulerwrap');
    this.ruler = part('.ruler');
    this.rangeStartHandle = part('.range-handle.start');
    this.rangeEndHandle = part('.range-handle.end');
    this.region = part('.region');
    this.startHandle = part('.loop-handle.start');
    this.endHandle = part('.loop-handle.end');
    this.timeSelectionRuler = part('.time-selection-ruler');
    this.keys = part('.keys');
    this.gridWrap = part('.gridwrap');
    this.gridElement = part('.grid');
    this.before = part('.outside.before');
    this.timeSelection = part('.time-selection');
    this.past = part('.past');
    this.markerGuide = part('.marker-guide');
    this.playheadElement = part('.playhead');
    this.marquee = part('.marquee');
    this.tip = part('.tip');
    this.division = part('.division');
    this.rangeStartLine = part('.range-start-line');
    this.rangeEndLine = part('.range-end-line');
    this.loopStartLine = part('.loop-start-line');
    this.loopEndLine = part('.loop-end-line');

    this.gridElement.addEventListener('pointerdown', (event) => {
      this.updateHoverKey(event);
      this.startPointer(event);
    });
    this.gridElement.addEventListener('pointermove', (event) => {
      this.updateHoverKey(event);
      this.movePointer(event);
    });
    this.gridElement.addEventListener('pointerup', (event) => this.endPointer(event));
    this.gridElement.addEventListener('pointercancel', (event) => this.endPointer(event));
    this.gridElement.addEventListener('pointerleave', () => {
      if (!this.drag) this.clearHoverKey();
    });
    this.gridElement.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    installTouchDoubleClick(this.gridElement);
    this.gridElement.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
    this.ruler.addEventListener('pointerdown', (event) => this.startRulerSelection(event));
    this.ruler.addEventListener('pointermove', (event) => this.movePointer(event));
    this.ruler.addEventListener('pointerup', (event) => this.endPointer(event));
    this.ruler.addEventListener('pointercancel', (event) => this.endPointer(event));
    this.keys.addEventListener('pointerdown', (event) => this.startKeyPan(event));
    this.keys.addEventListener('pointermove', (event) => this.moveKeyPan(event));
    this.keys.addEventListener('pointerup', (event) => this.endKeyPan(event));
    this.keys.addEventListener('pointercancel', (event) => this.endKeyPan(event));
    this.gridWrap.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.keys.addEventListener('wheel', (event) => this.handleKeysWheel(event), { passive: false });
    for (const [node, kind] of [[this.endHandle, 'end'], [this.startHandle, 'start'], [this.region, 'move']]) {
      node.addEventListener('pointerdown', (event) => this.startMarkerDrag(event, 'loop', kind));
      node.addEventListener('pointermove', (event) => this.moveMarkerDrag(event));
      node.addEventListener('pointerup', (event) => this.endMarkerDrag(event));
      node.addEventListener('pointercancel', (event) => this.endMarkerDrag(event));
    }
    for (const [node, kind] of [[this.rangeStartHandle, 'start'], [this.rangeEndHandle, 'end']]) {
      node.addEventListener('pointerdown', (event) => this.startMarkerDrag(event, 'range', kind));
      node.addEventListener('pointermove', (event) => this.moveMarkerDrag(event));
      node.addEventListener('pointerup', (event) => this.endMarkerDrag(event));
      node.addEventListener('pointercancel', (event) => this.endMarkerDrag(event));
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
    clearTimeout(this.emptySelectionTimer);
    this.emptySelectionTimer = null;
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.handleModifierKey, true);
    window.removeEventListener('keyup', this.handleModifierKey, true);
    window.removeEventListener('blur', this.handleWindowBlur);
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
    this.gridLines = this.getAttribute('grid-lines') !== 'off';
    this.snapMode = this.getAttribute('snap') === 'off' ? 'off' : 'grid';
    const rawStart = Math.max(0, numberAttr(this, 'start', this.rangeStart));
    const rawEnd = Math.max(rawStart + MIN_DURATION, numberAttr(this, 'end', this.rangeEnd));
    const rawLoopStart = Math.max(0, numberAttr(this, 'loop-start', this.loopStart));
    const rawLoopEnd = Math.max(rawLoopStart + MIN_DURATION, numberAttr(this, 'loop-end', this.loopEnd));
    this.rangeStart = rawStart;
    this.rangeEnd = rawEnd;
    this.loopStart = rawLoopStart;
    this.loopEnd = rawLoopEnd;
    this.loopEnabled = this.hasAttribute('loop');
    const scale = (this.getAttribute('scale') ?? '').split(/[\s,]+/)
      .filter(Boolean).map(Number).filter(Number.isFinite)
      .map((note) => ((Math.round(note) % 12) + 12) % 12);
    this.scale = [...new Set(scale)];
    this.scaleRoot = this.hasAttribute('root')
      ? ((Math.round(numberAttr(this, 'root', 0)) % 12) + 12) % 12 : null;
    this.explicitBeats = this.hasAttribute('beats');
    this.beats = this.explicitBeats
      ? Math.max(this.rangeEnd, this.loopEnd, numberAttr(this, 'beats', this.beats))
      : Math.max(Math.max(this.rangeEnd, this.loopEnd) + 8, 16);
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
    const next = normaliseNotes(notes, this.beats);
    if (next.some((note) => !note.id)) {
      throw new TypeError('compost-note-editor notes need caller-owned ids');
    }
    this._notes = next;
    this._preview = null;
    const ids = new Set(this._notes.map((note) => note.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
    this.expandSelectionRegionToNotes();
    this.refresh();
    if (shouldEmit) this.emitChange();
  }

  get step() {
    return gridStep(this.grid, this.beatsPerBar);
  }

  newNoteId() {
    const id = this.noteIdFactory?.();
    if (typeof id !== 'string' || !id) {
      throw new Error('compost-note-editor needs a noteIdFactory to create notes');
    }
    return id;
  }

  get readonly() {
    return this.hasAttribute('readonly') || this.hasAttribute('disabled');
  }

  get selectedIds() {
    return [...this.selection];
  }

  /** Sets the non-destructive playback range, in beats. */
  /** @param {number} start @param {number} end @param {boolean} [shouldEmit] */
  setRange(start, end, shouldEmit = false) {
    const nextStart = Math.max(0, Number(start) || 0);
    const nextEnd = Math.max(Number(end) || 0, nextStart + MIN_DURATION);
    if (nextStart === this.rangeStart && nextEnd === this.rangeEnd) return;
    this.setAttribute('start', String(nextStart));
    this.setAttribute('end', String(nextEnd));
    if (shouldEmit) this.emitRange();
  }

  /** Sets the loop region, in beats. */
  /** @param {number} start @param {number} end @param {boolean} [shouldEmit] */
  setLoop(start, end, shouldEmit = false) {
    const nextStart = Math.max(0, Number(start) || 0);
    const nextEnd = Math.max(Number(end) || 0, nextStart + MIN_DURATION);
    if (nextStart === this.loopStart && nextEnd === this.loopEnd) return;
    this.setAttribute('loop-start', String(nextStart));
    this.setAttribute('loop-end', String(nextEnd));
    if (shouldEmit) this.emitLoop();
  }

  /** Asks the host to quantize the selection, or everything when none is selected. */
  /** @param {{lengths?: boolean, division?: number}} [options] */
  quantize({ lengths = false, division = this.grid } = {}) {
    if (this.readonly) return;
    this.dispatchEvent(new CustomEvent('note-quantize', {
      bubbles: true, composed: true,
      detail: {
        ids: this.selection.size > 0 ? [...this.selection] : this._notes.map((note) => note.id),
        step: gridStep(division, this.beatsPerBar), lengths,
      },
    }));
  }

  selectAll() {
    this.selection = new Set(this._notes.map((note) => note.id));
    this.renderSelection();
    this.emitSelection();
  }

  clearSelection() {
    this.selectionRegion = null;
    this.selection.clear();
    this.renderNotes();
    this.renderSelectionRegion();
    this.emitSelection();
  }

  /** In Fold, vertical arrows move through displayed pitches without hiding the selection. */
  moveSelectionThroughVisiblePitches(direction) {
    const selected = this._notes.filter((note) => this.selection.has(note.id));
    const targets = new Map();
    for (const note of selected) {
      const index = this.visibleKeys.indexOf(note.note);
      const target = this.visibleKeys[index - direction];
      if (index < 0 || target === undefined) return;
      targets.set(note.note, target);
    }
    this.commit(this._notes.map((note) => (this.selection.has(note.id)
      ? { ...note, note: targets.get(note.note) }
      : note)), [...this.selection]);
  }

  deleteSelection() {
    if (this.readonly || this.selection.size === 0) return;
    const next = this._notes.filter((note) => !this.selection.has(note.id));
    this.selection.clear();
    this.commit(next);
  }

  /** Copies the selection one span later — or one marquee length later when the
   * marquee took in empty time beyond the notes — and selects the copies. */
  duplicateSelection() {
    if (this.readonly || this.selection.size === 0) return;
    const originals = this._notes.filter((note) => this.selection.has(note.id));
    const copies = duplicatedNotes(this._notes, [...this.selection], this.step, this.beats,
      () => this.newNoteId(), this.snapMode, this.selectionRegion);
    if (!copies.length) return;
    if (this.selectionRegion) {
      const shift = Math.max(...copies.map((copy, index) => copy.start - originals[index].start));
      this.selectionRegion = {
        ...this.selectionRegion,
        start: this.selectionRegion.start + shift,
        end: this.selectionRegion.end + shift,
      };
    }
    this.selection = new Set(copies.map((note) => note.id));
    this.commit([...this._notes, ...copies], copies.map((note) => note.id));
  }

  /** Adds one note without a pointer: at the loop start, or just after the
   * selection, on the middle visible row. Selects it and reports the change. */
  addNote() {
    if (this.readonly) return null;
    const span = selectionSpan(this._notes, this.selection.size ? [...this.selection] : null);
    const raw = this.selection.size && span ? span.end : this.rangeStart;
    const start = clamp(this.snapBeat(raw), 0, Math.max(0, this.beats - this.step));
    const created = {
      id: this.newNoteId(),
      note: this.visibleKeys[Math.floor(this.visibleKeys.length / 2)] ?? this.rootNote,
      start,
      duration: Math.max(this.step, MIN_DURATION),
      velocity: this.defaultVelocity,
      channel: this.defaultChannel,
    };
    this.selection = new Set([created.id]);
    this.commit([...this._notes, created], [created.id]);
    this.preview(created.note);
    return created;
  }

  /** Sets the loop to the selection's span. */
  loopToSelection() {
    const span = this.selectionRegion
      ?? selectionSpan(this._notes, this.selection.size ? [...this.selection] : null);
    if (!span) return;
    this.zoomPxPerBeat = 0;
    this.offset = 0;
    const locked = this.hasAttribute('lock-loop-start');
    this.setRange(Math.min(this.rangeStart, locked ? 0 : span.start), Math.max(this.rangeEnd, span.end), false);
    this.setAttribute('loop', '');
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
    const width = this.gridWrap?.clientWidth || 400;
    const fit = width / Math.max(1, this.beats);
    if (this.zoomPxPerBeat > 0) return Math.max(fit, this.zoomPxPerBeat);
    if (this.beatWidth > 0) return this.beatWidth;
    return Math.max(fit, width / Math.max(8, this.rangeEnd + 4));
  }

  /** @param {number} beat */
  beatToX(beat) { return beat * this.pxPerBeat; }

  /** @param {number} x */
  xToBeat(x) { return x / this.pxPerBeat; }

  get rowHeight() {
    return (this.gridWrap?.clientHeight || 300) / Math.max(1, this.visibleKeys.length);
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
    if (this.hasAttribute('fold')) {
      const used = [...new Set(this._notes.map((note) => note.note))].sort((a, b) => b - a);
      if (used.length) return used;
    }
    const count = this.noteCount;
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

  /** @param {number} beat @param {boolean} [free] */
  snapBeat(beat, free = this.snapMode === 'off') {
    return free ? Math.max(0, beat) : snapBeats(beat, this.step, 'grid');
  }

  /** A new note belongs to the grid cell under the pointer, not the nearest line. */
  creationBeat(beat, free = this.snapMode === 'off') {
    if (free) return Math.max(0, beat);
    return Math.max(0, Math.floor((beat + Number.EPSILON) / this.step) * this.step);
  }

  /** Command/Ctrl temporarily uses the opposite of the configured time snapping mode. */
  gestureIsFree(event) {
    const modifier = event.metaKey || event.ctrlKey;
    return this.snapMode === 'off' ? !modifier : modifier;
  }

  /** Shift uses the same quarter-speed precision as the envelope editor. */
  gestureFactor(event) {
    return event.shiftKey ? 0.25 : 1;
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
    this.renderMarkerGuide();
    this.renderSelectionRegion();
  }

  renderSelectionRegion() {
    if (!this.selectionRegion) {
      this.timeSelection.style.display = 'none';
      this.timeSelectionRuler.style.display = 'none';
      this.division.textContent = this.gridLines ? gridText(this.grid, this.beatsPerBar) : 'off';
      return;
    }
    const left = this.selectionRegion.start * this.pxPerBeat;
    const width = (this.selectionRegion.end - this.selectionRegion.start) * this.pxPerBeat;
    for (const element of [this.timeSelection, this.timeSelectionRuler]) {
      element.style.display = 'block';
      element.style.left = `${left}px`;
      element.style.width = `${width}px`;
    }
    const box = Array.isArray(this.selectionRegion.pitches) && this.selectionRegion.pitches.length > 0;
    this.timeSelection.toggleAttribute('data-box', box);
    if (box) {
      const rows = this.visibleKeys.map((note, index) => ({ note, index }))
        .filter(({ note }) => note >= Math.min(...this.selectionRegion.pitches)
          && note <= Math.max(...this.selectionRegion.pitches));
      if (rows.length) {
        const top = Math.min(...rows.map(({ index }) => index)) * this.rowHeight;
        const bottom = (Math.max(...rows.map(({ index }) => index)) + 1) * this.rowHeight;
        this.timeSelection.style.top = `${top}px`;
        this.timeSelection.style.bottom = 'auto';
        this.timeSelection.style.height = `${bottom - top}px`;
      } else this.timeSelection.style.display = 'none';
    } else {
      this.timeSelection.style.top = '0px';
      this.timeSelection.style.bottom = '0px';
      this.timeSelection.style.height = 'auto';
    }
    const beats = this.selectionRegion.end - this.selectionRegion.start;
    const bars = beats / this.beatsPerBar;
    this.division.textContent = Math.abs(bars - Math.round(bars)) < 1e-9
      ? `${Math.round(bars)} bar${Math.round(bars) === 1 ? '' : 's'}` : lengthText(beats);
  }

  renderRuler() {
    const px = this.pxPerBeat;
    this.ruler.style.width = `${this.beats * px}px`;
    this.ruler.style.transform = `translateX(${-this.offset}px)`;
    const rangeHandle = this.rangeStartHandle.offsetWidth || 11;
    this.rangeStartHandle.style.left = `${this.rangeStart * px - 1}px`;
    this.rangeEndHandle.style.left = `${this.rangeEnd * px - rangeHandle + 1}px`;
    this.region.style.left = `${this.loopStart * px}px`;
    this.region.style.width = `${(this.loopEnd - this.loopStart) * px}px`;
    const handle = this.startHandle.offsetWidth || 11;
    this.startHandle.style.left = `${this.loopStart * px - 1}px`;
    this.endHandle.style.left = `${this.loopEnd * px - handle + 1}px`;
    for (const label of this.ruler.querySelectorAll('.bn,.rt')) label.remove();
    const fragment = document.createDocumentFragment();
    for (let beat = 0; beat <= this.beats + 1e-9; beat += this.step) {
      const tick = document.createElement('div');
      const isBar = Math.abs(beat % this.beatsPerBar) < 1e-9;
      const isBeat = Math.abs(beat % 1) < 1e-9;
      tick.className = `rt${isBar ? ' bar' : isBeat ? ' beat' : ''}`;
      tick.part.add('ruler-tick');
      tick.style.left = `${beat * px}px`;
      fragment.append(tick);
    }
    for (const { beat, text } of rulerLabels(this.beats, this.beatsPerBar, px, this.step)) {
      const label = document.createElement('div');
      label.className = 'bn';
      label.part.add('ruler-label');
      label.textContent = text;
      label.style.left = `${beat * px}px`;
      fragment.append(label);
    }
    this.ruler.append(fragment);
    this.before.style.left = '0px';
    this.before.style.width = `${this.rangeStart * px}px`;
    this.past.style.left = `${this.rangeEnd * px}px`;
    this.past.style.width = `${Math.max(0, (this.beats - this.rangeEnd) * px)}px`;
    const timelineLeft = this.gridWrap.offsetLeft;
    const timelineWidth = this.gridWrap.clientWidth;
    for (const [line, beat] of [
      [this.rangeStartLine, this.rangeStart], [this.rangeEndLine, this.rangeEnd],
      [this.loopStartLine, this.loopStart], [this.loopEndLine, this.loopEnd],
    ]) {
      const x = beat * px - this.offset;
      line.hidden = x < 0 || x > timelineWidth;
      line.style.left = `${timelineLeft + x}px`;
    }
  }

  renderKeys() {
    const height = this.rowHeight;
    const fold = this.hasAttribute('fold');
    const markup = [];
    this.visibleKeys.forEach((note, index) => {
      const accidental = !isNaturalNote(note);
      const classes = `key ${accidental ? 'black' : 'white'}${note % 12 === 0 ? ' octave' : ''}`;
      const parts = `key ${accidental ? 'black-key' : 'white-key'}`;
      const label = height >= 9 && (fold || note % 12 === 0) ? ' data-label' : '';
      const relative = this.scaleRoot === null ? -1 : ((note - this.scaleRoot) % 12 + 12) % 12;
      const inScale = this.scaleRoot !== null && this.scale.includes(relative);
      const scaleState = inScale ? ' data-scale' : '';
      const rootState = inScale && relative === 0 ? ' data-root' : '';
      markup.push(`<div class="${classes}" part="${parts}" data-note="${note}" data-name="${noteName(note)}"${label}${scaleState}${rootState} style="top:${(index * height).toFixed(2)}px;height:${Math.max(2, height).toFixed(2)}px"></div>`);
    });
    this.keys.innerHTML = markup.join('');
  }

  clearHoverKey() {
    this.keys.querySelector('[data-hover]')?.removeAttribute('data-hover');
  }

  /** Shows the grid row's pitch on the matching key without auditioning it. */
  updateHoverKey(event) {
    const note = this.yToNote(this.gridPoint(event).y);
    const current = this.keys.querySelector('[data-hover]');
    if (current?.dataset.note === String(note)) return;
    current?.removeAttribute('data-hover');
    this.keys.querySelector(`[data-note="${note}"]`)?.setAttribute('data-hover', '');
  }

  renderGrid() {
    for (const node of this.gridElement.querySelectorAll('.gl,.rl,.rw')) node.remove();
    const height = this.rowHeight;
    const px = this.pxPerBeat;
    const markup = [];
    this.visibleKeys.forEach((note, index) => {
      const top = index * height;
      if (!isNaturalNote(note)) markup.push(`<div class="rw" part="row" style="top:${top.toFixed(2)}px;height:${height.toFixed(2)}px"></div>`);
      if (note % 12 === 0) markup.push(`<div class="rl octave" part="row-line octave-line" style="top:${top.toFixed(2)}px"></div>`);
    });
    const step = this.step;
    if (this.gridLines && step > 0) {
      for (let beat = 0; beat <= this.beats + 1e-9; beat += step) {
        const isBar = Math.abs(beat % this.beatsPerBar) < 1e-9;
        const isBeat = Math.abs(beat % 1) < 1e-9;
        markup.push(`<div class="gl${isBar ? ' bar' : isBeat ? ' beat' : ''}" part="grid-line${isBar ? ' bar-line' : isBeat ? ' beat-line' : ''}" style="left:${(beat * px).toFixed(2)}px"></div>`);
      }
    }
    this.past.insertAdjacentHTML('beforebegin', markup.join(''));
  }

  renderNotes() {
    for (const element of this.gridElement.querySelectorAll('.note')) element.remove();
    const height = this.rowHeight;
    const px = this.pxPerBeat;
    const fragment = document.createDocumentFragment();
    const velocityId = this.drag?.mode === 'vel' ? this.drag.note?.id : null;
    for (const note of this._preview ?? this._notes) {
      const y = this.noteToY(note.note);
      if (y < 0) continue;
      const element = document.createElement('div');
      element.className = 'note';
      element.part.add('note');
      element.dataset.id = note.id;
      if (this.selection.has(note.id)) element.dataset.selected = '';
      if (note.start < this.rangeStart || note.start >= this.rangeEnd) element.dataset.out = '';
      if (velocityId === note.id) element.dataset.vel = '';
      element.style.left = `${(note.start * px).toFixed(2)}px`;
      element.style.width = `${Math.max(3, note.duration * px).toFixed(2)}px`;
      element.style.top = `${(y + 1).toFixed(2)}px`;
      element.style.height = `${Math.max(3, height - 2).toFixed(2)}px`;
      const fill = Math.round((0.3 + 0.7 * (note.velocity / 127)) * 100);
      element.style.setProperty('--note-fill', `color-mix(in srgb, var(--compost-note-editor-signal) ${fill}%, transparent)`);
      element.setAttribute('aria-label',
        `${noteName(note.note)}, beat ${(note.start + 1).toFixed(2)}, length ${note.duration.toFixed(2)}, velocity ${note.velocity}`);
      const name = height >= 9 ? `<span class="nn" part="note-label">${noteName(note.note)}</span>` : '';
      element.innerHTML = `${name}<div class="ve" part="note-body"></div><div class="rs" part="note-start"></div><div class="re" part="note-end"></div>`;
      fragment.append(element);
    }
    this.gridElement.insertBefore(fragment, this.past);
  }

  renderSelection() {
    for (const element of this.gridElement.querySelectorAll('.note')) {
      element.toggleAttribute('data-selected', this.selection.has(element.dataset.id));
    }
  }

  renderPlayhead() {
    if (this.playhead === null) {
      this.playheadElement.style.display = 'none';
      return;
    }
    this.playheadElement.style.display = 'block';
    this.playheadElement.style.left = `${(this.playhead * this.pxPerBeat).toFixed(1)}px`;
  }

  renderMarkerGuide() {
    const drag = this.loopDrag;
    if (!drag) { this.markerGuide.removeAttribute('data-on'); return; }
    const beat = drag.scope === 'range'
      ? drag.kind === 'start' ? this.rangeStart : this.rangeEnd
      : drag.kind === 'start' ? this.loopStart : this.loopEnd;
    this.markerGuide.dataset.scope = drag.scope;
    this.markerGuide.style.left = `${(beat * this.pxPerBeat).toFixed(2)}px`;
    this.markerGuide.setAttribute('data-on', '');
  }

  // ---- Emitting ----------------------------------------------------------------

  /** @param {any[]} notes @param {string[]|null} [activeIds] */
  commit(notes, activeIds = null) {
    let next = normaliseNotes(notes, this.beats);
    if (activeIds?.length) next = resolveOverlaps(next, activeIds);
    this._preview = null;
    this.expandSelectionRegionToNotes(next);
    this.emitChange(next);
    this.refresh();
  }

  emitChange(notes = this._notes) {
    this.dispatchEvent(new CustomEvent('notes-change', {
      bubbles: true, composed: true,
      detail: { notes: notes.map((note) => ({ ...note })) },
    }));
  }

  emitLoop() {
    this.dispatchEvent(new CustomEvent('loop-change', {
      bubbles: true, composed: true, detail: { start: this.loopStart, end: this.loopEnd },
    }));
  }

  emitRange() {
    this.dispatchEvent(new CustomEvent('range-change', {
      bubbles: true, composed: true, detail: { start: this.rangeStart, end: this.rangeEnd },
    }));
  }

  emitSelection() {
    clearTimeout(this.emptySelectionTimer);
    this.emptySelectionTimer = null;
    this.expandSelectionRegionToNotes();
    this.renderSelectionRegion();
    this.dispatchEvent(new CustomEvent('selection-change', {
      bubbles: true, composed: true, detail: { ids: this.selectedIds },
    }));
  }

  scheduleEmptySelection() {
    clearTimeout(this.emptySelectionTimer);
    this.emptySelectionTimer = setTimeout(() => this.emitSelection(), DOUBLE_CLICK_MS);
  }

  /** Duplication time always contains every selected note from start to end. */
  expandSelectionRegionToNotes(notes = this._preview ?? this._notes) {
    if (!this.selectionRegion || !this.selection.size) return;
    const span = selectionSpan(notes, [...this.selection]);
    if (!span) return;
    this.selectionRegion = {
      ...this.selectionRegion,
      start: Math.min(this.selectionRegion.start, span.start),
      end: Math.max(this.selectionRegion.end, span.end),
    };
  }

  /** @param {number} note */
  preview(note) {
    this.dispatchEvent(new CustomEvent('note-preview', {
      bubbles: true, composed: true,
      detail: { note, velocity: this.defaultVelocity, channel: this.defaultChannel },
    }));
  }

  /** Ends a held keybed preview. */
  endPreview(note) {
    this.dispatchEvent(new CustomEvent('note-preview-end', {
      bubbles: true, composed: true,
      detail: { note, velocity: this.defaultVelocity, channel: this.defaultChannel },
    }));
  }

  /** @param {PointerEvent} event */
  startKeyPan(event) {
    if (event.button !== 0 || this.keyPan) return;
    const key = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('key'));
    if (!(key instanceof HTMLElement)) return;
    const note = Number(key.dataset.note);
    if (!Number.isInteger(note)) return;
    event.preventDefault();
    this.focus({ preventScroll: true });
    this.keyPan = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      root: this.rootNote, rows: this.noteCount, middle: this.rootNote + this.noteCount / 2,
      note, shiftKey: event.shiftKey, moved: false, axis: null, previewing: true,
      slop: event.pointerType === 'touch' ? DRAG_SLOP * 2 : DRAG_SLOP,
    };
    this.keys.setPointerCapture(event.pointerId);
    this.keys.setAttribute('data-pan', '');
    key.setAttribute('data-on', '');
    setTimeout(() => key.removeAttribute('data-on'), 160);
    this.preview(note);
  }

  /** @param {PointerEvent} event */
  moveKeyPan(event) {
    const pan = this.keyPan;
    if (!pan || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.axis) {
      if (Math.hypot(dx, dy) <= pan.slop) return;
      pan.axis = Math.abs(dx) > Math.abs(dy) ? 'zoom' : 'scroll';
      pan.moved = true;
      this.keys.dataset.axis = pan.axis;
      this.endPreview(pan.note);
      pan.previewing = false;
    }
    if (pan.axis === 'zoom') {
      const unit = parseFloat(getComputedStyle(this).fontSize) || 16;
      const rows = clamp(pan.rows - Math.round(dx / unit), MIN_ROWS, MAX_ROWS);
      this.setAttribute('note-count', String(rows));
      this.setAttribute('root-note', String(clamp(Math.round(pan.middle - rows / 2), 0, 128 - rows)));
    } else {
      const root = clamp(pan.root + Math.round(dy / this.rowHeight), 0, 128 - this.noteCount);
      this.setAttribute('root-note', String(root));
    }
  }

  /** @param {PointerEvent} event */
  endKeyPan(event) {
    const pan = this.keyPan;
    if (!pan || event.pointerId !== pan.pointerId) return;
    this.keyPan = null;
    this.keys.removeAttribute('data-pan');
    delete this.keys.dataset.axis;
    if (pan.previewing) this.endPreview(pan.note);
    if (event.type === 'pointercancel' || pan.moved) return;
    if (!pan.shiftKey) this.selection.clear();
    for (const entry of this._notes) if (entry.note === pan.note) this.selection.add(entry.id);
    this.renderNotes();
    this.emitSelection();
  }

  /** @param {string} text @param {{clientX: number, clientY: number}} event */
  showTip(text, event) {
    this.tip.hidden = false;
    this.tip.textContent = text;
    this.tip.style.left = `${event.clientX + 12}px`;
    this.tip.style.top = `${event.clientY - 16}px`;
  }

  /** Starts a pending grid-box or ruler-time selection. */
  startSelection(event, kind, point = this.gridPoint(event)) {
    event.preventDefault();
    this.focus({ preventScroll: true });
    this.drag = {
      pointerId: event.pointerId, mode: 'marq', kind,
      x: event.clientX, y: event.clientY,
      startBeat: clamp(this.snapBeat(this.xToBeat(point.x), this.gestureIsFree(event)), 0, this.beats),
      createBeat: clamp(this.creationBeat(this.xToBeat(point.x), this.gestureIsFree(event)), 0, this.beats),
      note0: kind === 'box' ? this.yToNote(point.y) : undefined,
      y0: point.y, moved: false, shiftKey: event.shiftKey,
      base: new Set(this.selection),
      regionBefore: this.selectionRegion ? { ...this.selectionRegion,
        pitches: this.selectionRegion.pitches ? [...this.selectionRegion.pitches] : undefined } : null,
      target: kind === 'box' ? this.gridElement : this.ruler,
      slop: event.pointerType === 'touch' ? DRAG_SLOP * 2 : DRAG_SLOP,
    };
    this.drag.target.setPointerCapture(event.pointerId);
  }

  /** Ruler drags select time without pitch bounds. */
  startRulerSelection(event) {
    if (this.readonly || event.button !== 0 || this.drag || this.loopDrag) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement
      && (node.classList.contains('handle') || node.classList.contains('region')))) return;
    this.startSelection(event, 'time');
  }

  // ---- Note gestures ------------------------------------------------------------

  /** @param {Event} event @returns {HTMLElement|null} */
  noteElementFrom(event) {
    const found = event.composedPath().find((node) =>
      node instanceof HTMLElement && node.classList.contains('note'));
    return found instanceof HTMLElement ? found : null;
  }

  /** Switches an active note move between its originals and temporary copies. */
  setCopyDrag(drag, copying) {
    if (drag.copy === copying) return;
    if (copying) {
      const sources = this._notes.filter((note) => drag.sourceIds.includes(note.id));
      if (!drag.copies) drag.copies = sources.map((note) => ({ ...note, id: this.newNoteId() }));
      drag.ids = drag.copies.map((note) => note.id);
      drag.note = drag.copies[sources.findIndex((note) => note.id === drag.sourceNoteId)] ?? drag.copies[0];
      this.selection = new Set(drag.ids);
    } else {
      drag.ids = [...drag.sourceIds];
      drag.note = this._notes.find((note) => note.id === drag.sourceNoteId);
      this.selection = new Set(drag.sourceIds);
    }
    drag.copy = copying;
  }

  dragSource(drag) {
    return drag.copy ? normaliseNotes([...this._notes, ...(drag.copies ?? [])], this.beats) : this._notes;
  }

  applyMoveDrag(drag, clientX, clientY, free) {
    const deltaBeats = this.xToBeat(clientX - drag.x);
    const deltaRows = Math.round((drag.y - clientY) / this.rowHeight);
    const source = this.dragSource(drag);
    const origin = source.find((note) => note.id === drag.note.id);
    if (!origin) return;
    const target = snapWithOffset(origin.start + deltaBeats, origin.start,
      this.step, free ? 'off' : 'grid');
    const shiftBeats = target - origin.start;
    const originRow = this.visibleKeys.indexOf(origin.note);
    const targetRow = clamp(originRow - deltaRows, 0, this.visibleKeys.length - 1);
    const shiftNote = originRow >= 0 ? (this.visibleKeys[targetRow] ?? origin.note) - origin.note : 0;
    this._preview = resolveOverlaps(movedNotes(source, drag.ids, shiftBeats, shiftNote,
      this.beats, this.step, 'off'), drag.ids);
  }

  /** @param {PointerEvent} event */
  startPointer(event) {
    if (this.readonly || event.button !== 0 || this.drag) return;
    clearTimeout(this.emptySelectionTimer);
    this.emptySelectionTimer = null;
    const regionBefore = this.selectionRegion ? { ...this.selectionRegion,
      pitches: this.selectionRegion.pitches ? [...this.selectionRegion.pitches] : undefined } : null;
    const element = this.noteElementFrom(event);
    const point = this.gridPoint(event);
    this.focus({ preventScroll: true });
    if (!element) {
      this.modifiedClick = null;
      event.preventDefault();
      if (this.hasAttribute('draw')) {
        const start = this.creationBeat(this.xToBeat(point.x), this.gestureIsFree(event));
        const selectionBefore = [...this.selection];
        const created = {
          id: this.newNoteId(), note: this.yToNote(point.y),
          start: Math.min(start, Math.max(0, this.beats - this.step)),
          duration: Math.max(this.step, MIN_DURATION),
          velocity: this.defaultVelocity, channel: this.defaultChannel,
        };
        this._preview = resolveOverlaps(normaliseNotes([...this._notes, created], this.beats), [created.id]);
        this.selection = new Set([created.id]);
        this.drag = { pointerId: event.pointerId, mode: 'len', note: created, moved: true, created: true,
          x: event.clientX, y: event.clientY, grabBeat: this.xToBeat(point.x),
          ids: [created.id], selectionBefore, regionBefore };
        this.preview(created.note);
      } else {
        this.startSelection(event, 'box', point);
        return;
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
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const edgeWidth = Math.min(bounds.width / 3,
      parseFloat(style.fontSize) * 0.4 + parseFloat(style.borderLeftWidth));
    const onStartEdge = target.classList.contains('rs') || event.clientX <= bounds.left + edgeWidth;
    const onEndEdge = target.classList.contains('re') || event.clientX >= bounds.right - edgeWidth;
    const selectionBefore = [...this.selection];
    const mode = onEndEdge ? 'len'
      : onStartEdge ? 'lenL'
        : (event.metaKey || event.ctrlKey) ? 'vel' : 'move';
    const copying = mode === 'move' && event.altKey;
    if (mode !== 'vel') this.modifiedClick = null;
    this.drag = {
      pointerId: event.pointerId, mode, note, x: event.clientX, y: event.clientY,
      currentX: event.clientX, currentY: event.clientY, free: false,
      grabBeat: this.xToBeat(point.x), ids: [...this.selection],
      sourceIds: [...this.selection], sourceNoteId: note.id,
      moved: false, copy: false, selectionBefore, regionBefore,
    };
    if (copying) this.setCopyDrag(this.drag, true);
    if (mode === 'move' && !copying) {
      this.preview(note.note);
      if (event.pointerType === 'touch') {
        this.longPress.start(() => {
          if (!this.drag || this.drag.moved) return;
          this.endPointer({ pointerId: event.pointerId, type: 'pointercancel' });
          this.dispatchEvent(new CustomEvent('note-context', {
            bubbles: true, composed: true,
            detail: { id: note.id, clientX: event.clientX, clientY: event.clientY },
          }));
        });
      }
    }
    this.setAttribute('data-drag', copying ? 'copy' : mode);
    if (mode !== 'vel') this.gridElement.setPointerCapture(event.pointerId);
    this.renderNotes();
    this.emitSelection();
  }

  /** @param {PointerEvent} event */
  movePointer(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = drag.target ?? this.gridElement;
    if (!target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId);
    const point = this.gridPoint(event);
    if (drag.mode === 'marq') {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= drag.slop) return;
      if (!drag.moved) {
        drag.moved = true;
        this.selectionRegion = null;
        this.renderSelectionRegion();
        this.marquee.style.display = 'block';
      }
      const free = this.gestureIsFree(event);
      const first = drag.startBeat;
      const last = clamp(this.snapBeat(this.xToBeat(point.x), free), 0, this.beats);
      const start = Math.min(first, last);
      const end = Math.max(first, last);
      const x = start * this.pxPerBeat;
      const currentY = clamp(point.y, 0, this.gridWrap.clientHeight);
      const y = drag.kind === 'box' ? Math.min(drag.y0, currentY) : 0;
      const width = (end - start) * this.pxPerBeat;
      const height = drag.kind === 'box' ? Math.abs(currentY - drag.y0) : this.gridWrap.clientHeight;
      Object.assign(this.marquee.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
      const rowHeight = this.rowHeight;
      const fromNote = drag.kind === 'box' ? this.yToNote(y + height) : 0;
      const toNote = drag.kind === 'box' ? this.yToNote(y) : 127;
      const box = { fromBeat: start, toBeat: end, fromNote, toNote };
      drag.region = drag.kind === 'box'
        ? { start, end, pitches: [Math.min(fromNote, toNote), Math.max(fromNote, toNote)] }
        : { start, end };
      this.selection = drag.shiftKey ? new Set(drag.base) : new Set();
      for (const note of notesInBox(this._notes, box)) {
        // a folded view has gaps between rows; only rows that are shown count
        const top = this.noteToY(note.note);
        if (top >= 0 && top + rowHeight > y && top < y + height) this.selection.add(note.id);
      }
      this.renderNotes();
      return;
    }
    this.setAttribute('data-drag', drag.mode);
    const free = this.gestureIsFree(event);
    const factor = this.gestureFactor(event);
    if (drag.mode === 'vel') {
      const dx = event.clientX - drag.x;
      const dy = drag.y - event.clientY;
      const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * factor;
      this._preview = velocityShiftedNotes(this._notes, drag.ids, delta);
      const current = this._preview.find((entry) => entry.id === drag.note.id);
      if (current) this.showTip(`vel ${current.velocity}`, event);
    } else if (drag.mode === 'len') {
      const source = drag.created ? normaliseNotes([...this._notes, drag.note], this.beats) : this._notes;
      const origin = source.find((/** @type {RollNote} */ entry) => entry.id === drag.note.id);
      if (!origin) return;
      const delta = (this.xToBeat(point.x) - drag.grabBeat) * factor;
      const duration = snapWithOffset(origin.duration + delta, origin.duration,
        this.step, free ? 'off' : 'grid');
      // every selected note takes the same change of length as the one being dragged
      this._preview = resizedNotes(source, drag.ids, duration - origin.duration,
        this.beats, this.step, 'off');
      if (drag.created) {
        this._preview = velocityShiftedNotes(this._preview, drag.ids, (drag.y - event.clientY) * factor);
      }
      const current = this._preview.find((entry) => entry.id === drag.note.id);
      if (current) this.showTip(`${lengthText(current.duration)}${drag.created ? ` · vel ${current.velocity}` : ''}`, event);
    } else if (drag.mode === 'lenL') {
      const origin = this._notes.find((/** @type {RollNote} */ entry) => entry.id === drag.note.id);
      if (!origin) return;
      const delta = (this.xToBeat(point.x) - drag.grabBeat) * factor;
      const start = snapWithOffset(origin.start + delta, origin.start,
        this.step, free ? 'off' : 'grid');
      this._preview = trimmedNotes(this._notes, drag.ids, start - origin.start,
        this.beats, this.step, 'off');
      const current = this._preview.find((entry) => entry.id === drag.note.id);
      if (current) this.showTip(lengthText(current.duration), event);
    } else {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= DRAG_SLOP) return;
      drag.moved = true;
      this.longPress.cancel();
      drag.currentX = event.clientX;
      drag.currentY = event.clientY;
      drag.free = free;
      this.setCopyDrag(drag, event.altKey);
      this.setAttribute('data-drag', drag.copy ? 'copy' : 'move');
      this.applyMoveDrag(drag, event.clientX, event.clientY, free);
    }
    if (drag.mode === 'len' || drag.mode === 'lenL') {
      this._preview = resolveOverlaps(this._preview, drag.ids);
    }
    this.renderNotes();
  }

  /** @param {PointerEvent} event */
  endPointer(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.longPress.cancel();
    this.drag = null;
    this.tip.hidden = true;
    this.marquee.style.display = 'none';
    this.clearHoverKey();
    this.removeAttribute('data-drag');
    if (event.type === 'pointercancel') {
      this._preview = null;
      this.selectionRegion = drag.regionBefore ?? this.selectionRegion;
      const selection = drag.mode === 'marq' ? drag.base : drag.selectionBefore ?? drag.ids ?? [];
      const noteIds = new Set(this._notes.map((entry) => entry.id));
      this.selection = new Set([...selection].filter((id) => noteIds.has(id)));
      this.renderNotes();
      this.renderSelectionRegion();
      this.emitSelection();
      return;
    }
    if (drag.mode === 'marq') {
      const emptyClick = !drag.moved && !drag.shiftKey && drag.kind === 'box';
      if (drag.moved) {
        const region = normalizeSelectionRegion(drag.region?.start, drag.region?.end,
          drag.region?.pitches, this.beats);
        this.selectionRegion = region ? { start: region.start, end: region.end,
          ...(region.items ? { pitches: region.items } : {}) } : null;
      } else if (drag.shiftKey && (drag.regionBefore || drag.base.size)) {
        const free = this.gestureIsFree(event);
        const point = this.gridPoint(event);
        const clickedBeat = clamp(this.snapBeat(this.xToBeat(point.x), free), 0, this.beats);
        const selected = this._notes.filter((note) => drag.base.has(note.id));
        const span = selectionSpan(selected);
        const existing = drag.regionBefore?.pitches ?? selected.map((note) => note.note);
        const pitches = drag.kind === 'box'
          ? [Math.min(...existing, this.yToNote(point.y)), Math.max(...existing, this.yToNote(point.y))]
          : undefined;
        const region = extendSelectionRegion(drag.regionBefore, clickedBeat,
          drag.regionBefore?.start ?? span?.start ?? clickedBeat, pitches, this.beats);
        this.selectionRegion = region ? { start: region.start, end: region.end,
          ...(region.items ? { pitches: region.items } : {}) } : null;
        if (this.selectionRegion) {
          const box = {
            fromBeat: this.selectionRegion.start, toBeat: this.selectionRegion.end,
            fromNote: this.selectionRegion.pitches?.[0] ?? 0,
            toNote: this.selectionRegion.pitches?.at(-1) ?? 127,
          };
          this.selection = new Set(drag.base);
          for (const note of notesInBox(this._notes, box)) this.selection.add(note.id);
        }
      } else {
        if (drag.kind === 'box') {
          const time = Number(event.timeStamp) || performance.now();
          const pending = this.pendingEmptyClick;
          if (!pending || time - pending.time > DOUBLE_CLICK_MS
            || Math.hypot(drag.x - pending.x, drag.y - pending.y) > DOUBLE_TAP_DISTANCE) {
            this.pendingEmptyClick = {
              beat: drag.createBeat, note: drag.note0, x: drag.x, y: drag.y, time,
            };
          }
        }
        this.selectionRegion = null;
        this.selection.clear();
      }
      this.renderNotes();
      this.renderSelectionRegion();
      if (emptyClick) this.scheduleEmptySelection();
      else this.emitSelection();
      return;
    }
    if (drag.copy && !drag.moved) {
      this._preview = null;
      this.selection = new Set(drag.selectionBefore ?? []);
      this.renderNotes();
      this.emitSelection();
      return;
    }
    const changed = this._preview !== null;
    if (drag.mode === 'vel' && !changed) {
      const now = event.timeStamp;
      if (this.modifiedClick?.id === drag.note.id && now - this.modifiedClick.time <= DOUBLE_CLICK_MS) {
        this.modifiedClick = null;
        this.ignoreDoubleClick = true;
        setTimeout(() => { this.ignoreDoubleClick = false; }, 0);
        this.commit(this._notes.map((note) => note.id === drag.note.id
          ? { ...note, velocity: this.defaultVelocity } : note));
      } else {
        this.modifiedClick = { id: drag.note.id, time: now };
        this.renderSelection();
      }
      return;
    }
    if (drag.mode === 'vel') this.modifiedClick = null;
    if (changed || drag.created || drag.copy) {
      const geometry = drag.mode === 'move' || drag.mode === 'len' || drag.mode === 'lenL';
      this.commit(this._preview ?? this._notes, geometry || drag.created || drag.copy ? drag.ids : null);
    }
    else this.renderSelection();
  }

  /** @param {MouseEvent} event */
  handleDoubleClick(event) {
    if (this.readonly) return;
    clearTimeout(this.emptySelectionTimer);
    this.emptySelectionTimer = null;
    if (this.ignoreDoubleClick) { this.ignoreDoubleClick = false; return; }
    const noteElement = this.noteElementFrom(event);
    if (noteElement) {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        this.commit(this._notes.map((note) => note.id === noteElement.dataset.id
          ? { ...note, velocity: this.defaultVelocity } : note));
      }
      return;
    }
    const point = this.gridPoint(event);
    const pending = this.pendingEmptyClick;
    this.pendingEmptyClick = null;
    const start = pending?.beat ?? this.creationBeat(this.xToBeat(point.x), this.gestureIsFree(event));
    const created = {
      id: this.newNoteId(), note: pending?.note ?? this.yToNote(point.y),
      start: Math.min(start, Math.max(0, this.beats - this.step)),
      duration: Math.max(this.step, MIN_DURATION),
      velocity: this.defaultVelocity, channel: this.defaultChannel,
    };
    this.selection = new Set([created.id]);
    this.commit([...this._notes, created], [created.id]);
    this.preview(created.note);
  }

  /** @param {MouseEvent} event */
  handleContextMenu(event) {
    const element = this.noteElementFrom(event);
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent('note-context', {
      bubbles: true, composed: true,
      detail: { id: element?.dataset.id, clientX: event.clientX, clientY: event.clientY },
    }));
  }

  /** Command/Ctrl says the next note-body drag sets velocity; the cursor says so too. */
  /** @param {KeyboardEvent} event */
  handleModifierKey(event) {
    this.toggleAttribute('data-velmod', event.metaKey || event.ctrlKey);
    this.toggleAttribute('data-copymod', event.altKey && !event.metaKey && !event.ctrlKey);
    const drag = this.drag;
    if (drag?.mode !== 'move') return;
    const free = this.gestureIsFree(event);
    if (!drag.moved) {
      drag.free = free;
      this.setAttribute('data-drag', event.altKey ? 'copy' : 'move');
      return;
    }
    if (drag.copy !== event.altKey) this.setCopyDrag(drag, event.altKey);
    drag.free = free;
    this.applyMoveDrag(drag, drag.currentX, drag.currentY, free);
    this.setAttribute('data-drag', drag.copy ? 'copy' : 'move');
    this.renderNotes();
  }

  // ---- Playback and loop markers --------------------------------------------------

  /** @param {PointerEvent} event @param {string} kind */
  startMarkerDrag(event, scope, kind) {
    if (this.readonly || event.button !== 0) return;
    if (scope === 'loop' && kind !== 'end' && this.hasAttribute('lock-loop-start')) return;
    event.preventDefault();
    event.stopPropagation();
    this.zoomPxPerBeat = this.pxPerBeat;   // pin the scale for the drag
    const start = scope === 'range' ? this.rangeStart : this.loopStart;
    const end = scope === 'range' ? this.rangeEnd : this.loopEnd;
    this.loopDrag = { pointerId: event.pointerId, scope, kind, x: event.clientX,
      start, end, px: this.pxPerBeat, node: event.currentTarget };
    this.renderMarkerGuide();
    /** @type {HTMLElement} */ (event.currentTarget).setAttribute('data-on', '');
    /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
  }

  /** @param {PointerEvent} event */
  moveMarkerDrag(event) {
    const drag = this.loopDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const free = this.gestureIsFree(event);
    const factor = this.gestureFactor(event);
    const step = this.step;
    const quantise = (/** @type {number} */ value) => (free ? Math.max(0, value) : Math.round(value / step) * step);
    const deltaBeats = ((event.clientX - drag.x) / drag.px) * factor;
    let start = drag.start;
    let end = drag.end;
    const minimum = free ? MIN_DURATION : step;
    if (drag.kind === 'end') end = Math.max(start + minimum, quantise(drag.end + deltaBeats));
    else if (drag.kind === 'start') start = clamp(quantise(drag.start + deltaBeats), 0, end - minimum);
    else {
      start = Math.max(0, quantise(drag.start + deltaBeats));
      end = start + (drag.end - drag.start);
    }
    if (drag.scope === 'range') this.setRange(start, end, false);
    else this.setLoop(start, end, false);
    const detail = drag.scope === 'range'
      ? { start: this.rangeStart, end: this.rangeEnd }
      : { start: this.loopStart, end: this.loopEnd };
    this.dispatchEvent(new CustomEvent(`${drag.scope === 'range' ? 'range' : 'loop'}-input`, {
      bubbles: true, composed: true, detail,
    }));
  }

  /** @param {PointerEvent} event */
  endMarkerDrag(event) {
    const drag = this.loopDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.loopDrag = null;
    this.markerGuide.removeAttribute('data-on');
    /** @type {HTMLElement} */ (drag.node).removeAttribute('data-on');
    this.zoomPxPerBeat = 0;
    this.refresh();
    const changed = drag.scope === 'range'
      ? drag.start !== this.rangeStart || drag.end !== this.rangeEnd
      : drag.start !== this.loopStart || drag.end !== this.loopEnd;
    if (changed) drag.scope === 'range' ? this.emitRange() : this.emitLoop();
  }

  // ---- Keyboard and wheel ---------------------------------------------------------

  /** @param {KeyboardEvent} event */
  handleKey(event) {
    if (event.composedPath()[0] !== this) return;
    if (event.shiftKey && event.key === 'F10') {
      const id = [...this.selection].at(-1);
      const element = id == null ? null
        : this.gridElement.querySelector(`.note[data-id="${CSS.escape(String(id))}"]`);
      if (!(element instanceof HTMLElement)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      this.dispatchEvent(new CustomEvent('note-context', {
        bubbles: true, composed: true,
        detail: { id, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
      }));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.clearSelection();
      return;
    }
    if (this.readonly) return;
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
    } else if (!meta && !event.altKey && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      this.quantize({ lengths: event.shiftKey });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!this.selection.size) return;
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      if (this.hasAttribute('fold')) this.moveSelectionThroughVisiblePitches(direction);
      else {
        const delta = direction * (event.shiftKey ? 12 : 1);
        this.commit(movedNotes(this._notes, [...this.selection], 0, delta, this.beats, this.step, 'off'),
          [...this.selection]);
      }
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!this.selection.size) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      if (event.altKey) {
        this.commit(resizedNotes(this._notes, [...this.selection], direction * this.step,
          this.beats, this.step, 'off'), [...this.selection]);
      } else {
        const delta = direction * (event.shiftKey ? this.step / 16 : this.step);
        this.commit(movedNotes(this._notes, [...this.selection], delta, 0, this.beats, this.step, 'off'),
          [...this.selection]);
      }
    }
  }

  /** Wheel scrolls pitch; Shift scrolls time; Cmd/Ctrl zooms time; Alt zooms pitch. */
  /** @param {WheelEvent} event */
  handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY;
    const width = this.gridWrap.clientWidth;
    if (event.altKey) {
      this.setAttribute('note-count', String(clamp(Math.round(this.noteCount + (delta > 0 ? 2 : -2)), MIN_ROWS, MAX_ROWS)));
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const at = (this.offset + width / 2) / this.pxPerBeat;
      const fit = width / Math.max(1, this.beats);
      this.zoomPxPerBeat = clamp(this.pxPerBeat * (delta > 0 ? 0.86 : 1.16), fit, MAX_PX_PER_BEAT);
      this.offset = clamp(at * this.pxPerBeat - width / 2, 0, Math.max(0, this.beats * this.pxPerBeat - width));
    } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(delta)) {
      this.offset = clamp(this.offset + (event.deltaX || delta), 0, Math.max(0, this.beats * this.pxPerBeat - width));
    } else {
      const lo = clamp(this.rootNote + (delta > 0 ? -1 : 1), 0, 128 - this.noteCount);
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
