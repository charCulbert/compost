export type ParameterCurveName = "linear" | "log" | "gain";

/** The options every scale function accepts; unset fields take sane defaults. */
export interface ParameterScaleOptions {
	min?: number | string | null;
	max?: number | string | null;
	mid?: number | string | null;
	mappingMid?: number | string | null;
	midiMid?: number | string | null;
	hasMid?: boolean;
	midIsExplicit?: boolean;
	curve?: string | null;
	shape?: number | string | null;
}

export interface NormalisedParameterScale {
	min: number;
	max: number;
	mid: number;
	shape: number;
	hasMid: boolean;
	curve: ParameterCurveName;
}

/** Lower-cases a curve name, falling back to 'linear'. */
export function normaliseCurveName(value: unknown): ParameterCurveName;

/** Resolves the scale options into finite bounds and a usable curve. */
export function normaliseParameterScale(
	options?: ParameterScaleOptions,
): NormalisedParameterScale;

/** Maps a 0..1 position onto the parameter's value range. */
export function normalisedPositionToValue(
	position: number,
	options?: ParameterScaleOptions,
): number;

/** Maps a value onto its 0..1 position along the scale. */
export function valueToNormalisedPosition(
	value: number,
	options?: ParameterScaleOptions,
): number;

/** Moves a value by a delta expressed in normalised position. */
export function moveValueByNormalisedDelta(
	value: number,
	delta: number,
	options?: ParameterScaleOptions,
): number;

/** The 0..1 step a keyboard arrow moves, from a position or value step. */
export function normalisedKeyboardStep(
	options?: ParameterScaleOptions & {
		positionStep?: number | string | null;
		step?: number | string | null;
	},
): number;

/** A short human description of the scale, for accessibility text. */
export function describeParameterScale(options?: ParameterScaleOptions): string;

/** Values where a piecewise scale changes slope, excluding its range edges. */
export function parameterScaleBreakpoints(
	options?: ParameterScaleOptions,
): number[];
