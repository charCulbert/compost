export type ClipState = 'stopped' | 'playing' | 'recording';

/** One slot's clip; a null slot is empty. */
export interface ClipSpec {
  name: string;
  /** Optional per-clip accent; otherwise the grid's accent is inherited. */
  color?: string;
  state?: ClipState;
  /** Whether this clip is waiting to launch while `state` remains current. */
  queued?: boolean;
  loop?: boolean;
  /** 0..1, washed behind a playing clip's name. */
  progress?: number;
  [key: string]: unknown;
}

/** The detail on slot-indexed intents (`clip-launch`, `clip-select`, ...). */
export interface ClipSlotDetail {
  index: number;
}

/** The detail on `clip-open` and `clip-context`. */
export interface ClipPointDetail extends ClipSlotDetail {
  altKey?: boolean;
  clientX?: number;
  clientY?: number;
}

/** The detail on `clip-rename`. */
export interface ClipRenameDetail extends ClipSlotDetail {
  name: string;
}

/** The detail on `clip-move`. */
export interface ClipMoveDetail extends ClipSlotDetail {
  to: number;
}

/** The detail on `clip-drop`, fired on the receiving grid. */
export interface ClipDropDetail {
  source: CompostClipGrid;
  fromIndex: number;
  toIndex: number;
  copy: boolean;
}

/** Which slot a pointer at `y` lands in, given the rows' boxes. */
export function slotIndexAt(y: number, rows: DOMRect[]): number;

/**
 * `<compost-clip-grid>`: one track's column of clip slots. The grid only
 * draws states and reports intent: `clip-launch`, `clip-stop`,
 * `clip-record`, `clip-select`, `clip-open`, `clip-context`, `clip-rename`,
 * `clip-delete`, `clip-duplicate`, `clip-move`, `clip-drag-start`,
 * `clip-drag-end` and `clip-drop`. The host decides what each intent means.
 *
 * @attribute slots - number of clip slots (1-512)
 * @attribute label
 * @attribute armed - record-arms the track
 * @attribute selected - index of the selected slot; absent clears
 * @attribute selection - further slot indexes marked as selected, space-separated; absent clears
 * @attribute record-queued - slot index queued for recording; reflected
 * @attribute stop - index of the playing slot; absent clears
 * @attribute disabled
 * @attribute show-stop - shows the stop square while a clip plays
 */
export class CompostClipGrid extends HTMLElement {
  slotCount: number;
  label: string;

  /** Copies of the slots, one entry per slot, null for an empty one. */
  get clips(): (ClipSpec | null)[];
  set clips(value: (ClipSpec | null)[]);
  /** The selected slot index, or -1. */
  get selected(): number;
  set selected(index: number | null);
  /** The slots marked as part of a wider selection, beside the selected one. */
  get selection(): number[];
  set selection(indexes: number[] | null);
  /** The empty slot waiting to begin recording, or -1. */
  get recordQueued(): number;
  set recordQueued(index: number | null);
  get armed(): boolean;
  get disabled(): boolean;
  set disabled(value: boolean);
  /** The stop slot's state: '' (idle), 'active' or 'queued'. */
  get stopState(): '' | 'active' | 'queued';

  /** Replaces every slot: one entry per slot, null for an empty one. */
  setClips(clips: (ClipSpec | null)[]): void;
  /** Cheap per-frame update of one playing clip's progress, 0..1. */
  setProgress(index: number, progress: number): void;
  /** Lights a row across the grid, as the scene launcher does when hovered. */
  highlightRow(index: number, on: boolean): void;
  /** Opens an inline editor on a clip's name; the result arrives as `clip-rename`. */
  beginRename(index: number): void;
  focusSlot(index: number): void;
  /** The slot under a viewport y, or -1. */
  slotIndexAtPoint(clientY: number): number;
  /** Marks the slot a drag would land in; -1 clears it. */
  markDrop(index: number, copy: boolean): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-clip-grid': CompostClipGrid;
  }
}
