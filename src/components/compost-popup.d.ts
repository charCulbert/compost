/** One entry for `setItems`; '-' or null is a separator. */
export type PopupItem = {
  value?: string;
  label?: string;
  detail?: string;
  color?: string;
  swatch?: boolean;
  disabled?: boolean;
  selected?: boolean;
} | string | null;

/** The detail on `popup-select`. */
export interface PopupSelectDetail {
  value: string;
  index: number;
  label: string;
}

/** The detail on `popup-close`. */
export interface PopupCloseDetail {
  reason: string;
}

/** Where a popup anchored to a trigger lands, kept inside the viewport. */
export function popupPlacement(request: {
  trigger: DOMRect;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  popupOffset?: number;
  margin?: number;
}): {left: number, top: number, width: number, maxHeight: number, openAbove: boolean};

/** Where a popup opened from a point (a context menu) lands. */
export function pointPlacement(request: {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  margin?: number;
}): {left: number, top: number, width: number, height: number};

/**
 * `<compost-popup>`: a small menu anchored to a control or opened at a
 * point. Purely UI: a pick emits `popup-select` and closes; the host
 * decides what it means. Also emits `popup-open` and `popup-close`.
 *
 * @attribute open - reflected open state
 * @attribute heading - visible heading above the items
 * @attribute value - selected value
 * @attribute label - accessible menu name
 * @attribute sheet - bottom-sheet presentation
 */
export class CompostPopup extends HTMLElement {
  activeIndex: number;
  /** The popover element inside the shadow root, for styling hooks. */
  menu: HTMLElement;

  get isOpen(): boolean;
  get value(): string;
  set value(value: string | null);

  /**
   * Opens beside an anchor (an element or a DOMRect) or at a point. Without
   * either, it opens where it last did, or at the top left of the viewport.
   */
  open(request?: {anchor?: Element | DOMRect | null, x?: number, y?: number}): void;
  openAt(x: number, y: number): void;
  close(reason?: string): void;

  /** Replaces the options from plain data; '-' entries become separators. */
  setItems(items: PopupItem[]): void;
  /** Highlights an item by index; -1 clears the highlight. */
  setActive(index: number, scroll?: boolean): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-popup': CompostPopup;
  }
}
