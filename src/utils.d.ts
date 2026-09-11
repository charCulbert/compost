/** Registers a custom element unless the name is already taken. */
export function defineElement(
	name: string,
	elementConstructor: CustomElementConstructor,
): void;

export function clamp(value: number, min: number, max: number): number;

/** Reads a numeric attribute, falling back when absent or not finite. */
export function numberAttr(
	element: Element,
	name: string,
	fallback: number,
): number;

/** Rounds a value to the nearest multiple of `step`; a falsy step disables snapping. */
export function snap(value: number, step: number): number;

/** The value change one dragged pixel is worth across a range. */
export function rangeDragIncrement(
	min: number,
	max: number,
	pixels?: number,
): number;

/** Splits a `text`/`options` attribute on `|` or `,` into trimmed labels. */
export function splitValueTextOptions(text?: string): string[];

/** The label for an integer value from a text-option list, or null. */
export function valueTextOption(
	value: unknown,
	text?: string | string[],
): string | null;

/** How many fraction digits a step implies, unless overridden explicitly. */
export function fractionDigitsForStep(
	step: number,
	displayFractionDigits?: number | string | null,
): number;

export function formatNumber(
	value: unknown,
	step: number,
	displayFractionDigits?: number | string | null,
): string;

/** Formats a value with text options, edge labels and a unit suffix. */
export function formatValue(
	value: number,
	step: number,
	unit?: string,
	text?: string | string[],
	displayFractionDigits?: number | string | null,
	bounds?: {
		min?: number;
		max?: number;
		minLabel?: string;
		maxLabel?: string;
	} | null,
): string;

/** Numeric configuration understood by controller-compatible controls. */
export interface ParameterControlConfiguration {
	parameterID?: string;
	kind?: ParameterKind;
	name?: string;
	label?: string;
	min?: number;
	max?: number;
	defaultValue?: number;
	resetValue?: number;
	step?: number;
	values?: readonly number[] | null;
	unit?: string;
	readOnly?: boolean;
	disabled?: boolean;
	mid?: number | null;
	curve?: string | null;
	shape?: number | null;
}

/** A structural numeric control; it need not be an element or event target. */
export interface ParameterControl {
	value?: number | null;
	parameterID?: string;
	parameterKind?: ParameterKind;
	name?: string;
	label?: string;
	min?: number;
	max?: number;
	resetValue?: number;
	step?: number;
	parameterValues?: readonly number[] | null;
	unit?: string;
	readOnly?: boolean;
	disabled?: boolean;
	mid?: number | null;
	curve?: string | null;
	shape?: number | null;
	eventTarget?: EventTarget;
	setValue?: (value: number, shouldEmit?: boolean, source?: string) => void;
	configure?(configuration: ParameterControlConfiguration): void;
	getParameterValue?(): number;
	getAttribute?(name: string): string | null;
	setAttribute?(name: string, value: string): void;
	removeAttribute?(name: string): void;
	hasAttribute?(name: string): boolean;
	toggleAttribute?(name: string, force?: boolean): boolean;
}

/** A parameter control that emits its own gesture events. */
export type ParameterEventControl = ParameterControl &
	Pick<EventTarget, "dispatchEvent">;

/** The three shapes a parameter edit can take: free values, fixed choices, momentary presses. */
export type ParameterKind = "continuous" | "discrete" | "trigger";

/**
 * The detail every `parameter-begin`/`parameter-edit`/`parameter-end`
 * CustomEvent carries. Extra gesture fields ride along untyped.
 */
export interface ParameterEventDetail {
	parameterID: string;
	value: number;
	kind: ParameterKind;
	source: string;
	cancelled: boolean;
	[key: string]: unknown;
}

/** Builds the shared parameter event detail for a control. */
export function parameterEventDetail(
	control: ParameterControl,
	value: number,
	extra?: Record<string, unknown>,
): ParameterEventDetail;

/** Dispatches `parameter-begin` once for the gesture. */
export function beginParameterGesture(
	control: ParameterEventControl,
	value?: number,
	extra?: Record<string, unknown>,
): void;

/** Dispatches `parameter-edit`, beginning the gesture first when needed. */
export function editParameterGesture(
	control: ParameterEventControl,
	value?: number,
	extra?: Record<string, unknown>,
): void;

/** Dispatches `parameter-end`; `{cancelled: true}` restores the start value. */
export function endParameterGesture(
	control: ParameterEventControl,
	value?: number,
	extra?: Record<string, unknown>,
): void;
