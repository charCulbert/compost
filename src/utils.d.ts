/** Registers a custom element unless the name is already taken. */
export function defineElement(name: string, constructor: CustomElementConstructor): void;

export function clamp(value: number, min: number, max: number): number;

/** Reads a numeric attribute, falling back when absent or not finite. */
export function numberAttr(element: Element, name: string, fallback: number): number;

/** Rounds a value to the nearest multiple of `step`; a falsy step disables snapping. */
export function snap(value: number, step: number): number;

/** The value change one dragged pixel is worth across a range. */
export function rangeDragIncrement(min: number, max: number, pixels?: number): number;

/** Splits a `text`/`options` attribute on `|` or `,` into trimmed labels. */
export function splitValueTextOptions(text?: string): string[];

/** The label for an integer value from a text-option list, or null. */
export function valueTextOption(value: unknown, text?: string | string[]): string | null;

/** How many fraction digits a step implies, unless overridden explicitly. */
export function fractionDigitsForStep(step: number, displayFractionDigits?: number | string | null): number;

export function formatNumber(value: unknown, step: number, displayFractionDigits?: number | string | null): string;

/** Formats a value with text options, edge labels and a unit suffix. */
export function formatValue(
  value: number,
  step: number,
  unit?: string,
  text?: string | string[],
  displayFractionDigits?: number | string | null,
  bounds?: {min?: number, max?: number, minLabel?: string, maxLabel?: string} | null,
): string;

/** A control that carries a parameter identity and value. */
export interface ParameterControl extends HTMLElement {
  value?: number | null;
  parameterID?: string;
  parameterKind?: ParameterKind;
  setValue?: (value: number, shouldEmit?: boolean, source?: string) => void;
}

/** The three shapes a parameter edit can take: free values, fixed choices, momentary presses. */
export type ParameterKind = 'continuous' | 'discrete' | 'trigger';

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
export function beginParameterGesture(control: ParameterControl, value?: number, extra?: Record<string, unknown>): void;

/** Dispatches `parameter-edit`, beginning the gesture first when needed. */
export function editParameterGesture(control: ParameterControl, value?: number, extra?: Record<string, unknown>): void;

/** Dispatches `parameter-end`; `{cancelled: true}` restores the start value. */
export function endParameterGesture(control: ParameterControl, value?: number, extra?: Record<string, unknown>): void;
