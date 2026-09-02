export type ClipState = "stopped" | "playing" | "recording";

/** One host-owned session clip. */
export interface ClipSpec {
	id?: string;
	name: string;
	color?: string;
	state?: ClipState;
	queued?: boolean;
	loop?: boolean;
	/** 0..1, washed behind a playing clip's name. */
	progress?: number;
	[key: string]: unknown;
}

/** One host-owned track column in the session grid. */
export interface ClipGridTrack {
	id: string;
	name?: string;
	color?: string;
	armed?: boolean;
	recordQueuedSlot?: number | null;
	stopState?: "" | "active" | "queued";
	clips?: (ClipSpec | null)[];
}

/** One discrete coordinate in the session grid. */
export interface ClipGridPosition {
	trackId: string;
	slot: number;
}

/** `clip-launch` and `clip-record`. */
export type ClipSlotDetail = ClipGridPosition;

/** `clip-stop`. */
export interface ClipTrackDetail {
	trackId: string;
}

/** `clip-open` and `clip-context`. */
export interface ClipPointDetail extends ClipGridPosition {
	altKey?: boolean;
	clientX?: number;
	clientY?: number;
}

/** `clip-rename`. */
export interface ClipRenameDetail extends ClipGridPosition {
	name: string;
}

/** `clips-select`. */
export interface ClipsSelectDetail {
	selection: ClipGridPosition[];
	cursor: ClipGridPosition | null;
}

/** `clips-copy`, `clips-cut`, `clips-delete`, `clips-drag-start`, and `clips-drag-end`. */
export interface ClipsPositionsDetail {
	positions: ClipGridPosition[];
}

/** `clips-paste`. */
export interface ClipsPasteDetail {
	to: ClipGridPosition;
}

/** `clips-duplicate`. */
export interface ClipsDuplicateDetail extends ClipsPositionsDetail {
	to: ClipGridPosition;
}

/** `clips-move`. */
export interface ClipsMoveDetail extends ClipsDuplicateDetail {
	copy: boolean;
}

export interface CompostClipGridEventDetailMap {
	"clip-launch": ClipSlotDetail;
	"clip-record": ClipSlotDetail;
	"clip-stop": ClipTrackDetail;
	"clip-open": ClipPointDetail;
	"clip-context": ClipPointDetail;
	"clip-rename": ClipRenameDetail;
	"clips-select": ClipsSelectDetail;
	"clips-copy": ClipsPositionsDetail;
	"clips-cut": ClipsPositionsDetail;
	"clips-paste": ClipsPasteDetail;
	"clips-delete": ClipsPositionsDetail;
	"clips-duplicate": ClipsDuplicateDetail;
	"clips-move": ClipsMoveDetail;
	"clips-drag-start": ClipsPositionsDetail;
	"clips-drag-end": ClipsPositionsDetail;
}

/** Which slot a pointer at `y` lands in, given the rows' boxes. */
export function slotIndexAt(y: number, rows: DOMRect[]): number;

/** Return every position in the inclusive rectangle. */
export function rectangularClipSelection(
	tracks: ClipGridTrack[],
	anchor: ClipGridPosition,
	end: ClipGridPosition,
): ClipGridPosition[];

/** Translate positions so their top-left lands at `to`. */
export function translatedClipPositions(
	tracks: ClipGridTrack[],
	positions: ClipGridPosition[],
	to: ClipGridPosition,
): ClipGridPosition[];

/**
 * `<compost-clip-grid>`: a complete multi-track session launcher. It owns
 * selection, focus, clipboard keyboard recognition, and drag geometry while
 * the host owns clip data, clipboard contents, IDs, collision policy, and
 * mutation.
 *
 * @attribute slots - number of session rows (1-512)
 * @attribute label
 * @attribute disabled
 * @attribute show-stop - shows empty track stop controls
 */
export class CompostClipGrid extends HTMLElement {
	slotCount: number;
	label: string;

	/** Deep copies of the tracks and their clip slots. */
	get tracks(): ClipGridTrack[];
	/** Replace every track and slot without emitting model intent. */
	setTracks(tracks: ClipGridTrack[]): void;

	/** Selected slot coordinates, including empty slots. */
	get selection(): ClipGridPosition[];
	/** Current keyboard and paste destination. */
	get cursor(): ClipGridPosition | null;
	/** Restore selection and optionally its cursor without emitting intent. */
	setSelection(
		positions: ClipGridPosition[],
		cursor?: ClipGridPosition | null,
	): void;

	get disabled(): boolean;
	set disabled(value: boolean);

	/** Cheap per-frame update of one playing clip's progress, 0..1. */
	setProgress(trackId: string, slot: number, progress: number): void;
	/** Lights one session row across every track. */
	highlightRow(slot: number, on: boolean): void;
	/** Opens an inline editor; the result arrives as `clip-rename`. */
	beginRename(position: ClipGridPosition): void;
	focusSlot(position: ClipGridPosition): void;

	addEventListener<K extends keyof CompostClipGridEventDetailMap>(
		type: K,
		listener: (
			this: CompostClipGrid,
			event: CustomEvent<CompostClipGridEventDetailMap[K]>,
		) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener<K extends keyof CompostClipGridEventDetailMap>(
		type: K,
		listener: (
			this: CompostClipGrid,
			event: CustomEvent<CompostClipGridEventDetailMap[K]>,
		) => void,
		options?: boolean | EventListenerOptions,
	): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-clip-grid": CompostClipGrid;
	}
}
