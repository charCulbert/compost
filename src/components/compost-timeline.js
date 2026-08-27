import { createLongPress, DRAG_SLOP, MOUSE_TRIM_EDGE, TOUCH_TRIM_EDGE } from '../internal/gestures.js';
import { installTouchDoubleClick } from '../internal/touch-double-click.js';
import { clamp, defineElement, numberAttr } from '../utils.js';
import { rulerLabels } from '../time-ruler.js';
import { gridStepOf, snapModeWith, snapTime } from '../time-grid.js';
import './compost-envelope-editor.js';
import { parameterScaleBreakpoints } from '../parameter-scale.js';
import { normalizeSelectionRegion } from '../selection-region.js';
import {
  addEnvelopePoint,
  deleteEnvelopePoint,
  drawEnvelopePoints,
  effectiveEnvelopeStep,
  envelopeRange as genericEnvelopeRange,
  envelopeRangeEdgeValues,
  envelopeValueAtTime,
  envelopeValueFromY,
  envelopeValueToY,
  flattenEnvelopeRange,
  moveEnvelopePoint,
  moveEnvelopePointsByY,
  moveEnvelopeRange,
  moveEnvelopeRangeByY,
  preserveEnvelopeEdgePoints,
  snapEnvelopeValue,
  thinEnvelopePoints,
} from '../envelope-model.js';

// A numerical guard, not a tick or musical-grid resolution.
const MIN_CLIP_LENGTH = 1e-9;
const MIN_PX_PER_BEAT = 4;
const MAX_PX_PER_BEAT = 480;
const DEFAULT_PX_PER_BEAT = 24;
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_LOOP_END = 8;
const DEFAULT_LANE_HEIGHT_EM = 4;
const DEFAULT_THIN_LANE_HEIGHT_EM = 2.5;
const DEFAULT_AUTOMATION_ROW_HEIGHT_EM = 2.36;

/** @typedef {{id: string, beat: number, name: string}} TimelineLocator */
/** @typedef {{start: number, end: number, laneIds: string[]}} TimelineTimeSelection */

/** @typedef {{id: string, name: string, start: number, length: number,
 * offset?: number, duration: number, loop?: boolean, state?: string,
 * progress?: number, notes?: {start: number, duration: number, note: number, velocity?: number}[], color?: string}} TimelineClip */
/** @typedef {{id: string, name: string, color?: string,
 * compact?: boolean, picked?: boolean, dimmed?: boolean, height?: number,
 * envelope?: {points: {beat: number, value: number}[], min: number, max: number, stepped?: boolean, scale?: 'linear'|'gain'}|null,
 * automation?: AutomationLaneView[],
 * clips: TimelineClip[]}} TimelineLane */
/** @typedef {{id: string, label: string, color?: string, min: number, max: number,
 * stepped: boolean, step?: number, scale?: 'linear'|'gain', points: {beat: number, value: number}[],
 * state?: 'idle'|'recording'|'overridden'|'playing', value?: number}} AutomationLaneView */

/** @param {number} value @param {number} min @param {number} max */
const finiteClamp = (value, min, max) => clamp(Number.isFinite(value) ? value : min, min, max);

/** A timeline grid step, expressed in beats. */
/** @param {number} beatsPerBar @param {number} grid */
function gridStep(beatsPerBar, grid) {
  return gridStepOf(beatsPerBar || DEFAULT_BEATS_PER_BAR, grid);
}

/** Snap a beat to the timeline grid, or leave it free when snapping is off. */
/** @param {number} beat @param {number} beatsPerBar @param {number} grid @param {string} snap */
export function snapBeat(beat, beatsPerBar, grid, snap) {
  return snapTime(beat, { step: gridStep(beatsPerBar, grid), mode: snap === 'off' ? 'off' : 'grid' });
}

/** Return stable, finite, beat-sorted locators without duplicate ids. */
/** @param {TimelineLocator[]} locators */
export function sortLocators(locators) {
  const seen = new Set();
  return (Array.isArray(locators) ? locators : []).map((locator, index) => ({
    id: String(locator?.id ?? ''),
    beat: Number(locator?.beat),
    name: String(locator?.name ?? ''),
    index,
  })).filter((locator) => locator.id && Number.isFinite(locator.beat) && locator.beat >= 0 && !seen.has(locator.id) && seen.add(locator.id))
    .sort((a, b) => a.beat - b.beat || a.index - b.index)
    .map(({ id, beat, name }) => ({ id, beat, name }));
}

/** Clamp and normalise a time selection; equal or absent edges clear it. */
/** @param {number|null} start @param {number|null} end @param {string[]} laneIds @param {number} [maxBeat] */
export function normalizeTimeSelection(start, end, laneIds = [], maxBeat = Number.POSITIVE_INFINITY) {
  if (start === null || start === undefined || end === null || end === undefined) return null;
  const region = normalizeSelectionRegion(start, end,
    (Array.isArray(laneIds) ? laneIds : []).map(String), maxBeat);
  return region ? { start: region.start, end: region.end, laneIds: region.items ?? [] } : null;
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

export function loopPassLines(clip, pxPerBeat = Number.POSITIVE_INFINITY) {
  if (clip?.loop === false) return [];
  const length = Math.max(0, Number(clip?.length) || 0);
  const duration = Number(clip?.duration) || 0;
  if (!(length > 0) || !(duration > 0)) return [];
  const offset = ((Number(clip?.offset) || 0) % duration + duration) % duration;
  const spacing = duration * (Number.isFinite(Number(pxPerBeat)) ? Math.max(0, Number(pxPerBeat)) : Number.POSITIVE_INFINITY);
  const stride = spacing > 0 && spacing < 8 ? Math.max(1, Math.ceil(8 / spacing)) : 1;
  const lines = [];
  let line = duration - offset;
  let index = 0;
  if (line <= MIN_CLIP_LENGTH) line = duration;
  for (; line < length - MIN_CLIP_LENGTH; line += duration, index += 1) {
    if (index % stride === 0) lines.push(line);
  }
  return lines;
}

/** Return the visible dash opacity for an optional MIDI velocity. */
export function clipNoteOpacity(velocity) {
  if (velocity === null || velocity === undefined || velocity === '') return .55;
  const value = Number(velocity);
  return Number.isFinite(value) ? .3 + .6 * finiteClamp(value, 0, 127) / 127 : .55;
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
  return genericEnvelopeRange(min, max);
}

const toEnvelopePoints = (points) => (Array.isArray(points) ? points : []).map(({ beat, ...point }) => ({
  ...point,
  time: Number(beat),
}));

const fromEnvelopePoints = (points) => (Array.isArray(points) ? points : []).map(({ time, ...point }) => ({
  ...point,
  beat: Number(time),
}));

/** Convert an automation value to a y coordinate in a sub-row. */
/** @param {number} value @param {number|{min:number,max:number}} min @param {number} max @param {number} height @param {'linear'|'gain'} [scale] */
export function automationValueToY(value, min, max, height, scale = 'linear') {
  return envelopeValueToY(value, min, max, height, scale);
}

/** Convert a y coordinate in a sub-row to an automation value. */
/** @param {number} y @param {number|{min:number,max:number}} min @param {number} max @param {number} height @param {'linear'|'gain'} [scale] */
export function automationValueFromY(y, min, max, height, scale = 'linear') {
  return envelopeValueFromY(y, min, max, height, scale);
}

/** Add a point and return a new beat-sorted, range-clamped array. */
/** @param {{beat:number,value:number}[]} points @param {{beat:number,value:number}} point @param {number|{min:number,max:number}} min @param {number} [max] */
export function addAutomationPoint(points, point, min = 0, max = 1) {
  return fromEnvelopePoints(addEnvelopePoint(toEnvelopePoints(points), {
    ...point,
    time: Number(point?.beat),
  }, min, max));
}

/** Move one point without allowing it to cross its neighbours. */
/** @param {{beat:number,value:number}[]} points @param {number} index @param {{beat:number,value:number}} point @param {number|{min:number,max:number}} min @param {number} [max] */
export function moveAutomationPoint(points, index, point, min = 0, max = 1) {
  return fromEnvelopePoints(moveEnvelopePoint(toEnvelopePoints(points), index, {
    ...point,
    time: Number(point?.beat),
  }, min, max));
}

/** Keep a synthetic original edge point when an endpoint moves inward. */
/** @param {{beat:number,value:number}[]} originPoints @param {{beat:number,value:number}[]} movedPoints @param {number} index */
export function preserveAutomationEdgePoints(originPoints, movedPoints, index) {
  return fromEnvelopePoints(preserveEnvelopeEdgePoints(
    toEnvelopePoints(originPoints), toEnvelopePoints(movedPoints), index,
  ));
}

/** Delete one point and return a new array. */
/** @param {{beat:number,value:number}[]} points @param {number} index */
export function deleteAutomationPoint(points, index) {
  return fromEnvelopePoints(deleteEnvelopePoint(toEnvelopePoints(points), index));
}

/** Snap an automation value when a lane supplies a discrete step. */
/** @param {number} value @param {number|{min:number,max:number}} min @param {number} [max] @param {number} [step] */
export function snapAutomationValue(value, min = 0, max = 1, step = 0) {
  return snapEnvelopeValue(value, min, max, step);
}

/** Return the effective value step, including the integer default for stepped lanes. */
/** @param {boolean} stepped @param {number|string|null|undefined} step */
export function effectiveAutomationStep(stepped = false, step) {
  return effectiveEnvelopeStep(stepped, step);
}

/** Return the value on an envelope at a beat, including flat stepped segments. */
/** @param {{beat:number,value:number}[]} points @param {number} beat @param {number|{min:number,max:number}} min @param {number} [max] @param {'linear'|'gain'} [scale] @param {boolean} [stepped] */
export function automationValueAtBeat(points, beat, min = 0, max = 1, scale = 'linear', stepped = false) {
  return envelopeValueAtTime(toEnvelopePoints(points), beat, min, max, scale, stepped);
}

function automationEditOptions(options = {}) {
  const range = automationRange(options.min ?? options.range ?? 0, options.max);
  return {
    range,
    height: Math.max(1, Number(options.height) || 1),
    scale: options.scale === 'gain' ? 'gain' : 'linear',
    stepped: Boolean(options.stepped),
    step: effectiveAutomationStep(Boolean(options.stepped), options.step ?? options.valueStep),
  };
}

/** Sample both sides of a range using the lane's actual interpolation semantics. */
/** @param {{beat:number,value:number}[]} points @param {number} start @param {number} end @param {object} options */
export function automationRangeEdgeValues(points, start, end, options = {}) {
  return envelopeRangeEdgeValues(toEnvelopePoints(points), start, end, options);
}

function automationValueMovedByY(value, deltaY, options = {}) {
  const { range, height, scale, stepped, step } = automationEditOptions(options);
  const y = automationValueToY(value, range, height, scale) + (Number(deltaY) || 0);
  return snapAutomationValue(automationValueFromY(y, range, height, scale), range, undefined, step || 0);
}

/** Move selected automation values in display space, preserving their beats. */
/** @param {{beat:number,value:number}[]} points @param {number[]} indexes @param {number} deltaY @param {object} options */
export function moveAutomationPointsByY(points, indexes, deltaY, options = {}) {
  return fromEnvelopePoints(moveEnvelopePointsByY(toEnvelopePoints(points), indexes, deltaY, options));
}

/** Move a selected range in display space while preserving independently sampled edges. */
/** @param {{beat:number,value:number}[]} points @param {number} start @param {number} end @param {number} deltaY @param {object} options */
export function moveAutomationRangeByY(points, start, end, deltaY, options = {}) {
  return fromEnvelopePoints(moveEnvelopeRangeByY(toEnvelopePoints(points), start, end, deltaY, options));
}

/** Thin freehand automation samples once, preserving endpoints and corners. */
/** @param {{beat:number,value:number}[]} points @param {number} tolerance */
export function thinAutomationPoints(points, tolerance = 0) {
  return fromEnvelopePoints(thinEnvelopePoints(toEnvelopePoints(points), tolerance));
}

/** Build one complete automation write from grid cells or freehand samples. */
/** @param {{beat:number,value:number}[]} originPoints @param {{beat:number,value:number}[]} samples @param {object} options */
export function drawAutomationPoints(originPoints, samples, options = {}) {
  return fromEnvelopePoints(drawEnvelopePoints(
    toEnvelopePoints(originPoints), toEnvelopePoints(samples), options,
  ));
}

/** Flatten an automation range while retaining points outside the selection. */
/** @param {{beat:number,value:number}[]} points @param {number} start @param {number} end @param {number} value @param {number|{min:number,max:number}} min @param {number} [max] @param {number} [step] */
export function flattenAutomationRange(points, start, end, value, min = 0, max = 1, step = 0) {
  return fromEnvelopePoints(flattenEnvelopeRange(toEnvelopePoints(points), start, end, value, min, max, step));
}

/** Move only the points and edge values inside a selected automation range. */
/** @param {{beat:number,value:number}[]} points @param {number} start @param {number} end @param {number} delta @param {number|{min:number,max:number}} min @param {number} [max] @param {number} [step] */
export function moveAutomationRange(points, start, end, delta, min = 0, max = 1, step = 0) {
  return fromEnvelopePoints(moveEnvelopeRange(toEnvelopePoints(points), start, end, delta, min, max, step));
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
    return ['label', 'beats-per-bar', 'grid', 'snap', 'follow', 'loop-enabled', 'disabled', 'readonly', 'lane-height', 'automation', 'draw'];
  }

  constructor() {
    super();

    this.label = 'Timeline';
    this.beatsPerBar = DEFAULT_BEATS_PER_BAR;
    this.grid = 4;
    this.snapMode = 'grid';
    this.follow = false;
    this.laneHeight = 64;
    this.thinLaneHeight = 32;
    this.automationRowHeight = 32;
    this.automation = false;
    this.draw = false;
    /** @type {string|null} */ this.automationChooserKey = null;
    this._pxPerBeat = DEFAULT_PX_PER_BEAT;
    this._scrollBeat = 0;
    this._playhead = 0;
    this._loopStart = 0;
    this._loopEnd = DEFAULT_LOOP_END;
    this._loopEnabled = false;
    /** @type {TimelineLane[]} */ this._lanes = [];
    /** @type {Map<string, HTMLElement>} */ this._laneHeaders = new Map();
    /** @type {Map<string, HTMLElement>} */ this._clipPreviews = new Map();
    /** @type {string[]} */ this._selected = [];
    /** @type {string|null} */ this.focusedClip = null;
    /** @type {string|null} */ this.focusedLane = null;
    /** @type {string|null} */ this.renaming = null;
    /** @type {string|null} */ this.renamingLane = null;
    /** @type {string|null} */ this.renamingLocator = null;
    /** @type {TimelineLocator[]} */ this._locators = [];
    /** @type {TimelineTimeSelection|null} */ this._timeSelection = null;
    /** @type {HTMLElement|null} */ this.timeSelectionWorld = null;
    /** @type {any} */ this.drag = null;
    /** @type {Map<number, {x: number, y: number}>} */ this.pointers = new Map();
    /** @type {any} */ this.pinch = null;
    this.viewChangeTimer = null;
    this.longPress = createLongPress();
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
          --compost-timeline-playhead: var(--compost-timeline-text);
          --compost-timeline-loop: var(--compost-theme-accent, #8ea9c7);
          --compost-timeline-loop-off: color-mix(in srgb, var(--compost-timeline-muted) 60%, transparent);
          --compost-timeline-header-width: 11rem;
          --compost-timeline-lane-height: 4em;
          --compost-timeline-thin-lane-height: 2.5em;
          --compost-timeline-row-height: var(--compost-timeline-lane-height);
          --compost-timeline-automation-row-height: 2.36em;
          --compost-timeline-value: var(--compost-timeline-signal-hi);
          --compost-timeline-clip-font-size: var(--compost-clip-grid-font-size, .91em);
          --compost-timeline-lane-font-size: .91em;
          --compost-timeline-clip-bg: color-mix(in srgb, var(--clip-color, var(--compost-timeline-select)) 16%, var(--compost-timeline-lane));
          --compost-timeline-clip-border: inset 0 0 0 1px color-mix(in srgb, var(--clip-color, var(--compost-timeline-select)) 55%, var(--compost-timeline-line));
          --compost-timeline-clip-radius: 2px;
          --compost-timeline-selected-outline: 2px solid var(--compost-timeline-select);
          --compost-timeline-selection-corners: 0;
          --compost-timeline-lane-selected-bg: color-mix(in srgb, var(--compost-timeline-select) 12%, transparent);
          --compost-timeline-lane-selected-outline: 1px solid var(--compost-timeline-select);
          --compost-timeline-lane-selection-corners: 0;
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
        .frame { display: grid; grid-template-columns: min(var(--compost-timeline-header-width), 44%) minmax(0, 1fr); grid-template-rows: 3.3em minmax(0, 1fr); height: 100%; min-height: 0; }
        .corner, .header-wrap { background: var(--compost-timeline-header-bg); border-right: 1px solid var(--compost-timeline-line); }
        .corner { border-bottom: 1px solid var(--compost-timeline-line); }
        .ruler-wrap { position: relative; overflow: hidden; border-bottom: 1px solid var(--compost-timeline-line); touch-action: none; scrollbar-width: none; }
        .ruler-wrap::-webkit-scrollbar { display: none; }
        .ruler, .ruler-world { position: absolute; inset: 0 auto 0 0; }
        .ruler-world { height: 100%; z-index: 1; }
        .ruler-label { position: absolute; top: 1.05em; border-left: 1px solid var(--compost-timeline-line); padding-left: 3px; color: var(--compost-timeline-muted); font: .72em/1 var(--compost-timeline-numeral-font); white-space: nowrap; }
        .ruler-label[data-bar] { border-left-color: var(--compost-timeline-bar-line); }
        .ruler-locator { position: absolute; top: .1em; height: .95em; z-index: 3; border-left: 1px solid var(--compost-timeline-value); padding-left: 4px; color: var(--compost-timeline-value); font: .8em/1 var(--compost-timeline-font); white-space: nowrap; cursor: pointer; }
        .ruler-locator:focus-visible { outline: 1px solid var(--compost-timeline-select); outline-offset: 1px; }
        .ruler-locator::before { content: ""; position: absolute; left: -4px; top: 0; border: 3.5px solid transparent; border-top: 5px solid var(--compost-timeline-value); }
        .ruler-locator-name { display: inline-block; min-width: 1px; }
        .ruler-locator-editor { box-sizing: border-box; width: 7em; border: 0; outline: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-bg); color: var(--compost-timeline-value); font: inherit; padding: 0 2px; }
        .ruler-time-selection { position: absolute; display: none; z-index: 2; top: 1em; height: 1.1em; background: color-mix(in srgb, var(--compost-timeline-select) 10%, transparent); box-shadow: inset 1px 0 0 var(--compost-timeline-select), inset -1px 0 0 var(--compost-timeline-select); pointer-events: none; }
        .ruler-band { position: absolute; top: 2.35em; height: .75em; background: color-mix(in srgb, var(--compost-timeline-loop) 24%, transparent); box-shadow: inset 0 0 0 1px var(--compost-timeline-loop); cursor: grab; }
        .ruler-band[data-off] { background: color-mix(in srgb, var(--compost-timeline-loop-off) 14%, transparent); box-shadow: inset 0 0 0 1px var(--compost-timeline-loop-off); opacity: .7; }
        .ruler-handle { position: absolute; top: 2.22em; height: 1em; width: .72em; z-index: 2; cursor: col-resize; touch-action: none; }
        .ruler-handle::before { content: ""; position: absolute; inset-block: 0; width: 2px; background: var(--compost-timeline-loop); }
        .ruler-handle.start::before { left: 0; }
        .ruler-handle.end::before { right: 0; }
        .ruler-playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-timeline-playhead); pointer-events: none; z-index: 4; }
        .ruler-playhead::before { content: ""; position: absolute; top: .08em; left: -4px; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid var(--compost-timeline-playhead); }
        .header-wrap, .lanes-wrap { min-height: 0; overflow: hidden; }
        .header-wrap { position: relative; overflow: hidden; }
        .headers { position: relative; width: 100%; }
        .lane-header { position: relative; box-sizing: border-box; height: auto; display: block; border-bottom: 1px solid var(--compost-timeline-line); color: var(--lane-color, var(--compost-timeline-text)); font-size: var(--compost-timeline-lane-font-size); }
        .lane-header-content { display: block; width: 100%; height: var(--lane-row-height, var(--compost-timeline-row-height)); }
        .lane-header-fallback { box-sizing: border-box; display: flex; align-items: center; padding: 0 1em; }
        .lane-header .lane-name, .lane-name-editor { position: relative; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; cursor: default; }
        .lane-header .lane-name[data-picked] { background: var(--compost-timeline-lane-selected-bg); outline: var(--compost-timeline-lane-selected-outline); outline-offset: 2px; }
        .lane-name-editor { box-sizing: border-box; width: 100%; border: 0; outline: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-bg); color: var(--lane-color); font: inherit; padding: 1px 3px; }
        .lane-header .lane-name[data-picked]::before, .lane-header .lane-name[data-picked]::after { content: ""; position: absolute; inset: -2px -3px; pointer-events: none; opacity: var(--compost-timeline-lane-selection-corners); background-repeat: no-repeat; background-size: 5px 1px, 1px 5px, 5px 1px, 1px 5px; }
        .lane-header .lane-name[data-picked]::before { background-image: linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)); background-position: left top, left top, right top, right top; }
        .lane-header .lane-name[data-picked]::after { background-image: linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)), linear-gradient(var(--compost-timeline-select), var(--compost-timeline-select)); background-position: left bottom, left bottom, right bottom, right bottom; }
        .lane-header .lane-name:focus-visible { outline: none; text-decoration: underline dotted var(--compost-timeline-select); text-underline-offset: 3px; }
        .lane-drop-line { position: absolute; left: 0; right: 0; z-index: 8; display: none; height: 1px; background: var(--compost-timeline-select); pointer-events: none; }
        .lane-resize { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; z-index: 6; cursor: row-resize; touch-action: none; }
        .lane-resize:hover::after, .lane-resize:active::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--compost-timeline-select); }
        .automation-header { box-sizing: border-box; height: var(--compost-timeline-automation-row-height); display: flex; align-items: center; gap: .3em; padding: 0 .6em 0 1.5em; border-top: 1px solid color-mix(in srgb, var(--compost-timeline-line) 50%, transparent); color: var(--compost-timeline-muted); font-size: .82em; }
        .automation-chooser { appearance: none; min-width: 0; max-width: 16em; display: inline-flex; align-items: center; gap: .35em; overflow: hidden; border: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
        .automation-chooser-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .automation-chooser::after { content: ""; flex: none; width: 0; height: 0; border-left: 3px solid transparent; border-right: 3px solid transparent; border-top: 4px solid currentColor; transform: translateY(1px); }
        .automation-chooser:hover, .automation-chooser:focus-visible, .automation-chooser[aria-expanded="true"] { color: var(--compost-timeline-select); }
        .automation-chooser:focus-visible, .automation-header button:focus-visible { outline: 1px solid var(--compost-timeline-select); outline-offset: 2px; }
        .automation-header-buttons { display: inline-flex; align-items: center; gap: .08em; }
        .automation-header-button { appearance: none; width: 1.25em; height: 1.25em; border: 0; padding: 0; background: none; color: inherit; font: inherit; line-height: 1; cursor: pointer; }
        .automation-header-button:hover, .automation-header-button:focus-visible { color: var(--compost-timeline-select); }
        .automation-header-value { margin-left: auto; color: var(--compost-timeline-value); font: .86em/1 var(--compost-timeline-numeral-font); }
        .automation-draw-hint { position: absolute; display: none; top: 50%; right: .6em; transform: translateY(-50%); margin: 0; color: var(--compost-timeline-muted); font: .78em/1 var(--compost-timeline-numeral-font); opacity: .8; pointer-events: none; }
        .lanes-wrap { position: relative; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; touch-action: none; }
        .lanes-wrap::-webkit-scrollbar { display: none; }
        .lanes-world { position: relative; min-height: 100%; }
        .time-selection-world { position: absolute; inset: 0 auto auto 0; z-index: 3; pointer-events: none; }
        .time-selection { position: absolute; background: color-mix(in srgb, var(--compost-timeline-select) 10%, transparent); box-shadow: inset 1px 0 0 var(--compost-timeline-select), inset -1px 0 0 var(--compost-timeline-select); pointer-events: none; }
        .grid-world { position: absolute; inset: 0 auto auto 0; z-index: 1; pointer-events: none; }
        .grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-timeline-line); opacity: .5; }
        .grid-line.bar { background: var(--compost-timeline-bar-line); opacity: 1; }
        .lane { position: relative; box-sizing: border-box; height: auto; border-bottom: 1px solid var(--compost-timeline-line); background: var(--compost-timeline-lane); }
        .lane[data-drop-target] { box-shadow: inset 0 0 0 1px var(--compost-timeline-select); }
        .lane[data-dimmed] .clip { opacity: .4; }
        .lane-base { position: relative; box-sizing: border-box; height: var(--lane-row-height, var(--compost-timeline-row-height)); }
        .lane-envelope-overlay { position: absolute; inset: 0 auto auto 0; z-index: 4; overflow: visible; pointer-events: none; }
        .lane-envelope-line { fill: none; stroke: var(--lane-color, var(--compost-timeline-text)); stroke-width: 1; opacity: .3; vector-effect: non-scaling-stroke; }
        .automation-row { position: relative; box-sizing: border-box; height: var(--compost-timeline-automation-row-height); overflow: visible; border-top: 1px solid color-mix(in srgb, var(--compost-timeline-line) 50%, transparent); background: var(--compost-timeline-lane); touch-action: none; }
        .automation-editor { width: 100%; height: 100%; min-height: 0; border: 0; overflow: visible; --compost-envelope-bg: transparent; --compost-envelope-line: transparent; --compost-envelope-signal: var(--lane-color, var(--compost-timeline-text)); --compost-envelope-point-bg: var(--compost-envelope-signal); --compost-envelope-point-border: var(--compost-timeline-bg); --compost-envelope-preview: var(--compost-timeline-over); --compost-envelope-grid-size: 100000px 100000px; }
        .automation-row[data-state="overridden"] .automation-editor { --compost-envelope-signal: var(--compost-timeline-muted); }
        .automation-row[data-state="overridden"] .automation-editor::part(line) { stroke-dasharray: 3 3; }
        .automation-row[data-state="recording"] .automation-editor { --compost-envelope-signal: var(--compost-timeline-over); }
        .automation-row[data-state="playing"] .automation-editor { --compost-envelope-signal: var(--compost-timeline-signal-hi); }
        .automation-row[data-draw]:hover .automation-draw-hint { display: block; }
        .clip { position: absolute; top: 4px; bottom: 4px; z-index: 2; box-sizing: border-box; min-width: 1px; overflow: hidden; border: 0; border-radius: var(--compost-timeline-clip-radius); background: var(--compost-timeline-clip-bg); box-shadow: var(--compost-timeline-clip-border); color: var(--clip-color, var(--compost-timeline-clip-text)); cursor: grab; touch-action: none; }
        .clip::before, .clip::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; border: 1px solid transparent; }
        .clip[data-selected] { z-index: 3; outline: var(--compost-timeline-selected-outline); outline-offset: -2px; }
        .clip[data-selected]::before, .clip[data-selected]::after { opacity: var(--compost-timeline-selection-corners); background-repeat: no-repeat; background-size: 6px 1px, 1px 6px, 6px 1px, 1px 6px; }
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
        .clip[data-state="playing"] .clip-notes, .clip[data-state="recording"] .clip-notes { opacity: 1; }
        .clip[data-dragging] { opacity: .35 !important; }
        .clip-name { position: relative; z-index: 2; display: block; padding: 3px 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--compost-timeline-clip-font-size); color: var(--clip-color, var(--compost-timeline-clip-text)); }
        .clip-notes { position: absolute; inset: 0; opacity: 1; pointer-events: none; }
        .clip-preview { position: absolute; inset: 0; display: block; pointer-events: none; }
        .clip-preview::slotted(*) { display: block; width: 100%; height: 100%; pointer-events: none; }
        .clip-note { position: absolute; bottom: 4px; height: 2px; min-width: 2px; background: currentColor; }
        .clip-extent { position: absolute; inset: auto 0 0 0; height: 1px; background: currentColor; opacity: .35; pointer-events: none; }
        .clip-extent::before { content: ""; position: absolute; left: 0; bottom: 0; width: 1px; height: 1000%; background: currentColor; }
        .clip-progress { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--compost-timeline-wash); filter: brightness(1.5); pointer-events: none; }
        /* a loop point: a thin line the height of the clip and a small cap at the top, in the clip's colour */
        .clip-loop-line { position: absolute; top: 0; bottom: 0; width: 1px; background: currentColor; opacity: .6; pointer-events: none; }
        .clip-loop-line::before { content: ""; position: absolute; top: 0; left: -3px; border-left: 3.5px solid transparent; border-right: 3.5px solid transparent; border-top: 4px solid currentColor; }
        .clip-editor { position: relative; z-index: 4; width: calc(100% - 5px); margin: 2px; border: 0; outline: 1px solid var(--compost-timeline-select); background: var(--compost-timeline-bg); color: var(--compost-timeline-text); font: inherit; font-size: .78em; }
        .announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        @keyframes compost-timeline-breath { 50% { opacity: .3; } }
        @media (prefers-reduced-motion: reduce) { .clip { transition: none; } .clip[data-state="queued"] .clip-name, .lane-session[data-state="queued"] .lane-session-name { animation: none; } }
      </style>
      <div class="frame" part="frame">
        <div class="corner" part="corner"></div>
        <div class="ruler-wrap" part="ruler" role="group" tabindex="0" aria-label="Timeline ruler">
          <div class="ruler"><div class="ruler-world"></div><div class="ruler-time-selection" part="time-selection"></div><div class="ruler-band" part="loop"></div><div class="ruler-handle start" part="loop-handle loop-start"></div><div class="ruler-handle end" part="loop-handle loop-end"></div><div class="ruler-playhead" part="playhead"></div></div>
        </div>
        <div class="header-wrap" part="headers"><div class="headers" role="list"></div><div class="lane-drop-line"></div></div>
        <div class="lanes-wrap" part="lanes"><div class="lanes-world" role="list"></div><div class="playhead" part="playhead"></div></div>
      </div>
      <div class="announce" aria-live="polite"></div>`;

    /** @param {string} selector @returns {HTMLElement} */
    const part = (selector) => /** @type {HTMLElement} */ (this.root.querySelector(selector));
    this.frame = part('.frame');
    this.rulerWrap = part('.ruler-wrap');
    this.ruler = part('.ruler');
    this.rulerWorld = part('.ruler-world');
    this.rulerTimeSelection = part('.ruler-time-selection');
    this.rulerBand = part('.ruler-band');
    this.rulerStart = part('.ruler-handle.start');
    this.rulerEnd = part('.ruler-handle.end');
    this.rulerPlayhead = part('.ruler-playhead');
    this.headerWrap = part('.header-wrap');
    this.headers = part('.headers');
    this.laneDropLine = part('.lane-drop-line');
    this.lanesWrap = part('.lanes-wrap');
    this.lanesWorld = part('.lanes-world');
    this.playheadElement = part('.playhead');
    this.announce = part('.announce');

    this.addEventListener('pointerdown', (event) => this.startPointer(event));
    this.addEventListener('pointermove', (event) => this.movePointer(event));
    this.addEventListener('pointerup', (event) => this.endPointer(event));
    this.addEventListener('pointercancel', (event) => this.cancelPointer(event));
    this.addEventListener('dblclick', (event) => {
      if (event.__compostTimelineHandled) return;
      event.__compostTimelineHandled = true;
      this.handleDoubleClick(event);
    });
    installTouchDoubleClick(this);
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
      node.addEventListener('pointercancel', (event) => this.cancelLoopDrag(event));
    }
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.render()) : null;
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.setAttribute('role', 'region');
    this.syncAttributes();
    this.render();
    this.resizeObserver?.observe(this);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.cancelActiveDrag({ clearPointers: true });
    this.longPress.cancel();
    clearTimeout(this.viewChangeTimer);
    this.viewChangeTimer = null;
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
    this.draw = this.hasAttribute('draw');
    const style = getComputedStyle(this);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const rawLaneHeight = style.getPropertyValue('--compost-timeline-lane-height').trim();
    const parsedLaneHeight = Number.parseFloat(rawLaneHeight);
    const cssLaneHeight = rawLaneHeight.endsWith('em') ? parsedLaneHeight * fontSize
      : rawLaneHeight.endsWith('rem') ? parsedLaneHeight * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
        : parsedLaneHeight;
    const defaultLaneHeight = fontSize * DEFAULT_LANE_HEIGHT_EM;
    this.laneHeight = Math.max(24, this.hasAttribute('lane-height')
      ? numberAttr(this, 'lane-height', this.laneHeight)
      : (Number.isFinite(cssLaneHeight) ? cssLaneHeight : defaultLaneHeight));
    const rawThinHeight = style.getPropertyValue('--compost-timeline-thin-lane-height').trim();
    const parsedThinHeight = Number.parseFloat(rawThinHeight);
    const cssThinHeight = rawThinHeight.endsWith('em') ? parsedThinHeight * fontSize
      : rawThinHeight.endsWith('rem') ? parsedThinHeight * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
        : parsedThinHeight;
    this.thinLaneHeight = Math.max(24, Number.isFinite(cssThinHeight)
      ? cssThinHeight : fontSize * DEFAULT_THIN_LANE_HEIGHT_EM);
    const rawAutomationHeight = style.getPropertyValue('--compost-timeline-automation-row-height').trim();
    const parsedAutomationHeight = Number.parseFloat(rawAutomationHeight);
    const cssAutomationHeight = rawAutomationHeight.endsWith('em') ? parsedAutomationHeight * fontSize
      : rawAutomationHeight.endsWith('rem') ? parsedAutomationHeight * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
        : parsedAutomationHeight;
    this.automationRowHeight = Math.max(20, Number.isFinite(cssAutomationHeight) ? cssAutomationHeight : fontSize * DEFAULT_AUTOMATION_ROW_HEIGHT_EM);
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
      envelope: lane.envelope && typeof lane.envelope === 'object' ? { ...lane.envelope, points: Array.isArray(lane.envelope.points) ? lane.envelope.points.map((point) => ({ ...point })) : [] } : lane.envelope,
      automation: cloneAutomation(lane.automation),
      clips: lane.clips.map((clip) => ({ ...clip, notes: clip.notes?.map((note) => ({ ...note })) })),
    }));
  }

  /** Replace all lanes and clips; this never emits a model intent. */
  /** @param {TimelineLane[]} lanes */
  setLanes(lanes) {
    this._lanes = Array.isArray(lanes) ? lanes.map((lane) => ({
      ...lane,
      compact: Boolean(lane.compact),
      picked: Boolean(lane.picked),
      dimmed: Boolean(lane.dimmed),
      envelope: lane.envelope && typeof lane.envelope === 'object' ? { ...lane.envelope, points: Array.isArray(lane.envelope.points) ? lane.envelope.points.map((point) => ({ ...point })) : [] } : lane.envelope,
      automation: cloneAutomation(lane.automation),
      clips: Array.isArray(lane.clips) ? lane.clips.map((clip) => ({ ...clip, notes: clip.notes?.map((note) => ({ ...note })) })) : [],
    })) : [];
    const ids = new Set(this._lanes.flatMap((lane) => lane.clips.map((clip) => clip.id)));
    for (const [id, preview] of this._clipPreviews) {
      if (ids.has(id)) continue;
      if (preview.parentElement === this) preview.remove();
      this._clipPreviews.delete(id);
    }
    this._selected = this._selected.filter((id) => ids.has(id));
    if (this._timeSelection) {
      this._timeSelection.laneIds = this._timeSelection.laneIds.filter((id) => this._lanes.some((lane) => lane.id === id));
      if (!this._timeSelection.laneIds.length) this._timeSelection = null;
    }
    if (this.focusedClip && !ids.has(this.focusedClip)) this.focusedClip = null;
    this.render();
  }

  /** Attach caller-owned lane headers through native slots. Compost owns the
   * aligned wrapper; the caller owns every control and policy inside it.
   * @param {Map<string, HTMLElement>|Record<string, HTMLElement>} headers */
  setLaneHeaders(headers) {
    const entries = headers instanceof Map ? [...headers.entries()] : Object.entries(headers || {});
    const next = new Map(entries.filter(([laneId, element]) => String(laneId) && element instanceof HTMLElement)
      .map(([laneId, element]) => [String(laneId), element]));
    for (const [laneId, element] of this._laneHeaders) {
      if (next.get(laneId) !== element && element.parentElement === this) element.remove();
    }
    this._laneHeaders = next;
    for (const [laneId, element] of next) this.attachLaneHeader(laneId, element);
    this.render();
  }

  /** Replace one caller-owned lane header. Passing null restores the generic fallback.
   * @param {string} laneId @param {HTMLElement|null} element */
  setLaneHeader(laneId, element) {
    const id = String(laneId);
    const previous = this._laneHeaders.get(id);
    if (previous?.parentElement === this) previous.remove();
    if (element instanceof HTMLElement) {
      this._laneHeaders.set(id, element);
      this.attachLaneHeader(id, element);
    } else this._laneHeaders.delete(id);
    this.render();
  }

  /** @param {string} laneId @param {HTMLElement} element */
  attachLaneHeader(laneId, element) {
    element.slot = `lane-header-${encodeURIComponent(laneId)}`;
    element.dataset.timelineLaneId = laneId;
    if (element.parentElement !== this) this.append(element);
  }

  /** Attach caller-owned clip preview content through a native slot. Passing
   * null restores the built-in structured-note preview.
   * @param {string} clipId @param {HTMLElement|null} element */
  setClipPreview(clipId, element) {
    const id = String(clipId);
    const previous = this._clipPreviews.get(id);
    if (previous?.parentElement === this) previous.remove();
    if (element instanceof HTMLElement) {
      element.slot = `clip-preview-${encodeURIComponent(id)}`;
      element.dataset.timelineClipId = id;
      this._clipPreviews.set(id, element);
      if (element.parentElement !== this) this.append(element);
    } else this._clipPreviews.delete(id);
    const found = this.findClip(id);
    if (found) {
      const clip = this.lanesWorld.querySelector(`.clip[data-id="${CSS.escape(id)}"]`);
      if (clip instanceof HTMLElement) this.paintClipContent(clip, found.clip);
    }
  }

  get locators() {
    return this._locators.map((locator) => ({ ...locator }));
  }

  /** Replace the ruler locators; the host remains the source of truth. */
  /** @param {TimelineLocator[]} locators */
  setLocators(locators) {
    this._locators = sortLocators(locators);
    if (this.renamingLocator && !this._locators.some((locator) => locator.id === this.renamingLocator)) this.renamingLocator = null;
    this.render();
  }

  get timeSelection() {
    return this._timeSelection ? { ...this._timeSelection, laneIds: [...this._timeSelection.laneIds] } : null;
  }

  /** Restore or clear the host-owned cross-lane time selection. */
  /** @param {number|null} start @param {number|null} end @param {string[]} [laneIds] */
  setTimeSelection(start, end, laneIds) {
    const ids = laneIds === undefined ? this._lanes.map((lane) => lane.id) : laneIds;
    this._timeSelection = normalizeTimeSelection(start, end, ids, this.worldEnd());
    this.paintTimeSelection();
  }

  /** Synchronise a host-owned automation chooser menu's expanded state. */
  /** @param {string} laneId @param {string} automationId @param {boolean} open */
  setAutomationChooserOpen(laneId, automationId, open) {
    const key = `${String(laneId)}\u0000${String(automationId)}`;
    this.automationChooserKey = open ? key : null;
    for (const chooser of this.headers.querySelectorAll('.automation-chooser')) {
      const isOpen = Boolean(open
        && chooser.dataset.laneId === String(laneId)
        && chooser.dataset.automationId === String(automationId));
      chooser.setAttribute('aria-expanded', String(isOpen));
    }
  }

  /** Replace one lane's clips without changing the lane order. */
  /** @param {string} laneId @param {TimelineClip[]} clips */
  setLaneClips(laneId, clips) {
    const lane = this._lanes.find((entry) => entry.id === laneId);
    if (!lane) return;
    lane.clips = Array.isArray(clips) ? clips.map((clip) => ({ ...clip })) : [];
    this.render();
  }

  /** Update generic lane emphasis without rebuilding its clips. */
  /** @param {string} laneId @param {boolean} dimmed */
  setLaneDimmed(laneId, dimmed) {
    const lane = this._lanes.find((entry) => entry.id === laneId);
    if (!lane) return;
    lane.dimmed = Boolean(dimmed);
    const body = this.lanesWorld.querySelector(`.lane[data-lane-id="${CSS.escape(laneId)}"]`);
    body?.toggleAttribute('data-dimmed', lane.dimmed);
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
    const laneHeight = this.laneHeightFor(lane);
    if (header instanceof HTMLElement) header.style.height = `${laneHeight}px`;
    if (row instanceof HTMLElement) row.style.height = `${laneHeight}px`;
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
    this.paintTimeSelection();
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

  /** @param {TimelineLane} lane */
  automationFor(lane) {
    return this.automation && Array.isArray(lane?.automation) ? lane.automation : [];
  }

  /** @param {TimelineLane} lane */
  laneRowHeightFor(lane) {
    const custom = Number(lane?.height);
    if (Number.isFinite(custom) && custom > 0) return Math.max(24, custom);
    return lane?.compact ? this.thinLaneHeight : this.laneHeight;
  }

  /** @param {TimelineLane} lane */
  laneHeightFor(lane) {
    return this.laneRowHeightFor(lane) + this.automationFor(lane).length * this.automationRowHeight;
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

  /** Return the nearest lane when a cross-lane drag leaves the visible stack. */
  /** @param {number} clientY */
  laneAtOrNearestPoint(clientY) {
    if (!this._lanes.length) return null;
    const rect = this.lanesWrap.getBoundingClientRect();
    const y = Number(clientY) - rect.top + this.lanesWrap.scrollTop;
    if (y <= 0) return this._lanes[0].id;
    let offset = 0;
    for (const lane of this._lanes) {
      const height = this.laneHeightFor(lane);
      if (y < offset + height) return lane.id;
      offset += height;
    }
    return this._lanes.at(-1).id;
  }

  /** Readonly renders and navigates but emits no mutating intent (README, Events). */
  get readonly() { return this.hasAttribute('readonly'); }

  beginRename(clipId) {
    if (this.hasAttribute('disabled') || this.readonly || !this.findClip(clipId)) return;
    this.renaming = String(clipId);
    this.render();
  }

  beginLaneRename(laneId) {
    const id = String(laneId);
    if (this.hasAttribute('disabled') || this.readonly || !this._lanes.some((lane) => lane.id === id)) return;
    this.renamingLane = id;
    this.focusedLane = id;
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
    this.lanesWrap.scrollTop = clamp(Math.ceil(this.lanesWrap.scrollTop + delta), 0, maximum);
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

  laneHeaderFromEvent(event) {
    const header = pathElement(event, 'lane-header');
    if (!(header instanceof HTMLElement)) return null;
    const lane = this._lanes.find((entry) => entry.id === header.dataset.laneId);
    return lane ? { header, lane } : null;
  }

  locatorFromEvent(event) {
    const element = pathElement(event, 'ruler-locator');
    if (!(element instanceof HTMLElement)) return null;
    const locator = this._locators.find((entry) => entry.id === element.dataset.locatorId);
    return locator ? { element, locator } : null;
  }

  rulerRowAtPoint(clientY) {
    const rect = this.rulerWrap.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(this).fontSize) || 16;
    const y = Number(clientY) - rect.top;
    if (y < fontSize) return 1;
    if (y < fontSize * 2.35) return 2;
    return 3;
  }

  laneIdsForSpan(startLaneId, endLaneId) {
    const first = this._lanes.findIndex((lane) => lane.id === startLaneId);
    const last = this._lanes.findIndex((lane) => lane.id === endLaneId);
    if (first < 0) return [];
    const end = last < 0 ? first : last;
    const low = Math.min(first, end);
    const high = Math.max(first, end);
    return this._lanes.slice(low, high + 1).map((lane) => lane.id);
  }

  clipsInsideTimeSelection(selection) {
    if (!selection) return [];
    const laneIds = new Set(selection.laneIds);
    return this._lanes.flatMap((lane) => {
      if (!laneIds.has(lane.id)) return [];
      return lane.clips.filter((clip) => {
        const start = Number(clip.start) || 0;
        const end = start + (Number(clip.length) || 0);
        return start >= selection.start - MIN_CLIP_LENGTH && end <= selection.end + MIN_CLIP_LENGTH;
      }).map((clip) => clip.id);
    });
  }

  /** Paint the time selection; a gesture passes its preview instead of the host's. */
  /** @param {TimelineTimeSelection|null} [selection] */
  paintTimeSelection(selection = this._timeSelection) {
    if (!(this.rulerTimeSelection instanceof HTMLElement)) return;
    for (const old of this.lanesWorld.querySelectorAll('.time-selection-world')) old.remove();
    for (const row of this.lanesWorld.querySelectorAll('.automation-row')) {
      const editor = row.querySelector('compost-envelope-editor');
      if (!editor) continue;
      if (selection?.laneIds.includes(String(row.dataset.laneId))) editor.setSelection(selection.start, selection.end);
      else editor.setSelection(undefined, undefined);
    }
    if (!selection) {
      this.rulerTimeSelection.style.display = 'none';
      this.timeSelectionWorld = null;
      return;
    }
    const left = (selection.start - this._scrollBeat) * this._pxPerBeat;
    const width = Math.max(1, (selection.end - selection.start) * this._pxPerBeat);
    this.rulerTimeSelection.style.left = `${left}px`;
    this.rulerTimeSelection.style.width = `${width}px`;
    this.rulerTimeSelection.style.display = 'block';
    const world = document.createElement('div');
    world.className = 'time-selection-world';
    world.style.width = `${this.lanesWorld.clientWidth || this.worldEnd() * this._pxPerBeat}px`;
    world.style.height = `${this.totalLaneHeight()}px`;
    const ids = new Set(selection.laneIds);
    let top = 0;
    for (const lane of this._lanes) {
      const height = this.laneHeightFor(lane);
      if (ids.has(lane.id)) {
        const overlay = document.createElement('div');
        overlay.className = 'time-selection';
        overlay.part.add('time-selection');
        overlay.dataset.laneId = lane.id;
        overlay.style.left = `${selection.start * this._pxPerBeat}px`;
        overlay.style.top = `${top}px`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
        world.append(overlay);
      }
      top += height;
    }
    this.lanesWorld.append(world);
    this.timeSelectionWorld = world;
  }

  laneIndexFromHeaderPoint(clientY) {
    const headers = [...this.headers.querySelectorAll('.lane-header')];
    const hit = headers.find((header) => {
      const rect = header.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!hit) return clientY < (headers[0]?.getBoundingClientRect().top ?? 0) ? 0 : this._lanes.length;
    const index = this._lanes.findIndex((lane) => lane.id === hit.dataset.laneId);
    const rect = hit.getBoundingClientRect();
    return index + (clientY > rect.top + rect.height / 2 ? 1 : 0);
  }

  paintLaneDropLine(toIndex) {
    if (!(this.laneDropLine instanceof HTMLElement)) return;
    const headers = [...this.headers.querySelectorAll('.lane-header')];
    const target = headers[Math.max(0, Math.min(headers.length - 1, toIndex))];
    // the line is absolutely positioned in the header-wrap, whose top stays put
    // while the headers themselves translate with the lane scroll
    const wrapRect = this.headerWrap.getBoundingClientRect();
    let top = 0;
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      top = (toIndex >= headers.length ? rect.bottom : rect.top) - wrapRect.top;
    } else if (headers.length) {
      const rect = headers.at(-1).getBoundingClientRect();
      top = rect.bottom - wrapRect.top;
    }
    this.laneDropLine.style.top = `${top}px`;
    this.laneDropLine.style.display = 'block';
  }

  clearLaneDropLine() {
    if (this.laneDropLine instanceof HTMLElement) this.laneDropLine.style.display = 'none';
  }

  worldEnd() {
    const last = this._lanes.reduce((end, lane) => {
      const clipEnd = lane.clips.reduce((clipMax, clip) => Math.max(clipMax, (Number(clip.start) || 0) + (Number(clip.length) || 0)), 0);
      const automationEnd = this.automationFor(lane).reduce((automationMax, automation) => automation.points?.reduce(
        (pointMax, point) => Math.max(pointMax, Number(point.beat) || 0), automationMax) || automationMax, 0);
      const envelopeEnd = lane.envelope?.points?.reduce((pointMax, point) => Math.max(pointMax, Number(point.beat) || 0), 0) || 0;
      return Math.max(end, clipEnd, automationEnd, envelopeEnd);
    }, 0);
    const locatorEnd = this._locators.at(-1)?.beat || 0;
    const visible = this._scrollBeat + Math.max(16, (this.lanesWrap.clientWidth || 320) / this._pxPerBeat);
    return Math.max(16, last, locatorEnd, this._loopEnd, visible);
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
    this.paintTimeSelection();
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
      line.part.add('grid-line', inBar ? 'bar-line' : 'beat-line');
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
      label.part.add('ruler-label');
      label.dataset.bar = '';
      label.style.left = `${beat * this._pxPerBeat}px`;
      label.textContent = text;
      fragment.append(label);
    }
    this.rulerWorld.append(fragment);
    this.renderLocators();
  }

  renderLocators() {
    for (const locator of this._locators) {
      const element = document.createElement('span');
      element.className = 'ruler-locator';
      element.part.add('locator');
      element.dataset.locatorId = locator.id;
      element.style.left = `${locator.beat * this._pxPerBeat}px`;
      element.setAttribute('role', 'button');
      element.tabIndex = 0;
      element.setAttribute('aria-label', `${locator.name || locator.id} locator at beat ${locator.beat}`);
      if (this.renamingLocator === locator.id) {
        const input = document.createElement('input');
        input.className = 'ruler-locator-editor';
        input.value = locator.name;
        input.setAttribute('aria-label', `Rename ${locator.name || locator.id}`);
        const finish = (commit) => {
          if (this.renamingLocator !== locator.id) return;
          this.renamingLocator = null;
          const name = input.value.trim();
          this.render();
          if (commit && name && name !== locator.name) this.dispatchEvent(eventOf('locator-rename', { id: locator.id, name }));
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
        name.className = 'ruler-locator-name';
        name.textContent = locator.name;
        element.append(name);
      }
      this.rulerWorld.append(element);
    }
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
    const chooser = document.createElement('button');
    chooser.type = 'button';
    chooser.className = 'automation-chooser';
    chooser.dataset.laneId = lane.id;
    chooser.dataset.automationId = automation.id;
    chooser.setAttribute('aria-haspopup', 'menu');
    chooser.setAttribute('aria-expanded', String(this.automationChooserKey === `${String(lane.id)}\u0000${String(automation.id)}`));
    chooser.setAttribute('aria-label', `Choose automation for ${lane.name || lane.id}`);
    const label = document.createElement('span');
    label.className = 'automation-chooser-label automation-header-label';
    label.textContent = automation.label || automation.id;
    chooser.append(label);
    chooser.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dispatchEvent(eventOf('automation-choose', {
        laneId: lane.id,
        automationId: automation.id,
        clientX: event.clientX,
        clientY: event.clientY,
      }));
    });
    chooser.addEventListener('pointerdown', (event) => event.stopPropagation());
    const buttons = document.createElement('span');
    buttons.className = 'automation-header-buttons';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'automation-header-button automation-add';
    add.textContent = '+';
    add.title = 'Add automation';
    add.setAttribute('aria-label', `Add automation to ${lane.name || lane.id}`);
    add.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.readonly) return;
      this.dispatchEvent(eventOf('automation-add', { laneId: lane.id, clientX: event.clientX, clientY: event.clientY }));
    });
    add.addEventListener('pointerdown', (event) => event.stopPropagation());
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'automation-header-button automation-remove';
    remove.textContent = '−';
    remove.title = 'Remove automation';
    remove.setAttribute('aria-label', `Remove ${automation.label || automation.id} automation from ${lane.name || lane.id}`);
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.readonly) return;
      this.dispatchEvent(eventOf('automation-remove', { laneId: lane.id, automationId: automation.id }));
    });
    remove.addEventListener('pointerdown', (event) => event.stopPropagation());
    buttons.append(add, remove);
    header.append(chooser, buttons);
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
    header.toggleAttribute('data-compact', Boolean(lane.compact));
    header.part.add('lane-header');
    header.setAttribute('role', 'listitem');
    header.tabIndex = -1;
    header.style.setProperty('--lane-color', lane.color || 'var(--compost-timeline-text)');
    header.style.setProperty('--lane-row-height', `${this.laneRowHeightFor(lane)}px`);
    header.style.height = `${this.laneHeightFor(lane)}px`;

    if (this._laneHeaders.has(lane.id)) {
      const slot = document.createElement('slot');
      slot.className = 'lane-header-content';
      slot.name = `lane-header-${encodeURIComponent(lane.id)}`;
      header.append(slot);
      for (const automation of this.automationFor(lane)) header.append(this.renderAutomationHeader(lane, automation));
      header.append(this.renderLaneResizeHandle(lane));
      return header;
    }

    const main = document.createElement('div');
    main.className = 'lane-header-content lane-header-fallback';
    main.part.add('lane-header-fallback');
    main.append(this.renderLaneName(lane));
    header.append(main);
    for (const automation of this.automationFor(lane)) header.append(this.renderAutomationHeader(lane, automation));
    header.append(this.renderLaneResizeHandle(lane));
    return header;
  }

  /** A grab edge along the header's bottom border: drag sets the lane's own row
   * height (lane.height), double-click clears it back to the shared default.
   * @param {TimelineLane} lane */
  renderLaneResizeHandle(lane) {
    const handle = document.createElement('div');
    handle.className = 'lane-resize';
    handle.part.add('lane-resize');
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', `Resize ${lane.name || lane.id}`);
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-valuemin', '24');
    handle.setAttribute('aria-valuemax', '400');
    handle.title = 'Drag or use Arrow keys to resize; double-click or Home resets';
    /** @type {{pointerId:number,startY:number,startHeight:number,startCustomHeight:number|null}|null} */ let drag = null;
    const apply = (/** @type {number|undefined} */ height) => {
      if (height === undefined) delete lane.height;
      else lane.height = height;
      handle.setAttribute('aria-valuenow', String(this.laneRowHeightFor(lane)));
      const header = handle.closest('.lane-header');
      const row = this.lanesWorld.querySelector(`.lane[data-lane-id="${CSS.escape(lane.id)}"]`);
      for (const element of [header, row]) {
        if (!(element instanceof HTMLElement)) continue;
        element.style.setProperty('--lane-row-height', `${this.laneRowHeightFor(lane)}px`);
        element.style.height = `${this.laneHeightFor(lane)}px`;
      }
      this.lanesWorld.style.minHeight = `${this.totalLaneHeight()}px`;
      const grid = this.lanesWorld.querySelector('.grid-world');
      if (grid instanceof HTMLElement) grid.style.height = `${this.totalLaneHeight()}px`;
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const customHeight = Number(lane.height);
      drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: this.laneRowHeightFor(lane),
        startCustomHeight: Number.isFinite(customHeight) && customHeight > 0 ? customHeight : null };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      apply(clamp(drag.startHeight + event.clientY - drag.startY, 24, 400));
    });
    const end = (/** @type {PointerEvent} */ event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const finished = drag;
      drag = null;
      if (event.type === 'pointercancel') { apply(finished.startCustomHeight ?? undefined); return; }
      if (this.laneRowHeightFor(lane) !== finished.startHeight) {
        this.dispatchEvent(eventOf('lane-resize', { laneId: lane.id, height: this.laneRowHeightFor(lane) }));
        this.render();
      }
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      apply(undefined);
      this.dispatchEvent(eventOf('lane-resize', { laneId: lane.id, height: null }));
      this.render();
    });
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'Home') {
        event.preventDefault();
        apply(undefined);
        this.dispatchEvent(eventOf('lane-resize', { laneId: lane.id, height: null }));
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      apply(clamp(this.laneRowHeightFor(lane) + direction * (event.shiftKey ? 16 : 4), 24, 400));
      this.dispatchEvent(eventOf('lane-resize', { laneId: lane.id, height: this.laneRowHeightFor(lane) }));
    });
    apply(lane.height);
    return handle;
  }

  /** @param {TimelineLane} lane */
  renderLaneName(lane) {
    if (this.renamingLane === lane.id) {
      const input = document.createElement('input');
      input.className = 'lane-name-editor';
      input.value = lane.name || '';
      input.setAttribute('aria-label', `Rename ${lane.name || lane.id}`);
      const finish = (commit) => {
        if (this.renamingLane !== lane.id) return;
        this.renamingLane = null;
        const name = input.value.trim();
        this.render();
        if (commit && name && name !== lane.name) this.dispatchEvent(eventOf('lane-rename', { laneId: lane.id, name }));
      };
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('pointerdown', (event) => event.stopPropagation());
      requestAnimationFrame(() => { input.focus(); input.select(); });
      return input;
    }
    const name = document.createElement('span');
    name.className = 'lane-name';
    name.part.add('lane-name');
    name.textContent = lane.name || lane.id;
    name.tabIndex = 0;
    name.toggleAttribute('data-picked', Boolean(lane.picked));
    name.setAttribute('role', 'button');
    name.setAttribute('aria-label', `${lane.name || lane.id} lane`);
    name.addEventListener('focus', () => { this.focusedLane = lane.id; this.focusedClip = null; });
    return name;
  }

  /** @param {TimelineLane} lane */
  renderLaneBase(lane, end = this.worldEnd()) {
    const base = document.createElement('div');
    base.className = 'lane-base';
    base.part.add('lane-content');
    if (!this.automation) {
      const overlay = this.renderEnvelopeOverlay(lane, end);
      if (overlay) base.append(overlay);
    }
    for (const clip of lane.clips) base.append(this.renderClip(clip, lane));
    return base;
  }

  /** @param {AutomationLaneView} automation @param {number} end */
  automationPath(automation, end, height = this.automationRowHeight) {
    const points = (Array.isArray(automation.points) ? automation.points : [])
      .filter((point) => Number.isFinite(Number(point.beat)) && Number.isFinite(Number(point.value)))
      .sort((a, b) => Number(a.beat) - Number(b.beat));
    if (!points.length) return '';
    const y = (point) => automationValueToY(point.value, automation.min, automation.max, height, automation.scale);
    const x = (point) => Math.max(0, Number(point.beat) || 0) * this._pxPerBeat;
    let path = `M 0 ${y(points[0])} H ${x(points[0])}`;
    for (let index = 1; index < points.length; index += 1) {
      if (automation.stepped) path += ` H ${x(points[index])} V ${y(points[index])}`;
      else {
        const before = points[index - 1];
        const after = points[index];
        if (automation.scale === 'gain' && after.value !== before.value) {
          const turns = parameterScaleBreakpoints({
            min: automation.min, max: automation.max, curve: 'gain',
          })
            .filter((value) => (value - before.value) * (value - after.value) < 0)
            .map((value) => ({
              beat: before.beat + (after.beat - before.beat) * (value - before.value) / (after.value - before.value),
              value,
            }))
            .sort((a, b) => a.beat - b.beat);
          for (const turn of turns) path += ` L ${x(turn)} ${y(turn)}`;
        }
        path += ` L ${x(after)} ${y(after)}`;
      }
    }
    path += ` H ${Math.max(x(points[points.length - 1]), end * this._pxPerBeat)}`;
    return path;
  }

  /** @param {TimelineLane} lane @param {number} end */
  renderEnvelopeOverlay(lane, end) {
    const envelope = lane.envelope;
    if (!envelope || !Array.isArray(envelope.points) || !envelope.points.length) return null;
    const height = this.laneRowHeightFor(lane);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('lane-envelope-overlay');
    svg.setAttribute('width', String(end * this._pxPerBeat));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${end * this._pxPerBeat} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.classList.add('lane-envelope-line');
    line.setAttribute('d', this.automationPath(envelope, end, height));
    svg.append(line);
    return svg;
  }

  /** @param {TimelineLane} lane @param {AutomationLaneView} automation @param {number} end */
  renderAutomationRow(lane, automation, end) {
    const row = document.createElement('div');
    row.className = 'automation-row';
    row.dataset.laneId = lane.id;
    row.dataset.automationId = automation.id;
    row.dataset.state = automation.state || 'idle';
    row.toggleAttribute('data-draw', this.draw);
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `${automation.label || automation.id} automation for ${lane.name || lane.id}`);
    row.addEventListener('focus', () => { this.focusedLane = lane.id; this.focusedClip = null; });
    row.style.setProperty('--lane-color', automation.color || lane.color || 'var(--compost-timeline-text)');

    const editor = document.createElement('compost-envelope-editor');
    editor.className = 'automation-editor';
    editor.setAttribute('label', `${automation.label || automation.id} automation for ${lane.name || lane.id}`);
    editor.setAttribute('duration', String(end));
    editor.setAttribute('min', String(automation.min));
    editor.setAttribute('max', String(automation.max));
    editor.setAttribute('grid', String(gridStep(this.beatsPerBar, this.grid)));
    editor.setAttribute('snap', this.snapMode);
    if (automation.scale === 'gain') editor.setAttribute('scale', 'gain');
    if (automation.stepped) editor.setAttribute('stepped', '');
    const valueStep = this.automationValueStep(automation);
    if (valueStep > 0) editor.setAttribute('step', String(valueStep));
    if (this.draw) editor.setAttribute('draw', '');
    if (this.hasAttribute('disabled')) editor.setAttribute('disabled', '');
    if (this.readonly) editor.setAttribute('readonly', '');
    editor.duration = end;
    editor.min = Number(automation.min);
    editor.max = Number(automation.max);
    editor.scale = automation.scale === 'gain' ? 'gain' : 'linear';
    editor.stepped = Boolean(automation.stepped);
    editor.step = valueStep;
    editor.snapMode = this.snapMode;
    editor.grid = gridStep(this.beatsPerBar, this.grid);
    editor.draw = this.draw;
    editor.points = (Array.isArray(automation.points) ? automation.points : []).map((point) => ({
      time: Number(point.beat),
      value: Number(point.value),
    }));
    const selection = this.automationSelectionFor(lane.id);
    editor.setSelection(selection?.start, selection?.end);
    editor.addEventListener('envelope-input', (event) => {
      event.stopPropagation();
      this.dispatchEvent(eventOf('automation-input', {
        laneId: lane.id,
        automationId: automation.id,
        points: event.detail.points.map((point) => ({ beat: point.time, value: point.value })),
      }));
    });
    editor.addEventListener('envelope-change', (event) => {
      event.stopPropagation();
      this.commitAutomationChange(lane, automation,
        event.detail.points.map((point) => ({ beat: point.time, value: point.value })));
    });
    editor.addEventListener('envelope-context', (event) => {
      event.stopPropagation();
      this.dispatchEvent(eventOf('automation-context', {
        laneId: lane.id,
        automationId: automation.id,
        pointIndex: event.detail.pointIndex,
        beat: event.detail.time,
        value: event.detail.value,
        clientX: event.detail.clientX,
        clientY: event.detail.clientY,
      }));
    });
    const hint = document.createElement('span');
    hint.className = 'automation-draw-hint';
    hint.textContent = `✎ draw · grid 1/${Math.max(1, Number(this.grid) || 1)}`;
    row.append(editor);
    row.append(hint);
    return row;
  }

  /** @param {TimelineLane} lane @param {number} end */
  renderLaneBody(lane, end) {
    const row = document.createElement('div');
    row.className = 'lane';
    row.part.add('lane');
    row.dataset.laneId = lane.id;
    row.toggleAttribute('data-compact', Boolean(lane.compact));
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', lane.name || lane.id);
    row.toggleAttribute('data-dimmed', Boolean(lane.dimmed));
    row.style.setProperty('--lane-color', lane.color || 'var(--compost-timeline-text)');
    row.style.setProperty('--lane-row-height', `${this.laneRowHeightFor(lane)}px`);
    row.style.height = `${this.laneHeightFor(lane)}px`;
    row.append(this.renderLaneBase(lane, end));
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
      progress.part.add('clip-progress');
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
      name.part.add('clip-name');
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
    for (const old of element.querySelectorAll('.clip-notes, .clip-preview, .clip-extent, .clip-loop-line')) old.remove();
    const anchor = element.querySelector('.clip-name, .clip-editor');
    const place = (node) => anchor ? element.insertBefore(node, anchor) : element.append(node);
    const duration = Math.max(MIN_CLIP_LENGTH, Number(clip.duration) || Number(clip.length) || 1);
    const length = Math.max(MIN_CLIP_LENGTH, Number(clip.length) || duration);
    const offset = ((Number(clip.offset) || 0) % duration + duration) % duration;
    if (this._clipPreviews.has(clip.id)) {
      const preview = document.createElement('slot');
      preview.className = 'clip-preview';
      preview.name = `clip-preview-${encodeURIComponent(clip.id)}`;
      preview.part.add('clip-preview');
      place(preview);
    } else {
      const notes = document.createElement('span');
      notes.className = 'clip-notes';
      notes.part.add('clip-preview');
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
          mark.part.add('clip-preview-mark');
          mark.style.opacity = String(clipNoteOpacity(note.velocity));
          mark.style.left = `${Math.max(0, Math.min(100, start / length * 100))}%`;
          mark.style.width = `${Math.max(2, Math.min(30, noteDuration / length * 100))}%`;
          mark.style.bottom = `${Math.max(2, Math.min(90, ((Number(note.note) || 0) / 127) * 90))}%`;
          notes.append(mark);
        }
      }
      place(notes);
    }
    const extent = document.createElement('span');
    extent.className = 'clip-extent';
    extent.part.add('clip-extent');
    place(extent);
    for (const line of loopPassLines(clip, this._pxPerBeat)) {
      const mark = document.createElement('span');
      mark.className = 'clip-loop-line';
      mark.part.add('clip-loop');
      mark.title = 'loop point';
      mark.style.left = `${(line / length) * 100}%`;
      place(mark);
    }
  }

  /** Mark the selected clips; a gesture passes its preview instead of the selection. */
  /** @param {string[]} [ids] */
  paintSelection(ids = this._selected) {
    for (const element of this.clipElements()) {
      if (ids.includes(element.dataset.id)) element.dataset.selected = '';
      else delete element.dataset.selected;
    }
  }

  /** Mark the lane under a clip drag without changing host state. */
  paintClipDropTarget(laneId) {
    for (const lane of this.lanesWorld.querySelectorAll('.lane[data-drop-target]')) lane.removeAttribute('data-drop-target');
    if (!laneId) return;
    const target = this.lanesWorld.querySelector(`.lane[data-lane-id="${CSS.escape(laneId)}"]`);
    target?.setAttribute('data-drop-target', '');
  }

  clearClipDragVisuals() {
    for (const clip of this.clipElements()) {
      clip.style.transform = '';
      clip.removeAttribute('data-dragging');
    }
    this.paintClipDropTarget(null);
  }

  paintScroll() {
    const offset = `${(-this._scrollBeat * this._pxPerBeat).toFixed(2)}px`;
    this.rulerWorld.style.transform = `translateX(${offset})`;
    this.lanesWorld.style.transform = `translateX(${offset})`;
    this.paintPlayhead();
    this.paintLoop();
    this.paintTimeSelection();
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

  /** Paint the loop brace; a gesture passes its preview instead of the host's loop. */
  paintLoop(start = this._loopStart, end = this._loopEnd, enabled = this._loopEnabled) {
    const left = (start - this._scrollBeat) * this._pxPerBeat;
    const width = Math.max(1, (end - start) * this._pxPerBeat);
    this.rulerBand.style.left = `${left}px`;
    this.rulerBand.style.width = `${width}px`;
    this.rulerBand.toggleAttribute('data-off', !enabled);
    this.rulerStart.style.left = `${left - 1}px`;
    this.rulerEnd.style.left = `${left + width - 5}px`;
    this.rulerStart.title = `Loop start, beat ${start}`;
    this.rulerEnd.title = `Loop end, beat ${end}`;
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
    return {
      row,
      lane,
      automation,
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
    const found = this.clipFromEvent(event);
    if (!found) return;
    const rect = found.element.getBoundingClientRect();
    const edge = event.pointerType === 'touch' ? TOUCH_TRIM_EDGE : MOUSE_TRIM_EDGE;
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

  automationValueStep(automation) {
    return effectiveAutomationStep(Boolean(automation?.stepped), automation?.step ?? automation?.valueStep);
  }

  /** The snap mode for one gesture: Cmd/Ctrl inverts whatever the host set. */
  /** @param {{metaKey?: boolean, ctrlKey?: boolean}} event */
  snapModeFor(event) {
    return snapModeWith(this.snapMode, Boolean(event?.metaKey || event?.ctrlKey));
  }

  automationSelectionFor(laneId) {
    const selection = this._timeSelection;
    return selection && selection.laneIds.includes(String(laneId)) ? selection : null;
  }

  startPointer(event) {
    if (this.hasAttribute('disabled') || event.button !== 0) return;
    if (event.pointerType === 'touch') {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2) {
        this.longPress.cancel();
        this.cancelActiveDrag();
        this.clearClipDragVisuals();
        this.startPinch();
        event.preventDefault();
        return;
      }
    }
    if (this.drag) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement
      && node.matches('button, input, select, textarea, [data-timeline-interactive]'))) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement
      && (node.classList.contains('automation-header-button') || node.classList.contains('automation-chooser')))) return;
    const loopPart = event.composedPath().find((node) => node instanceof HTMLElement
      && (node.classList.contains('ruler-band') || node.classList.contains('ruler-handle')));
    if (loopPart instanceof HTMLElement) return;
    const locator = this.locatorFromEvent(event);
    if (locator) {
      event.preventDefault();
      this.drag = {
        pointerId: event.pointerId, type: 'locator', locatorId: locator.locator.id,
        element: locator.element, startX: event.clientX, startY: event.clientY, startBeat: locator.locator.beat, moved: false,
      };
      if (event.isTrusted) locator.element.setPointerCapture?.(event.pointerId);
      return;
    }
    const onRuler = event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('ruler-wrap'));
    if (onRuler) {
      const row = this.rulerRowAtPoint(event.clientY);
      const beat = this.beatAtPoint(event.clientX);
      if (row === 1) {
        this.drag = { pointerId: event.pointerId, type: 'ruler-locator-row', startX: event.clientX, startY: event.clientY, startBeat: beat, moved: false };
        return;
      }
      if (row === 2) {
        this.drag = {
          pointerId: event.pointerId,
          type: event.metaKey || event.ctrlKey ? 'ruler-zoom' : 'ruler-scroll',
          startX: event.clientX,
          startY: event.clientY,
          startScrollBeat: this._scrollBeat,
          startPxPerBeat: this._pxPerBeat,
          anchorBeat: beat,
          moved: false,
        };
        if (event.isTrusted) this.rulerWrap.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    const header = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane-header'));
    if (header instanceof HTMLElement) {
      header.focus({ preventScroll: true });
      this.focusedLane = header.dataset.laneId || null;
      this.focusedClip = null;
      this.drag = { pointerId: event.pointerId, type: 'lane-header', laneId: header.dataset.laneId, startX: event.clientX, startY: event.clientY, moved: false, toIndex: this._lanes.findIndex((lane) => lane.id === header.dataset.laneId) };
      if (event.isTrusted) header.setPointerCapture?.(event.pointerId);
      this.longPress.start(() => {
        if (!this.drag || this.drag.type !== 'lane-header' || this.drag.moved) return;
        this.dispatchEvent(eventOf('lane-header-context', { laneId: header.dataset.laneId, clientX: event.clientX, clientY: event.clientY }));
        this.drag = null;
      });
      return;
    }
    const found = this.clipFromEvent(event);
    if (found) {
      event.preventDefault();
      const rect = found.element.getBoundingClientRect();
      const edge = event.pointerType === 'touch' ? TOUCH_TRIM_EDGE : MOUSE_TRIM_EDGE;
      const mode = this.readonly ? 'move'
        : event.clientX - rect.left <= edge ? 'trim-left'
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
      this.longPress.start(() => {
        if (!this.drag || this.drag.moved || this.drag.type !== 'move') return;
        this.dispatchEvent(eventOf('clip-context', { id: found.clip.id, clientX: event.clientX, clientY: event.clientY }));
        this.endPointer({ pointerId: event.pointerId });
      });
      return;
    }
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('ruler-wrap'))) {
      this.drag = { pointerId: event.pointerId, type: 'seek-ruler', startX: event.clientX, startY: event.clientY, moved: false };
      return;
    }
    const lane = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane'));
    if (lane instanceof HTMLElement) {
      if (this.draw) return;
      this.drag = {
        pointerId: event.pointerId, type: 'time-selection', laneId: lane.dataset.laneId,
        startX: event.clientX, startY: event.clientY, startBeat: this.beatAtPoint(event.clientX),
        startScrollBeat: this._scrollBeat, startScrollTop: this.lanesWrap.scrollTop,
        originSelection: this.timeSelection,
        originSelected: [...this._selected], moved: false,
      };
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
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_SLOP) drag.moved = true;
    if (drag.type === 'locator') {
      if (!drag.moved || this.readonly) return;
      const rawBeat = this.beatAtPoint(event.clientX);
      const beat = snapBeat(rawBeat, this.beatsPerBar, this.grid, this.snapModeFor(event));
      drag.previewBeat = Math.min(beat, this.worldEnd());
      drag.element.style.left = `${drag.previewBeat * this._pxPerBeat}px`;
      return;
    }
    if (drag.type === 'ruler-locator-row') return;
    if (drag.type === 'ruler-scroll') {
      if (!drag.moved) return;
      this.scrollBeat = Math.max(0, drag.startScrollBeat - dx / this._pxPerBeat);
      return;
    }
    if (drag.type === 'ruler-zoom') {
      if (!drag.moved) return;
      const rect = this.rulerWrap.getBoundingClientRect();
      const next = finiteClamp(drag.startPxPerBeat * Math.pow(1.01, dx), MIN_PX_PER_BEAT, MAX_PX_PER_BEAT);
      this._pxPerBeat = next;
      this._scrollBeat = Math.max(0, drag.anchorBeat - (event.clientX - rect.left) / next);
      this.render();
      this.scheduleViewChange();
      return;
    }
    if (drag.type === 'time-selection') {
      if (event.pointerType === 'touch' && drag.moved && Math.abs(dy) > Math.abs(dx)) {
        drag.type = 'scroll-lanes';
        const maximum = Math.max(0, this.lanesWrap.scrollHeight - this.lanesWrap.clientHeight);
        this.lanesWrap.scrollTop = clamp(drag.startScrollTop - dy, 0, maximum);
        this.paintLaneScroll();
        return;
      }
      if (event.pointerType === 'touch' && drag.moved && Math.abs(dx) > Math.abs(dy)) {
        drag.type = 'scroll-time';
        drag.startScrollBeat = this._scrollBeat;
        this.scrollBeat = Math.max(0, drag.startScrollBeat - dx / this._pxPerBeat);
        return;
      }
      if (!drag.moved) return;
      const currentLane = this.laneAtOrNearestPoint(event.clientY) || drag.laneId;
      const laneIds = this.laneIdsForSpan(drag.laneId, currentLane);
      const start = snapBeat(drag.startBeat, this.beatsPerBar, this.grid, this.snapModeFor(event));
      const end = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, this.snapModeFor(event));
      drag.previewSelection = normalizeTimeSelection(start, end, laneIds, this.worldEnd());
      this.paintTimeSelection(drag.previewSelection);
      this.paintSelection(drag.previewSelection ? this.clipsInsideTimeSelection(drag.previewSelection) : []);
      this.dispatchEvent(eventOf('time-select-input', drag.previewSelection || { start, end, laneIds }));
      return;
    }
    if (drag.type === 'seek-ruler') return;
    if (drag.type === 'lane-header') {
      if (!drag.moved || this.readonly) return;
      drag.toIndex = this.laneIndexFromHeaderPoint(event.clientY);
      this.paintLaneDropLine(drag.toIndex);
      return;
    }
    if (drag.type === 'scroll-time') {
      this.scrollBeat = Math.max(0, drag.startScrollBeat - dx / this._pxPerBeat);
      return;
    }
    if (drag.type === 'scroll-lanes') {
      const maximum = Math.max(0, this.lanesWrap.scrollHeight - this.lanesWrap.clientHeight);
      this.lanesWrap.scrollTop = clamp(drag.startScrollTop - dy, 0, maximum);
      this.paintLaneScroll();
      return;
    }
    if (drag.type === 'trim-left' || drag.type === 'trim-right') {
      const origin = drag.origin;
      const rawBeat = this._scrollBeat + (event.clientX - this.rulerWrap.getBoundingClientRect().left) / this._pxPerBeat;
      const edgeBeat = snapBeat(rawBeat, this.beatsPerBar, this.grid, this.snapModeFor(event));
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
      if (!drag.moved || this.readonly) return;
      const targetLane = this.laneAtPoint(event.clientY);
      this.paintClipDropTarget(targetLane);
      const raw = dx / this._pxPerBeat;
      const originStart = Number(drag.origin.start) || 0;
      const delta = snapTime(originStart + raw, {
        step: gridStep(this.beatsPerBar, this.grid), mode: this.snapModeFor(event), origin: originStart,
      }) - originStart;
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

  /** Restore a gesture preview without emitting a host intent. */
  /** @param {any} [options] */
  cancelActiveDrag(options = {}) {
    const drag = this.drag;
    this.longPress.cancel();
    clearTimeout(this.viewChangeTimer);
    this.viewChangeTimer = null;
    this.drag = null;
    if (drag) {
      if (drag.type === 'locator' && drag.element instanceof HTMLElement) {
        drag.element.style.left = `${drag.startBeat * this._pxPerBeat}px`;
      }
      if (drag.type === 'time-selection' || drag.type === 'scroll-time') {
        this.paintTimeSelection();
        this.paintSelection();
        this.scrollBeat = drag.startScrollBeat ?? this._scrollBeat;
      }
      if (drag.type === 'trim-left' || drag.type === 'trim-right') this.render();
      if (drag.type === 'ruler-scroll' || drag.type === 'ruler-zoom') {
        this._scrollBeat = drag.startScrollBeat ?? this._scrollBeat;
        if (drag.type === 'ruler-zoom') this._pxPerBeat = drag.startPxPerBeat ?? this._pxPerBeat;
        this.render();
      }
      if (drag.type === 'loop') this.paintLoop();
      this.clearLaneDropLine();
    }
    this.clearClipDragVisuals();
    if (options.clearPointers) {
      this.pointers.clear();
      this.pinch = null;
    }
  }

  /** A cancelled pointer never commits its pending gesture. */
  cancelPointer() {
    this.cancelActiveDrag({ clearPointers: true });
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
    if (!drag || event.pointerId !== drag.pointerId) {
      this.clearClipDragVisuals();
      return;
    }
    this.longPress.cancel();
    this.drag = null;
    this.clearClipDragVisuals();
    if (drag.type === 'lane-header') {
      this.clearLaneDropLine();
      const index = this._lanes.findIndex((lane) => lane.id === drag.laneId);
      if (drag.moved) { if (!this.readonly) this.dispatchEvent(eventOf('lane-move', { laneId: drag.laneId, toIndex: clamp(Number(drag.toIndex) || 0, 0, this._lanes.length - 1) })); }
      else if (index >= 0) this.dispatchEvent(eventOf('lane-pick', { laneId: drag.laneId, shiftKey: Boolean(event.shiftKey) }));
      return;
    }
    if (drag.type === 'locator') {
      if (drag.moved) {
        if (!this.readonly) this.dispatchEvent(eventOf('locator-move', {
          id: drag.locatorId,
          beat: drag.previewBeat ?? drag.startBeat,
        }));
        return;
      }
      else this.dispatchEvent(eventOf('locator-jump', { id: drag.locatorId }));
      return;
    }
    if (drag.type === 'ruler-locator-row') return;
    if (drag.type === 'ruler-scroll') {
      if (!drag.moved) {
        const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, this.snapModeFor(event));
        this.dispatchEvent(eventOf('seek', { beat, source: 'ruler' }));
      }
      return;
    }
    if (drag.type === 'ruler-zoom') return;
    if (drag.type === 'time-selection') {
      if (drag.moved && drag.previewSelection) {
        const selection = drag.previewSelection;
        this.setTimeSelection(selection.start, selection.end, selection.laneIds);
        this._selected = this.clipsInsideTimeSelection(selection);
        this.emitSelection();
        this.dispatchEvent(eventOf('time-select', this.timeSelection));
      } else if (drag.moved) {
        this.setTimeSelection(null, null);
        this._selected = [];
        this.emitSelection();
        this.dispatchEvent(eventOf('time-select', { start: drag.startBeat, end: drag.startBeat, laneIds: [drag.laneId] }));
      } else {
        this.setTimeSelection(null, null);
        this.dispatchEvent(eventOf('time-select', { start: null }));
        const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, this.snapModeFor(event));
        this.dispatchEvent(eventOf('seek', { beat, source: 'lane' }));
      }
      return;
    }
    if (drag.type === 'seek-ruler') {
      const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, this.snapModeFor(event));
      this.dispatchEvent(eventOf('seek', { beat, source: 'ruler' }));
      return;
    }
    if (drag.type === 'scroll-time' || drag.type === 'scroll-lanes') return;
    this.clearClipDragVisuals();
    if (drag.element) drag.element.style.cursor = 'grab';
    if (drag.type === 'trim-left' || drag.type === 'trim-right') {
      if (drag.preview) this.dispatchEvent(eventOf('clip-trim', { id: drag.clipId, ...drag.preview }));
      else this.render();
      return;
    }
    if (drag.type === 'move' && drag.moved && !this.readonly) {
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
    this.drag = {
      pointerId: event.pointerId, type: 'loop', kind, startX: event.clientX,
      start: this._loopStart, end: this._loopEnd, loopEnabled: this._loopEnabled,
      px: this._pxPerBeat, node: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  moveLoopDrag(event) {
    const drag = this.drag;
    if (!drag || drag.type !== 'loop' || event.pointerId !== drag.pointerId) return;
    const delta = (event.clientX - drag.startX) / drag.px;
    const mode = this.snapModeFor(event);
    const step = gridStep(this.beatsPerBar, this.grid);
    const snapValue = (value, origin) => snapTime(value, { step, mode, origin });
    let start = drag.start;
    let end = drag.end;
    if (drag.kind === 'start') start = Math.min(snapValue(drag.start + delta, drag.start), end - MIN_CLIP_LENGTH);
    else if (drag.kind === 'end') end = Math.max(snapValue(drag.end + delta, drag.end), start + MIN_CLIP_LENGTH);
    else { start = snapValue(drag.start + delta, drag.start); end = start + (drag.end - drag.start); }
    drag.preview = { start, end };
    this.paintLoop(start, end);
    this.dispatchEvent(eventOf('loop-input', { start, end, enabled: this._loopEnabled }));
  }

  endLoopDrag(event) {
    const drag = this.drag;
    if (!drag || drag.type !== 'loop' || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    const preview = drag.preview ?? { start: drag.start, end: drag.end };
    this.paintLoop();
    this.dispatchEvent(eventOf('loop-change', { ...preview, enabled: this._loopEnabled }));
  }

  cancelLoopDrag(event) {
    if (!this.drag || this.drag.type !== 'loop' || event.pointerId !== this.drag.pointerId) return;
    this.cancelActiveDrag();
  }

  /** @param {TimelineLane} lane @param {AutomationLaneView} automation @param {{beat:number,value:number}[]} points */
  /** Report an automation edit; the host applies it and hands the points back. */
  commitAutomationChange(lane, automation, points) {
    if (this.readonly) return;
    this.dispatchEvent(eventOf('automation-change', {
      laneId: lane.id,
      automationId: automation.id,
      points: points.map((point) => ({ ...point })),
    }));
  }

  // ---- Click, keyboard, wheel -------------------------------------------------

  handleDoubleClick(event) {
    if (this.hasAttribute('disabled')) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement
      && (node.classList.contains('automation-header-button') || node.classList.contains('automation-chooser')))) return;
    const loopPart = event.composedPath().find((node) => node instanceof HTMLElement
      && (node.classList.contains('ruler-band') || node.classList.contains('ruler-handle')));
    if (loopPart instanceof HTMLElement) {
      if (loopPart.classList.contains('ruler-band')) {
        this.dispatchEvent(eventOf('loop-toggle', { enabled: !this._loopEnabled }));
      }
      return;
    }
    const locator = this.locatorFromEvent(event);
    if (locator) {
      const name = pathElement(event, 'ruler-locator-name');
      if (name instanceof HTMLElement && !this.readonly) {
        event.preventDefault();
        this.renamingLocator = locator.locator.id;
        this.render();
      }
      return;
    }
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('ruler-wrap'))) {
      if (this.rulerRowAtPoint(event.clientY) === 1) {
        if (this.readonly) return;
        event.preventDefault();
        const beat = snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, this.snapModeFor(event));
        this.dispatchEvent(eventOf('locator-create', { beat }));
      } else if (this.rulerRowAtPoint(event.clientY) === 2) {
        event.preventDefault();
        this.dispatchEvent(eventOf('fit-request', {}));
      }
      return;
    }
    const laneName = pathElement(event, 'lane-name');
    if (laneName instanceof HTMLElement) {
      const lane = this._lanes.find((entry) => entry.id === laneName.closest('.lane-header')?.dataset.laneId);
      if (lane) {
        event.preventDefault();
        this.beginLaneRename(lane.id);
      }
      return;
    }
    const found = this.clipFromEvent(event);
    if (found) {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-open', { id: found.clip.id, altKey: event.altKey, clientX: event.clientX, clientY: event.clientY }));
      return;
    }
    if (this.readonly) return;
    const lane = event.composedPath().find((node) => node instanceof HTMLElement && node.classList.contains('lane'));
    if (lane instanceof HTMLElement) {
      this.dispatchEvent(eventOf('lane-create', { laneId: lane.dataset.laneId, beat: snapBeat(this.beatAtPoint(event.clientX), this.beatsPerBar, this.grid, this.snapModeFor(event)) }));
    } else if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('header-wrap'))) {
      this.dispatchEvent(eventOf('lanes-create', { clientX: event.clientX, clientY: event.clientY }));
    }
  }

  handleContextMenu(event) {
    if (this.hasAttribute('disabled')) return;
    const locator = this.locatorFromEvent(event);
    if (locator) {
      event.preventDefault();
      this.dispatchEvent(eventOf('locator-context', { id: locator.locator.id, clientX: event.clientX, clientY: event.clientY }));
      return;
    }
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
    } else if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('header-wrap'))) {
      event.preventDefault();
      this.dispatchEvent(eventOf('lanes-context', { clientX: event.clientX, clientY: event.clientY }));
    } else if (event.composedPath().some((node) => node instanceof HTMLElement && node.classList.contains('ruler-wrap'))) {
      event.preventDefault();
      this.dispatchEvent(eventOf('ruler-context', { beat: this.beatAtPoint(event.clientX), clientX: event.clientX, clientY: event.clientY }));
    } else {
      // every remaining point of the surface still resolves to a context
      // intent, so callers never need a native contextmenu fallback
      event.preventDefault();
      this.dispatchEvent(eventOf('timeline-context', { clientX: event.clientX, clientY: event.clientY }));
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
    const key = event.key.toLowerCase();
    const automationBody = this.automationFromEvent(event);
    const automationHeader = this.automationHeaderFromEvent(event);
    const envelopeEditor = event.composedPath().some((node) => node instanceof HTMLElement
      && node.localName === 'compost-envelope-editor');
    if (!this.readonly && !event.altKey && !event.metaKey && !event.ctrlKey && key === 'b') {
      event.preventDefault();
      this.dispatchEvent(eventOf('draw-toggle', { enabled: !this.draw }));
      return;
    }
    if (envelopeEditor && !(this.draw && (event.key === 'Delete' || event.key === 'Backspace'))) return;
    const locatorTarget = this.locatorFromEvent(event);
    if (locatorTarget) {
      if (event.key === 'F2' && !this.readonly) {
        event.preventDefault();
        this.renamingLocator = locatorTarget.locator.id;
        this.render();
        return;
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.dispatchEvent(eventOf('locator-jump', { id: locatorTarget.locator.id }));
        return;
      }
    }
    if (automationHeader && event.key === 'Escape') {
      event.preventDefault();
      automationHeader.header.blur();
      return;
    }
    if (this.draw && automationBody && event.key.startsWith('Arrow')) {
      event.preventDefault();
      return;
    }
    const selection = this._timeSelection;
    const automationSelection = !this.draw && automationBody
      ? this.automationSelectionFor(automationBody.lane.id) : null;
    if (automationSelection && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      const values = automationRangeEdgeValues(automationBody.automation.points,
        automationSelection.start, automationSelection.end, {
          min: automationBody.automation.min,
          max: automationBody.automation.max,
          scale: automationBody.automation.scale,
          stepped: automationBody.automation.stepped,
          step: this.automationValueStep(automationBody.automation),
        });
      this.commitAutomationChange(automationBody.lane, automationBody.automation,
        flattenAutomationRange(automationBody.automation.points, automationSelection.start, automationSelection.end, values,
          { min: automationBody.automation.min, max: automationBody.automation.max }, undefined,
          this.automationValueStep(automationBody.automation)));
      return;
    }
    if (selection) {
      if (key === 'l' && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        this.dispatchEvent(eventOf('loop-change', { start: selection.start, end: selection.end, enabled: true }));
        return;
      }
      if (!this.readonly && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        this.dispatchEvent(eventOf('time-delete', {
          start: selection.start,
          end: selection.end,
          laneIds: [...selection.laneIds],
          removeTime: Boolean(event.shiftKey),
        }));
        return;
      }
      if (!this.readonly && (event.metaKey || event.ctrlKey) && key === 'e') {
        event.preventDefault();
        this.dispatchEvent(eventOf('clip-split', {
          ids: this.clipsInsideTimeSelection(selection),
          beats: [selection.start, selection.end],
          laneIds: [...selection.laneIds],
        }));
        return;
      }
    }
    if (event.key === ',' || event.key === '.') {
      const current = this._playhead;
      const candidates = this._locators.filter((locator) => event.key === ',' ? locator.beat < current : locator.beat > current);
      const locator = event.key === ',' ? candidates.at(-1) : candidates[0];
      if (locator) {
        event.preventDefault();
        this.dispatchEvent(eventOf(event.key === ',' ? 'locator-prev' : 'locator-next', { id: locator.id }));
      }
      return;
    }
    const headerTarget = this.laneHeaderFromEvent(event);
    const onAutomationSurface = event.composedPath().some((node) => node instanceof HTMLElement && (node.classList.contains('automation-header') || node.classList.contains('automation-row')));
    const onHeaderControl = event.composedPath().some((node) => node instanceof HTMLElement
      && node.matches('button, input, select, textarea, [data-timeline-interactive]'));
    if (headerTarget && !onAutomationSurface && !onHeaderControl) {
      const index = this._lanes.indexOf(headerTarget.lane);
      if (event.shiftKey && event.key === 'F10') {
        event.preventDefault();
        const point = this.pointForLaneHeader(headerTarget.lane.id);
        this.dispatchEvent(eventOf('lane-header-context', { laneId: headerTarget.lane.id, ...point }));
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const toIndex = clamp(index + (event.key === 'ArrowUp' ? -1 : 1), 0, this._lanes.length - 1);
        if (toIndex !== index && !this.readonly) this.dispatchEvent(eventOf('lane-move', { laneId: headerTarget.lane.id, toIndex }));
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        this.beginLaneRename(headerTarget.lane.id);
        return;
      }
    }
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
    const current = this.focusedClip || this._selected[0];
    const found = current ? this.findClip(current) : null;
    const meta = event.metaKey || event.ctrlKey;
    // loop the selection: Cmd/Ctrl-L as in Ableton, and plain `l` because the browser
    // keeps Cmd-L for its address bar
    if (key === 'l' && !event.altKey && !event.shiftKey) {
      const ids = this._selected.length ? this._selected : found ? [found.clip.id] : [];
      const clips = ids.map((id) => this.findClip(id)?.clip).filter(Boolean);
      if (clips.length) {
        event.preventDefault();
        const start = Math.min(...clips.map((clip) => Number(clip.start) || 0));
        const end = Math.max(...clips.map((clip) => (Number(clip.start) || 0) + (Number(clip.length) || 0)));
        if (end > start + MIN_CLIP_LENGTH) this.dispatchEvent(eventOf('loop-change', { start, end, enabled: true }));
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
    if (!this.readonly && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
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
    } else if (!this.readonly && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-delete', { ids: this.selected.length ? this.selected : [found.clip.id] }));
    } else if (!this.readonly && meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.dispatchEvent(eventOf('clip-duplicate', { ids: this.selected.length ? this.selected : [found.clip.id] }));
    } else if (!this.readonly && meta && event.key.toLowerCase() === 'e') {
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
