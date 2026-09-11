import type { ParameterCurveName } from "./parameter-scale.js";
import type { ParameterKind } from "./utils.js";

export interface ValueControlDrawState {
	value: number;
	position: number;
	valueText: string;
	focused: boolean;
	dragging: boolean;
	disabled: boolean;
}

export interface ValueControlDragOptions {
	/** Horizontal increases rightward; vertical increases upward. */
	axis?: "x" | "y";
	mode?: "relative" | "position";
	/** Pointer pixels that traverse the full normalized range in relative mode. */
	distance?: number;
	/** Relative-drag multiplier while Shift is held. */
	fineScale?: number;
	pointerLock?: boolean;
}

export interface ValueControlConfiguration {
	parameterID?: string;
	parameterKind?: ParameterKind;
	kind?: ParameterKind;
	name?: string;
	label?: string;
	min?: number;
	max?: number;
	mid?: number | null;
	curve?: ParameterCurveName | string | null;
	shape?: number | null;
	positionStep?: number | null;
	step?: number;
	value?: number;
	resetValue?: number;
	defaultValue?: number;
	unit?: string;
	text?: string | string[];
	displayFractionDigits?: number | null;
	minLabel?: string;
	maxLabel?: string;
	disabled?: boolean;
	readOnly?: boolean;
	orientation?: "horizontal" | "vertical";
	drag?: ValueControlDragOptions;
	formatValue?: (value: number, control: ValueControl) => string;
	draw?: (state: ValueControlDrawState) => void;
}

export interface ValueControlOptions extends ValueControlConfiguration {
	/** Receives parameter events; defaults to the semantic element. */
	eventTarget?: EventTarget;
	/** Receives automatic gestures; null enables manual shared-target hit testing. */
	pointerTarget?: HTMLElement | null;
}

export interface ValueControl {
	readonly element: HTMLElement;
	readonly eventTarget: EventTarget;
	readonly pointerTarget: HTMLElement | null;
	readonly parameterID: string;
	readonly parameterKind: ParameterKind;
	readonly parameterValues: null;
	readonly name: string;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly mid: number | null;
	readonly curve: ParameterCurveName;
	readonly shape: number | null;
	readonly positionStep: number | null;
	readonly step: number;
	readonly unit: string;
	readonly resetValue: number;
	readonly disabled: boolean;
	readonly readOnly: boolean;
	readonly value: number;
	setValue(value: number, shouldEmit?: boolean, source?: string): void;
	/** Cancels an active gesture before applying this partial configuration. */
	configure(options: Partial<ValueControlConfiguration>): ValueControl;
	beginGesture(source?: string): void;
	editValue(value: number, source?: string): void;
	endGesture(cancelled?: boolean, source?: string): void;
	reset(source?: string): void;
	startPointerDrag(event: PointerEvent): boolean;
	/** Cancels interaction, removes listeners, and restores owned ARIA attributes. */
	dispose(): void;
}

export function createValueControl(
	element: HTMLElement,
	options?: ValueControlOptions,
): ValueControl;
