import type { ParameterCurveName } from '../parameter-scale.js';

export type { ParameterEventDetail } from '../utils.js';

/**
 * `<compost-slider>`: a linear parameter control, horizontal or vertical.
 * Edits arrive as `parameter-begin`/`parameter-edit`/`parameter-end`
 * CustomEvents carrying the shared parameter detail.
 *
 * @attribute name
 * @attribute parameter-id - registers the slider with createParameterController
 * @attribute label
 * @attribute section - group heading for the accessibility description
 * @attribute orientation - 'horizontal' or 'vertical'
 * @attribute interaction - 'position' jumps to the pointer; 'relative' drags from the value
 * @attribute min
 * @attribute max
 * @attribute mid - value pinned to the centre of the scale
 * @attribute curve - linear, log or gain response
 * @attribute shape - curve exponent
 * @attribute position-step - position quantisation in 0..1
 * @attribute step - value step
 * @attribute display-fraction-digits - fixed decimals in the readout
 * @attribute value
 * @attribute text - pipe-delimited value labels
 * @attribute editable - allows inline value text editing
 * @attribute unit - suffix in the readout
 * @attribute reset-value - value the double-click reset returns to
 * @attribute min-label - label for the minimum edge
 * @attribute max-label - label for the maximum edge
 * @attribute parameter-kind - 'continuous', 'discrete' or 'trigger' override
 * @attribute disabled
 */
export class CompostSlider extends HTMLElement {
  name: string;
  parameterID: string;
  label: string;
  section: string;
  min: number;
  max: number;
  mid: number | null;
  curve: ParameterCurveName;
  shape: number | null;
  positionStep: number | null;
  step: number;
  displayFractionDigits: number | null;
  unit: string;
  valueText: string;
  resetValue: number;
  minLabel: string;
  maxLabel: string;

  get value(): number;
  set value(value: number);
  get editable(): boolean;
  get disabled(): boolean;
  set disabled(value: boolean);
  get parameterKind(): string;
  get orientation(): 'horizontal' | 'vertical';
  /** 'position' jumps to the pointer; 'relative' drags from the current value. */
  get interaction(): 'position' | 'relative';

  /** Sets the value, snapped and clamped; emits `parameter-edit` by default. */
  setValue(value: number, shouldEmit?: boolean, source?: string): void;
  /** Returns to the reset value and ends the gesture. */
  reset(): void;
  /** Opens the inline value editor on an editable slider. */
  beginValueEdit(initialValue?: string, selectValue?: boolean): void;
  /** The value's 0..1 position along the scale. */
  getPosition(): number;
  getPercent(): number;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-slider': CompostSlider;
  }
}
