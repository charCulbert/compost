/** The detail on `scope-frame`, fired after each drawn frame. */
export interface ScopeFrameDetail {
  /** The requestAnimationFrame timestamp. */
  time: number;
}

/**
 * `<compost-scope>`: a one-channel waveform renderer over caller-prepared
 * samples. Presentation is attribute-driven; `setSamples` supplies exactly
 * what is drawn. Emits `scope-frame` after an actual browser-frame draw.
 *
 * @attribute value-range - vertical span of the view in data units
 * @attribute y-offset - vertical centre offset in data units
 * @attribute x-markers - comma-separated vertical marker positions in data units
 * @attribute y-markers - comma-separated horizontal marker positions in data units
 * @attribute x-marker-labels - `position:label` pairs for the x markers
 * @attribute y-marker-labels - `position:label` pairs for the y markers
 */
export class CompostScope extends HTMLElement {
  valueRange: number;
  yOffset: number;
  /** Vertical marker positions in data units. */
  xMarkers: number[];
  /** Horizontal marker positions in data units. */
  yMarkers: number[];
  /** Displays one prepared channel, coalescing updates to browser frames. */
  setSamples(
    samples: ArrayLike<number>,
    options?: {copy?: boolean},
  ): this;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-scope': CompostScope;
  }
}
