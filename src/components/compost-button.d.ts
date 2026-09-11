export type { ParameterEventDetail } from "../utils.js";

/** The detail on `button-trigger` events. */
export interface ButtonTriggerDetail {
	name: string;
	parameterID: string;
	value: number;
	source: string;
}

/**
 * `<compost-button>`: a trigger, switch, or cycling choice button.
 *
 * @attribute label
 * @attribute mode - 'switch', 'trigger', or 'cycle'
 * @attribute name
 * @attribute parameter-id - registers the button with createParameterController
 * @attribute section - group heading for the accessibility description
 * @attribute pressed - reflected switch state
 * @attribute text - pipe- or comma-separated cycle labels
 * @attribute value
 * @attribute parameter-kind - 'continuous', 'discrete' or 'trigger' override
 * @attribute disabled
 * @attribute aria-label
 * @attribute aria-description
 */
export class CompostButton extends HTMLElement {
	get mode(): "switch" | "trigger" | "cycle";
	get pressed(): boolean;
	set pressed(value: boolean);
	/** The cycle index, or 1 while a switch is pressed and 0 otherwise. */
	get value(): number;
	set value(value: number);
	get parameterID(): string;
	get parameterKind(): "discrete" | "trigger";
	/** True only for a trigger button, whose value never rests at 1. */
	get transientParameter(): boolean;
	get parameterValues(): number[] | null;
	get min(): number | undefined;
	get max(): number | undefined;
	get step(): number | undefined;
	get disabled(): boolean;
	set disabled(value: boolean);

	/** Sets a cycle/switch state, or fires a trigger at >= 0.5. */
	setValue(value: number, shouldEmit?: boolean, source?: string): void;
	/** Fires the trigger action and its events. */
	trigger(source?: string): void;

	focus(options?: FocusOptions): void;
	blur(): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-button": CompostButton;
	}
}
