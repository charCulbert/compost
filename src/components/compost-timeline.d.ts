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
export interface TimelineTimeDuplicateDetail extends TimelineTimeSelection {
	to: number;
}
export interface TimelineLaneCreateDetail {
	laneId: string;
	beat: number;
	length: number;
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
	notes?: {
		start: number;
		duration: number;
		note: number;
		velocity?: number;
	}[];
	color?: string;
	[key: string]: unknown;
}

/** The automation curve shown in a lane's automation view. */
export interface TimelineAutomationPoint {
	beat: number;
	value: number;
	/** Curvature from -1 to 1 for the segment beginning here; zero is linear. */
	curve?: number;
	[key: string]: unknown;
}

export interface AutomationLaneView {
	id: string;
	label: string;
	color?: string;
	min: number;
	max: number;
	stepped: boolean;
	step?: number;
	scale?: "linear" | "gain";
	points: TimelineAutomationPoint[];
	state?: "idle" | "recording" | "overridden" | "playing";
	value?: number;
	[key: string]: unknown;
}

export interface TimelineLane {
	id: string;
	name: string;
	color?: string;
	/** what is written on the lane's clips, black or white; defaults to the system accent text */
	ink?: string;
	compact?: boolean;
	picked?: boolean;
	dimmed?: boolean;
	height?: number;
	automation?: AutomationLaneView | null;
	clips: TimelineClip[];
	[key: string]: unknown;
}

// ---- Intent event details -------------------------------------------------

/** `seek`: a ruler click. */
export interface TimelineSeekDetail {
	beat: number;
	source: "ruler";
}
/** `loop-input` and `loop-change`. */
export interface TimelineLoopDetail {
	start: number;
	end: number;
	enabled: boolean;
}
/** `view-change`: a settled zoom or scroll. */
export interface TimelineViewChangeDetail {
	pxPerBeat: number;
	scrollBeat: number;
}
/** `time-move-input` and `time-move`: relocate or copy material in a rectangle. */
export interface TimelineTimeMoveDetail extends TimelineTimeSelection {
	to: number;
	toLaneIds: string[];
	copy: boolean;
}
/** `clip-trim-input` and `clip-trim`. */
export interface TimelineClipTrimDetail {
	id: string;
	start: number;
	end: number;
}
/** `automation-input` and `automation-change`. */
export interface TimelineAutomationChangeDetail {
	laneId: string;
	automationId: string;
	points: TimelineAutomationPoint[];
}
/** `time-delete`: Delete with a time selection. */
export interface TimelineTimeDeleteDetail extends TimelineTimeSelection {
	removeTime: boolean;
}
/** `time-select` and `time-select-input`; a null start clears the rectangle. */
export type TimelineTimeSelectDetail = TimelineTimeSelection | { start: null };
/** `clip-open` and `clip-context`. */
export interface TimelineClipPointDetail {
	id: string;
	altKey?: boolean;
	clientX: number;
	clientY: number;
}
/** `clip-rename` and `locator-rename`. */
export interface TimelineRenameDetail {
	id: string;
	name: string;
}
/** `clip-delete`, `clip-duplicate` and `clip-join`. */
export interface TimelineClipIDsDetail {
	ids: string[];
}
/** `clip-split`, with one beat or the edges of a time region. */
export interface TimelineClipSplitDetail {
	ids: string[];
	beat?: number;
	beats?: number[];
	laneIds?: string[];
}
/** `loop-toggle` and `draw-toggle`. */
export interface TimelineToggleDetail {
	enabled: boolean;
}
/** `locator-create`. */
export interface TimelineBeatDetail {
	beat: number;
}
/** `locator-move`. */
export interface TimelineLocatorMoveDetail {
	id: string;
	beat: number;
}
/** `locator-jump`, `locator-delete`, `locator-prev` and `locator-next`. */
export interface TimelineIDDetail {
	id: string;
}
/** `lane-move`. */
export interface TimelineLaneMoveDetail {
	laneId: string;
	toIndex: number;
}
/** `lane-pick`. */
export interface TimelineLanePickDetail {
	laneId: string;
	shiftKey: boolean;
}
/** `lane-rename`. */
export interface TimelineLaneRenameDetail {
	laneId: string;
	name: string;
}
/** `lane-resize`; null restores the default height. */
export interface TimelineLaneResizeDetail {
	laneId: string;
	height: number | null;
}
/** `lanes-resize`. */
export interface TimelineLanesResizeDetail {
	height: number;
}
/** `time-insert`. */
export interface TimelineTimeInsertDetail {
	beat: number;
	beats: number;
	laneIds: string[];
}
/** `automation-context`. */
export interface TimelineAutomationContextDetail {
	laneId: string;
	automationId: string;
	clientX: number;
	clientY: number;
}
/** Context-menu coordinates shared by timeline surfaces. */
export interface TimelinePointDetail {
	clientX: number;
	clientY: number;
}
export interface TimelineLanePointDetail extends TimelinePointDetail {
	laneId: string;
	beat?: number;
}
export interface TimelineRulerPointDetail extends TimelinePointDetail {
	beat: number;
}
/** `fit-request` has no parameters. */
export type TimelineFitRequestDetail = Record<string, never>;

export interface TimelineEventDetailMap {
	"automation-change": TimelineAutomationChangeDetail;
	"automation-context": TimelineAutomationContextDetail;
	"automation-input": TimelineAutomationChangeDetail;
	"clip-context": TimelineClipPointDetail;
	"clip-delete": TimelineClipIDsDetail;
	"clip-duplicate": TimelineClipIDsDetail;
	"clip-join": TimelineClipIDsDetail;
	"clip-open": TimelineClipPointDetail;
	"clip-rename": TimelineRenameDetail;
	"clip-split": TimelineClipSplitDetail;
	"clip-trim": TimelineClipTrimDetail;
	"clip-trim-input": TimelineClipTrimDetail;
	"draw-toggle": TimelineToggleDetail;
	"fit-request": TimelineFitRequestDetail;
	"lane-context": TimelineLanePointDetail;
	"lane-create": TimelineLaneCreateDetail;
	"lane-header-context": TimelineLanePointDetail;
	"lane-move": TimelineLaneMoveDetail;
	"lane-pick": TimelineLanePickDetail;
	"lane-rename": TimelineLaneRenameDetail;
	"lane-resize": TimelineLaneResizeDetail;
	"lanes-context": TimelinePointDetail;
	"lanes-create": TimelinePointDetail;
	"lanes-resize": TimelineLanesResizeDetail;
	"locator-context": TimelineClipPointDetail;
	"locator-create": TimelineBeatDetail;
	"locator-delete": TimelineIDDetail;
	"locator-jump": TimelineIDDetail;
	"locator-move": TimelineLocatorMoveDetail;
	"locator-next": TimelineIDDetail;
	"locator-prev": TimelineIDDetail;
	"locator-rename": TimelineRenameDetail;
	"loop-change": TimelineLoopDetail;
	"loop-input": TimelineLoopDetail;
	"loop-toggle": TimelineToggleDetail;
	"ruler-context": TimelineRulerPointDetail;
	seek: TimelineSeekDetail;
	"time-delete": TimelineTimeDeleteDetail;
	"time-duplicate": TimelineTimeDuplicateDetail;
	"time-insert": TimelineTimeInsertDetail;
	"time-move": TimelineTimeMoveDetail;
	"time-move-input": TimelineTimeMoveDetail;
	"time-select": TimelineTimeSelectDetail;
	"time-select-input": TimelineTimeSelectDetail;
	"timeline-context": TimelinePointDetail;
	"view-change": TimelineViewChangeDetail;
}

// ---- Module helpers -------------------------------------------------------

/** Snap a beat to the timeline grid, or leave it free when snapping is off. */
export function snapBeat(
	beat: number,
	beatsPerBar: number,
	grid: string | number,
	snap: string,
): number;

/** Return stable, finite, beat-sorted locators without duplicate ids. */
export function sortLocators(locators: TimelineLocator[]): TimelineLocator[];

/** Clamp and normalise a time selection; equal edges form an edit cursor. */
export function normalizeTimeSelection(
	start: number | null | undefined,
	end: number | null | undefined,
	laneIds?: string[],
	maxBeat?: number,
): TimelineTimeSelection | null;

/** Convert a clip's beat geometry into pixels relative to the visible left edge. */
export function clipBox(
	clip: { start: number; length: number },
	pxPerBeat: number,
	scrollBeat: number,
): { left: number; width: number };

/** The clip as a trim to [start, end) would leave it. */
export function previewTrimmedClip(
	clip: TimelineClip,
	start: number,
	end: number,
): TimelineClip;

/** Return the content-wrap positions of a looping clip, in beats from its start. */
export function loopPassLines(
	clip: { length: number; duration: number; offset?: number; loop?: boolean },
	pxPerBeat?: number,
): number[];

/** Return the visible dash opacity for an optional MIDI velocity. */
export function clipNoteOpacity(
	velocity: number | string | null | undefined,
): number;

/** How many bars fit comfortably between ruler labels at this zoom. */
export function rulerStep(pxPerBeat: number, beatsPerBar: number): number;

/**
 * `<compost-timeline>`: an arrangement view of lanes, clips, locators, a
 * loop brace and an optional automation view. The host owns all state; the element
 * draws it and reports intent as CustomEvents: `seek`, `loop-input`,
 * `loop-change`, `loop-toggle`, `locator-*`, `time-select`, `time-move`,
 * `time-delete`, `time-duplicate`, `clip-open`, `clip-context`, `clip-trim`,
 * `clip-rename`, `clip-delete`, `clip-duplicate`, `clip-split`,
 * `lane-*`, `automation-*`, `draw-toggle`, `fit-request` and
 * `view-change`.
 *
 * Event details name the intent's subject: clip and locator events carry
 * `id`/`ids`, lane events carry `laneId`.
 * A two-finger pinch zooms time and pans time or lanes. Touch long-press
 * emits the context intent for the surface under the finger.
 *
 * @attribute label
 * @attribute time-signature - meter as N/D
 * @attribute grid - default grid, a note value or legacy cells
 * @attribute adaptive-grid-density - adaptive line density from 0.5 (sparse) to 2 (dense); default 1
 * @attribute adaptive-grid - lets zoom choose the effective grid step
 * @attribute snap - 'off' frees edits from the grid
 * @attribute follow - auto-scrolls to keep the playhead in view during playback
 * @attribute playing - enables playback-only follow behavior
 * @attribute loop-enabled - reflected loop state
 * @attribute disabled
 * @attribute readonly
 * @attribute lane-height - default lane height in px
 * @attribute automation - enables the automation lane view
 * @attribute draw - draw mode
 */
export class CompostTimeline extends HTMLElement {
	label: string;
	/** Effective meter; 4/4 unless `time-signature` parses. */
	timeSignature: string;
	/** Effective bar length in quarter-note beats. */
	beatsPerBar: number;
	/** Effective denominator-beat length in quarter-note beats. */
	beatLength: number;
	/** Derived compound pulse length, or null outside compound x/8 meters. */
	pulseLength: number | null;
	/** A meter-independent note value such as `1/16`, `1/8T` or `bar`; numbers are legacy cells per bar. */
	grid: string | number;
	/** Whether zoom chooses the effective grid step; absent `adaptive-grid` keeps the declared grid fixed. */
	adaptiveGrid: boolean;
	/** Adaptive line density, clamped to 0.5–2; ignored for a fixed grid. */
	adaptiveGridDensity: number;
	snapMode: "grid" | "off";
	follow: boolean;
	playing: boolean;
	/** Default lane height, clamped to at least two font ems. */
	laneHeight: number;
	thinLaneHeight: number;
	/** Mirrors the `automation` attribute: whether lanes show their automation curve. */
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
	setLaneHeaders(
		headers: Map<string, HTMLElement> | Record<string, HTMLElement>,
	): void;
	/** Replace one caller-owned lane header. Passing null restores the generic fallback. */
	setLaneHeader(laneId: string, element: HTMLElement | null): void;
	/** Attach caller-owned clip preview content through a native slot. */
	setClipPreview(clipId: string, element: HTMLElement | null): void;
	/** Replace one lane's clips without changing the lane order. */
	setLaneClips(laneId: string, clips: TimelineClip[]): void;
	/** Update generic lane emphasis without rebuilding its clips. */
	setLaneDimmed(laneId: string, dimmed: boolean): void;
	/** Update the automation curve shown for one lane. */
	setLaneAutomation(
		laneId: string,
		automation: AutomationLaneView | null,
	): void;

	get locators(): TimelineLocator[];
	/** Replace the ruler locators; the host remains the source of truth. */
	setLocators(locators: TimelineLocator[]): void;

	get timeSelection(): TimelineTimeSelection | null;
	/** Restore or clear the host-owned contiguous cross-lane time selection. */
	setTimeSelection(
		start: number | null,
		end: number | null,
		laneIds?: string[],
	): void;

	get playhead(): number;
	/** Move only the playhead; follow re-anchors the view only while `playing` is set. */
	setPlayhead(beat: number): void;

	get loopStart(): number;
	get loopEnd(): number;
	setLoop(start: number, end: number, enabled: boolean, emit?: boolean): void;

	get pxPerBeat(): number;
	set pxPerBeat(value: number);
	get scrollBeat(): number;
	set scrollBeat(value: number);
	/** Readonly renders and navigates but emits no mutating intent. */
	get readonly(): boolean;
	set readonly(value: boolean);
	get disabled(): boolean;
	set disabled(value: boolean);

	/** Scroll the timeline view to a beat. */
	scrollToBeat(beat: number): void;
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
	findClip(id: string): { lane: TimelineLane; clip: TimelineClip } | null;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-timeline": CompostTimeline;
	}
}
