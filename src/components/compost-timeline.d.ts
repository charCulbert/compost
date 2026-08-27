export interface TimelineLocator {
  id: string;
  beat: number;
  name: string;
}

export interface TimelineTimeSelection {
  start: number;
  end: number;
  laneIds: string[];
}

/** One clip on a lane; geometry is in beats. */
export interface TimelineClip {
  id: string;
  name: string;
  start: number;
  length: number;
  offset?: number;
  duration: number;
  loop?: boolean;
  state?: string;
  progress?: number;
  notes?: {start: number, duration: number, note: number, velocity?: number}[];
  color?: string;
  [key: string]: unknown;
}

/** One automation sub-row under a lane. */
export interface AutomationLaneView {
  id: string;
  label: string;
  color?: string;
  min: number;
  max: number;
  stepped: boolean;
  step?: number;
  scale?: 'linear' | 'gain';
  points: {beat: number, value: number}[];
  state?: 'idle' | 'recording' | 'overridden' | 'playing';
  value?: number;
  [key: string]: unknown;
}

export interface TimelineLane {
  id: string;
  name: string;
  color?: string;
  compact?: boolean;
  picked?: boolean;
  dimmed?: boolean;
  height?: number;
  envelope?: {points: {beat: number, value: number}[], min: number, max: number, stepped?: boolean, scale?: 'linear' | 'gain'} | null;
  automation?: AutomationLaneView[];
  clips: TimelineClip[];
  [key: string]: unknown;
}

// ---- Intent event details -------------------------------------------------

/** `seek`: a ruler or empty-lane click. */
export interface TimelineSeekDetail { beat: number, source: 'ruler' | 'lane' }
/** `loop-input` and `loop-change`. */
export interface TimelineLoopDetail { start: number, end: number, enabled: boolean }
/** `view-change`: a settled zoom or scroll. */
export interface TimelineViewChangeDetail { pxPerBeat: number, scrollBeat: number }
/** `clip-select`. */
export interface TimelineClipSelectDetail { ids: string[] }
/** `clip-move`: a clip body drag ends. */
export interface TimelineClipMoveDetail { ids: string[], laneId: string | null, deltaBeats: number, copy: boolean }
/** `clip-trim-input` and `clip-trim`. */
export interface TimelineClipTrimDetail { id: string, start: number, end: number }
/** `automation-input` and `automation-change`. */
export interface TimelineAutomationChangeDetail {
  laneId: string;
  automationId: string;
  points: {beat: number, value: number}[];
}
/** `time-delete`: Delete with a time selection. */
export interface TimelineTimeDeleteDetail extends TimelineTimeSelection { removeTime: boolean }

// ---- Module helpers -------------------------------------------------------

/** Snap a beat to the timeline grid, or leave it free when snapping is off. */
export function snapBeat(beat: number, beatsPerBar: number, grid: number, snap: string): number;

/** Return stable, finite, beat-sorted locators without duplicate ids. */
export function sortLocators(locators: TimelineLocator[]): TimelineLocator[];

/** Clamp and normalise a time selection; equal or absent edges clear it. */
export function normalizeTimeSelection(
  start: number | null | undefined,
  end: number | null | undefined,
  laneIds?: string[],
  maxBeat?: number,
): TimelineTimeSelection | null;

/** Convert a clip's beat geometry into pixels relative to the visible left edge. */
export function clipBox(
  clip: {start: number, length: number},
  pxPerBeat: number,
  scrollBeat: number,
): {left: number, width: number};

/** The clip as a trim to [start, end) would leave it. */
export function previewTrimmedClip(clip: TimelineClip, start: number, end: number): TimelineClip;

/** Return the content-wrap positions of a looping clip, in beats from its start. */
export function loopPassLines(
  clip: {length: number, duration: number, offset?: number, loop?: boolean},
  pxPerBeat?: number,
): number[];

/** Return the visible dash opacity for an optional MIDI velocity. */
export function clipNoteOpacity(velocity: number | string | null | undefined): number;

/** How many bars fit comfortably between ruler labels at this zoom. */
export function rulerStep(pxPerBeat: number, beatsPerBar: number): number;

export interface AutomationEditOptions {
  min?: number | {min: number, max: number};
  max?: number;
  height?: number;
  scale?: 'linear' | 'gain';
  stepped?: boolean;
  step?: number | string | null;
  [key: string]: unknown;
}

/** Convert an automation value to a y coordinate in a sub-row. */
export function automationValueToY(value: number, min: number | {min: number, max: number}, max: number, height: number, scale?: 'linear' | 'gain'): number;
/** Convert a y coordinate in a sub-row to an automation value. */
export function automationValueFromY(y: number, min: number | {min: number, max: number}, max: number, height: number, scale?: 'linear' | 'gain'): number;
/** Add a point and return a new beat-sorted, range-clamped array. */
export function addAutomationPoint(points: {beat: number, value: number}[], point: {beat: number, value: number}, min?: number | {min: number, max: number}, max?: number): {beat: number, value: number}[];
/** Move one point without allowing it to cross its neighbours. */
export function moveAutomationPoint(points: {beat: number, value: number}[], index: number, point: {beat: number, value: number}, min?: number | {min: number, max: number}, max?: number): {beat: number, value: number}[];
/** Keep a synthetic original edge point when an endpoint moves inward. */
export function preserveAutomationEdgePoints(originPoints: {beat: number, value: number}[], movedPoints: {beat: number, value: number}[], index: number): {beat: number, value: number}[];
/** Delete one point and return a new array. */
export function deleteAutomationPoint(points: {beat: number, value: number}[], index: number): {beat: number, value: number}[];
/** Snap an automation value when a lane supplies a discrete step. */
export function snapAutomationValue(value: number, min?: number | {min: number, max: number}, max?: number, step?: number): number;
/** Return the effective value step, including the integer default for stepped lanes. */
export function effectiveAutomationStep(stepped?: boolean, step?: number | string | null): number;
/** Return the value on an envelope at a beat, including flat stepped segments. */
export function automationValueAtBeat(points: {beat: number, value: number}[], beat: number, min?: number | {min: number, max: number}, max?: number, scale?: 'linear' | 'gain', stepped?: boolean): number;
/** Sample both sides of a range using the lane's actual interpolation semantics. */
export function automationRangeEdgeValues(points: {beat: number, value: number}[], start: number, end: number, options?: AutomationEditOptions): {start: number, end: number};
/** Move selected automation values in display space, preserving their beats. */
export function moveAutomationPointsByY(points: {beat: number, value: number}[], indexes: number[], deltaY: number, options?: AutomationEditOptions): {beat: number, value: number}[];
/** Move a selected range in display space while preserving independently sampled edges. */
export function moveAutomationRangeByY(points: {beat: number, value: number}[], start: number, end: number, deltaY: number, options?: AutomationEditOptions): {beat: number, value: number}[];
/** Thin freehand automation samples once, preserving endpoints and corners. */
export function thinAutomationPoints(points: {beat: number, value: number}[], tolerance?: number): {beat: number, value: number}[];
/** Build one complete automation write from grid cells or freehand samples. */
export function drawAutomationPoints(originPoints: {beat: number, value: number}[], samples: {beat: number, value: number}[], options?: AutomationEditOptions & {gridStep?: number, snap?: string, freehand?: boolean, tolerance?: number}): {beat: number, value: number}[];
/** Flatten an automation range while retaining points outside the selection. */
export function flattenAutomationRange(points: {beat: number, value: number}[], start: number, end: number, value: number, min?: number | {min: number, max: number}, max?: number, step?: number): {beat: number, value: number}[];
/** Move only the points and edge values inside a selected automation range. */
export function moveAutomationRange(points: {beat: number, value: number}[], start: number, end: number, delta: number, min?: number | {min: number, max: number}, max?: number, step?: number): {beat: number, value: number}[];

/**
 * `<compost-timeline>`: an arrangement view of lanes, clips, locators, a
 * loop brace and automation sub-rows. The host owns all state; the element
 * draws it and reports intent as CustomEvents: `seek`, `loop-input`,
 * `loop-change`, `loop-toggle`, `locator-*`, `time-select`, `time-delete`,
 * `clip-select`, `clip-open`, `clip-context`, `clip-move`, `clip-trim`,
 * `clip-rename`, `clip-delete`, `clip-duplicate`, `clip-split`,
 * `clip-nudge`, `lane-*`, `automation-*`, `draw-toggle`, `fit-request` and
 * `view-change`.
 */
export class CompostTimeline extends HTMLElement {
  label: string;
  timeSignature: string;
  beatsPerBar: number;
  beatLength: number;
  grid: number;
  snapMode: 'grid' | 'off';
  follow: boolean;
  laneHeight: number;
  thinLaneHeight: number;
  automationRowHeight: number;
  /** Mirrors the `automation` attribute: whether sub-rows are shown. */
  automation: boolean;
  /** Mirrors the `draw` attribute: whether pointer gestures draw automation. */
  draw: boolean;
  focusedClip: string | null;
  focusedLane: string | null;

  /** Deep copies of the lanes and their clips. */
  get lanes(): TimelineLane[];
  /** Replace all lanes and clips; this never emits a model intent. */
  setLanes(lanes: TimelineLane[]): void;
  /** Attach caller-owned lane headers through native slots. */
  setLaneHeaders(headers: Map<string, HTMLElement> | Record<string, HTMLElement>): void;
  /** Replace one caller-owned lane header. Passing null restores the generic fallback. */
  setLaneHeader(laneId: string, element: HTMLElement | null): void;
  /** Attach caller-owned clip preview content through a native slot. */
  setClipPreview(clipId: string, element: HTMLElement | null): void;
  /** Replace one lane's clips without changing the lane order. */
  setLaneClips(laneId: string, clips: TimelineClip[]): void;
  /** Update generic lane emphasis without rebuilding its clips. */
  setLaneDimmed(laneId: string, dimmed: boolean): void;
  /** Update one lane's automation rows without changing the lane order. */
  setLaneAutomation(laneId: string, automation: AutomationLaneView[]): void;
  /** Synchronise a host-owned automation chooser menu's expanded state. */
  setAutomationChooserOpen(laneId: string, automationId: string, open: boolean): void;
  /** Scroll the vertical lane viewport until an automation row is visible. */
  revealAutomation(laneId: string, automationId: string): boolean;

  get locators(): TimelineLocator[];
  /** Replace the ruler locators; the host remains the source of truth. */
  setLocators(locators: TimelineLocator[]): void;

  get timeSelection(): TimelineTimeSelection | null;
  /** Restore or clear the host-owned cross-lane time selection. */
  setTimeSelection(start: number | null, end: number | null, laneIds?: string[]): void;

  get playhead(): number;
  /** Move only the playhead; clip geometry is not rebuilt. */
  setPlayhead(beat: number): void;

  get loopStart(): number;
  get loopEnd(): number;
  setLoop(start: number, end: number, enabled: boolean, emit?: boolean): void;

  get pxPerBeat(): number;
  set pxPerBeat(value: number);
  get scrollBeat(): number;
  set scrollBeat(value: number);
  /** The selected clip ids. */
  get selected(): string[];
  set selected(value: string[]);
  /** Readonly renders and navigates but emits no mutating intent. */
  get readonly(): boolean;

  /** Scrolls the view to a beat. Shadows Element.scrollTo, whose signatures
   * remain callable but scroll to beat 0. */
  scrollTo(beat: number): void;
  scrollTo(options?: ScrollToOptions): void;
  scrollTo(x: number, y: number): void;
  zoomToFit(endBeat: number): void;
  /** Convert a viewport x coordinate into an unsnapped timeline beat. */
  beatAtPoint(clientX: number): number;
  /** Return the lane id under a viewport y coordinate. */
  laneAtPoint(clientY: number): string | null;
  /** Return the nearest lane when a cross-lane drag leaves the visible stack. */
  laneAtOrNearestPoint(clientY: number): string | null;

  beginRename(clipId: string): void;
  beginLaneRename(laneId: string): void;
  focusClip(clipId: string): void;
  findClip(id: string): {lane: TimelineLane, clip: TimelineClip} | null;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-timeline': CompostTimeline;
  }
}
