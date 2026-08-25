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
export interface NotesChangeDetail { notes: RollNote[] }
/** The detail on `loop-change`, `loop-input`, `range-change` and `range-input`. */
export interface NoteRangeDetail { start: number, end: number }
/** The detail on `selection-change`. */
export interface NoteSelectionDetail { ids: string[] }
/** The detail on `note-preview`. */
export interface NotePreviewDetail { note: number, velocity: number, channel: number }
/** The detail on `note-context`. */
export interface NoteContextDetail { id: string | undefined, clientX: number, clientY: number }

/** The bar and beat labels a ruler shows, sparser when beats are tight. */
export function rulerLabels(beats: number, beatsPerBar: number, pxPerBeat: number): {beat: number, text: string}[];

/** A length in beats, written the way a musician reads it. */
export function lengthText(duration: number): string;

/**
 * `<compost-note-editor>`: a MIDI note editor. It edits a note list and
 * draws the playhead position it is given; it neither plays nor schedules
 * anything. Emits `notes-change`, `loop-input`/`loop-change`,
 * `range-input`/`range-change`, `selection-change`, `note-preview` and
 * `note-context` CustomEvents.
 */
export class CompostNoteEditor extends HTMLElement {
  label: string;
  beatsPerBar: number;
  grid: number;
  snapMode: 'grid' | 'off';
  rangeStart: number;
  rangeEnd: number;
  loopStart: number;
  loopEnd: number;
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
  get selectedIds(): string[];
  get pxPerBeat(): number;

  /** Sets the non-destructive playback range, in beats. The loop remains nested. */
  setRange(start: number, end: number, shouldEmit?: boolean): void;
  /** Sets the loop region, in beats. */
  setLoop(start: number, end: number, shouldEmit?: boolean): void;
  /** Snaps the selection, or everything when nothing is selected. */
  quantize(options?: {lengths?: boolean, division?: number}): void;
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
    'compost-note-editor': CompostNoteEditor;
  }
}
