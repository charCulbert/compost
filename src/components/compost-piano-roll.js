import { isNaturalNote, noteName } from '../midi.js';
import {
  gridStep,
  movedNotes,
  normaliseNotes,
  notesInBox,
  quantizedNotes,
  resizedNotes,
  snapBeats,
  snapDuration,
} from '../piano-roll-model.js';
import { clamp, defineElement, numberAttr } from '../utils.js';

let nextRollID = 1;

/** @typedef {import('../piano-roll-model.js').RollNote} RollNote */

export class CompostPianoRoll extends HTMLElement {
  static get observedAttributes() {
    return [
      'beats', 'beats-per-bar', 'grid', 'snap', 'root-note', 'note-count',
      'row-height', 'beat-width', 'velocity', 'channel', 'label', 'readonly', 'disabled',
    ];
  }

  constructor() {
    super();

    this.beats = 4;
    this.beatsPerBar = 4;
    this.grid = 16;
    this.snapMode = 'grid';
    this.rootNote = 48;
    this.noteCount = 25;
    this.rowHeight = 14;
    this.beatWidth = 64;
    this.defaultVelocity = 100;
    this.defaultChannel = 0;
    this.label = 'Piano roll';
    /** @type {RollNote[]} */ this._notes = [];
    /** @type {Set<string>} */ this.selection = new Set();
    this.inputID = `compost-piano-roll-${nextRollID += 1}`;
    /** @type {object|null} */ this.drag = null;
    this.activeNoteId = null;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --piano-roll-bg: #ffffff;
          --piano-roll-text: #111111;
          --piano-roll-muted: #6a6a6a;
          --piano-roll-line: rgba(17, 17, 17, 0.14);
          --piano-roll-beat-line: rgba(17, 17, 17, 0.3);
          --piano-roll-bar-line: rgba(17, 17, 17, 0.5);
          --piano-roll-row-accidental: rgba(17, 17, 17, 0.07);
          --piano-roll-key-bg: #f4f4f4;
          --piano-roll-key-accidental-bg: #d9d9d9;
          --piano-roll-key-width: 44px;
          --piano-roll-ruler-height: 18px;
          --piano-roll-note: #4a7fb5;
          --piano-roll-note-text: #ffffff;
          --piano-roll-note-selected: #d8a021;
          --piano-roll-note-radius: 2px;
          --piano-roll-marquee: rgba(74, 127, 181, 0.22);
          --piano-roll-focus: #4a7fb5;
          --piano-roll-playhead: #d83a2f;
          --piano-roll-color-scheme: light;

          display: block;
          color-scheme: var(--piano-roll-color-scheme);
          color: var(--piano-roll-text);
          background: var(--piano-roll-bg);
          font: 11px system-ui, sans-serif;
          contain: paint;
        }
        :host([disabled]) { opacity: 0.55; pointer-events: none; }

        .frame {
          display: grid;
          grid-template-columns: var(--piano-roll-key-width) minmax(0, 1fr);
          grid-template-rows: var(--piano-roll-ruler-height) minmax(0, 1fr);
          height: 100%;
          min-height: 0;
        }
        .corner {
          grid-column: 1; grid-row: 1;
          border-right: 1px solid var(--piano-roll-line);
          border-bottom: 1px solid var(--piano-roll-line);
          background: var(--piano-roll-key-bg);
        }
        .ruler {
          grid-column: 2; grid-row: 1;
          position: relative;
          border-bottom: 1px solid var(--piano-roll-line);
          overflow: hidden;
        }
        .ruler span {
          position: absolute;
          top: 0;
          padding-left: 3px;
          color: var(--piano-roll-muted);
          font-size: 9px;
          line-height: var(--piano-roll-ruler-height);
          user-select: none;
        }
        .keys {
          grid-column: 1; grid-row: 2;
          position: relative;
          border-right: 1px solid var(--piano-roll-line);
          background: var(--piano-roll-key-bg);
          overflow: hidden;
        }
        .key {
          position: absolute;
          left: 0; right: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          box-sizing: border-box;
          padding-right: 4px;
          border-bottom: 1px solid var(--piano-roll-line);
          color: var(--piano-roll-muted);
          font-size: 9px;
          white-space: nowrap;
          user-select: none;
          cursor: pointer;
        }
        .key[data-accidental] { background: var(--piano-roll-key-accidental-bg); }

        .scroll {
          grid-column: 2; grid-row: 2;
          position: relative;
          overflow: auto;
          touch-action: none;
          background: var(--piano-roll-past-end, rgba(17, 17, 17, 0.06));
        }
        .canvas { background: var(--piano-roll-bg); }
        .canvas {
          position: relative;
          transform-origin: 0 0;
        }
        .rows, .lines { position: absolute; inset: 0; pointer-events: none; }
        .row {
          position: absolute;
          left: 0; right: 0;
          border-bottom: 1px solid var(--piano-roll-line);
        }
        .row[data-accidental] { background: var(--piano-roll-row-accidental); }
        .line {
          position: absolute;
          top: 0; bottom: 0;
          width: 1px;
          background: var(--piano-roll-line);
        }
        .line[data-beat] { background: var(--piano-roll-beat-line); }
        .line[data-bar] { background: var(--piano-roll-bar-line); }

        .note {
          position: absolute;
          box-sizing: border-box;
          padding: 0 3px;
          border: 0;
          border-radius: var(--piano-roll-note-radius);
          background: var(--piano-roll-note);
          color: var(--piano-roll-note-text);
          font: inherit;
          font-size: 9px;
          line-height: 1;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          cursor: grab;
        }
        .note[data-selected] {
          background: var(--piano-roll-note-selected);
          outline: 1px solid var(--piano-roll-text);
          outline-offset: -1px;
        }
        .note:focus-visible {
          outline: 2px solid var(--piano-roll-focus);
          outline-offset: 1px;
        }
        .note-edge {
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 5px;
          cursor: ew-resize;
        }
        .marquee {
          position: absolute;
          background: var(--piano-roll-marquee);
          outline: 1px solid var(--piano-roll-focus);
          pointer-events: none;
        }
        .playhead {
          position: absolute;
          top: 0; bottom: 0;
          width: 1px;
          background: var(--piano-roll-playhead);
          pointer-events: none;
        }
        :host(:not([playhead])) .playhead { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .note { transition: none; }
        }
      </style>
      <div class="frame" part="frame">
        <div class="corner" part="corner"></div>
        <div class="ruler" part="ruler"></div>
        <div class="keys" part="keys"></div>
        <div class="scroll" part="scroll">
          <div class="canvas" part="canvas">
            <div class="rows"></div>
            <div class="lines"></div>
            <div class="playhead" part="playhead"></div>
          </div>
        </div>
      </div>`;

    this.frame = this.root.querySelector('.frame');
    this.ruler = this.root.querySelector('.ruler');
    this.keys = this.root.querySelector('.keys');
    this.scroll = this.root.querySelector('.scroll');
    this.canvas = this.root.querySelector('.canvas');
    this.rowLayer = this.root.querySelector('.rows');
    this.lineLayer = this.root.querySelector('.lines');
    this.playheadElement = this.root.querySelector('.playhead');

    this.handlePointerMove = (event) => this.movePointer(event);
    this.handlePointerUp = (event) => this.endPointer(event);
    this.scroll.addEventListener('pointerdown', (event) => this.startPointer(event));
    this.scroll.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    this.scroll.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
    this.scroll.addEventListener('scroll', () => this.syncScroll());
    this.keys.addEventListener('pointerdown', (event) => this.previewFromKey(event));
    this.addEventListener('keydown', (event) => this.handleKey(event));
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.setAttribute('role', 'group');
    this.syncAttributes();
    this.refresh();
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.syncAttributes();
    this.refresh();
  }

  syncAttributes() {
    this.beats = Math.max(0.25, numberAttr(this, 'beats', this.beats));
    this.beatsPerBar = Math.max(1, Math.round(numberAttr(this, 'beats-per-bar', this.beatsPerBar)));
    this.grid = Math.max(1, numberAttr(this, 'grid', this.grid));
    this.snapMode = this.getAttribute('snap') === 'off' ? 'off' : 'grid';
    this.rootNote = clamp(Math.round(numberAttr(this, 'root-note', this.rootNote)), 0, 127);
    this.noteCount = clamp(Math.round(numberAttr(this, 'note-count', this.noteCount)), 1, 128);
    this.rowHeight = Math.max(6, numberAttr(this, 'row-height', this.rowHeight));
    this.beatWidth = Math.max(8, numberAttr(this, 'beat-width', this.beatWidth));
    this.defaultVelocity = clamp(Math.round(numberAttr(this, 'velocity', this.defaultVelocity)), 1, 127);
    this.defaultChannel = clamp(Math.round(numberAttr(this, 'channel', this.defaultChannel)), 0, 15);
    this.label = this.getAttribute('label') ?? this.label;
    this.setAttribute('aria-label', this.label);
  }

  // ---- Public API ---------------------------------------------------------

  get notes() {
    return this._notes.map((note) => ({ ...note }));
  }

  set notes(value) {
    this.setNotes(value, false);
  }

  /** Replaces the note list. Silent by default so a host can push state back. */
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

  /** Snaps the selection, or everything when nothing is selected. */
  quantize({ lengths = false, division = this.grid } = {}) {
    if (this.readonly) return;
    const ids = this.selection.size > 0 ? [...this.selection] : null;
    const next = quantizedNotes(this._notes, gridStep(division, this.beatsPerBar),
      { ids, lengths, beats: this.beats });
    this.commit(next);
  }

  selectAll() {
    this.selection = new Set(this._notes.map((note) => note.id));
    this.refresh();
  }

  clearSelection() {
    this.selection.clear();
    this.refresh();
  }

  deleteSelection() {
    if (this.readonly || this.selection.size === 0) return;
    const next = this._notes.filter((note) => !this.selection.has(note.id));
    this.selection.clear();
    this.commit(next);
  }

  // ---- Geometry -----------------------------------------------------------

  get lowNote() { return this.rootNote; }

  get highNote() { return Math.min(127, this.rootNote + this.noteCount - 1); }

  beatToX(beat) { return beat * this.beatWidth; }

  xToBeat(x) { return x / this.beatWidth; }

  noteToY(note) { return (this.highNote - note) * this.rowHeight; }

  yToNote(y) { return this.highNote - Math.floor(y / this.rowHeight); }

  /** Pointer position in beats and note number, relative to the scrolled canvas. */
  pointerPosition(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      beat: this.xToBeat(event.clientX - bounds.left),
      note: this.yToNote(event.clientY - bounds.top),
    };
  }

  // ---- Rendering ----------------------------------------------------------

  refresh() {
    if (!this.canvas) return;
    const width = this.beatToX(this.beats);
    const height = this.noteCount * this.rowHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.renderRows();
    this.renderLines();
    this.renderRuler();
    this.renderKeys();
    this.renderNotes();
    this.syncScroll();
  }

  renderRows() {
    const markup = [];
    for (let note = this.highNote; note >= this.lowNote; note -= 1) {
      const accidental = isNaturalNote(note) ? '' : ' data-accidental';
      markup.push(`<div class="row"${accidental} style="top:${this.noteToY(note)}px;height:${this.rowHeight}px"></div>`);
    }
    this.rowLayer.innerHTML = markup.join('');
  }

  renderLines() {
    const step = this.step;
    const markup = [];
    if (step > 0) {
      for (let beat = 0; beat <= this.beats + 1e-9; beat += step) {
        const isBeat = Math.abs(beat - Math.round(beat)) < 1e-9;
        const isBar = isBeat && Math.abs(beat % this.beatsPerBar) < 1e-9;
        const flag = isBar ? ' data-bar' : isBeat ? ' data-beat' : '';
        markup.push(`<div class="line"${flag} style="left:${this.beatToX(beat)}px"></div>`);
      }
    }
    this.lineLayer.innerHTML = markup.join('');
  }

  renderRuler() {
    const markup = [];
    for (let beat = 0; beat < this.beats; beat += this.beatsPerBar) {
      markup.push(`<span style="left:${this.beatToX(beat)}px">${Math.floor(beat / this.beatsPerBar) + 1}</span>`);
    }
    this.ruler.innerHTML = markup.join('');
  }

  renderKeys() {
    const markup = [];
    for (let note = this.highNote; note >= this.lowNote; note -= 1) {
      const accidental = isNaturalNote(note) ? '' : ' data-accidental';
      const name = isNaturalNote(note) && note % 12 === 0 ? noteName(note) : '';
      markup.push(`<div class="key"${accidental} data-note="${note}" style="top:${this.noteToY(note)}px;height:${this.rowHeight}px">${name}</div>`);
    }
    this.keys.innerHTML = markup.join('');
  }

  renderNotes() {
    for (const element of [...this.canvas.querySelectorAll('.note')]) element.remove();
    const fragment = document.createDocumentFragment();
    for (const note of this._notes) {
      if (note.note < this.lowNote || note.note > this.highNote) continue;
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'note';
      element.part = 'note';
      element.dataset.id = note.id;
      if (this.selection.has(note.id)) element.dataset.selected = '';
      element.style.left = `${this.beatToX(note.start)}px`;
      element.style.width = `${Math.max(3, this.beatToX(note.duration))}px`;
      element.style.top = `${this.noteToY(note.note)}px`;
      element.style.height = `${this.rowHeight - 1}px`;
      element.textContent = this.rowHeight >= 12 ? noteName(note.note) : '';
      element.setAttribute('aria-label',
        `${noteName(note.note)}, beat ${(note.start + 1).toFixed(2)}, length ${note.duration.toFixed(2)}`);
      const edge = document.createElement('span');
      edge.className = 'note-edge';
      element.append(edge);
      fragment.append(element);
    }
    this.canvas.append(fragment);
  }

  /** Keys and ruler are separate panes, so they follow the grid by transform. */
  syncScroll() {
    if (!this.scroll) return;
    for (const key of this.keys.children) {
      key.style.transform = `translateY(${-this.scroll.scrollTop}px)`;
    }
    for (const mark of this.ruler.children) {
      mark.style.transform = `translateX(${-this.scroll.scrollLeft}px)`;
    }
  }

  // ---- Editing ------------------------------------------------------------

  commit(notes) {
    this._notes = normaliseNotes(notes, this.beats);
    this.refresh();
    this.emitChange();
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent('notes-change', {
      bubbles: true,
      detail: { notes: this.notes },
    }));
  }

  preview(note) {
    this.dispatchEvent(new CustomEvent('note-preview', {
      bubbles: true,
      detail: { note, velocity: this.defaultVelocity, channel: this.defaultChannel },
    }));
  }

  previewFromKey(event) {
    const note = Number(event.target?.dataset?.note);
    if (Number.isInteger(note)) this.preview(note);
  }

  noteElementFrom(event) {
    const path = event.composedPath();
    return path.find((node) => node instanceof HTMLElement && node.classList.contains('note')) ?? null;
  }

  startPointer(event) {
    if (this.readonly || event.button !== 0) return;
    const element = this.noteElementFrom(event);
    const position = this.pointerPosition(event);

    if (!element) {
      // Empty grid: shift starts a marquee, a plain drag draws a new note.
      event.preventDefault();
      this.focus();
      if (event.shiftKey) {
        this.drag = { kind: 'marquee', from: position, element: this.makeMarquee() };
      } else {
        if (!event.metaKey && !event.ctrlKey) this.selection.clear();
        const start = snapBeats(position.beat, this.step, this.snapMode);
        const created = {
          id: crypto.randomUUID(),
          note: clamp(position.note, 0, 127),
          start: Math.min(start, Math.max(0, this.beats - this.step)),
          duration: Math.max(this.step, 1 / 64),
          velocity: this.defaultVelocity,
          channel: this.defaultChannel,
        };
        this._notes = normaliseNotes([...this._notes, created], this.beats);
        this.selection = new Set([created.id]);
        this.drag = { kind: 'draw', id: created.id, from: position, origin: { ...created } };
        this.preview(created.note);
        this.refresh();
      }
    } else {
      event.preventDefault();
      const id = element.dataset.id;
      const note = this._notes.find((entry) => entry.id === id);
      if (!note) return;
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        if (this.selection.has(id)) this.selection.delete(id);
        else this.selection.add(id);
      } else if (!this.selection.has(id)) {
        this.selection = new Set([id]);
      }
      const resizing = event.composedPath().some(
        (node) => node instanceof HTMLElement && node.classList.contains('note-edge'),
      );
      this.drag = {
        kind: resizing ? 'resize' : 'move',
        from: position,
        origin: this._notes.map((entry) => ({ ...entry })),
        ids: [...this.selection],
        moved: false,
      };
      if (!resizing) this.preview(note.note);
      this.refresh();
    }

    this.scroll.setPointerCapture(event.pointerId);
    this.drag.pointerId = event.pointerId;
    this.scroll.addEventListener('pointermove', this.handlePointerMove);
    this.scroll.addEventListener('pointerup', this.handlePointerUp);
    this.scroll.addEventListener('pointercancel', this.handlePointerUp);
  }

  makeMarquee() {
    const element = document.createElement('div');
    element.className = 'marquee';
    this.canvas.append(element);
    return element;
  }

  movePointer(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const position = this.pointerPosition(event);
    const deltaBeats = position.beat - this.drag.from.beat;
    const deltaNote = position.note - this.drag.from.note;

    if (this.drag.kind === 'marquee') {
      const box = {
        fromBeat: this.drag.from.beat, toBeat: position.beat,
        fromNote: this.drag.from.note, toNote: position.note,
      };
      const left = this.beatToX(Math.min(box.fromBeat, box.toBeat));
      const right = this.beatToX(Math.max(box.fromBeat, box.toBeat));
      const top = this.noteToY(Math.max(box.fromNote, box.toNote));
      const bottom = this.noteToY(Math.min(box.fromNote, box.toNote)) + this.rowHeight;
      Object.assign(this.drag.element.style, {
        left: `${left}px`, top: `${top}px`,
        width: `${Math.max(1, right - left)}px`, height: `${Math.max(1, bottom - top)}px`,
      });
      this.selection = new Set(notesInBox(this._notes, box).map((note) => note.id));
      this.renderNotes();
      return;
    }

    if (this.drag.kind === 'draw') {
      const note = this._notes.find((entry) => entry.id === this.drag.id);
      if (!note) return;
      const duration = snapDuration(position.beat - note.start, this.step, this.snapMode);
      this._notes = resizedNotes(this._notes, [note.id], duration - note.duration,
        this.beats, this.step, this.snapMode);
      this.renderNotes();
      return;
    }

    this.drag.moved = true;
    this._notes = this.drag.kind === 'resize'
      ? resizedNotes(this.drag.origin, this.drag.ids, deltaBeats, this.beats, this.step, this.snapMode)
      : movedNotes(this.drag.origin, this.drag.ids, deltaBeats, deltaNote,
        this.beats, this.step, this.snapMode);
    this.renderNotes();
  }

  endPointer(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const wasMarquee = this.drag.kind === 'marquee';
    this.drag.element?.remove();
    const changed = !wasMarquee;
    this.drag = null;
    this.scroll.removeEventListener('pointermove', this.handlePointerMove);
    this.scroll.removeEventListener('pointerup', this.handlePointerUp);
    this.scroll.removeEventListener('pointercancel', this.handlePointerUp);
    if (changed) this.commit(this._notes);
    else this.refresh();
  }

  handleDoubleClick(event) {
    if (this.readonly) return;
    const element = this.noteElementFrom(event);
    if (!element) return;
    event.preventDefault();
    // A double-click on a note removes it; drawing already happens on drag.
    const id = element.dataset.id;
    this.selection.delete(id);
    this.commit(this._notes.filter((note) => note.id !== id));
  }

  handleContextMenu(event) {
    if (this.readonly) return;
    const element = this.noteElementFrom(event);
    if (!element) return;
    event.preventDefault();
    const id = element.dataset.id;
    this.selection.delete(id);
    this.commit(this._notes.filter((note) => note.id !== id));
  }

  handleKey(event) {
    if (this.readonly) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selection.size === 0) return;
      event.preventDefault();
      this.deleteSelection();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      this.quantize({ lengths: event.shiftKey });
      return;
    }
    if (this.selection.size === 0) return;

    const step = event.altKey ? this.step / 2 : this.step;
    const moves = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, 1], ArrowDown: [0, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.commit(movedNotes(this._notes, [...this.selection], move[0], move[1],
      this.beats, this.step, 'off'));
  }
}

defineElement('compost-piano-roll', CompostPianoRoll);
