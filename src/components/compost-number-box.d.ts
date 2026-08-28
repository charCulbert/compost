import type { ParameterCurveName } from '../parameter-scale.js';

export type { ParameterEventDetail } from '../utils.js';

/**
 * `<compost-number-box>`: a draggable, editable numeric field. Edits arrive
 * as `parameter-begin`/`parameter-edit`/`parameter-end` CustomEvents
 * carrying the shared parameter detail. With `allow-empty`, a cleared box
 * reads back as a null value.
 *
 * @attribute name
 * @attribute parameter-id - registers the box with createParameterController
 * @attribute label
 * @attribute aria-label
 * @attribute section - group heading for the accessibility description
 * @attribute min
 * @attribute max
 * @attribute mid - value pinned to the centre of the scale
 * @attribute curve - linear, log or gain response
 * @attribute shape - curve exponent
 * @attribute step - value step
 * @attribute display-fraction-digits - fixed decimals in the readout
 * @attribute value
 * @attribute text - pipe-delimited value labels
 * @attribute unit - suffix in the readout
 * @attribute reset-value - value the desktop double-click reset returns to;
 * touch taps open the numeric editor
 * @attribute min-label - label for the minimum edge
 * @attribute max-label - label for the maximum edge
 * @attribute placeholder - shown while the box reads as empty
 * @attribute allow-empty - a cleared box reads back as a null value
 * @attribute parameter-kind - 'continuous', 'discrete' or 'trigger' override
 * @attribute disabled
 * @attribute pointer-lock - locks the pointer during drags so it cannot leave the box
 * @attribute split-drag - vertical drag zones with their own step sizes
 * @attribute drag-step-left - value change per px in the left zone
 * @attribute drag-step-middle - value change per px in the middle zone
 * @attribute drag-step-right - value change per px in the right zone
 * @attribute fine-drag-scale - multiplier for fine drags
 */
export class CompostNumberBox extends HTMLElement {
  name: string;
  parameterID: string;
  label: string;
  section: string;
  min: number;
  max: number;
  mid: number | null;
  curve: ParameterCurveName;
  shape: number | null;
  step: number;
  displayFractionDigits: number | null;
  unit: string;
  valueText: string;
  resetValue: number;
  minLabel: string;
  maxLabel: string;
  placeholder: string;
  /** True while the box shows its placeholder instead of a value. */
  empty: boolean;

  /** The value, or null while empty. Setting null clears an `allow-empty` box. */
  get value(): number | null;
  set value(value: number | string | null);
  get allowEmpty(): boolean;
  get disabled(): boolean;
  set disabled(value: boolean);
  get parameterKind(): string;

  /** Sets the value, snapped and clamped; emits `parameter-edit` by default. */
  setValue(value: number | string | null, shouldEmit?: boolean, source?: string): void;
  getParameterValue(): number | null;
  /** Opens the inline text editor. */
  beginEdit(initialValue?: string, selectValue?: boolean, gestureAlreadyBegun?: boolean): void;

  focus(options?: FocusOptions): void;
  blur(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-number-box': CompostNumberBox;
  }
}
