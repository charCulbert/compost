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

/**
 * `<compost-select>`: a combobox over its `<option>` children. Picking an
 * option sets `value` and emits a plain `change` event.
 */
export class CompostSelect extends HTMLElement {
  get value(): string;
  set value(value: string);
  get disabled(): boolean;
  set disabled(value: boolean);
  get open(): boolean;
  set open(value: boolean);

  toggle(): void;
  /** Picks an option by index; `notify` emits `change` when the value moved. */
  selectIndex(index: number, notify?: boolean): boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-select': CompostSelect;
  }
}
