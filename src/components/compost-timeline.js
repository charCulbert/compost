import { clamp, defineElement, numberAttr } from '../utils.js';
import { rulerLabels } from '../time-ruler.js';
import { DEFAULT_TAPER, washLevel, washPosition } from './compost-channel-strip.js';

const MIN_CLIP_LENGTH = 1e-6;
const MIN_PX_PER_BEAT = 4;
const MAX_PX_PER_BEAT = 480;
const DEFAULT_PX_PER_BEAT = 24;
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_LOOP_END = 8;
const DRAG_THRESHOLD = 3;
const LANE_SEPARATOR = 1;

/** @typedef {{id: string, name: string, start: number, length: number,
 * offset?: number, duration: number, loop?: boolean, state?: string,
 * progress?: number, notes?: {start: number, duration: number, note: number}[], color?: string}} TimelineClip */
/** @typedef {{id: string, name: string, color?: string, overridden?: boolean,
 * armed?: boolean, recording?: boolean, controls?: {armed: boolean, muted: boolean, soloed: boolean},
 * automation?: AutomationLaneView[],
 * clips: TimelineClip[]}} TimelineLane */
/** @typedef {{id: string, label: string, color?: string, min: number, max: number,
 * stepped: boolean, scale?: 'linear'|'gain', points: {beat: number, value: number}[],
 * state?: 'idle'|'recording'|'overridden'|'playing', value?: number}} AutomationLaneView */

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
/** The clip as a trim to [start, end) would leave it: the content keeps its place in
 * time, so a left trim moves the offset (wrapping for a loop, clamping otherwise).
 * @param {TimelineClip} clip @param {number} start @param {number} end */
export function previewTrimmedClip(clip, start, end) {
  const duration = Math.max(MIN_CLIP_LENGTH, Number(clip?.duration) || Number(clip?.length) || 1);
  const delta = start - (Number(clip?.start) || 0);
  let offset = (Number(clip?.offset) || 0) + delta;
  if (clip?.loop === false) offset = Math.max(0, Math.min(duration - MIN_CLIP_LENGTH, offset));
  else offset = ((offset % duration) + duration) % duration;
  return { ...clip, start, length: Math.max(MIN_CLIP_LENGTH, end - start), offset };
}

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

function automationRange(min, max) {
  const source = min && typeof min === 'object' ? min : { min, max };
  const low = Number.isFinite(Number(source.min)) ? Number(source.min) : 0;
  const high = Number.isFinite(Number(source.max)) ? Number(source.max) : 1;
  return low <= high ? { min: low, max: high } : { min: high, max: low };
}

function automationGeometryArgs(min, max, height, scale) {
  if (min && typeof min === 'object') {
    return { range: automationRange(min), height: max, scale: typeof height === 'string' ? height : 'linear' };
  }
  return { range: automationRange(min, max), height, scale };
}

/** Convert an automation value to a y coordinate in a sub-row. */
/** @param {number} value @param {number|{min:number,max:number}} min @param {number} max @param {number} height @param {'linear'|'gain'} [scale] */
export function automationValueToY(value, min, max, height, scale = 'linear') {
  const args = automationGeometryArgs(min, max, height, scale);
  const range = args.range;
  const rowHeight = Math.max(1, Number(args.height) || 1);
  const bounded = finiteClamp(Number(value), range.min, range.max);
  const fraction = args.scale === 'gain'
    ? washPosition(bounded, DEFAULT_TAPER)
    : (range.max === range.min ? .5 : (bounded - range.min) / (range.max - range.min));
  return (1 - clamp(fraction, 0, 1)) * rowHeight;
}

/** Convert a y coordinate in a sub-row to an automation value. */
/** @param {number} y @param {number|{min:number,max:number}} min @param {number} max @param {number} height @param {'linear'|'gain'} [scale] */
export function automationValueFromY(y, min, max, height, scale = 'linear') {
  const args = automationGeometryArgs(min, max, height, scale);
  const range = args.range;
  const rowHeight = Math.max(1, Number(args.height) || 1);
  const fraction = clamp(1 - (Number(y) || 0) / rowHeight, 0, 1);
  const value = args.scale === 'gain'
    ? washLevel(fraction, DEFAULT_TAPER)
    : range.min + fraction * (range.max - range.min);
  return finiteClamp(value, range.min, range.max);
}

/** Add a point and return a new beat-sorted, range-clamped array. */
/** @param {{beat:number,value:number}[]} points @param {{beat:number,value:number}} point @param {number|{min:number,max:number}} min @param {number} [max] */
export function addAutomationPoint(points, point, min = 0, max = 1) {
  const range = automationRange(min, max);
  const next = Array.isArray(points) ? points.map((entry) => ({ ...entry })) : [];
  next.push({ ...point, beat: Math.max(0, Number(point?.beat) || 0), value: finiteClamp(Number(point?.value), range.min, range.max) });
  return next.sort((a, b) => a.beat - b.beat);
}

/** Move one point without allowing it to cross its neighbours. */
/** @param {{beat:number,value:number}[]} points @param {number} index @param {{beat:number,value:number}} point @param {number|{min:number,max:number}} min @param {number} [max] */
export function moveAutomationPoint(points, index, point, min = 0, max = 1) {
  const range = automationRange(min, max);
  const next = Array.isArray(points) ? points.map((entry) => ({ ...entry })) : [];
  const current = next[Number(index)];
  if (!current) return next;
  const before = next[Number(index) - 1]?.beat ?? 0;
  const after = next[Number(index) + 1]?.beat ?? Number.POSITIVE_INFINITY;
  current.beat = clamp(Math.max(0, Number(point?.beat) || 0), before, after);
  current.value = finiteClamp(Number(point?.value), range.min, range.max);
  return next;
}

/** Delete one point and return a new array. */
/** @param {{beat:number,value:number}[]} points @param {number} index */
export function deleteAutomationPoint(points, index) {
  return (Array.isArray(points) ? points : []).filter((_, entryIndex) => entryIndex !== Number(index))
    .map((entry) => ({ ...entry }));
}

function cloneAutomation(automation) {
  return Array.isArray(automation) ? automation.map((entry) => ({
    ...entry,
    points: Array.isArray(entry.points) ? entry.points.map((point) => ({ ...point })) : [],
  })) : undefined;
}

/** @param {Event} event @param {string} className */
function pathElement(event, className) {
  return event.composedPath().find((node) => node instanceof Element
    && node.classList.contains(className));
}

/** @param {string} type @param {object} detail */
function eventOf(type, detail) {
  return new CustomEvent(type, { bubbles: true, composed: true, detail });
}

export class CompostTimeline extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'beats-per-bar', 'grid', 'snap', 'follow', 'loop-enabled', 'disabled', 'lane-height', 'automation'];
  }

  constructor() {
    super();

    this.label = 'Timeline';
    this.beatsPerBar = DEFAULT_BEATS_PER_BAR;
    this.grid = 4;
    this.snapMode = 'grid';
    this.follow = false;
    this.laneHeight = 42;
    this.automationRowHeight = 32;
    this.automation = false;
    this._pxPerBeat = DEFAULT_PX_PER_BEAT;
    this._scrollBeat = 0;
    this._playhead = 0;
    this._loopStart = 0;
    this._loopEnd = DEFAULT_LOOP_END;
    this._loopEnabled = false;
    this._punchIn = false;
    this._punchOut = false;
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
          --compost-timeline-lane: var(--compost-timeline-bg);
          --compost-timeline-lane-alt: var(--compost-timeline-bg);
          --compost-timeline-header-bg: var(--compost-timeline-bg);
          --compost-timeline-clip-text: var(--compost-timeline-text);
          --compost-timeline-signal-hi: var(--compost-timeline-select, #6fa8eb);
          --compost-timeline-wash: color-mix(in srgb, var(--compost-timeline-text) 12%, transparent);
          --compost-timeline-over: #d98a4a;
          --compost-timeline-highlight: color-mix(in srgb, var(--compost-timeline-text) 8%, transparent);
          --compost-timeline-select: var(--compost-theme-learn, #6fa8eb);
          --compost-timeline-marquee: color-mix(in srgb, var(--compost-timeline-select) 15%, transparent);
          --compost-timeline-playhead: var(--compost-timeline-text);
          --compost-timeline-loop: var(--compost-theme-accent, #8ea9c7);
          --compost-timeline-loop-off: color-mix(in srgb, var(--compost-timeline-muted) 60%, transparent);
          --compost-timeline-lane-height: var(--compost-clip-grid-row-height, 2.9em);
          --compost-timeline-row-height: var(--compost-timeline-lane-height);
          --compost-timeline-automation-row-height: 2.2em;
          --compost-timeline-value: var(--compost-timeline-signal-hi);
          --compost-timeline-automation-line: var(--lane-color, var(--compost-timeline-text));
          --compost-timeline-clip-font-size: var(--compost-clip-grid-font-size, .91em);
          --compost-timeline-lane-font-size: .91em;
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
        .ruler-wrap { position: relative; overflow: hidden; border-bottom: 1px solid var(--compost-timeline-line); touch-action: none; }
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
        .ruler-handle[data-punch]::after { content: ""; position: absolute; inset-block: 0; width: 2px; background: var(--compost-timeline-over); }
        .ruler-handle.start[data-punch]::after { left: 2px; }
        .ruler-handle.end[data-punch]::after { right: 2px; }
        .ruler-playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-timeline-playhead); pointer-events: none; z-index: 4; }
        .ruler-playhead::before { content: ""; position: absolute; top: .08em; left: -4px; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid var(--compost-timeline-playhead); }
        .header-wrap, .lanes-wrap { min-height: 0; overflow: hidden; }
        .header-wrap { overflow: hidden; }
        .headers { position: relative; }
        .lane-header { box-sizing: border-box; height: auto; display: block; border-bottom: 1px solid var(--compost-timeline-line); color: var(--lane-color, var(--compost-timeline-text)); font-size: var(--compost-timeline-lane-font-size); }
        .lane-header-main { box-sizing: border-box; height: var(--compost-timeline-row-height); display: flex; align-items: center; gap: .45em; padding: 0 .6em; }
        .lane-header .lane-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; cursor: default; }
        .lane-header .lane-name:focus-visible { outline: 1px dotted var(--compost-timeline-select); outline-offset: 2px; }
        .lane-controls { display: flex; flex: none; align-items: center; gap: .18em; margin-left: auto; }
        .lane-control { appearance: none; border: 0; border-radius: 2px; min-width: 1.45em; height: 1.45em; padding: 0 .2em; background: none; color: var(--compost-timeline-muted); font: inherit; font-size: .78em; line-height: 1; cursor: pointer; }
        .lane-control:hover, .lane-control:focus-visible { color: var(--compost-timeline-text); background: var(--compost-timeline-highlight); }
        .lane-control:focus-visible { outline: 1px solid var(--compost-timeline-select); outline-offset: 1px; }
        .lane-control[data-name="arm"][aria-pressed="true"] { color: var(--compost-timeline-over); }
        .lane-control[data-name="mute"][aria-pressed="true"], .lane-control[data-name="solo"][aria-pressed="true"] { color: var(--compost-timeline-text); background: var(--compost-timeline-highlight); }
        .back-pip { flex: none; width: .58em; height: .58em; border: 0; border-radius: 50%; padding: 0; background: var(--compost-timeline-loop); cursor: pointer; }
        .back-pip:focus-visible { outline: 1px solid var(--compost-timeline-select); outline-offset: 2px; }
        .automation-header { box-sizing: border-box; height: var(--compost-timeline-automation-row-height); display: flex; align-items: center; gap: .3em; padding: 0 .6em 0 1.5em; border-top: 1px solid color-mix(in srgb, var(--compost-timeline-line) 50%, transparent); color: var(--compost-timeline-muted); font-size: .82em; }
        .automation-header-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .automation-header-value { margin-left: auto; color: var(--compost-timeline-value); font: .86em/1 var(--compost-timeline-numeral-font); }
        .lanes-wrap { position: relative; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; touch-action: none; }
        .lanes-world { position: relative; min-height: 100%; }
        .grid-world { position: absolute; inset: 0 auto auto 0; z-index: 1; pointer-events: none; }
        .grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-timeline-line); opacity: .5; }
        .grid-line.bar { background: var(--compost-timeline-bar-line); opacity: 1; }
        .lane { position: relative; box-sizing: border-box; height: auto; border-bottom: 1px solid var(--compost-timeline-line); background: var(--compost-timeline-lane); }
        .lane-base { position: relative; box-sizing: border-box; height: var(--compost-timeline-row-height); }
        .automation-row { position: relative; box-sizing: border-box; height: var(--compost-timeline-automation-row-height); overflow: visible; border-top: 1px solid color-mix(in srgb, var(--compost-timeline-line) 50%, transparent); background: var(--compost-timeline-lane); touch-action: none; }
        .automation-row[data-state="overridden"] .automation-line { stroke: var(--compost-timeline-muted); stroke-dasharray: 3 3; }
        .automation-row[data-state="overridden"] .automation-point { fill: var(--compost-timeline-muted); }
        .automation-row[data-state="recording"] .automation-line { stroke: var(--compost-timeline-over); }
        .automation-row[data-state="recording"] .automation-point { fill: var(--compost-timeline-over); }
        .automation-row[data-state="playing"] .automation-line { stroke: var(--compost-timeline-signal-hi); }
        .automation-row[data-state="playing"] .automation-point { fill: var(--compost-timeline-signal-hi); }
        .automation-svg { position: absolute; inset: 0 auto auto 0; overflow: visible; pointer-events: none; }
        .automation-line { fill: none; stroke: var(--lane-color, var(--compost-timeline-text)); stroke-width: 1; vector-effect: non-scaling-stroke; }
        .automation-point { fill: var(--lane-color, var(--compost-timeline-text)); stroke: var(--compost-timeline-bg); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: all; cursor: grab; }
        .automation-point:focus-visible { outline: 1px solid var(--compost-timeline-select); outline-offset: 2px; }
        .automation-readout { position: absolute; z-index: 5; transform: translate(-50%, -100%); padding: 1px 3px; background: var(--compost-timeline-bg); color: var(--compost-timeline-value); font: .78em/1 var(--compost-timeline-numeral-font); pointer-events: none; }
        .lane[data-overridden] { filter: brightness(1.18); }
        .lane[data-overridden] .clip { opacity: .4; }
        .clip { position: absolute; top: 4px; bottom: 4px; z-index: 2; box-sizing: border-box; min-width: 1px; overflow: hidden; border: 0; background: transparent; color: var(--clip-color, var(--compost-timeline-clip-text)); cursor: grab; touch-action: none; }
        .clip::before, .clip::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; border: 1px solid transparent; }
        .clip[data-selected] { z-index: 3; }
        .clip[data-selected]::before, .clip[data-selected]::after { opacity: 1; background-repeat: no-repeat; background-size: 6px 1px, 1px 6px, 6px 1px, 1px 6px; }
        .clip[data-selected]::before { background-image: linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)); background-position: left top, left top, right bottom, right bottom; }
        .clip[data-selected]::after { background-image: linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)); background-position: right top, right top, left bottom, left bottom; }
        .clip:focus-visible { outline: none; }
        .clip:focus-visible .clip-name { text-decoration: underline dotted var(--compost-timeline-muted); text-underline-offset: 2px; }
        .clip[data-state="playing"] { background: var(--compost-timeline-wash); }
        .clip[data-state="recording"] { border-right: 1px dashed var(--compost-timeline-over); }
        .clip[data-state="open"] .clip-name { color: var(--compost-timeline-select); }
        .clip[data-state="playing"] .clip-name { color: var(--compost-timeline-signal-hi); }
        .clip[data-state="queued"] .clip-name { color: var(--compost-timeline-select); animation: compost-timeline-breath 1s ease-in-out infinite; }
        .clip[data-state="recording"] .clip-name { color: var(--compost-timeline-over); }
        .clip[data-state="playing"] .clip-notes { opacity: .9; }
        .clip[data-state="recording"] .clip-notes { color: var(--lane-color, var(--compost-timeline-clip-text)); opacity: .55; }
        .clip[data-dragging] { opacity: .35 !important; }
        .clip-name { position: relative; z-index: 2; display: block; padding: 3px 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--compost-timeline-clip-font-size); color: var(--clip-color, var(--compost-timeline-clip-text)); }
        .clip-notes { position: absolute; inset: 0; opacity: .55; pointer-events: none; }
        .clip-note { position: absolute; bottom: 4px; height: 2px; min-width: 2px; background: currentColor; }
        .clip-extent { position: absolute; inset: auto 0 0 0; height: 1px; background: currentColor; opacity: .35; pointer-events: none; }
        .clip-extent::before { content: ""; position: absolute; left: 0; bottom: 0; width: 1px; height: 1000%; background: currentColor; }
        .clip-progress { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--compost-timeline-wash); filter: brightness(1.5); pointer-events: none; }
        /* a loop point: a thin line the height of the clip and a small cap at the top, in the clip's colour */
        .clip-loop-line { position: absolute; top: 0; bottom: 0; width: 1px; background: currentColor; opacity: .6; pointer-events: none; }
        .clip-loop-line::before { content: ""; position: absolute; top: 0; left: -3px; border-left: 3.5px solid transparent; border-right: 3.5px solid transparent; border-top: 4px solid currentColor; }
        .clip-editor { position: relative; z-index: 4; width: calc(100% - 5px); margin: 2px; border: 0; outline: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-bg); color: var(--compost-timeline-text); font: inherit; font-size: .78em; }
        .marquee { position: absolute; z-index: 7; border: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-marquee); pointer-events: none; display: none; }
        .announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        @keyframes compost-timeline-breath { 50% { opacity: .3; } }
        @media (prefers-reduced-motion: reduce) { .clip { transition: none; } .clip[data-state="queued"] .clip-name { animation: none; } }
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
    this.addEventListener('dblclick', (event) => {
      if (event.__compostTimelineHandled) return;
      event.__compostTimelineHandled = true;
      this.handleDoubleClick(event);
    });
    this.addEventListener('contextmenu', (event) => {
      if (event.__compostTimelineHandled) return;
      event.__compostTimelineHandled = true;
      this.handleContextMenu(event);
    });
    this.addEventListener('keydown', (event) => this.handleKey(event));
    // Some browsers keep secondary mouse events inside a shadow root. Relay
    // those events at the root while marking composed events so they do not
    // run twice on the host listener above.
    for (const [type, method] of [['dblclick', 'handleDoubleClick'], ['contextmenu', 'handleContextMenu']]) {
      this.root.addEventListener(type, (event) => {
        if (event.__compostTimelineHandled) return;
        event.__compostTimelineHandled = true;
        this[method](event);
      });
    }
    this.lanesWrap.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.rulerWrap.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.lanesWrap.addEventListener('scroll', () => this.paintLaneScroll());
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
    this.automation = this.hasAttribute('automation');
    const style = getComputedStyle(this);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const rawLaneHeight = style.getPropertyValue('--compost-timeline-lane-height').trim();
    const parsedLaneHeight = Number.parseFloat(rawLaneHeight);
    const cssLaneHeight = rawLaneHeight.endsWith('em') ? parsedLaneHeight * fontSize
      : rawLaneHeight.endsWith('rem') ? parsedLaneHeight * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
        : parsedLaneHeight;
    const defaultLaneHeight = fontSize * 2.9;
    this.laneHeight = Math.max(24, this.hasAttribute('lane-height')
      ? numberAttr(this, 'lane-height', this.laneHeight)
      : (Number.isFinite(cssLaneHeight) ? cssLaneHeight : defaultLaneHeight));
    const rawAutomationHeight = style.getPropertyValue('--compost-timeline-automation-row-height').trim();
    const parsedAutomationHeight = Number.parseFloat(rawAutomationHeight);
    const cssAutomationHeight = rawAutomationHeight.endsWith('em') ? parsedAutomationHeight * fontSize
      : rawAutomationHeight.endsWith('rem') ? parsedAutomationHeight * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
        : parsedAutomationHeight;
    this.automationRowHeight = Math.max(20, Number.isFinite(cssAutomationHeight) ? cssAutomationHeight : fontSize * 2.2);
    this._loopEnabled = this.hasAttribute('loop-enabled');
    this.setAttribute('aria-label', this.label);
    this.style.setProperty('--compost-timeline-row-height', `${this.laneHeight}px`);
    // the header column and the lane body resolve the row token against different
    // font sizes; pinning it in px keeps an automation header level with its row
    this.style.setProperty('--compost-timeline-automation-row-height', `${this.automationRowHeight}px`);
  }

  get lanes() {
    return this._lanes.map((lane) => ({
      ...lane,
      armed: lane.controls ? Boolean(lane.controls.armed) : lane.armed,
      controls: lane.controls ? { ...lane.controls } : undefined,
      automation: cloneAutomation(lane.automation),
      clips: lane.clips.map((clip) => ({ ...clip })),
    }));
  }

  /** Replace all lanes and clips; this never emits a model intent. */
  /** @param {TimelineLane[]} lanes */
  setLanes(lanes) {
    this._lanes = Array.isArray(lanes) ? lanes.map((lane) => ({
      ...lane,
      armed: lane.controls ? Boolean(lane.controls.armed) : lane.armed,
      controls: lane.controls ? { armed: Boolean(lane.controls.armed), muted: Boolean(lane.controls.muted), soloed: Boolean(lane.controls.soloed) } : undefined,
      automation: cloneAutomation(lane.automation),
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

  /** Update one lane's header controls without rebuilding its clips. */
  /** @param {string} laneId @param {{armed: boolean, muted: boolean, soloed: boolean}} controls */
  setLaneControls(laneId, controls) {
    const lane = this._lanes.find((entry) => entry.id === laneId);
    if (!lane || !controls) return;
    lane.controls = { armed: Boolean(controls.armed), muted: Boolean(controls.muted), soloed: Boolean(controls.soloed) };
    lane.armed = lane.controls.armed;
    const header = this.headers.querySelector(`.lane-header[data-lane-id="${CSS.escape(laneId)}"]`);
    const existing = header?.querySelector('.lane-controls');
    if (!(header instanceof HTMLElement)) return;
    const next = this.renderLaneControls(lane);
    if (existing) existing.replaceWith(next);
    else (header.querySelector('.lane-header-main') || header).append(next);
  }

  /** Update one lane's automation rows without changing the lane order. */
  /** @param {string} laneId @param {AutomationLaneView[]} automation */
  setLaneAutomation(laneId, automation) {
    const lane = this._lanes.find((entry) => entry.id === laneId);
    if (!lane) return;
    lane.automation = cloneAutomation(automation);
    const previousWidth = Number.parseFloat(this.lanesWorld.style.width);
    const previousEnd = Number.isFinite(previousWidth) && this._pxPerBeat > 0 ? previousWidth / this._pxPerBeat : null;
    const end = this.worldEnd();
    const header = this.headers.querySelector(`.lane-header[data-lane-id="${CSS.escape(laneId)}"]`);
    const row = this.lanesWorld.querySelector(`.lane[data-lane-id="${CSS.escape(laneId)}"]`);
    // only the automation sub-rows are rebuilt: the clip row (possibly mid-drag) and the
    // header's name row stay in place, so a write painting at 10 Hz does not disturb them
    if (header instanceof HTMLElement) {
      for (const old of header.querySelectorAll('.automation-header')) old.remove();
      for (const entry of this.automationFor(lane)) header.append(this.renderAutomationHeader(lane, entry));
    }
    if (row instanceof HTMLElement) {
      for (const old of row.querySelectorAll('.automation-row')) old.remove();
      for (const entry of this.automationFor(lane)) row.append(this.renderAutomationRow(lane, entry, end));
    }
    this.lanesWorld.style.minHeight = `${this.totalLaneHeight()}px`;
    const grid = this.lanesWorld.querySelector('.grid-world');
    if (grid instanceof HTMLElement) grid.style.height = `${this.totalLaneHeight()}px`;
    // the world only widens when the lane content grew past it; then the ruler follows
    if (previousEnd === null || Math.abs(previousEnd - end) > MIN_CLIP_LENGTH) {
      this.rulerWorld.style.width = `${end * this._pxPerBeat}px`;
      this.lanesWorld.style.width = `${end * this._pxPerBeat}px`;
      this.rulerWorld.replaceChildren(this.rulerGrid(end));
      this.renderRulerLabels(end);
      if (grid instanceof HTMLElement) {
        grid.style.width = `${end * this._pxPerBeat}px`;
        grid.replaceChildren(this.rulerGrid(end, true));
      }
    }
    this.paintSelection();
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

  /** @param {number} start @param {number} end @param {boolean} enabled @param {boolean} [emit]
   * @param {{punchIn?: boolean, punchOut?: boolean}} [options] */
  setLoop(start, end, enabled, emit = false, options) {
    this._loopStart = Math.max(0, Number(start) || 0);
    this._loopEnd = Math.max(this._loopStart + MIN_CLIP_LENGTH, Number(end) || this._loopStart + 1);
    this._loopEnabled = Boolean(enabled);
    if (options && Object.prototype.hasOwnProperty.call(options, 'punchIn')) this._punchIn = Boolean(options.punchIn);
    if (options && Object.prototype.hasOwnProperty.call(options, 'punchOut')) this._punchOut = Boolean(options.punchOut);
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

  /** @param {TimelineLane} lane */
  automationFor(lane) {
    return this.automation && Array.isArray(lane?.automation) ? lane.automation : [];
  }

  /** @param {TimelineLane} lane */
  laneHeightFor(lane) {
    return this.laneHeight + this.automationFor(lane).length * this.automationRowHeight + LANE_SEPARATOR;
  }

  totalLaneHeight() {
    return Math.max(1, this._lanes.reduce((height, lane) => height + this.laneHeightFor(lane), 0));
  }

  /** Return the lane id under a viewport y coordinate. */
  /** @param {number} clientY */
  laneAtPoint(clientY) {
    const rect = this.lanesWrap.getBoundingClientRect();
    const y = Number(clientY) - rect.top + this.lanesWrap.scrollTop;
    let offset = 0;
    for (const lane of this._lanes) {
      const height = this.laneHeightFor(lane);
      if (y >= offset && y < offset + height) return lane.id;
      offset += height;
    }
    return null;
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

  /** Scroll the vertical lane viewport until an automation row is visible. */
  /** @param {string} laneId @param {string} automationId @returns {boolean} */
  revealAutomation(laneId, automationId) {
    const row = this.lanesWorld.querySelector(`.automation-row[data-lane-id="${CSS.escape(String(laneId))}"][data-automation-id="${CSS.escape(String(automationId))}"]`);
    if (!(row instanceof HTMLElement)) return false;
    const viewport = this.lanesWrap.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const delta = bounds.top < viewport.top ? bounds.top - viewport.top
      : bounds.bottom > viewport.bottom ? bounds.bottom - viewport.bottom : 0;
    const maximum = Math.max(0, this.lanesWrap.scrollHeight - this.lanesWrap.clientHeight);
    this.lanesWrap.scrollTop = clamp(this.lanesWrap.scrollTop + delta, 0, maximum);
    this.paintLaneScroll();
    return true;
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

  /** @param {string} laneId @param {string} automationId @param {number} pointIndex */
  pointForAutomation(laneId, automationId, pointIndex) {
    const point = this.lanesWorld.querySelector(`.automation-row[data-lane-id="${CSS.escape(laneId)}"][data-automation-id="${CSS.escape(automationId)}"] .automation-point[data-point-index="${pointIndex}"]`);
    if (!(point instanceof SVGElement)) return { clientX: 0, clientY: 0 };
    const rect = point.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  worldEnd() {
    const last = this._lanes.reduce((end, lane) => {
      const clipEnd = lane.clips.reduce((clipMax, clip) => Math.max(clipMax, (Number(clip.start) || 0) + (Number(clip.length) || 0)), 0);
      const automationEnd = this.automationFor(lane).reduce((automationMax, automation) => automation.points?.reduce(
        (pointMax, point) => Math.max(pointMax, Number(point.beat) || 0), automationMax) || automationMax, 0);
      return Math.max(end, clipEnd, automationEnd);
    }, 0);
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
    this.lanesWorld.style.minHeight = `${this.totalLaneHeight()}px`;
    this.rulerWorld.append(this.rulerGrid(end));
    this.renderRulerLabels(end);
    this.renderLanes();
    this.paintScroll();
    this.paintLaneScroll();
    this.paintPlayhead();
    this.paintLoop();
  }

  /** @param {number} end */
  rulerGrid(end, lanes = false) {
    const fragment = document.createDocumentFragment();
    const stepBars = rulerStep(this._pxPerBeat, this.beatsPerBar);
    const step = lanes && this._pxPerBeat < 48 ? 1 : this.beatsPerBar / Math.max(1, this.grid);
    for (let beat = 0; beat <= end + MIN_CLIP_LENGTH; beat += step) {
      if (lanes && beat < MIN_CLIP_LENGTH) continue;
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

  /** @param {TimelineLane} lane */
  renderLaneControls(lane) {
    const controls = document.createElement('span');
    controls.className = 'lane-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', `${lane.name || lane.id} controls`);
    for (const [name, glyph] of [['armed', '●'], ['muted', 'M'], ['soloed', 'S']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lane-control';
      button.dataset.name = name === 'armed' ? 'arm' : name === 'muted' ? 'mute' : 'solo';
      button.textContent = glyph;
      button.title = button.dataset.name;
      button.setAttribute('aria-label', `${button.dataset.name} ${lane.name || lane.id}`);
      button.setAttribute('aria-pressed', String(Boolean(lane.controls?.[name])));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dispatchEvent(eventOf('lane-toggle', { laneId: lane.id, name: button.dataset.name }));
      });
      controls.append(button);
    }
    return controls;
  }

  /** @param {TimelineLane} lane @param {AutomationLaneView} automation */
  renderAutomationHeader(lane, automation) {
    const header = document.createElement('div');
    header.className = 'automation-header';
    header.dataset.laneId = lane.id;
    header.dataset.automationId = automation.id;
    header.setAttribute('role', 'listitem');
    header.tabIndex = 0;
    header.setAttribute('aria-label', `${automation.label || automation.id} automation for ${lane.name || lane.id}`);
    header.addEventListener('focus', () => { this.focusedLane = lane.id; this.focusedClip = null; });
    const label = document.createElement('span');
    label.className = 'automation-header-label';
    label.textContent = automation.label || automation.id;
    header.append(label);
    if (Number.isFinite(Number(automation.value))) {
      const value = document.createElement('span');
      value.className = 'automation-header-value';
      value.textContent = Number(automation.value).toFixed(2);
      header.append(value);
    }
    return header;
  }

  /** @param {TimelineLane} lane */
  renderLaneHeader(lane) {
    const header = document.createElement('div');
    header.className = 'lane-header';
    header.dataset.laneId = lane.id;
    header.part.add('lane-header');
    header.setAttribute('role', 'listitem');
    header.tabIndex = -1;
    header.style.setProperty('--lane-color', lane.color || 'var(--compost-timeline-text)');
    const main = document.createElement('div');
    main.className = 'lane-header-main';
    const name = document.createElement('span');
    name.className = 'lane-name';
    name.textContent = lane.name || lane.id;
    name.tabIndex = 0;
    name.setAttribute('role', 'button');
    name.setAttribute('aria-label', `${lane.name || lane.id} lane`);
    name.addEventListener('focus', () => { this.focusedLane = lane.id; this.focusedClip = null; });
    main.append(name);
    if (lane.overridden) {
      const back = document.createElement('button');
      back.className = 'back-pip';
      back.type = 'button';
      back.dataset.laneId = lane.id;
      back.title = 'back to timeline';
      back.setAttribute('aria-label', `Back to timeline for ${lane.name || lane.id}`);
      main.append(back);
    }
    if (lane.controls) main.append(this.renderLaneControls(lane));
    header.append(main);
    for (const automation of this.automationFor(lane)) header.append(this.renderAutomationHeader(lane, automation));
    return header;
  }

  /** @param {TimelineLane} lane */
  renderLaneBase(lane) {
    const base = document.createElement('div');
    base.className = 'lane-base';
    for (const clip of lane.clips) base.append(this.renderClip(clip, lane));
    return base;
  }

  /** @param {AutomationLaneView} automation @param {number} end */
  automationPath(automation, end) {
    const points = (Array.isArray(automation.points) ? automation.points : [])
      .filter((point) => Number.isFinite(Number(point.beat)) && Number.isFinite(Number(point.value)))
      .sort((a, b) => Number(a.beat) - Number(b.beat));
    if (!points.length) return '';
    const height = this.automationRowHeight;
    const y = (point) => automationValueToY(point.value, automation.min, automation.max, height, automation.scale);
    const x = (point) => Math.max(0, Number(point.beat) || 0) * this._pxPerBeat;
    let path = `M 0 ${y(points[0])} H ${x(points[0])}`;
    for (let index = 1; index < points.length; index += 1) {
      if (automation.stepped) path += ` H ${x(points[index])} V ${y(points[index])}`;
      else path += ` L ${x(points[index])} ${y(points[index])}`;
    }
    path += ` H ${Math.max(x(points[points.length - 1]), end * this._pxPerBeat)}`;
    return path;
  }

  /** @param {TimelineLane} lane @param {AutomationLaneView} automation @param {number} end */
  renderAutomationRow(lane, automation, end) {
    const row = document.createElement('div');
    row.className = 'automation-row';
    row.dataset.laneId = lane.id;
    row.dataset.automationId = automation.id;
    row.dataset.state = automation.state || 'idle';
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `${automation.label || automation.id} automation for ${lane.name || lane.id}`);
    row.addEventListener('focus', () => { this.focusedLane = lane.id; this.focusedClip = null; });
    row.style.setProperty('--lane-color', automation.color || lane.color || 'var(--compost-timeline-text)');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('automation-svg');
    svg.setAttribute('width', String(end * this._pxPerBeat));
    svg.setAttribute('height', String(this.automationRowHeight));
    svg.setAttribute('viewBox', `0 0 ${end * this._pxPerBeat} ${this.automationRowHeight}`);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.classList.add('automation-line');
    line.setAttribute('d', this.automationPath(automation, end));
    svg.append(line);
    const points = (Array.isArray(automation.points) ? automation.points : [])
      .filter((point) => Number.isFinite(Number(point.beat)) && Number.isFinite(Number(point.value)))
      .sort((a, b) => Number(a.beat) - Number(b.beat));
    points.forEach((point, index) => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      marker.classList.add('automation-point');
      marker.dataset.pointIndex = String(index);
      marker.setAttribute('x', String((Number(point.beat) || 0) * this._pxPerBeat - 2.5));
      marker.setAttribute('y', String(automationValueToY(point.value, automation.min, automation.max, this.automationRowHeight, automation.scale) - 2.5));
      marker.setAttribute('width', '5');
      marker.setAttribute('height', '5');
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `${automation.label || automation.id} point ${Number(point.beat).toFixed(2)} ${Number(point.value).toFixed(2)}`);
      svg.append(marker);
    });
    row.append(svg);
    return row;
  }

  /** @param {TimelineLane} lane @param {number} end */
  renderLaneBody(lane, end) {
    const row = document.createElement('div');
    row.className = 'lane';
    row.dataset.laneId = lane.id;
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', lane.name || lane.id);
    if (lane.overridden) row.dataset.overridden = '';
    row.style.setProperty('--lane-color', lane.color || 'var(--compost-timeline-text)');
    row.append(this.renderLaneBase(lane));
    for (const automation of this.automationFor(lane)) row.append(this.renderAutomationRow(lane, automation, end));
    return row;
  }

  renderLanes() {
    const headerFragment = document.createDocumentFragment();
    const laneFragment = document.createDocumentFragment();
    const end = this.worldEnd();
    this._lanes.forEach((lane) => {
      headerFragment.append(this.renderLaneHeader(lane));
      laneFragment.append(this.renderLaneBody(lane, end));
    });
    this.headers.append(headerFragment);
    this.lanesWorld.append(laneFragment);
    const grid = document.createElement('div');
    grid.className = 'grid-world';
    grid.style.width = `${end * this._pxPerBeat}px`;
    grid.style.height = `${this.totalLaneHeight()}px`;
    grid.append(this.rulerGrid(end, true));
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
    if (element.dataset.state === 'playing' && Number.isFinite(Number(clip.progress))) {
      const progress = document.createElement('span');
      progress.className = 'clip-progress';
      progress.style.width = `${finiteClamp(Number(clip.progress), 0, 1) * 100}%`;
      element.append(progress);
    }
    this.paintClipContent(element, clip);
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

  /** The clip's body: notes, extent and loop points, positioned in beats of the
   * clip's own length. A trim preview repaints this with the previewed geometry so
   * the notes stay where they are in time instead of stretching with the box.
   * @param {HTMLElement} element @param {TimelineClip} clip */
  paintClipContent(element, clip) {
    for (const old of element.querySelectorAll('.clip-notes, .clip-extent, .clip-loop-line')) old.remove();
    const anchor = element.querySelector('.clip-name, .clip-editor');
    const place = (node) => anchor ? element.insertBefore(node, anchor) : element.append(node);
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
    place(notes);
    const extent = document.createElement('span');
    extent.className = 'clip-extent';
    place(extent);
    for (const line of loopPassLines(clip)) {
      const mark = document.createElement('span');
      mark.className = 'clip-loop-line';
      mark.title = 'loop point';
      mark.style.left = `${(line / length) * 100}%`;
      place(mark);
    }
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

  paintLaneScroll() {
    this.headers.style.transform = `translateY(${-this.lanesWrap.scrollTop}px)`;
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
    this.rulerStart.toggleAttribute('data-punch', this._punchIn);
    this.rulerEnd.toggleAttribute('data-punch', this._punchOut);
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

  automationFromEvent(event) {
    const row = pathElement(event, 'automation-row');
    if (!(row instanceof HTMLElement)) return null;
    const lane = this._lanes.find((entry) => entry.id === row.dataset.laneId);
    const automation = lane && this.automationFor(lane).find((entry) => entry.id === row.dataset.automationId);
    if (!lane || !automation) return null;
    const point = event.composedPath().find((node) => node instanceof Element && node.classList.contains('automation-point'));
    return {
      row,
      lane,
      automation,
      automationIndex: this.automationFor(lane).indexOf(automation),
      point: point instanceof Element ? point : null,
      pointIndex: point instanceof Element ? Number(point.dataset.pointIndex) : -1,
    };
  }

  automationHeaderFromEvent(event) {
    const header = pathElement(event, 'automation-header');
    if (!(header instanceof HTMLElement)) return null;
    const lane = this._lanes.find((entry) => entry.id === header.dataset.laneId);
    return lane ? { header, lane } : null;
  }

  updatePointerCursor(event) {
    if (event.pointerType === 'touch') return;
    const automation = this.automationFromEvent(event);
    if (automation?.point) automation.point.style.cursor = 'grab';
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

  /** @param {AutomationLaneView} automation @param {number} beat */
  automationSegmentIndex(automation, beat) {
    const points = Array.isArray(automation.points) ? automation.points : [];
    if (points.length < 2) return 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      if (beat >= Number(points[index].beat) && beat <= Number(points[index + 1].beat)) return index;
    }
    return beat < Number(points[0].beat) ? 0 : points.length - 2;
  }

  /** @param {any} drag @param {TimelineLane} lane @param {AutomationLaneView} automation @param {{beat:number,value:number}[]} points */
  paintAutomationPreview(drag, lane, automation, points) {
    const row = this.lanesWorld.querySelector(`.automation-row[data-lane-id="${CSS.escape(drag.laneId)}"][data-automation-id="${CSS.escape(drag.automationId)}"]`);
    if (!(row instanceof HTMLElement)) return;
    const svg = row.querySelector('.automation-svg');
    const line = row.querySelector('.automation-line');
    if (!(svg instanceof SVGElement) || !(line instanceof SVGElement)) return;
    const end = this.worldEnd();
    const width = end * this._pxPerBeat;
    svg.setAttribute('width', String(width));
    svg.setAttribute('viewBox', `0 0 ${width} ${this.automationRowHeight}`);
    line.setAttribute('d', this.automationPath(automation, end));
    const markers = [...row.querySelectorAll('.automation-point')];
    points.forEach((point, index) => {
      const marker = markers[index];
      if (!(marker instanceof SVGElement)) return;
      marker.dataset.pointIndex = String(index);
      marker.setAttribute('x', String((Number(point.beat) || 0) * this._pxPerBeat - 2.5));
      marker.setAttribute('y', String(automationValueToY(point.value, automation.min, automation.max, this.automationRowHeight, automation.scale) - 2.5));
      marker.setAttribute('aria-label', `${automation.label || automation.id} point ${Number(point.beat).toFixed(2)} ${Number(point.value).toFixed(2)}`);
    });
    row.querySelector('.automation-readout')?.remove();
    const point = points[drag.pointIndex];
    const beat = drag.type === 'automation-point' ? point?.beat : this.beatAtPoint(drag.lastClientX ?? drag.startX);
    const value = drag.type === 'automation-point' ? point?.value : drag.lastValue;
    if (!Number.isFinite(Number(beat)) || !Number.isFinite(Number(value))) return;
    const readout = document.createElement('span');
    readout.className = 'automation-readout';
    readout.textContent = Number(value).toFixed(2);
    readout.style.left = `${Number(beat) * this._pxPerBeat}px`;
    readout.style.top = `${automationValueToY(Number(value), automation.min, automation.max, this.automationRowHeight, automation.scale)}px`;
    row.append(readout);
  }

  /** @param {any} drag @param {PointerEvent} event */
  previewAutomationDrag(drag, event) {
    const lane = this._lanes.find((entry) => entry.id === drag.laneId);
    const automation = lane && this.automationFor(lane)[drag.automationIndex];
    if (!lane || !automation) return;
    const row = this.lanesWorld.querySelector(`.automation-row[data-lane-id="${CSS.escape(drag.laneId)}"][data-automation-id="${CSS.escape(drag.automationId)}"]`);
    if (!(row instanceof HTMLElement)) return;
    const rect = row.getBoundingClientRect();
    const rawBeat = this.beatAtPoint(event.clientX);
    const beat = snapBeat(rawBeat, this.beatsPerBar, this.grid, event.altKey ? 'off' : this.snapMode);
    const localY = event.clientY - rect.top;
    const value = automationValueFromY(localY, automation.min, automation.max, this.automationRowHeight, automation.scale);
    const range = { min: automation.min, max: automation.max };
    let points = drag.originPoints;
    if (drag.type === 'automation-point') {
      const origin = drag.originPoints[drag.pointIndex];
      const nextValue = origin.value + (value - origin.value) * (event.shiftKey ? .1 : 1);
      points = moveAutomationPoint(drag.originPoints, drag.pointIndex, { beat, value: nextValue }, range);
    } else if (drag.type === 'automation-segment') {
      const valueAtStart = automationValueFromY(drag.startY - rect.top, automation.min, automation.max, this.automationRowHeight, automation.scale);
      const delta = (valueAtStart - value) * (event.shiftKey ? .1 : 1);
      const segment = drag.segmentIndex;
      points = drag.originPoints.map((point, index) => {
        if (index !== segment && index !== segment + 1) return { ...point };
        return { ...point, value: finiteClamp(Number(point.value) - delta, Number(automation.min), Number(automation.max)) };
      });
    }
    drag.previewPoints = points;
    drag.lastClientX = event.clientX;
    drag.lastValue = value;
    drag.moved = true;
    automation.points = points.map((point) => ({ ...point }));
    this.paintAutomationPreview(drag, lane, automation, points);
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
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('lane-control'))) return;
    const loopPart = event.composedPath().find((node) => node instanceof HTMLElement
      && (node.classList.contains('ruler-band') || node.classList.contains('ruler-handle')));
    if (loopPart instanceof HTMLElement) return;
    const automation = this.automationFromEvent(event);
    if (automation) {
      event.preventDefault();
      // preventDefault stops the browser's own focus change: give the focus explicitly,
      // so Delete and the arrows work on the point that was just clicked
      const focusTarget = automation.point instanceof SVGElement || automation.point instanceof HTMLElement
        ? automation.point : automation.row;
      /** @type {any} */ (focusTarget).focus?.({ preventScroll: true });
      const beat = this.beatAtPoint(event.clientX);
      const points = Array.isArray(automation.automation.points)
        ? automation.automation.points.map((point) => ({ ...point })) : [];
      this.drag = automation.pointIndex >= 0
        ? {
          pointerId: event.pointerId, type: 'automation-point', laneId: automation.lane.id,
          automationId: automation.automation.id, automationIndex: automation.automationIndex,
          pointIndex: automation.pointIndex, startX: event.clientX, startY: event.clientY,
          originPoints: points, moved: false,
        }
        : {
          pointerId: event.pointerId, type: 'automation-segment', laneId: automation.lane.id,
          automationId: automation.automation.id, automationIndex: automation.automationIndex,
          segmentIndex: this.automationSegmentIndex(automation.automation, beat), startX: event.clientX,
          startY: event.clientY, originPoints: points, moved: false,
      };
      if (event.isTrusted) automation.row.setPointerCapture?.(event.pointerId);
      this.longPressTimer = setTimeout(() => {
        if (!this.drag || this.drag.pointerId !== event.pointerId || this.drag.moved) return;
        this.dispatchEvent(eventOf('automation-context', {
          laneId: automation.lane.id,
          automationId: automation.automation.id,
          clientX: event.clientX,
          clientY: event.clientY,
        }));
        this.endPointer({ pointerId: event.pointerId });
      }, 550);
      return;
    }
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
      this.drag = { pointerId: event.pointerId, type: 'marquee', laneId: lane.dataset.laneId, startX: event.clientX, startY: event.clientY, startScrollBeat: this._scrollBeat, moved: false, base: event.shiftKey ? new Set(this._selected) : new Set() };
      if (event.isTrusted) lane.setPointerCapture?.(event.pointerId);
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
    if (drag.type === 'automation-point' || drag.type === 'automation-segment') {
      if (!drag.moved) return;
      this.previewAutomationDrag(drag, event);
      return;
    }
    if (drag.type === 'marquee') {
      if (event.pointerType === 'touch' && drag.moved && Math.abs(dx) > Math.abs(dy)) {
        drag.type = 'scroll-time';
        this.marquee.style.display = 'none';
      }
    }
    if (drag.type === 'scroll-time') {
      this.scrollBeat = Math.max(0, drag.startScrollBeat - dx / this._pxPerBeat);
      return;
    }
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
      this.paintClipContent(drag.element, previewTrimmedClip(origin, start, end));
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
        element.style.transform = `translate(${delta * this._pxPerBeat}px, ${this.laneOffsetForPoint(event.clientY, item.lane.id)}px)`;
      }
    }
  }

  /** @param {number} clientY @param {string} originalLaneId */
  laneOffsetForPoint(clientY, originalLaneId) {
    const target = this.laneAtPoint(clientY);
    if (!target || target === originalLaneId) return 0;
    const from = this._lanes.findIndex((lane) => lane.id === originalLaneId);
    const to = this._lanes.findIndex((lane) => lane.id === target);
    if (to < 0 || from < 0) return 0;
    if (to > from) return this._lanes.slice(from, to).reduce((offset, lane) => offset + this.laneHeightFor(lane), 0);
    return -this._lanes.slice(to, from).reduce((offset, lane) => offset + this.laneHeightFor(lane), 0);
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
    if (drag.type === 'automation-point' || drag.type === 'automation-segment') {
      this.lanesWorld.querySelector(`.automation-row[data-lane-id="${CSS.escape(drag.laneId)}"][data-automation-id="${CSS.escape(drag.automationId)}"] .automation-readout`)?.remove();
      if (drag.moved && Array.isArray(drag.previewPoints)) {
        this.dispatchEvent(eventOf('automation-change', {
          laneId: drag.laneId,
          automationId: drag.automationId,
          points: drag.previewPoints.map((point) => ({ ...point })),
        }));
      }
      // a plain click changes nothing and must not rebuild the row under the pointer:
      // a rebuilt row is a new target and the browser then never fires dblclick
      return;
    }
    if (drag.type === 'marquee') {
      this.marquee.style.display = 'none';
      if (drag.moved) {
        const left = Math.min(drag.startX, event.clientX);
        const right = Math.max(drag.startX, event.clientX);
        const top = Math.min(drag.startY, event.clientY);
        const bottom = Math.max(drag.startY, event.clientY);
        const selected = [...drag.base];
        for (const lane of this._lanes) {
          const laneRect = this.lanesWorld.querySelector(`.lane[data-lane-id="${CSS.escape(lane.id)}"] .lane-base`)?.getBoundingClientRect();
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
    if (drag.type === 'scroll-time') return;
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

  /** @param {TimelineLane} lane @param {AutomationLaneView} automation @param {{beat:number,value:number}[]} points */
  commitAutomationChange(lane, automation, points) {
    automation.points = points.map((point) => ({ ...point }));
    this.render();
    this.dispatchEvent(eventOf('automation-change', {
      laneId: lane.id,
      automationId: automation.id,
      points: automation.points.map((point) => ({ ...point })),
    }));
  }

  // ---- Click, keyboard, wheel -------------------------------------------------

  handleDoubleClick(event) {
    if (this.hasAttribute('disabled')) return;
    const automation = this.automationFromEvent(event);
    if (automation) {
      event.preventDefault();
      const rect = automation.row.getBoundingClientRect();
      const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, event.altKey ? 'off' : this.snapMode);
      const value = automationValueFromY(event.clientY - rect.top, automation.automation.min, automation.automation.max, this.automationRowHeight, automation.automation.scale);
      const points = automation.pointIndex >= 0
        ? deleteAutomationPoint(automation.automation.points, automation.pointIndex)
        : addAutomationPoint(automation.automation.points, { beat, value }, { min: automation.automation.min, max: automation.automation.max });
      this.commitAutomationChange(automation.lane, automation.automation, points);
      return;
    }
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
    const automation = this.automationFromEvent(event);
    if (automation) {
      event.preventDefault();
      this.dispatchEvent(eventOf('automation-context', {
        laneId: automation.lane.id, automationId: automation.automation.id,
        clientX: event.clientX, clientY: event.clientY,
      }));
      return;
    }
    const automationHeader = this.automationHeaderFromEvent(event);
    if (automationHeader) {
      event.preventDefault();
      this.dispatchEvent(eventOf('automation-context', {
        laneId: automationHeader.lane.id,
        automationId: event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('automation-header'))?.dataset.automationId,
        clientX: event.clientX,
        clientY: event.clientY,
      }));
      return;
    }
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

  entryClip(key) {
    const clips = this._lanes.flatMap((lane) => lane.clips);
    if (!clips.length) return null;
    if (key === 'Home' || key === 'ArrowLeft' || key === 'ArrowUp') return clips[0];
    if (key === 'End') return clips[clips.length - 1];
    return clips.reduce((nearest, clip) => Math.abs((Number(clip.start) || 0) - this._playhead)
      < Math.abs((Number(nearest.start) || 0) - this._playhead) ? clip : nearest, clips[0]);
  }

  handleKey(event) {
    if (this.hasAttribute('disabled')) return;
    const source = event.composedPath()[0];
    if (source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement) return;
    const pointElement = event.composedPath().find((node) => node instanceof Element && node.classList.contains('automation-point'));
    const automation = pointElement instanceof Element ? this.automationFromEvent(event) : null;
    const automationBody = this.automationFromEvent(event);
    const automationHeader = this.automationHeaderFromEvent(event);
    if (event.shiftKey && event.key === 'F10' && (automationBody || automationHeader)) {
      event.preventDefault();
      const target = automationBody?.row || automationHeader?.header;
      const rect = target.getBoundingClientRect();
      this.dispatchEvent(eventOf('automation-context', {
        laneId: automationBody?.lane.id || automationHeader.lane.id,
        automationId: automationBody?.automation.id || automationHeader.header.dataset.automationId,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
      return;
    }
    if (automation && automation.pointIndex >= 0) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        this.commitAutomationChange(automation.lane, automation.automation,
          deleteAutomationPoint(automation.automation.points, automation.pointIndex));
        return;
      }
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
      if (direction) {
        event.preventDefault();
        const beatDelta = direction[0] * gridStep(this.beatsPerBar, this.grid) * (event.shiftKey ? .1 : 1);
        const valueDelta = direction[1] * (Number(automation.automation.max) - Number(automation.automation.min)) * .01;
        const point = automation.automation.points[automation.pointIndex];
        this.commitAutomationChange(automation.lane, automation.automation,
          moveAutomationPoint(automation.automation.points, automation.pointIndex, {
            beat: Number(point.beat) + beatDelta,
            value: Number(point.value) + valueDelta * (event.shiftKey ? .1 : 1),
          }, { min: automation.automation.min, max: automation.automation.max }));
        return;
      }
    }
    const current = this.focusedClip || this._selected[0];
    const found = current ? this.findClip(current) : null;
    const meta = event.metaKey || event.ctrlKey;
    // loop the selection: Cmd/Ctrl-L as in Ableton, and plain `l` because the browser
    // keeps Cmd-L for its address bar
    if (event.key.toLowerCase() === 'l' && !event.altKey && !event.shiftKey) {
      const ids = this._selected.length ? this._selected : found ? [found.clip.id] : [];
      const clips = ids.map((id) => this.findClip(id)?.clip).filter(Boolean);
      if (clips.length) {
        event.preventDefault();
        const start = Math.min(...clips.map((clip) => Number(clip.start) || 0));
        const end = Math.max(...clips.map((clip) => (Number(clip.start) || 0) + (Number(clip.length) || 0)));
        if (end > start + MIN_CLIP_LENGTH) this.setLoop(start, end, true, true);
      }
      return;
    }
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
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        const entry = this.entryClip(event.key);
        if (entry) {
          event.preventDefault();
          this.selectOne(entry.id);
          this.focusClip(entry.id);
        }
        return;
      }
      if (event.key === '[' || event.key === ']') { event.preventDefault(); this.zoomBy(event.key === ']' ? 1.16 : .86); }
      return;
    }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const step = gridStep(this.beatsPerBar, this.grid) * (event.key === 'ArrowRight' ? 1 : -1);
      this.dispatchEvent(eventOf('clip-nudge', { ids: this.selected.length ? this.selected : [found.clip.id], deltaBeats: step }));
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
