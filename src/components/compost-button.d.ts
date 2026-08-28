export type { ParameterEventDetail } from '../utils.js';

/** The detail on `button-trigger` events. */
export interface ButtonTriggerDetail {
  name: string;
  parameterID: string;
  value: number;
  source: string;
}

/**
 * `<compost-button>`: a trigger or switch button. A trigger press emits
 * `button-trigger` plus a parameter gesture; a switch toggles `pressed` and
 * emits `change` inside a parameter gesture.
 */
export class CompostButton extends HTMLElement {
  get mode(): 'switch' | 'trigger';
  get pressed(): boolean;
  set pressed(value: boolean);
  /** 1 while pressed, 0 otherwise; setting maps onto `pressed`. */
  get value(): number;
  set value(value: number);
  get parameterID(): string;
  get parameterKind(): 'discrete' | 'trigger';
  /** True for a trigger button, whose value never rests at 1. */
  get transientParameter(): boolean;
  get disabled(): boolean;
  set disabled(value: boolean);

  /** Sets the switch state, or fires a trigger at >= 0.5. */
  setValue(value: number, shouldEmit?: boolean, source?: string): void;
  /** Fires the trigger action and its events. */
  trigger(source?: string): void;

  focus(options?: FocusOptions): void;
  blur(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-button': CompostButton;
  }
}
