/**
 * `<compost-select>`: a native-backed select for discrete numeric parameters.
 * User choices emit `parameter-begin`/`parameter-edit`/`parameter-end`, and
 * `setValue(value, false)` applies host updates silently.
 *
 * @attribute value
 * @attribute parameter-kind - 'continuous', 'discrete' or 'trigger' override
 * @attribute disabled
 * @attribute label
 * @attribute name
 * @attribute parameter-id - registers the select with createParameterController
 * @attribute aria-label
 * @attribute aria-labelledby
 * @attribute aria-description
 * @attribute aria-describedby
 */
export class CompostSelect extends HTMLElement {
	get value(): string;
	set value(value: string | number);
	get disabled(): boolean;
	set disabled(value: boolean);
	get parameterKind(): "discrete";
	get parameterValues(): number[] | null;
	get min(): number;
	get max(): number;
	get step(): 0;

	getParameterValue(): number;
	/** Sets a matching option; `shouldEmit = false` is a silent host update. */
	setValue(
		value: string | number,
		shouldEmit?: boolean,
		source?: string,
	): boolean;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-select": CompostSelect;
	}
}
