/** The detail on `scope-frame`, fired after each drawn frame. */
export interface ScopeFrameDetail {
  /** The requestAnimationFrame timestamp. */
  time: number;
}

/**
 * `<compost-scope>`: a one-channel waveform renderer over caller-prepared
 * samples. Presentation is attribute-driven; `setSamples` supplies exactly
 * what is drawn. Emits `scope-frame` after an actual browser-frame draw.
 */
export class CompostScope extends HTMLElement {
  valueRange: number;
  yOffset: number;
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
