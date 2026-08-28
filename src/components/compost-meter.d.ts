/** One meter lane's levels; null hides a bar, Infinity pins to an edge. */
export interface MeterChannelState {
  label?: string;
  primary?: number | null;
  secondary?: number | null;
  peak?: number | null;
  /** A number draws the over bar from zero; true reuses `primary`. */
  over?: number | boolean | null;
  clipped?: boolean;
}

export interface MeterState {
  primaryLabel?: string;
  secondaryLabel?: string;
  holdLabel?: string;
  unit?: string;
  channels?: MeterChannelState[];
}

/**
 * `<compost-meter>`: a level meter of one lane per channel, with primary,
 * secondary, peak-hold and over bars. Purely presentational; the host
 * pushes levels through `setState`.
 *
 * @attribute label - accessible name
 * @attribute min - smallest level
 * @attribute max - largest level
 * @attribute mid - value pinned to the centre of the scale
 * @attribute curve - linear, log or gain response
 * @attribute shape - curve exponent
 */
export class CompostMeter extends HTMLElement {
  get min(): number;
  get max(): number;

  /** Merges partial state and repaints; channels replace wholesale. */
  setState(state?: MeterState): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-meter': CompostMeter;
  }
}
