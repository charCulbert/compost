import type { ParameterCurveName } from '../parameter-scale.js';

export type { ParameterEventDetail } from '../utils.js';

/**
 * `<compost-knob>`: a rotary parameter control. Edits arrive as
 * `parameter-begin`/`parameter-edit`/`parameter-end` CustomEvents carrying
 * the shared parameter detail.
 */
export class SynthKnob extends HTMLElement {
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

  /** Sets the value, snapped and clamped; emits `parameter-edit` by default. */
  setValue(value: number, shouldEmit?: boolean, source?: string): void;
  /** Returns to the reset value and ends the gesture. */
  reset(): void;
  /** Opens the inline value editor on an editable knob. */
  beginValueEdit(initialValue?: string, selectValue?: boolean): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-knob': SynthKnob;
  }
}
