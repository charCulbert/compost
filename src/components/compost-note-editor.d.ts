/** One note in the editor; beats and duration are musical time. */
export interface RollNote {
	id: string;
	note: number;
	start: number;
	duration: number;
	velocity: number;
	channel: number;
}

/** The detail on `notes-change`. */
export interface NotesChangeDetail {
	notes: RollNote[];
}
/** The detail on `loop-change`, `loop-input`, `range-change` and `range-input`. */
export interface NoteRangeDetail {
	start: number;
	end: number;
}
/** A persisted time region; a two-pitch extent makes it a grid box. */
export interface NoteSelectionRegion {
	start: number;
	end: number;
	pitches?: number[];
}
/** The detail on `selection-change`. */
export interface NoteSelectionDetail {
	ids: string[];
}
/** The host-owned quantize request. */
export interface NoteQuantizeDetail {
	ids: string[];
	step: number;
	lengths: boolean;
}
/** The detail on `note-preview` and `note-preview-end`. */
export interface NotePreviewDetail {
	note: number;
	velocity: number;
	channel: number;
}
/** The detail on `note-context`; `id` is absent for the editor background. */
export interface NoteContextDetail {
	id: string | undefined;
	clientX: number;
	clientY: number;
}

/** Bar, beat and grid-cell labels, made sparser when space is tight. */
export function rulerLabels(
	beats: number,
	meter: number | { barLength: number; beatLength: number },
	pxPerBeat: number,
	gridStep?: number,
): { beat: number; text: string }[];

/** A length in the meter's denominator beats, written the way a musician reads it. */
export function lengthText(duration: number, beatLength?: number): string;

/** The musical name of a note-value grid, or of a legacy cells-per-bar value. */
export function gridText(
	division: string | number,
	beatsPerBar?: number,
): string;

/**
 * `<compost-note-editor>`: a MIDI note editor. It edits a note list and
 * draws the playhead position it is given; it neither plays nor schedules
 * anything. Emits `notes-change`, `loop-input`/`loop-change`,
 * `range-input`/`range-change`, `selection-change`, `note-preview`,
 * `note-preview-end`, `note-context` and `note-quantize` CustomEvents.
 * A two-finger pinch zooms and pans time or pitch. Touch long-press emits
 * `note-context` for either a note or the empty grid.
 *
 * @attribute label
 * @attribute beats - total length in quarter-note beats
 * @attribute time-signature - meter as N/D
 * @attribute grid - default grid, a note value or legacy cells
 * @attribute adaptive-grid - lets zoom choose the effective grid step
 * @attribute snap - 'off' frees edits from the grid
 * @attribute start - first visible beat
 * @attribute end - last visible beat
 * @attribute loop-start - loop region start in beats
 * @attribute loop-end - loop region end in beats
 * @attribute root-note - MIDI note of the bottom row
 * @attribute note-count - number of pitch rows
 * @attribute beat-width - pixels per quarter-note beat; 0 lets zoom decide
 * @attribute fold - folds away pitch rows without notes
 * @attribute draw - draw mode; dragging paints notes
 * @attribute playhead - playhead position in beats
 * @attribute scale - comma-separated pitch classes to highlight
 * @attribute root - root pitch class of the highlighted scale
 * @attribute velocity - default velocity for new notes
 * @attribute channel - default MIDI channel for new notes
 * @attribute grid-lines - 'off' hides the grid lines
 * @attribute loop - shows the loop region
 * @attribute lock-loop-start - hides the loop start handle
 * @attribute readonly
 * @attribute disabled
 */
export class CompostNoteEditor extends HTMLElement {
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
	/** Whether time-grid lines are drawn; set `grid-lines="off"` to hide them. */
	gridLines: boolean;
	snapMode: "grid" | "off";
	rangeStart: number;
	rangeEnd: number;
	loopStart: number;
	loopEnd: number;
	/** Whether the loop bar and boundaries are shown; reflected by the `loop` attribute. */
	loopEnabled: boolean;
	/** The last marquee's snapped time span, independently of its selected notes. */
	selectionRegion: NoteSelectionRegion | null;
	/** Pitch-class offsets displayed as in-scale when both `scale` and `root` are set. */
	scale: number[];
	/** Display-only root pitch class, or null when the `root` attribute is absent. */
	scaleRoot: number | null;
	rootNote: number;
	noteCount: number;
	beatWidth: number;
	/** The drawn playhead beat, or null to hide it. */
	playhead: number | null;
	defaultVelocity: number;
	defaultChannel: number;
	/** Caller-owned allocator for durable note identity. */
	noteIdFactory: (() => string) | null;
	beats: number;
	/** The horizontal scroll offset, in pixels; repaint with `refresh`. */
	offset: number;
	/** A wheel-zoom override in px per beat; 0 defers to `beat-width` or auto. */
	zoomPxPerBeat: number;

	/** Copies of the notes. Setting is silent; use `setNotes` to emit. */
	get notes(): RollNote[];
	set notes(value: RollNote[]);
	/** Replaces the note list. Silent by default so a host can push state back. */
	setNotes(notes: RollNote[], shouldEmit?: boolean): void;

	/** A fresh id from `noteIdFactory`; throws without one. */
	newNoteId(): string;

	/** Recomputes geometry and repaints everything. */
	refresh(): void;

	/** The grid step, in beats. */
	get step(): number;
	get readonly(): boolean;
	set readonly(value: boolean);
	get disabled(): boolean;
	set disabled(value: boolean);
	get selectedIds(): string[];
	get pxPerBeat(): number;

	/** Sets the non-destructive playback range, independently of the loop. */
	setRange(start: number, end: number, shouldEmit?: boolean): void;
	/** Sets the loop region, in beats. */
	setLoop(start: number, end: number, shouldEmit?: boolean): void;
	/** Emits a quantize intent for the selection, or everything when none is selected. */
	quantize(options?: { lengths?: boolean; division?: string | number }): void;
	selectAll(): void;
	clearSelection(): void;
	deleteSelection(): void;
	/** Copies the selection one span later and selects the copies. */
	duplicateSelection(): void;
	/** Adds one note without a pointer, selects it and reports the change. */
	addNote(): RollNote | null;
	/** Sets the loop to the selection's span. */
	loopToSelection(): void;
	zoomReset(): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-note-editor": CompostNoteEditor;
	}
}
