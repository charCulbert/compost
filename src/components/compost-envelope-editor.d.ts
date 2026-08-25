/** One envelope point in caller-owned time/value units. */
export interface EnvelopePoint {
  time: number;
  value: number;
  [key: string]: unknown;
}

/** The detail on `envelope-input` and `envelope-change`. */
export interface EnvelopeChangeDetail {
  points: EnvelopePoint[];
}

/** The detail on `envelope-context`. */
export interface EnvelopeContextDetail {
  /** -1 when the context is empty surface rather than a point. */
  pointIndex: number;
  time: number;
  value: number;
  clientX: number;
  clientY: number;
}

/**
 * `<compost-envelope-editor>`: a generic time/value envelope surface. The
 * caller owns the points and what they mean; the editor only previews
 * gestures and emits replacement arrays as `envelope-input` (during a
 * gesture), `envelope-change` (commit) and `envelope-context` CustomEvents.
 */
export class CompostEnvelopeEditor extends HTMLElement {
  label: string;
  duration: number;
  min: number;
  max: number;
  scale: 'linear' | 'gain';
  stepped: boolean;
  step: number;
  snapMode: 'grid' | 'off';
  grid: number;
  draw: boolean;
  /** The painted time selection, or null. */
  selection: {start: number, end: number} | null;

  /** Copies of the points, clamped and time-sorted. */
  get points(): EnvelopePoint[];
  set points(points: EnvelopePoint[]);
  setPoints(points: EnvelopePoint[]): void;
  /** Paints a time selection; absent or equal edges clear it. */
  setSelection(start?: number, end?: number): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-envelope-editor': CompostEnvelopeEditor;
  }
}
