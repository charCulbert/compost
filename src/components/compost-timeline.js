import { clamp, defineElement, numberAttr } from '../utils.js';
import { rulerLabels } from '../time-ruler.js';

const MIN_CLIP_LENGTH = 1e-6;
const MIN_PX_PER_BEAT = 4;
const MAX_PX_PER_BEAT = 480;
const DEFAULT_PX_PER_BEAT = 24;
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_LOOP_END = 8;
const DRAG_THRESHOLD = 3;

/** @typedef {{id: string, name: string, start: number, length: number,
 * offset?: number, duration: number, loop?: boolean, state?: string,
 * notes?: {start: number, duration: number, note: number}[], color?: string}} TimelineClip */
/** @typedef {{id: string, name: string, color?: string, overridden?: boolean,
 * armed?: boolean, recording?: boolean, clips: TimelineClip[]}} TimelineLane */

/** @param {number} value @param {number} min @param {number} max */
const finiteClamp = (value, min, max) => clamp(Number.isFinite(value) ? value : min, min, max);

/** A timeline grid step, expressed in beats. */
/** @param {number} beatsPerBar @param {number} grid */
function gridStep(beatsPerBar, grid) {
  return Math.max(MIN_CLIP_LENGTH, Math.max(1, Number(beatsPerBar) || DEFAULT_BEATS_PER_BAR)
    / Math.max(1, Number(grid) || 4));
}

/** Snap a beat to the timeline grid, or leave it free when snapping is off. */
/** @param {number} beat @param {number} beatsPerBar @param {number} grid @param {string} snap */
export function snapBeat(beat, beatsPerBar, grid, snap) {
  const value = Math.max(0, Number(beat) || 0);
  if (snap === 'off') return value;
  const step = gridStep(beatsPerBar, grid);
  return Math.max(0, Math.round(value / step) * step);
}

/** Convert a clip's beat geometry into pixels relative to the visible left edge. */
/** @param {{start: number, length: number}} clip @param {number} pxPerBeat @param {number} scrollBeat */
export function clipBox(clip, pxPerBeat, scrollBeat) {
  const px = Number.isFinite(Number(pxPerBeat)) ? Number(pxPerBeat) : DEFAULT_PX_PER_BEAT;
  const scroll = Number.isFinite(Number(scrollBeat)) ? Number(scrollBeat) : 0;
  const start = Number(clip?.start) || 0;
  const length = Math.max(0, Number(clip?.length) || 0);
  return { left: (start - scroll) * px, width: Math.max(1, length * px) };
}

/** Return the content-wrap positions of a looping clip, in beats from its start. */
/** @param {{length: number, duration: number, offset?: number, loop?: boolean}} clip */
export function loopPassLines(clip) {
  if (clip?.loop === false) return [];
  const length = Math.max(0, Number(clip?.length) || 0);
  const duration = Number(clip?.duration) || 0;
  if (!(length > 0) || !(duration > 0)) return [];
  const offset = ((Number(clip?.offset) || 0) % duration + duration) % duration;
  const lines = [];
  let line = duration - offset;
  if (line <= MIN_CLIP_LENGTH) line = duration;
  for (; line < length - MIN_CLIP_LENGTH; line += duration) lines.push(line);
  return lines;
}

/** How many bars fit comfortably between ruler labels at this zoom. */
/** @param {number} pxPerBeat @param {number} beatsPerBar */
export function rulerStep(pxPerBeat, beatsPerBar) {
  const px = Math.max(0, Number(pxPerBeat) || 0);
  const bar = Math.max(1, Number(beatsPerBar) || DEFAULT_BEATS_PER_BAR);
  let bars = 1;
  while (bars < 8 && px * bar * bars < 80) bars *= 2;
  return bars;
}

/** @param {Event} event @param {string} className */
function pathElement(event, className) {
  return event.composedPath().find((node) => node instanceof HTMLElement
    && node.classList.contains(className));
}

/** @param {string} type @param {object} detail */
function eventOf(type, detail) {
  return new CustomEvent(type, { bubbles: true, composed: true, detail });
}

export class CompostTimeline extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'beats-per-bar', 'grid', 'snap', 'follow', 'loop-enabled', 'disabled', 'lane-height'];
  }

  constructor() {
    super();

    this.label = 'Timeline';
    this.beatsPerBar = DEFAULT_BEATS_PER_BAR;
    this.grid = 4;
    this.snapMode = 'grid';
    this.follow = false;
    this.laneHeight = 42;
    this._pxPerBeat = DEFAULT_PX_PER_BEAT;
    this._scrollBeat = 0;
    this._playhead = 0;
    this._loopStart = 0;
    this._loopEnd = DEFAULT_LOOP_END;
    this._loopEnabled = false;
    /** @type {TimelineLane[]} */ this._lanes = [];
    /** @type {string[]} */ this._selected = [];
    /** @type {string|null} */ this.focusedClip = null;
    /** @type {string|null} */ this.focusedLane = null;
    /** @type {string|null} */ this.renaming = null;
    /** @type {any} */ this.drag = null;
    /** @type {Map<number, {x: number, y: number}>} */ this.pointers = new Map();
    /** @type {any} */ this.pinch = null;
    this.viewChangeTimer = null;
    this.longPressTimer = null;
    this.resizeObserver = null;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-timeline-bg: var(--compost-theme-bg, #1f1f1f);
          --compost-timeline-text: var(--compost-theme-text, #f2f2f2);
          --compost-timeline-muted: var(--compost-theme-muted, #aaaaaa);
          --compost-timeline-faint: color-mix(in srgb, var(--compost-timeline-muted) 64%, transparent);
          --compost-timeline-line: var(--compost-theme-line, rgba(255,255,255,.18));
          --compost-timeline-bar-line: var(--compost-timeline-muted);
          --compost-timeline-lane: color-mix(in srgb, var(--compost-timeline-bg) 92%, var(--compost-timeline-text));
          --compost-timeline-lane-alt: color-mix(in srgb, var(--compost-timeline-bg) 88%, var(--compost-timeline-text));
          --compost-timeline-header-bg: var(--compost-timeline-bg);
          --compost-timeline-clip-wash-alpha: .24;
          --compost-timeline-clip-text: var(--compost-timeline-text);
          --compost-timeline-select: var(--compost-theme-learn, #6fa8eb);
          --compost-timeline-marquee: color-mix(in srgb, var(--compost-timeline-select) 15%, transparent);
          --compost-timeline-playhead: var(--compost-timeline-text);
          --compost-timeline-loop: var(--compost-theme-accent, #8ea9c7);
          --compost-timeline-loop-off: color-mix(in srgb, var(--compost-timeline-muted) 60%, transparent);
          --compost-timeline-lane-height: 42px;
          --compost-timeline-row-height: var(--compost-timeline-lane-height);
          --compost-timeline-font: inherit;
          --compost-timeline-numeral-font: ui-monospace, SFMono-Regular, Menlo, monospace;
          --compost-timeline-color-scheme: var(--compost-theme-color-scheme, dark);
          color-scheme: var(--compost-timeline-color-scheme);
          display: block;
          box-sizing: border-box;
          min-height: 0;
          overflow: hidden;
          background: var(--compost-timeline-bg);
          color: var(--compost-timeline-text);
          font: var(--compost-timeline-font);
          -webkit-user-select: none;
          user-select: none;
          outline: none;
        }
        :host(:focus-visible) { box-shadow: inset 0 0 0 1px var(--compost-timeline-select); }
        :host([disabled]) { opacity: .55; pointer-events: none; }
        .frame { display: grid; grid-template-columns: 10.5em minmax(0, 1fr); grid-template-rows: 2.45em minmax(0, 1fr); height: 100%; min-height: 0; }
        .corner, .header-wrap { background: var(--compost-timeline-header-bg); border-right: 1px solid var(--compost-timeline-line); }
        .corner { border-bottom: 1px solid var(--compost-timeline-line); }
        .ruler-wrap { position: relative; overflow: hidden; border-bottom: 1px solid var(--compost-timeline-line); }
        .ruler, .ruler-world { position: absolute; inset: 0 auto 0 0; }
        .ruler-world { height: 100%; }
        .ruler-label { position: absolute; top: .28em; border-left: 1px solid var(--compost-timeline-line); padding-left: 3px; color: var(--compost-timeline-muted); font: .72em/1 var(--compost-timeline-numeral-font); white-space: nowrap; }
        .ruler-label[data-bar] { border-left-color: var(--compost-timeline-bar-line); }
        .ruler-band { position: absolute; top: 1.48em; height: .72em; background: color-mix(in srgb, var(--compost-timeline-loop) 24%, transparent); box-shadow: inset 0 0 0 1px var(--compost-timeline-loop); cursor: grab; }
        .ruler-band[data-off] { background: color-mix(in srgb, var(--compost-timeline-loop-off) 14%, transparent); box-shadow: inset 0 0 0 1px var(--compost-timeline-loop-off); opacity: .7; }
        .ruler-handle { position: absolute; top: 1.32em; height: 1em; width: .72em; z-index: 2; cursor: col-resize; touch-action: none; }
        .ruler-handle::before { content: ""; position: absolute; inset-block: 0; width: 2px; background: var(--compost-timeline-loop); }
        .ruler-handle.start::before { left: 0; }
        .ruler-handle.end::before { right: 0; }
        .ruler-playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-timeline-playhead); pointer-events: none; z-index: 4; }
        .ruler-playhead::before { content: ""; position: absolute; top: .08em; left: -4px; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid var(--compost-timeline-playhead); }
        .header-wrap, .lanes-wrap { min-height: 0; overflow: hidden; }
        .header-wrap { overflow: hidden; }
        .headers { position: relative; }
        .lane-header { box-sizing: border-box; height: var(--compost-timeline-row-height); display: flex; align-items: center; gap: .45em; padding: 0 .6em; border-bottom: 1px solid var(--compost-timeline-line); color: var(--lane-color, var(--compost-timeline-text)); font-size: .84em; }
        .lane-header:nth-child(even) { background: var(--compost-timeline-lane-alt); }
        .lane-header .number { flex: none; font: .78em var(--compost-timeline-numeral-font); opacity: .8; }
        .lane-header .lane-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .back-pip { flex: none; width: .58em; height: .58em; border: 0; border-radius: 50%; padding: 0; background: var(--compost-timeline-loop); cursor: pointer; }
        .back-pip:focus-visible { outline: 1px solid var(--compost-timeline-select); outline-offset: 2px; }
        .lanes-wrap { position: relative; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
        .lanes-world { position: relative; min-height: 100%; }
        .grid-world { position: absolute; inset: 0 auto auto 0; z-index: 1; pointer-events: none; }
        .grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-timeline-line); opacity: .35; }
        .grid-line.beat { opacity: .52; }
        .grid-line.bar { background: var(--compost-timeline-bar-line); opacity: .75; }
        .lane { position: relative; box-sizing: border-box; height: var(--compost-timeline-row-height); border-bottom: 1px solid var(--compost-timeline-line); background: var(--compost-timeline-lane); }
        .lane:nth-child(even) { background: var(--compost-timeline-lane-alt); }
        .lane[data-overridden] { filter: brightness(1.18); }
        .lane[data-overridden] .clip { opacity: .4; }
        .clip { position: absolute; top: 4px; bottom: 4px; z-index: 2; box-sizing: border-box; min-width: 1px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--clip-color, var(--compost-timeline-text)) 78%, var(--compost-timeline-text)); background: color-mix(in srgb, var(--clip-color, var(--compost-timeline-text)) calc(var(--compost-timeline-clip-wash-alpha) * 100%), transparent); color: var(--clip-color, var(--compost-timeline-clip-text)); cursor: grab; touch-action: none; }
        .clip:hover, .clip[data-state="playing"] { filter: brightness(1.24); }
        .clip[data-state="recording"] { border-right-style: dashed; }
        .clip[data-state="open"] { outline: 1px solid var(--compost-timeline-select); outline-offset: 1px; }
        .clip[data-selected] { outline: 1px solid var(--compost-timeline-select); outline-offset: 1px; z-index: 3; }
        .clip[data-dragging] { opacity: .35 !important; }
        .clip-name { position: relative; z-index: 2; display: block; padding: 3px 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .78em; color: var(--clip-color, var(--compost-timeline-clip-text)); }
        .clip-notes { position: absolute; inset: 0; opacity: .38; pointer-events: none; }
        .clip-note { position: absolute; bottom: 4px; height: 2px; min-width: 2px; background: currentColor; }
        .clip-loop-line { position: absolute; top: 0; bottom: 0; width: 1px; background: currentColor; opacity: .35; pointer-events: none; }
        .clip-editor { position: relative; z-index: 4; width: calc(100% - 5px); margin: 2px; border: 0; outline: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-bg); color: var(--compost-timeline-text); font: inherit; font-size: .78em; }
        .marquee { position: absolute; z-index: 7; border: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-marquee); pointer-events: none; display: none; }
        .announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        @media (prefers-reduced-motion: reduce) { .clip { transition: none; } }
      </style>
      <div class="frame">
        <div class="corner"></div>
        <div class="ruler-wrap" role="button" tabindex="0" aria-label="Timeline ruler">
          <div class="ruler"><div class="ruler-world"></div><div class="ruler-band"></div><div class="ruler-handle start"></div><div class="ruler-handle end"></div><div class="ruler-playhead"></div></div>
        </div>
        <div class="header-wrap"><div class="headers" role="list"></div></div>
        <div class="lanes-wrap"><div class="lanes-world" role="list"></div><div class="marquee"></div><div class="playhead"></div></div>
      </div>
      <div class="announce" aria-live="polite"></div>`;

    /** @param {string} selector @returns {HTMLElement} */
    const part = (selector) => /** @type {HTMLElement} */ (this.root.querySelector(selector));
    this.frame = part('.frame');
    this.rulerWrap = part('.ruler-wrap');
    this.ruler = part('.ruler');
    this.rulerWorld = part('.ruler-world');
    this.rulerBand = part('.ruler-band');
    this.rulerStart = part('.ruler-handle.start');
    this.rulerEnd = part('.ruler-handle.end');
    this.rulerPlayhead = part('.ruler-playhead');
    this.headerWrap = part('.header-wrap');
    this.headers = part('.headers');
    this.lanesWrap = part('.lanes-wrap');
    this.lanesWorld = part('.lanes-world');
    this.marquee = part('.marquee');
    this.playheadElement = part('.playhead');
    this.announce = part('.announce');

    this.addEventListener('pointerdown', (event) => this.startPointer(event));
    this.addEventListener('pointermove', (event) => this.movePointer(event));
    this.addEventListener('pointerup', (event) => this.endPointer(event));
    this.addEventListener('pointercancel', (event) => this.endPointer(event));
    this.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    this.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
    this.addEventListener('keydown', (event) => this.handleKey(event));
    this.lanesWrap.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.rulerWrap.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.lanesWrap.addEventListener('scroll', () => { this.headers.scrollTop = this.lanesWrap.scrollTop; });
    for (const [node, kind] of [[this.rulerStart, 'start'], [this.rulerEnd, 'end'], [this.rulerBand, 'move']]) {
      node.addEventListener('pointerdown', (event) => this.startLoopDrag(event, kind));
      node.addEventListener('pointermove', (event) => this.moveLoopDrag(event));
      node.addEventListener('pointerup', (event) => this.endLoopDrag(event));
      node.addEventListener('pointercancel', (event) => this.endLoopDrag(event));
    }
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.render()) : null;
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.setAttribute('role', 'list');
    this.syncAttributes();
    this.render();
    this.resizeObserver?.observe(this);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    clearTimeout(this.longPressTimer);
    this.endPointer({ pointerId: this.drag?.pointerId });
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.syncAttributes();
    this.render();
  }

  syncAttributes() {
    this.label = this.getAttribute('label') || this.label;
    this.beatsPerBar = Math.max(1, Math.round(numberAttr(this, 'beats-per-bar', this.beatsPerBar)));
    this.grid = Math.max(1, numberAttr(this, 'grid', this.grid));
    this.snapMode = this.getAttribute('snap') === 'off' ? 'off' : 'grid';
    this.follow = this.hasAttribute('follow');
    const cssLaneHeight = Number.parseFloat(getComputedStyle(this).getPropertyValue('--compost-timeline-lane-height'));
    this.laneHeight = Math.max(24, this.hasAttribute('lane-height')
      ? numberAttr(this, 'lane-height', this.laneHeight)
      : (Number.isFinite(cssLaneHeight) ? cssLaneHeight : this.laneHeight));
    this._loopEnabled = this.hasAttribute('loop-enabled');
    this.setAttribute('aria-label', this.label);
    this.style.setProperty('--compost-timeline-row-height', `${this.laneHeight}px`);
  }

  get lanes() { return this._lanes.map((lane) => ({ ...lane, clips: lane.clips.map((clip) => ({ ...clip })) })); }

  /** Replace all lanes and clips; this never emits a model intent. */
  /** @param {TimelineLane[]} lanes */
  setLanes(lanes) {
    this._lanes = Array.isArray(lanes) ? lanes.map((lane) => ({
      ...lane,
      clips: Array.isArray(lane.clips) ? lane.clips.map((clip) => ({ ...clip, notes: clip.notes?.map((note) => ({ ...note })) })) : [],
    })) : [];
    const ids = new Set(this._lanes.flatMap((lane) => lane.clips.map((clip) => clip.id)));
    this._selected = this._selected.filter((id) => ids.has(id));
    if (this.focusedClip && !ids.has(this.focusedClip)) this.focusedClip = null;
    this.render();
  }

  /** Replace one lane's clips without changing the lane order. */
  /** @param {string} laneId @param {TimelineClip[]} clips */
  setLaneClips(laneId, clips) {
    const lane = this._lanes.find((entry) => entry.id === laneId);
    if (!lane) return;
    lane.clips = Array.isArray(clips) ? clips.map((clip) => ({ ...clip })) : [];
    this.render();
  }

  get playhead() { return this._playhead; }

  /** Move only the playhead; clip geometry is not rebuilt. */
  /** @param {number} beat */
  setPlayhead(beat) {
    this._playhead = Math.max(0, Number(beat) || 0);
    this.paintPlayhead();
    if (this.follow) this.keepPlayheadVisible();
  }

  get loopStart() { return this._loopStart; }
  get loopEnd() { return this._loopEnd; }

  /** @param {number} start @param {number} end @param {boolean} enabled @param {boolean} [emit] */
  setLoop(start, end, enabled, emit = false) {
    this._loopStart = Math.max(0, Number(start) || 0);
    this._loopEnd = Math.max(this._loopStart + MIN_CLIP_LENGTH, Number(end) || this._loopStart + 1);
    this._loopEnabled = Boolean(enabled);
    this.toggleAttribute('loop-enabled', this._loopEnabled);
    this.paintLoop();
    if (emit) this.dispatchEvent(eventOf('loop-change', {
      start: this._loopStart, end: this._loopEnd, enabled: this._loopEnabled,
    }));
  }

  get pxPerBeat() { return this._pxPerBeat; }
  set pxPerBeat(value) {
    const next = finiteClamp(Number(value), MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
    if (next === this._pxPerBeat) return;
    this._pxPerBeat = next;
    this.render();
    this.scheduleViewChange();
  }

  get scrollBeat() { return this._scrollBeat; }
  set scrollBeat(value) {
    const next = Math.max(0, Number(value) || 0);
    if (next === this._scrollBeat) return;
    this._scrollBeat = next;
    this.paintScroll();
    this.scheduleViewChange();
  }

  get selected() { return [...this._selected]; }
  set selected(value) {
    const ids = Array.isArray(value) ? value.map(String) : [];
    this._selected = [...new Set(ids)];
    this.paintSelection();
    this.announce.textContent = this._selected.length ? `${this._selected.length} clip${this._selected.length === 1 ? '' : 's'} selected` : '';
  }

  scrollTo(beat) {
    const width = this.lanesWrap?.clientWidth || 0;
    this.scrollBeat = Math.max(0, Number(beat) || 0);
    if (width) this.paintScroll();
  }

  zoomToFit(endBeat) {
    const width = Math.max(1, this.lanesWrap.clientWidth || this.clientWidth || 1);
    const end = Math.max(MIN_CLIP_LENGTH, Number(endBeat) || 1);
    this._pxPerBeat = finiteClamp(width / end, MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
    this._scrollBeat = 0;
    this.render();
    this.scheduleViewChange();
  }

  /** Convert a viewport x coordinate into an unsnapped timeline beat. */
  /** @param {number} clientX */
  beatAtPoint(clientX) {
    const rect = this.rulerWrap.getBoundingClientRect();
    return Math.max(0, this._scrollBeat + (Number(clientX) - rect.left) / this._pxPerBeat);
  }

  /** Return the lane id under a viewport y coordinate. */
  /** @param {number} clientY */
  laneAtPoint(clientY) {
    const rect = this.lanesWrap.getBoundingClientRect();
    const y = Number(clientY) - rect.top + this.lanesWrap.scrollTop;
    const index = Math.floor(y / this.laneHeight);
    return this._lanes[index]?.id ?? null;
  }

  beginRename(clipId) {
    if (this.hasAttribute('disabled') || !this.findClip(clipId)) return;
    this.renaming = String(clipId);
    this.render();
  }

  focusClip(clipId) {
    const id = String(clipId);
    this.focusedClip = id;
    this.focusedLane = null;
    const element = this.clipElements().find((node) => node.dataset.id === id);
    if (element) {
      element.focus({ preventScroll: true });
      this.ensureClipVisible(id);
    }
  }

  // ---- Rendering --------------------------------------------------------------

  /** @returns {{lane: TimelineLane, clip: TimelineClip}|null} */
  findClip(id) {
    for (const lane of this._lanes) {
      const clip = lane.clips.find((entry) => entry.id === id);
      if (clip) return { lane, clip };
    }
    return null;
  }

  clipElements() {
    return /** @type {HTMLElement[]} */ ([...this.lanesWorld.querySelectorAll('.clip')]);
  }

  pointForClip(id) {
    const element = this.clipElements().find((node) => node.dataset.id === id);
    if (!element) return { clientX: 0, clientY: 0 };
    const rect = element.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  pointForLaneHeader(id) {
    const element = this.headers.querySelector(`.lane-header[data-lane-id="${CSS.escape(id)}"]`);
    if (!element) return { clientX: 0, clientY: 0 };
    const rect = element.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  worldEnd() {
    const last = this._lanes.flatMap((lane) => lane.clips)
      .reduce((end, clip) => Math.max(end, (Number(clip.start) || 0) + (Number(clip.length) || 0)), 0);
    const visible = this._scrollBeat + Math.max(16, (this.lanesWrap.clientWidth || 320) / this._pxPerBeat);
    return Math.max(16, last, this._loopEnd, visible);
  }

  render() {
    if (!this.root) return;
    this.rulerWorld.replaceChildren();
    this.headers.replaceChildren();
    this.lanesWorld.replaceChildren();
    const end = this.worldEnd();
    const width = end * this._pxPerBeat;
    this.rulerWorld.style.width = `${width}px`;
    this.lanesWorld.style.width = `${width}px`;
    this.lanesWorld.style.minHeight = `${Math.max(1, this._lanes.length) * this.laneHeight}px`;
    this.rulerWorld.append(this.rulerGrid(end));
    this.renderRulerLabels(end);
    this.renderLanes();
    this.paintScroll();
    this.paintPlayhead();
    this.paintLoop();
  }

  /** @param {number} end */
  rulerGrid(end) {
    const fragment = document.createDocumentFragment();
    const stepBars = rulerStep(this._pxPerBeat, this.beatsPerBar);
    const step = this.beatsPerBar / Math.max(1, this.grid);
    for (let beat = 0; beat <= end + MIN_CLIP_LENGTH; beat += step) {
      const line = document.createElement('div');
      const inBar = Math.abs(beat % this.beatsPerBar) < MIN_CLIP_LENGTH;
      line.className = `grid-line${inBar ? ' bar' : ' beat'}`;
      line.style.left = `${beat * this._pxPerBeat}px`;
      fragment.append(line);
    }
    // The ruler labels are separate from the grid so zooming does not alter the lane paint.
    this.rulerWorld.dataset.stepBars = String(stepBars);
    return fragment;
  }

  /** @param {number} end */
  renderRulerLabels(end) {
    const stepBars = rulerStep(this._pxPerBeat, this.beatsPerBar);
    const fragment = document.createDocumentFragment();
    const labelStep = this.beatsPerBar * stepBars;
    for (const { beat, text } of rulerLabels(end + labelStep, this.beatsPerBar, this._pxPerBeat)) {
      if (Math.abs(beat % labelStep) > MIN_CLIP_LENGTH) continue;
      const label = document.createElement('div');
      label.className = 'ruler-label';
      label.dataset.bar = '';
      label.style.left = `${beat * this._pxPerBeat}px`;
      label.textContent = text;
      fragment.append(label);
    }
    this.rulerWorld.append(fragment);
  }

  renderLanes() {
    const headerFragment = document.createDocumentFragment();
    const laneFragment = document.createDocumentFragment();
    this._lanes.forEach((lane, laneIndex) => {
      const header = document.createElement('div');
      header.className = 'lane-header';
      header.dataset.laneId = lane.id;
      header.part.add('lane-header');
      header.setAttribute('role', 'listitem');
      header.tabIndex = -1;
      header.style.setProperty('--lane-color', lane.color || 'var(--compost-timeline-text)');
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = String(laneIndex + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'lane-name';
      name.textContent = lane.name || lane.id;
      header.append(number, name);
      if (lane.overridden) {
        const back = document.createElement('button');
        back.className = 'back-pip';
        back.type = 'button';
        back.dataset.laneId = lane.id;
        back.title = 'back to timeline';
        back.setAttribute('aria-label', `Back to timeline for ${lane.name || lane.id}`);
        header.append(back);
      }
      headerFragment.append(header);

      const row = document.createElement('div');
      row.className = 'lane';
      row.dataset.laneId = lane.id;
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', lane.name || lane.id);
      if (lane.overridden) row.dataset.overridden = '';
      row.style.setProperty('--lane-color', lane.color || 'var(--compost-timeline-text)');
      for (const clip of lane.clips) row.append(this.renderClip(clip, lane));
      laneFragment.append(row);
    });
    this.headers.append(headerFragment);
    this.lanesWorld.append(laneFragment);
    const grid = document.createElement('div');
    grid.className = 'grid-world';
    grid.style.width = `${this.worldEnd() * this._pxPerBeat}px`;
    grid.style.height = `${Math.max(1, this._lanes.length) * this.laneHeight}px`;
    grid.append(this.rulerGrid(this.worldEnd()));
    this.lanesWorld.append(grid);
    this.paintSelection();
  }

  /** @param {TimelineClip} clip @param {TimelineLane} lane */
  renderClip(clip, lane) {
    const element = document.createElement('div');
    element.className = 'clip';
    element.part.add('clip');
    element.dataset.id = clip.id;
    element.dataset.state = clip.state || 'stopped';
    element.tabIndex = this.focusedClip === clip.id ? 0 : -1;
    element.setAttribute('role', 'button');
    element.style.setProperty('--clip-color', clip.color || lane.color || 'var(--compost-timeline-clip-text)');
    const start = Number(clip.start) || 0;
    const end = start + Math.max(0, Number(clip.length) || 0);
    element.setAttribute('aria-label', `${clip.name || 'clip'}, bar ${Math.floor(start / this.beatsPerBar) + 1} to ${Math.max(Math.floor((end - MIN_CLIP_LENGTH) / this.beatsPerBar) + 1, 1)}, lane ${lane.name || lane.id}`);
    const box = clipBox(clip, this._pxPerBeat, this._scrollBeat);
    element.style.left = `${box.left}px`;
    element.style.width = `${box.width}px`;
    const notes = document.createElement('span');
    notes.className = 'clip-notes';
    const duration = Math.max(MIN_CLIP_LENGTH, Number(clip.duration) || Number(clip.length) || 1);
    const length = Math.max(MIN_CLIP_LENGTH, Number(clip.length) || duration);
    const offset = ((Number(clip.offset) || 0) % duration + duration) % duration;
    for (const note of (clip.notes || []).slice(0, 200)) {
      const noteStart = Number(note.start) || 0;
      const noteDuration = Number(note.duration) || .1;
      const starts = [];
      if (clip.loop === false) starts.push(noteStart - offset);
      else {
        let start = noteStart - offset;
        while (start < 0) start += duration;
        for (; start < length; start += duration) starts.push(start);
      }
      for (const start of starts) {
        if (start < 0 || start >= length) continue;
        const mark = document.createElement('span');
        mark.className = 'clip-note';
        mark.style.left = `${Math.max(0, Math.min(100, start / length * 100))}%`;
        mark.style.width = `${Math.max(2, Math.min(30, noteDuration / length * 100))}%`;
        mark.style.bottom = `${Math.max(2, Math.min(90, ((Number(note.note) || 0) / 127) * 90))}%`;
        notes.append(mark);
      }
    }
    element.append(notes);
    for (const line of loopPassLines(clip)) {
      const mark = document.createElement('span');
      mark.className = 'clip-loop-line';
      mark.style.left = `${(line / Math.max(MIN_CLIP_LENGTH, Number(clip.length) || 1)) * 100}%`;
      element.append(mark);
    }
    if (this.renaming === clip.id) {
      const input = document.createElement('input');
      input.className = 'clip-editor';
      input.value = clip.name || '';
      input.setAttribute('aria-label', `Rename ${clip.name || 'clip'}`);
      let closed = false;
      const finish = (commit) => {
        if (closed) return;
        closed = true;
        this.renaming = null;
        const name = input.value.trim();
        this.render();
        if (commit && name && name !== clip.name) this.dispatchEvent(eventOf('clip-rename', { id: clip.id, name }));
      };
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('pointerdown', (event) => event.stopPropagation());
      element.append(input);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    } else {
      const name = document.createElement('span');
      name.className = 'clip-name';
      name.textContent = clip.name || 'clip';
      element.append(name);
    }
    return element;
  }

  paintSelection() {
    for (const element of this.clipElements()) {
      if (this._selected.includes(element.dataset.id)) element.dataset.selected = '';
      else delete element.dataset.selected;
    }
  }

  paintScroll() {
    const offset = `${(-this._scrollBeat * this._pxPerBeat).toFixed(2)}px`;
    this.rulerWorld.style.transform = `translateX(${offset})`;
    this.lanesWorld.style.transform = `translateX(${offset})`;
    this.paintPlayhead();
    this.paintLoop();
  }

  paintPlayhead() {
    if (!this.playheadElement || !this.rulerPlayhead) return;
    const left = (this._playhead - this._scrollBeat) * this._pxPerBeat;
    this.playheadElement.style.left = `${left.toFixed(2)}px`;
    this.rulerPlayhead.style.left = `${left.toFixed(2)}px`;
    this.rulerWrap.setAttribute('aria-label', `Timeline ruler, playhead at beat ${this._playhead.toFixed(2)}`);
  }

  paintLoop() {
    const left = (this._loopStart - this._scrollBeat) * this._pxPerBeat;
    const width = Math.max(1, (this._loopEnd - this._loopStart) * this._pxPerBeat);
    this.rulerBand.style.left = `${left}px`;
    this.rulerBand.style.width = `${width}px`;
    this.rulerBand.toggleAttribute('data-off', !this._loopEnabled);
    this.rulerStart.style.left = `${left - 1}px`;
    this.rulerEnd.style.left = `${left + width - 5}px`;
    this.rulerStart.title = `Loop start, beat ${this._loopStart}`;
    this.rulerEnd.title = `Loop end, beat ${this._loopEnd}`;
  }

  keepPlayheadVisible() {
    const width = this.lanesWrap.clientWidth || 0;
    if (!width) return;
    const visible = width / this._pxPerBeat;
    if (this._playhead < this._scrollBeat + .5) this.scrollBeat = Math.max(0, this._playhead - 1);
    else if (this._playhead > this._scrollBeat + visible - .5) this.scrollBeat = Math.max(0, this._playhead - visible + 1);
  }

  ensureClipVisible(id) {
    const found = this.findClip(id);
    if (!found) return;
    const start = Number(found.clip.start) || 0;
    const end = start + (Number(found.clip.length) || 0);
    const visible = (this.lanesWrap.clientWidth || 0) / this._pxPerBeat;
    if (start < this._scrollBeat) this.scrollBeat = start;
    else if (end > this._scrollBeat + visible) this.scrollBeat = Math.max(0, end - visible);
  }

  scheduleViewChange() {
    clearTimeout(this.viewChangeTimer);
    this.viewChangeTimer = setTimeout(() => {
      this.dispatchEvent(eventOf('view-change', { pxPerBeat: this._pxPerBeat, scrollBeat: this._scrollBeat }));
    }, 150);
  }

  emitSelection() {
    this.paintSelection();
    this.announce.textContent = this._selected.length ? `${this._selected.length} clip${this._selected.length === 1 ? '' : 's'} selected` : 'No clips selected';
    this.dispatchEvent(eventOf('clip-select', { ids: this.selected }));
  }

  selectOne(id, additive = false) {
    if (additive) {
      this._selected = this._selected.includes(id) ? this._selected.filter((entry) => entry !== id) : [...this._selected, id];
    } else this._selected = [id];
    this.focusedClip = id;
    this.focusedLane = null;
    this.emitSelection();
  }

  // ---- Pointer gestures -------------------------------------------------------

  clipFromEvent(event) {
    const element = pathElement(event, 'clip');
    return element ? this.findClip(element.dataset.id) && { element, ...this.findClip(element.dataset.id) } : null;
  }

  updatePointerCursor(event) {
    if (event.pointerType === 'touch') return;
    const found = this.clipFromEvent(event);
    if (!found) return;
    const rect = found.element.getBoundingClientRect();
    const edge = event.pointerType === 'touch' ? 12 : 6;
    found.element.style.cursor = event.clientX - rect.left <= edge || rect.right - event.clientX <= edge
      ? 'ew-resize' : 'grab';
  }

  startPinch() {
    const points = [...this.pointers.values()];
    if (points.length < 2) return;
    const [first, second] = points;
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    this.pinch = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      centerX,
      centerY,
      pxPerBeat: this._pxPerBeat,
      beat: this.beatAtPoint(centerX),
    };
  }

  movePinch() {
    if (!this.pinch || this.pointers.size < 2) return;
    const points = [...this.pointers.values()];
    const [first, second] = points;
    const centerX = (first.x + second.x) / 2;
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const nextPxPerBeat = finiteClamp(this.pinch.pxPerBeat * distance / this.pinch.distance, MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
    const rect = this.rulerWrap.getBoundingClientRect();
    this._pxPerBeat = nextPxPerBeat;
    this._scrollBeat = Math.max(0, this.pinch.beat - (centerX - rect.left) / nextPxPerBeat);
    this.render();
    this.scheduleViewChange();
  }

  startPointer(event) {
    if (this.hasAttribute('disabled') || event.button !== 0) return;
    if (event.pointerType === 'touch') {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2) {
        clearTimeout(this.longPressTimer);
        for (const element of this.clipElements()) element.style.transform = '';
        this.drag = null;
        this.startPinch();
        event.preventDefault();
        return;
      }
    }
    if (this.drag) return;
    const pip = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('back-pip'));
    if (pip instanceof HTMLElement) {
      event.preventDefault();
      this.dispatchEvent(eventOf('lane-back', { laneId: pip.dataset.laneId }));
      return;
    }
    const loopPart = event.composedPath().find((node) => node instanceof HTMLElement
      && (node.classList.contains('ruler-band') || node.classList.contains('ruler-handle')));
    if (loopPart instanceof HTMLElement) return;
    const header = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane-header'));
    if (header instanceof HTMLElement) {
      header.focus({ preventScroll: true });
      this.focusedLane = header.dataset.laneId || null;
      this.focusedClip = null;
      return;
    }
    const found = this.clipFromEvent(event);
    if (found) {
      event.preventDefault();
      const rect = found.element.getBoundingClientRect();
      const edge = event.pointerType === 'touch' ? 12 : 6;
      const mode = event.clientX - rect.left <= edge ? 'trim-left'
        : rect.right - event.clientX <= edge ? 'trim-right' : 'move';
      found.element.style.cursor = mode === 'move' ? 'grab' : 'ew-resize';
      if (!event.shiftKey && !this._selected.includes(found.clip.id)) this.selectOne(found.clip.id);
      else if (event.shiftKey) this.selectOne(found.clip.id, true);
      const ids = this._selected.length ? [...this._selected] : [found.clip.id];
      this.focusedClip = found.clip.id;
      this.drag = {
        pointerId: event.pointerId, type: mode, clipId: found.clip.id, laneId: found.lane.id,
        startX: event.clientX, startY: event.clientY, origin: { ...found.clip }, ids,
        copy: Boolean(event.altKey), moved: false, element: found.element,
        selected: ids.map((id) => this.findClip(id)).filter(Boolean),
      };
      found.element.setPointerCapture?.(event.pointerId);
      this.longPressTimer = setTimeout(() => {
        if (!this.drag || this.drag.moved || this.drag.type !== 'move') return;
        this.dispatchEvent(eventOf('clip-context', { id: found.clip.id, clientX: event.clientX, clientY: event.clientY }));
        this.endPointer({ pointerId: event.pointerId });
      }, 550);
      return;
    }
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('ruler-wrap'))) {
      this.drag = { pointerId: event.pointerId, type: 'seek-ruler', startX: event.clientX, startY: event.clientY, moved: false };
      return;
    }
    const lane = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane'));
    if (lane instanceof HTMLElement) {
      this.drag = { pointerId: event.pointerId, type: 'marquee', laneId: lane.dataset.laneId, startX: event.clientX, startY: event.clientY, moved: false, base: event.shiftKey ? new Set(this._selected) : new Set() };
      return;
    }
  }

  movePointer(event) {
    if (event.pointerType === 'touch' && this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pinch) {
        this.movePinch();
        return;
      }
    }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) {
      if (!drag) this.updatePointerCursor(event);
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;
    if (drag.type === 'seek-ruler') return;
    if (drag.type === 'marquee') {
      if (!drag.moved) return;
      const rect = this.lanesWrap.getBoundingClientRect();
      const left = Math.min(drag.startX, event.clientX) - rect.left + this._scrollBeat * this._pxPerBeat;
      const top = Math.min(drag.startY, event.clientY) - rect.top + this.lanesWrap.scrollTop;
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      Object.assign(this.marquee.style, { display: 'block', left: `${left - this._scrollBeat * this._pxPerBeat}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      return;
    }
    if (drag.type === 'trim-left' || drag.type === 'trim-right') {
      const origin = drag.origin;
      const rawBeat = this._scrollBeat + (event.clientX - this.rulerWrap.getBoundingClientRect().left) / this._pxPerBeat;
      const edgeBeat = snapBeat(rawBeat, this.beatsPerBar, this.grid, event.altKey ? 'off' : this.snapMode);
      const start = drag.type === 'trim-left' ? Math.min(edgeBeat, origin.start + origin.length - MIN_CLIP_LENGTH) : origin.start;
      const end = drag.type === 'trim-right' ? Math.max(edgeBeat, origin.start + MIN_CLIP_LENGTH) : origin.start + origin.length;
      drag.preview = { start, end };
      drag.element.style.left = `${(start - this._scrollBeat) * this._pxPerBeat}px`;
      drag.element.style.width = `${Math.max(1, (end - start) * this._pxPerBeat)}px`;
      this.dispatchEvent(eventOf('clip-trim-input', { id: drag.clipId, start, end }));
      return;
    }
    if (drag.type === 'move') {
      if (!drag.moved) return;
      const raw = dx / this._pxPerBeat;
      const delta = event.altKey || drag.copy || this.snapMode === 'off'
        ? raw : Math.round(raw / gridStep(this.beatsPerBar, this.grid)) * gridStep(this.beatsPerBar, this.grid);
      drag.previewDelta = delta;
      for (const item of drag.selected) {
        const element = this.clipElements().find((node) => node.dataset.id === item.clip.id);
        if (!element) continue;
        element.dataset.dragging = '';
        element.style.transform = `translate(${delta * this._pxPerBeat}px, ${this.laneOffsetForPoint(event.clientY, item.lane.id) * this.laneHeight}px)`;
      }
    }
  }

  /** @param {number} clientY @param {string} originalLaneId */
  laneOffsetForPoint(clientY, originalLaneId) {
    const target = this.laneAtPoint(clientY);
    if (!target || target === originalLaneId) return 0;
    const from = this._lanes.findIndex((lane) => lane.id === originalLaneId);
    const to = this._lanes.findIndex((lane) => lane.id === target);
    return to >= 0 && from >= 0 ? to - from : 0;
  }

  endPointer(event) {
    if (event.pointerType === 'touch' || this.pointers.has(event.pointerId)) {
      this.pointers.delete(event.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        return;
      }
    }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    clearTimeout(this.longPressTimer);
    this.drag = null;
    if (drag.type === 'marquee') {
      this.marquee.style.display = 'none';
      if (drag.moved) {
        const left = Math.min(drag.startX, event.clientX);
        const right = Math.max(drag.startX, event.clientX);
        const top = Math.min(drag.startY, event.clientY);
        const bottom = Math.max(drag.startY, event.clientY);
        const selected = [...drag.base];
        for (const lane of this._lanes) {
          const laneRect = this.lanesWorld.querySelector(`.lane[data-lane-id="${CSS.escape(lane.id)}"]`)?.getBoundingClientRect();
          if (!laneRect || laneRect.bottom < top || laneRect.top > bottom) continue;
          for (const clip of lane.clips) {
            const rect = { left: (clip.start - this._scrollBeat) * this._pxPerBeat + this.lanesWrap.getBoundingClientRect().left, right: (clip.start + clip.length - this._scrollBeat) * this._pxPerBeat + this.lanesWrap.getBoundingClientRect().left, top: laneRect.top, bottom: laneRect.bottom };
            if (rect.right >= left && rect.left <= right) selected.push(clip.id);
          }
        }
        this._selected = [...new Set(selected)];
        this.emitSelection();
      } else {
        const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, event.altKey ? 'off' : this.snapMode);
        this.dispatchEvent(eventOf('seek', { beat, source: 'lane' }));
      }
      return;
    }
    if (drag.type === 'seek-ruler') {
      const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, event.altKey ? 'off' : this.snapMode);
      this.dispatchEvent(eventOf('seek', { beat, source: 'ruler' }));
      return;
    }
    for (const element of this.clipElements()) element.style.transform = '';
    if (drag.element) drag.element.style.cursor = 'grab';
    if (drag.type === 'trim-left' || drag.type === 'trim-right') {
      if (drag.preview) this.dispatchEvent(eventOf('clip-trim', { id: drag.clipId, ...drag.preview }));
      else this.render();
      return;
    }
    if (drag.type === 'move' && drag.moved) {
      const targetLane = this.laneAtPoint(event.clientY) || drag.laneId;
      const deltaBeats = drag.previewDelta ?? 0;
      this.dispatchEvent(eventOf('clip-move', { ids: drag.ids, laneId: targetLane, deltaBeats, copy: Boolean(event.altKey || drag.copy) }));
      return;
    }
    if (drag.type === 'move') this.paintSelection();
  }

  startLoopDrag(event, kind) {
    if (this.hasAttribute('disabled') || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.drag = { pointerId: event.pointerId, type: 'loop', kind, startX: event.clientX, start: this._loopStart, end: this._loopEnd, px: this._pxPerBeat, node: event.currentTarget };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  moveLoopDrag(event) {
    const drag = this.drag;
    if (!drag || drag.type !== 'loop' || event.pointerId !== drag.pointerId) return;
    const delta = (event.clientX - drag.startX) / drag.px;
    const free = event.altKey || this.snapMode === 'off';
    const snapValue = (value) => free ? Math.max(0, value) : snapBeat(value, this.beatsPerBar, this.grid, 'grid');
    let start = drag.start;
    let end = drag.end;
    if (drag.kind === 'start') start = Math.min(snapValue(drag.start + delta), end - MIN_CLIP_LENGTH);
    else if (drag.kind === 'end') end = Math.max(snapValue(drag.end + delta), start + MIN_CLIP_LENGTH);
    else { start = snapValue(drag.start + delta); end = start + (drag.end - drag.start); }
    this.setLoop(start, end, this._loopEnabled);
    this.dispatchEvent(eventOf('loop-input', { start, end, enabled: this._loopEnabled }));
  }

  endLoopDrag(event) {
    const drag = this.drag;
    if (!drag || drag.type !== 'loop' || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    this.dispatchEvent(eventOf('loop-change', { start: this._loopStart, end: this._loopEnd, enabled: this._loopEnabled }));
  }

  // ---- Click, keyboard, wheel -------------------------------------------------

  handleDoubleClick(event) {
    if (this.hasAttribute('disabled')) return;
    const found = this.clipFromEvent(event);
    if (found) {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-open', { id: found.clip.id, altKey: event.altKey, clientX: event.clientX, clientY: event.clientY }));
      return;
    }
    const lane = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane'));
    if (lane instanceof HTMLElement) {
      this.dispatchEvent(eventOf('lane-create', { laneId: lane.dataset.laneId, beat: snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, event.altKey ? 'off' : this.snapMode) }));
    } else if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('ruler-band'))) {
      this.setLoop(this._loopStart, this._loopEnd, !this._loopEnabled);
      this.dispatchEvent(eventOf('loop-toggle', { enabled: this._loopEnabled }));
    }
  }

  handleContextMenu(event) {
    if (this.hasAttribute('disabled')) return;
    const found = this.clipFromEvent(event);
    if (found) {
      event.preventDefault();
      this.selectOne(found.clip.id);
      this.dispatchEvent(eventOf('clip-context', { id: found.clip.id, clientX: event.clientX, clientY: event.clientY }));
      return;
    }
    const header = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane-header'));
    if (header instanceof HTMLElement) {
      event.preventDefault();
      this.dispatchEvent(eventOf('lane-header-context', { laneId: header.dataset.laneId, clientX: event.clientX, clientY: event.clientY }));
      return;
    }
    const lane = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane'));
    if (lane instanceof HTMLElement) {
      event.preventDefault();
      this.dispatchEvent(eventOf('lane-context', { laneId: lane.dataset.laneId, beat: this.beatAtPoint(event.clientX), clientX: event.clientX, clientY: event.clientY }));
    }
  }

  handleKey(event) {
    if (this.hasAttribute('disabled')) return;
    const source = event.composedPath()[0];
    if (source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement) return;
    const current = this.focusedClip || this._selected[0];
    const found = current ? this.findClip(current) : null;
    const meta = event.metaKey || event.ctrlKey;
    if (event.shiftKey && event.key === 'F10') {
      if (found) {
        event.preventDefault();
        this.dispatchEvent(eventOf('clip-context', { id: found.clip.id, ...this.pointForClip(found.clip.id) }));
      }
      else if (this.focusedLane) {
        event.preventDefault();
        this.dispatchEvent(eventOf('lane-header-context', { laneId: this.focusedLane, ...this.pointForLaneHeader(this.focusedLane) }));
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this._selected = [];
      this.focusedClip = null;
      this.focusedLane = null;
      this.emitSelection();
      return;
    }
    if (!found) {
      if (event.key === '[' || event.key === ']') { event.preventDefault(); this.zoomBy(event.key === ']' ? 1.16 : .86); }
      return;
    }
    const adjacent = this.adjacentClip(found, event.key);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      if (!adjacent) return;
      event.preventDefault();
      if (event.shiftKey) this.selectOne(adjacent.id, true);
      else this.selectOne(adjacent.id);
      this.focusClip(adjacent.id);
      return;
    }
    if (event.key === 'Enter' || (!meta && !event.altKey && event.key.toLowerCase() === 'e')) {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-open', { id: found.clip.id, altKey: event.altKey, ...this.pointForClip(found.clip.id) }));
    } else if (event.key === 'F2') {
      event.preventDefault();
      this.beginRename(found.clip.id);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-delete', { ids: this.selected.length ? this.selected : [found.clip.id] }));
    } else if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-duplicate', { ids: this.selected.length ? this.selected : [found.clip.id] }));
    } else if (meta && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-split', { ids: this.selected.length ? this.selected : [found.clip.id], beat: this._playhead }));
    } else if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const step = gridStep(this.beatsPerBar, this.grid) * (event.key === 'ArrowRight' ? 1 : -1);
      this.dispatchEvent(eventOf('clip-nudge', { ids: this.selected.length ? this.selected : [found.clip.id], deltaBeats: step }));
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      this.zoomBy(event.key === ']' ? 1.16 : .86);
    }
  }

  /** @param {{lane: TimelineLane, clip: TimelineClip}} found @param {string} key */
  adjacentClip(found, key) {
    const laneIndex = this._lanes.indexOf(found.lane);
    const clips = found.lane.clips;
    const index = clips.indexOf(found.clip);
    if (key === 'Home') return clips[0];
    if (key === 'End') return clips[clips.length - 1];
    if (key === 'ArrowLeft') return clips[index - 1] || clips[index];
    if (key === 'ArrowRight') return clips[index + 1] || clips[index];
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const other = this._lanes[laneIndex + (key === 'ArrowUp' ? -1 : 1)];
      if (!other?.clips.length) return null;
      const center = (Number(found.clip.start) || 0) + (Number(found.clip.length) || 0) / 2;
      return other.clips.reduce((best, clip) => Math.abs((clip.start + clip.length / 2) - center) < Math.abs((best.start + best.length / 2) - center) ? clip : best);
    }
    return null;
  }

  zoomBy(multiplier) {
    const at = this._playhead;
    const old = this._pxPerBeat;
    this._pxPerBeat = finiteClamp(old * multiplier, MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
    this._scrollBeat = Math.max(0, at - ((at - this._scrollBeat) * old) / this._pxPerBeat);
    this.render();
    this.scheduleViewChange();
  }

  handleWheel(event) {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      const old = this._pxPerBeat;
      const rect = this.rulerWrap.getBoundingClientRect();
      const at = this._scrollBeat + (event.clientX - rect.left) / old;
      this._pxPerBeat = finiteClamp(old * (event.deltaY > 0 ? .86 : 1.16), MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
      this._scrollBeat = Math.max(0, at - (event.clientX - rect.left) / this._pxPerBeat);
      this.render();
      this.scheduleViewChange();
    } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.scrollBeat = Math.max(0, this._scrollBeat + (event.deltaX || event.deltaY) / this._pxPerBeat);
    } else {
      this.lanesWrap.scrollTop = Math.max(0, this.lanesWrap.scrollTop + event.deltaY);
    }
  }
}

defineElement('compost-timeline', CompostTimeline);
