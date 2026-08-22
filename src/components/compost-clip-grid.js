import { clamp, defineElement, numberAttr } from '../utils.js';

let nextGridID = 1;
const DRAG_THRESHOLD = 5;
/** An ellipsis costs about a character, a poor trade when only a few show. */
const ELLIPSIS_MIN_CHARS = 7;

/** @typedef {'stopped'|'playing'|'queued'|'recording'} ClipState */
/** @typedef {{name: string, state?: ClipState, loop?: boolean, progress?: number}} ClipSpec */

/** @param {string} fill */
const triangle = (fill) => `<svg viewBox="0 0 7 8" aria-hidden="true"><path d="M1 .5 6 4 1 7.5Z" fill="${fill}"/></svg>`;
/** @param {string} stroke */
const ring = (stroke) => `<svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" stroke="${stroke}" fill="none"/></svg>`;
/** @param {string} fill */
const dot = (fill) => `<svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" fill="${fill}"/></svg>`;
/** @param {string} stroke */
const square = (stroke) => `<svg viewBox="0 0 7 7" aria-hidden="true"><path d="M.9.9h5.2v5.2h-5.2z" fill="none" stroke="${stroke}" stroke-linejoin="round"/></svg>`;
const PREVIEW = '<svg class="preview" viewBox="0 0 25 14" aria-hidden="true"><g fill="currentColor">'
  + '<rect x="0" y="3" width="13" height="2.3"/><rect x="16" y="3" width="8" height="2.3"/>'
  + '<rect x="0" y="10" width="6" height="2.3"/></g></svg>';

/** Which slot a pointer at `y` lands in, given the rows' boxes. */
/** @param {number} y @param {DOMRect[]} rows */
export function slotIndexAt(y, rows) {
  for (let index = 0; index < rows.length; index += 1) {
    if (y >= rows[index].top && y < rows[index].bottom) return index;
  }
  return -1;
}

/**
 * One track's column of clip slots: each slot renders a clip's name and
 * state — stopped, playing with its progress washed behind the name,
 * queued for the next launch point, or recording — and an empty slot shows
 * a record ring when the track is armed. A stop slot underneath takes the
 * whole track out at the next launch point the way a clip is brought in.
 *
 * The grid only draws states and reports intent: `clip-launch`,
 * `clip-stop`, `clip-record`, `clip-select`, `clip-open`, `clip-context`,
 * `clip-rename`, `clip-delete`, `clip-duplicate`, `clip-move`, and
 * `clip-drop` when a clip is dragged into a slot (of this or another grid).
 * The host decides when a queued launch fires and sets the states back.
 */
export class CompostClipGrid extends HTMLElement {
  static get observedAttributes() {
    return ['slots', 'label', 'armed', 'selected', 'stop', 'disabled', 'show-stop'];
  }

  constructor() {
    super();

    this.gridID = `compost-clip-grid-${nextGridID++}`;
    this.slotCount = 5;
    this.label = 'Clips';
    /** @type {(ClipSpec|null)[]} */ this._clips = [];
    /** @type {{pointerId: number, index: number, x: number, y: number, moved: boolean,
     * copy: boolean, target: CompostClipGrid|null, targetIndex: number, row: HTMLElement}|null} */
    this.drag = null;
    /** @type {number|null} */ this.renaming = null;
    /** @type {{index: number, copy: boolean}|null} */ this.dropMark = null;
    this.handleWindowMove = this.handleWindowMove.bind(this);
    this.handleWindowUp = this.handleWindowUp.bind(this);
    this.fitNames = this.fitNames.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-clip-grid-text: #3c3c34;
          --compost-clip-grid-faint: #8a8a8a;
          --compost-clip-grid-signal: #c45a2c;
          --compost-clip-grid-signal-hi: #c45a2c;
          --compost-clip-grid-select: #2f6da8;
          --compost-clip-grid-over: #d98a4a;
          --compost-clip-grid-rail: rgba(17, 17, 17, 0.12);
          --compost-clip-grid-wash: rgba(196, 90, 44, 0.22);
          --compost-clip-grid-highlight: rgba(17, 17, 17, 0.07);
          --compost-clip-grid-editor-bg: #ffffff;
          --compost-clip-grid-row-height: 2.9em;
          --compost-clip-grid-font-size: 0.91em;
          --compost-clip-grid-color-scheme: light;
          color-scheme: var(--compost-clip-grid-color-scheme);
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior-y: contain;
          scrollbar-width: none;
          color: var(--compost-clip-grid-text);
          font: inherit;
          -webkit-user-select: none;
          user-select: none;
        }
        :host::-webkit-scrollbar { display: none; }
        :host([disabled]) { opacity: 0.5; pointer-events: none; }
        .row {
          position: relative;
          flex: none;
          display: flex;
          align-items: center;
          height: var(--compost-clip-grid-row-height);
          padding-right: 0.55em;
          /* isolate makes z-index:-1 mean "behind this row's text" rather than
             "behind the whole column" */
          isolation: isolate;
        }
        .row[data-highlight]::after {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--compost-clip-grid-highlight);
          pointer-events: none;
          z-index: -1;
        }
        .progress {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0;
          background: var(--compost-clip-grid-wash);
          filter: brightness(1.5);
        }
        .mark {
          position: absolute;
          left: 0;
          top: 0.36em;
          bottom: 0.36em;
          width: 2px;
          background: var(--compost-clip-grid-select);
        }
        .row[data-dragging] { opacity: 0.3; }
        .row[data-occupied] { box-shadow: inset 0 0 0 1px var(--compost-clip-grid-select); }
        .row[data-occupied="copy"] { box-shadow: inset 0 0 0 1px var(--compost-clip-grid-signal); }
        .tri {
          flex: none;
          align-self: stretch;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.55em;
          border: 0;
          padding: 0;
          background: none;
          color: inherit;
          cursor: pointer;
          font: inherit;
        }
        .tri svg { display: block; width: 0.64em; height: 0.73em; }
        .tri.record svg, .tri.rec svg { width: 0.73em; height: 0.73em; }
        .tri:focus-visible { outline: 1px solid var(--compost-clip-grid-select); outline-offset: -1px; }
        .name {
          flex: 1 1 auto;
          min-width: 0;
          padding-left: 0.45em;
          font-size: var(--compost-clip-grid-font-size);
          color: var(--compost-clip-grid-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
          touch-action: none;
        }
        .name:focus-visible { outline: none; color: var(--compost-clip-grid-select); }
        .row[data-state="playing"] .name { color: var(--compost-clip-grid-signal-hi); }
        .row[data-state="queued"] .name { color: var(--compost-clip-grid-select); }
        .row[data-state="recording"] .name { color: var(--compost-clip-grid-over); }
        .preview { flex: none; width: 2.27em; height: 1.27em; color: var(--compost-clip-grid-faint); }
        .row[data-state="playing"] .preview { color: var(--compost-clip-grid-signal-hi); }
        .preview[hidden] { display: none !important; }
        .editor {
          box-sizing: border-box;
          width: 6.9em;
          margin-left: 0.45em;
          border: 0;
          outline: 1px solid var(--compost-clip-grid-select);
          background: var(--compost-clip-grid-editor-bg);
          color: var(--compost-clip-grid-text);
          font: inherit;
          font-size: var(--compost-clip-grid-font-size);
          -webkit-user-select: text;
          user-select: text;
        }
        .stop { opacity: 0.55; transition: opacity 120ms; }
        .stop:hover, .stop[data-queued] { opacity: 1; }
        .stop[hidden] { display: none !important; }
        @media (prefers-reduced-motion: reduce) { .stop { transition: none; } }
      </style>`;

    this.addEventListener('click', (event) => this.handleClick(event));
    this.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    this.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
    this.addEventListener('pointerdown', (event) => this.beginDrag(event));
    this.addEventListener('keydown', (event) => this.handleKey(event));
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(this.fitNames) : null;
  }

  connectedCallback() {
    this.setAttribute('role', 'group');
    // a press on an idle part of this element is the column's to use
    if (!this.hasAttribute('data-strip-passthrough')) this.setAttribute('data-strip-passthrough', '');
    this.readAttributes();
    this.render();
    this.resizeObserver?.observe(this);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.endDrag(true);
  }

  /** @param {string} name */
  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    this.readAttributes();
    // the selection mark and the stop slot change in place: rebuilding the rows
    // under a pointer would break the double-click that follows a click
    if (name === 'selected') this.paintSelection();
    else if (name === 'stop') this.paintStop();
    else this.render();
  }

  readAttributes() {
    this.slotCount = clamp(Math.round(numberAttr(this, 'slots', this.slotCount)), 1, 512);
    this.label = this.getAttribute('label') || this.label;
    this.setAttribute('aria-label', `${this.label} clips`);
  }

  get clips() {
    return this._clips.map((clip) => (clip ? { ...clip } : null));
  }

  set clips(value) {
    this.setClips(value);
  }

  get selected() {
    return this.hasAttribute('selected') ? numberAttr(this, 'selected', -1) : -1;
  }

  set selected(index) {
    if (index === null || index === undefined || index < 0) this.removeAttribute('selected');
    else this.setAttribute('selected', String(index));
  }

  get armed() { return this.hasAttribute('armed'); }

  get disabled() { return this.hasAttribute('disabled'); }

  /** The stop slot's state: '' (idle), 'active' (something is playing), 'queued'. */
  get stopState() {
    const value = this.getAttribute('stop');
    return value === 'queued' || value === 'active' ? value : '';
  }

  /** Replaces every slot: one entry per slot, null for an empty one. */
  /** @param {(ClipSpec|null)[]} clips */
  setClips(clips) {
    const list = Array.isArray(clips) ? clips : [];
    this._clips = Array.from({ length: Math.max(this.slotCount, list.length) }, (_, index) => {
      const clip = list[index];
      return clip && typeof clip.name === 'string' ? { ...clip } : null;
    });
    if (this._clips.length !== this.slotCount) {
      this.slotCount = this._clips.length;
      this.setAttribute('slots', String(this.slotCount));
    }
    this.render();
  }

  /** Cheap per-frame update of one playing clip's progress, 0..1. */
  /** @param {number} index @param {number} progress */
  setProgress(index, progress) {
    const clip = this._clips[index];
    if (!clip) return;
    clip.progress = clamp(Number(progress) || 0, 0, 1);
    const bar = this.rowElements()[index]?.querySelector('.progress');
    if (bar instanceof HTMLElement) bar.style.width = `${(clip.progress * 100).toFixed(1)}%`;
  }

  /** Lights a row across the grid, as the scene launcher does when hovered. */
  /** @param {number} index @param {boolean} on */
  highlightRow(index, on) {
    const row = this.rowElements()[index];
    if (row) row.toggleAttribute('data-highlight', on);
  }

  /** Opens an inline editor on a clip's name; the result arrives as `clip-rename`. */
  /** @param {number} index */
  beginRename(index) {
    if (!this._clips[index] || this.disabled) return;
    this.renaming = index;
    this.render();
  }

  // ---- Rendering ------------------------------------------------------------

  rowElements() {
    return /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll('.row:not(.stop)')]);
  }

  render() {
    if (!this.root) return;
    const rows = [];
    const selected = this.selected;
    for (let index = 0; index < this.slotCount; index += 1) {
      const clip = this._clips[index] ?? null;
      const row = document.createElement('div');
      row.className = 'row';
      row.part.add('row');
      row.dataset.index = String(index);
      if (clip) {
        const state = clip.state ?? 'stopped';
        row.dataset.state = state;
        row.part.add(state);
        if (state === 'playing') {
          const progress = document.createElement('span');
          progress.className = 'progress';
          progress.part.add('progress');
          progress.style.width = `${(clamp(Number(clip.progress) || 0, 0, 1) * 100).toFixed(1)}%`;
          row.append(progress);
        }
        if (selected === index) {
          const mark = document.createElement('span');
          mark.className = 'mark';
          mark.part.add('mark');
          row.append(mark);
        }
        const tri = document.createElement('button');
        tri.type = 'button';
        tri.className = `tri${state === 'recording' ? ' rec' : ''}`;
        tri.dataset.action = 'launch';
        tri.setAttribute('aria-label', `${state === 'playing' || state === 'queued' ? 'Stop' : 'Launch'} ${clip.name}`);
        tri.title = state === 'recording' ? 'finish the take and launch it at the next launch point'
          : state === 'playing' || state === 'queued' ? 'stop' : 'launch at the next launch point  (enter on the name)';
        tri.innerHTML = state === 'recording' ? dot('var(--compost-clip-grid-over)')
          : triangle(state === 'playing' ? 'var(--compost-clip-grid-signal-hi)'
            : state === 'queued' ? 'var(--compost-clip-grid-select)' : 'var(--compost-clip-grid-faint)');
        row.append(tri);
        row.insertAdjacentHTML('beforeend', PREVIEW);
        if (this.renaming === index) {
          const input = document.createElement('input');
          input.className = 'editor';
          input.value = clip.name;
          input.setAttribute('aria-label', `Rename ${clip.name}`);
          let closed = false;
          const finish = (/** @type {boolean} */ commit) => {
            if (closed) return;
            closed = true;
            this.renaming = null;
            const name = input.value.trim();
            this.render();
            if (commit && name && name !== clip.name) {
              this.dispatchEvent(new CustomEvent('clip-rename', {
                bubbles: true, composed: true, detail: { index, name },
              }));
            }
          };
          input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') finish(true);
            if (event.key === 'Escape') finish(false);
          });
          input.addEventListener('blur', () => finish(true));
          input.addEventListener('pointerdown', (event) => event.stopPropagation());
          row.append(input);
          requestAnimationFrame(() => { input.focus(); input.select(); });
        } else {
          const name = document.createElement('span');
          name.className = 'name';
          name.part.add('name');
          name.dataset.action = 'clip';
          name.tabIndex = 0;
          name.setAttribute('role', 'button');
          name.setAttribute('aria-label', `${clip.name}, ${state}${clip.loop === false ? ', one shot' : ''}`);
          name.textContent = clip.name;
          row.append(name);
        }
      } else {
        const tri = document.createElement(this.armed ? 'button' : 'span');
        tri.className = `tri${this.armed ? ' record' : ''}`;
        if (this.armed) {
          /** @type {HTMLButtonElement} */ (tri).type = 'button';
          tri.dataset.action = 'record';
          tri.setAttribute('aria-label', `Record into ${this.label} slot ${index + 1}`);
          tri.title = 'record a take into this slot from the next launch point';
          tri.innerHTML = ring('var(--compost-clip-grid-rail)');
        }
        row.append(tri);
      }
      rows.push(row);
    }
    // every track that holds clips gets a stop slot
    const stop = document.createElement('div');
    stop.className = 'row stop';
    stop.part.add('row');
    stop.part.add('stop');
    stop.hidden = !this._clips.some(Boolean) && !this.hasAttribute('show-stop');
    const tri = document.createElement('button');
    tri.type = 'button';
    tri.className = 'tri';
    tri.dataset.action = 'stop';
    tri.setAttribute('aria-label', `Stop ${this.label}`);
    stop.append(tri);
    rows.push(stop);
    const style = this.root.querySelector('style');
    this.root.replaceChildren(...(style ? [style] : []), ...rows);
    this.paintStop();
    // a host re-rendering mid-drag must not lose the slot the drag is over
    if (this.dropMark) this.markDrop(this.dropMark.index, this.dropMark.copy);
    this.fitNames();
  }

  /** Moves the selection mark without rebuilding the rows. */
  paintSelection() {
    const selected = this.selected;
    this.rowElements().forEach((row, index) => {
      const mark = row.querySelector('.mark');
      if (index === selected && !mark && this._clips[index]) {
        const span = document.createElement('span');
        span.className = 'mark';
        span.part.add('mark');
        row.prepend(span);
      } else if (index !== selected && mark) {
        mark.remove();
      }
    });
  }

  /** Draws the stop slot's state without rebuilding the rows. */
  paintStop() {
    const stop = this.root.querySelector('.row.stop');
    const tri = stop?.querySelector('.tri');
    if (!(stop instanceof HTMLElement) || !(tri instanceof HTMLElement)) return;
    const stopState = this.stopState;
    stop.toggleAttribute('data-queued', stopState === 'queued');
    tri.innerHTML = square(stopState === 'queued' ? 'var(--compost-clip-grid-select)'
      : stopState === 'active' ? 'var(--compost-clip-grid-text)' : 'var(--compost-clip-grid-faint)');
    tri.title = stopState === 'queued' ? 'stop queued — click to cancel'
      : 'stop this track at the next launch point';
  }

  /** The preview mark is decoration; the clip's name is not. Give the mark up on
   * any row whose name would otherwise be cut short, and below a handful of
   * characters clip instead of ellipsising. */
  fitNames() {
    for (const row of this.rowElements()) {
      const name = row.querySelector('.name');
      const preview = row.querySelector('.preview');
      if (!(name instanceof HTMLElement)) continue;
      if (preview instanceof SVGElement) preview.removeAttribute('hidden');
      if (preview instanceof SVGElement && name.scrollWidth > name.clientWidth + 1) {
        preview.setAttribute('hidden', '');
      }
      const width = name.clientWidth;
      const per = name.scrollWidth / Math.max(1, name.textContent?.length ?? 1);
      name.style.textOverflow = per > 0 && width / per < ELLIPSIS_MIN_CHARS ? 'clip' : 'ellipsis';
    }
  }

  // ---- Events -----------------------------------------------------------------

  /** @param {Event} event @returns {{action: string, index: number}|null} */
  actionFrom(event) {
    const path = event.composedPath();
    const control = path.find((node) => node instanceof HTMLElement && node.dataset.action);
    const row = path.find((node) => node instanceof HTMLElement && node.classList.contains('row'));
    if (!(control instanceof HTMLElement) || !(row instanceof HTMLElement)) return null;
    return { action: control.dataset.action ?? '', index: Number(row.dataset.index ?? -1) };
  }

  /** @param {string} type @param {object} detail */
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  /** @param {MouseEvent} event */
  handleClick(event) {
    if (this.disabled) return;
    const hit = this.actionFrom(event);
    if (!hit) return;
    if (hit.action === 'launch') this.emit('clip-launch', { index: hit.index });
    else if (hit.action === 'record') this.emit('clip-record', { index: hit.index });
    else if (hit.action === 'stop') this.emit('clip-stop', {});
    else if (hit.action === 'clip') this.emit('clip-select', { index: hit.index });
  }

  /** @param {MouseEvent} event */
  handleDoubleClick(event) {
    if (this.disabled) return;
    const hit = this.actionFrom(event);
    if (hit?.action === 'clip') {
      event.stopPropagation();
      this.emit('clip-open', { index: hit.index, altKey: event.altKey });
    }
  }

  /** @param {MouseEvent} event */
  handleContextMenu(event) {
    if (this.disabled) return;
    const hit = this.actionFrom(event);
    if (!hit || (hit.action !== 'clip' && hit.action !== 'launch')) return;
    event.preventDefault();
    event.stopPropagation();
    this.emit('clip-context', { index: hit.index, clientX: event.clientX, clientY: event.clientY });
  }

  /** @param {KeyboardEvent} event */
  handleKey(event) {
    if (this.disabled) return;
    const hit = this.actionFrom(event);
    if (hit?.action !== 'clip') return;
    const meta = event.metaKey || event.ctrlKey;
    // the same door the double-click opens, for a keyboard: Shift-Enter, or e
    if ((event.shiftKey && event.key === 'Enter') || (!meta && !event.altKey && event.key === 'e')) {
      event.preventDefault(); this.emit('clip-open', { index: hit.index, altKey: event.altKey });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); this.emit('clip-launch', { index: hit.index });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); this.emit('clip-delete', { index: hit.index });
    } else if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault(); this.emit('clip-duplicate', { index: hit.index });
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const to = hit.index + (event.key === 'ArrowDown' ? 1 : -1);
      if (to < 0 || to >= this.slotCount) return;
      event.preventDefault(); event.stopPropagation();
      this.emit('clip-move', { index: hit.index, to });
    } else if (event.key === 'F2') {
      event.preventDefault(); this.beginRename(hit.index);
    }
  }

  /** @param {number} index */
  focusSlot(index) {
    const name = this.rowElements()[index]?.querySelector('.name');
    if (name instanceof HTMLElement) name.focus();
  }

  // ---- Dragging clips between slots and grids ----------------------------------

  /** @param {PointerEvent} event */
  beginDrag(event) {
    if (this.disabled || event.button !== 0) return;
    const hit = this.actionFrom(event);
    if (hit?.action !== 'clip') return;
    const row = this.rowElements()[hit.index];
    if (!row) return;
    this.drag = {
      pointerId: event.pointerId, index: hit.index, x: event.clientX, y: event.clientY,
      moved: false, copy: event.altKey, target: null, targetIndex: -1, row,
    };
    window.addEventListener('pointermove', this.handleWindowMove);
    window.addEventListener('pointerup', this.handleWindowUp);
    window.addEventListener('pointercancel', this.handleWindowUp);
  }

  /** @param {PointerEvent} event */
  handleWindowMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.x) < DRAG_THRESHOLD && Math.abs(event.clientY - drag.y) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.row.setAttribute('data-dragging', '');
      this.emit('clip-drag-start', { index: drag.index });
    }
    drag.copy = event.altKey;
    event.preventDefault();
    // show the exact slot it would land in, moving or copying, on any grid
    const under = document.elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element instanceof CompostClipGrid);
    const target = under instanceof CompostClipGrid ? under : null;
    const targetIndex = target ? target.slotIndexAtPoint(event.clientY) : -1;
    if (drag.target && (drag.target !== target || drag.targetIndex !== targetIndex)) {
      drag.target.markDrop(-1, false);
    }
    drag.target = target;
    drag.targetIndex = targetIndex;
    if (target && targetIndex >= 0) target.markDrop(targetIndex, drag.copy);
  }

  /** @param {PointerEvent} event */
  handleWindowUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { target, targetIndex, index, moved } = drag;
    const copy = event.altKey || drag.copy;
    this.endDrag(false);
    if (!moved || !target || targetIndex < 0) return;
    if (target === this && targetIndex === index) return;
    target.emit('clip-drop', { source: this, fromIndex: index, toIndex: targetIndex, copy });
  }

  /** @param {boolean} silent */
  endDrag(silent) {
    const drag = this.drag;
    this.drag = null;
    window.removeEventListener('pointermove', this.handleWindowMove);
    window.removeEventListener('pointerup', this.handleWindowUp);
    window.removeEventListener('pointercancel', this.handleWindowUp);
    if (!drag) return;
    drag.row.removeAttribute('data-dragging');
    drag.target?.markDrop(-1, false);
    if (drag.moved && !silent) this.emit('clip-drag-end', { index: drag.index });
  }

  /** The slot under a viewport y, or -1. */
  /** @param {number} clientY */
  slotIndexAtPoint(clientY) {
    return slotIndexAt(clientY, this.rowElements().map((row) => row.getBoundingClientRect()));
  }

  /** Marks the slot a drag would land in; -1 clears it. */
  /** @param {number} index @param {boolean} copy */
  markDrop(index, copy) {
    this.dropMark = index >= 0 ? { index, copy } : null;
    this.rowElements().forEach((row, position) => {
      if (position === index) row.setAttribute('data-occupied', copy ? 'copy' : 'move');
      else row.removeAttribute('data-occupied');
    });
  }
}

defineElement('compost-clip-grid', CompostClipGrid);
