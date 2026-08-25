/** The detail on `drawer-resize`. */
export interface DrawerResizeDetail {
  size: number;
}

/**
 * `<compost-drawer>`: a collapsible panel docked to an edge, optionally
 * resizable by a handle. Emits a plain `toggle` event when it opens or
 * closes and `drawer-resize` CustomEvents while resizing.
 */
export class CompostDrawer extends HTMLElement {
  get open(): boolean;
  set open(value: boolean);
  get resizable(): boolean;
  set resizable(value: boolean);
  get edge(): 'top' | 'right' | 'bottom' | 'left';
  set edge(value: 'top' | 'right' | 'bottom' | 'left');
  get orientation(): 'horizontal' | 'vertical';
  /** The panel size along its resize axis, in pixels. */
  get size(): number;
  set size(value: number);
  get minSize(): number;
  get maxSize(): number;

  /** Sets the size, clamped to the bounds; `shouldEmit` fires `drawer-resize`. */
  setSize(value: number, shouldEmit?: boolean): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-drawer': CompostDrawer;
  }
}
