/** One envelope point in caller-owned time/value units. */
export interface EnvelopePoint {
  time: number;
  value: number;
  /** Curvature from -1 to 1 for the segment beginning here; zero is linear. */
  curve?: number;
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

/** The detail on `envelope-selection`; null edges mean the selection cleared. */
export interface EnvelopeSelectionDetail {
  start: number | null;
  end: number | null;
}

/**
 * `<compost-envelope-editor>`: a generic time/value envelope surface. The
 * caller owns the points and what they mean; the editor only previews
 * gestures and emits replacement arrays as `envelope-input` (during a
 * gesture), `envelope-change` (commit) and `envelope-context` CustomEvents.
 * Dragging empty space changes the selected time section and emits
 * `envelope-selection`.
 *
 * @attribute label
 * @attribute duration - envelope length in seconds
 * @attribute min - smallest value
 * @attribute max - largest value
 * @attribute scale - vertical scale name or exponent
 * @attribute stepped - draws a step curve
 * @attribute step - value snap step
 * @attribute snap - 'off' frees time from the grid
 * @attribute grid - time grid divisions
 * @attribute grid-lines - 'time' shows vertical rules; 'off' hides the grid
 * @attribute draw - freehand draw mode
 * @attribute readonly
 * @attribute disabled
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
  /** Which grid lines are visible: all, time divisions only, or none. */
  gridLines: 'all' | 'time' | 'off';
  draw: boolean;
  get readonly(): boolean;
  set readonly(value: boolean);
  get disabled(): boolean;
  set disabled(value: boolean);
  /** The painted time section, or null. */
  selection: {start: number, end: number} | null;

  /** Copies of the points, clamped and time-sorted. */
  get points(): EnvelopePoint[];
  set points(points: EnvelopePoint[]);
  setPoints(points: EnvelopePoint[]): void;
  /** Paints a time section; absent or equal edges clear it. */
  setSelection(start?: number, end?: number): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-envelope-editor': CompostEnvelopeEditor;
  }
}
