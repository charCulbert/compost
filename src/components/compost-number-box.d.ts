import type { ParameterCurveName } from '../parameter-scale.js';

export type { ParameterEventDetail } from '../utils.js';

/**
 * `<compost-number-box>`: a draggable, editable numeric field. Edits arrive
 * as `parameter-begin`/`parameter-edit`/`parameter-end` CustomEvents
 * carrying the shared parameter detail. With `allow-empty`, a cleared box
 * reads back as a null value.
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
  beginEdit(initialValue?: string, selectValue?: boolean): void;

  focus(options?: FocusOptions): void;
  blur(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-number-box': CompostNumberBox;
  }
}
