/** The detail on `window-resize`; `resizing` is true during a grip drag. */
export interface WindowResizeDetail {
  width: number;
  height: number;
  resizing: boolean;
}

/** The detail on `window-move`. */
export interface WindowMoveDetail {
  x: number;
  y: number;
}

/** The detail on the cancelable `window-close` event. */
export interface WindowCloseDetail {
  reason: string;
}

/** Where a window goes when asked to move: the whole frame stays inside the viewport. */
export function boundedPosition(request: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}): {x: number, y: number};

/** Rounds a requested content size to one the window allows. */
export function constrainedSize(request: {
  width: number;
  height: number;
  current: {width: number, height: number};
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspectRatio?: number | null;
  axis?: 'both' | 'horizontal' | 'vertical' | 'none';
}): {width: number, height: number};

/**
 * `<compost-window>`: a floating window dragged by its header and resized
 * from a corner grip, never allowed past the viewport's edges. `width` and
 * `height` name the content size; the frame adds its own chrome. Emits
 * `window-open`, `window-close` (cancelable), `window-move`,
 * `window-resize` and `window-focus` CustomEvents.
 *
 * @attribute open - reflected open state
 * @attribute heading - visible title-bar text
 * @attribute x - viewport x of the frame
 * @attribute y - viewport y of the frame
 * @attribute width - content width in px
 * @attribute height - content height in px
 * @attribute min-width - smallest content width in px
 * @attribute min-height - smallest content height in px
 * @attribute max-width - largest content width in px
 * @attribute max-height - largest content height in px
 * @attribute aspect-ratio - width/height ratio kept while resizing
 * @attribute resizable - shows the corner resize grip
 * @attribute fullscreen - fills the viewport
 * @attribute sheet - bottom-sheet presentation
 * @attribute static - ignores drag and resize gestures
 */
export class CompostWindow extends HTMLElement {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspectRatio: number | null;

  get open(): boolean;
  set open(value: boolean);
  get heading(): string;
  set heading(value: string);
  get resizable(): 'both' | 'horizontal' | 'vertical' | 'none';

  /** The content box's size, in CSS pixels. */
  get contentSize(): {width: number, height: number};
  /** Sizes the content box, keeping the frame inside the viewport and the bounds. */
  setContentSize(width: number, height: number, options?: {emit?: boolean}): {width: number, height: number};
  /** Moves the frame, bounded to the viewport. */
  moveTo(x: number, y: number, options?: {emit?: boolean}): {x: number, y: number};
  /** Brings the window above every other compost-window. */
  raise(): void;
  /** Asks to close; the cancelable `window-close` event may keep it open. */
  requestClose(reason: string): void;
  close(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-window': CompostWindow;
  }
}
