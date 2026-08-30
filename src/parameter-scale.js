const CURVES = new Set(["linear", "log", "gain"]);
const EPSILON = 1e-12;
const GAIN_POINTS = [
	[-90, 0],
	[-60, 0.1],
	[-48, 0.17],
	[-36, 0.25],
	[-24, 0.35],
	[-12, 0.5],
	[-6, 0.6],
	[0, 0.7],
	[6, 0.85],
	[12, 1],
];

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
	return clamp(Number(value), 0, 1);
}

function finiteNumber(value, fallback = null) {
	if (value === null || value === undefined || value === "") return fallback;
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function readCurveName(value) {
	if (value === null || value === undefined || value === "") return null;

	const name = String(value).trim().toLowerCase();
	return CURVES.has(name) ? name : null;
}

export function normaliseCurveName(value) {
	return readCurveName(value) || "linear";
}

export function normaliseParameterScale(options = {}) {
	const min = finiteNumber(options.min, 0);
	const max = finiteNumber(options.max, 1);
	const rawMid = options.mid ?? options.mappingMid ?? options.midiMid;
	const hasExplicitMid =
		options.hasMid ??
		options.midIsExplicit ??
		finiteNumber(rawMid, null) !== null;
	const fallbackMid = min + (max - min) / 2;
	const mid = finiteNumber(rawMid, fallbackMid);
	const curve = normaliseCurveName(options.curve);
	const explicitShape = finiteNumber(options.shape, null);
	const shape = Math.max(
		EPSILON,
		finiteNumber(
			explicitShape,
			curve === "log" && hasExplicitMid ? logShapeForMid({ min, max, mid }) : 1,
		),
	);

	return {
		min,
		max,
		mid,
		shape,
		hasMid: hasExplicitMid,
		curve: usableCurve(curve, { min, max, mid }),
	};
}

export function normalisedPositionToValue(position, options = {}) {
	const scale = normaliseParameterScale(options);
	const normal = clamp01(position);

	if (scale.max === scale.min) return scale.min;

	if (scale.curve === "gain") {
		const minPosition = gainValueToPosition(scale.min);
		const maxPosition = gainValueToPosition(scale.max);
		return gainPositionToValue(
			minPosition + normal * (maxPosition - minPosition),
		);
	}

	if (scale.curve === "log") {
		return scale.min * (scale.max / scale.min) ** (normal ** scale.shape);
	}

	if (scale.hasMid && isStrictlyBetween(scale.mid, scale.min, scale.max)) {
		return linearPositionToValue(normal, scale);
	}

	return scale.min + (scale.max - scale.min) * normal;
}

export function valueToNormalisedPosition(value, options = {}) {
	const scale = normaliseParameterScale(options);
	const number = finiteNumber(value, scale.min);

	if (scale.max === scale.min) return 0;

	const low = Math.min(scale.min, scale.max);
	const high = Math.max(scale.min, scale.max);
	const clampedValue = clamp(number, low, high);

	if (scale.curve === "gain") {
		const minPosition = gainValueToPosition(scale.min);
		const maxPosition = gainValueToPosition(scale.max);
		return clamp01(
			(gainValueToPosition(clampedValue) - minPosition) /
				(maxPosition - minPosition),
		);
	}

	if (scale.curve === "log") {
		const exponent =
			Math.log(clampedValue / scale.min) / Math.log(scale.max / scale.min);
		return clamp01(exponent ** (1 / scale.shape));
	}

	if (scale.hasMid && isStrictlyBetween(scale.mid, scale.min, scale.max)) {
		return valueToLinearPosition(clampedValue, scale);
	}

	return clamp01((clampedValue - scale.min) / (scale.max - scale.min));
}

export function moveValueByNormalisedDelta(value, delta, options = {}) {
	const position = valueToNormalisedPosition(value, options);
	return normalisedPositionToValue(position + Number(delta || 0), options);
}

export function normalisedKeyboardStep(options = {}) {
	const positionStep = finiteNumber(options.positionStep, null);
	if (positionStep !== null && positionStep > 0) {
		return clamp(positionStep, 0, 1);
	}

	const min = finiteNumber(options.min, 0);
	const max = finiteNumber(options.max, 1);
	const range = Math.abs(max - min);
	if (!(range > 0)) return 0.01;

	const valueStep = finiteNumber(options.step, null);
	const stepAsPosition =
		valueStep !== null && valueStep > 0 ? Math.abs(valueStep) / range : 0.01;
	return clamp(Math.max(0.01, stepAsPosition), 0, 1);
}

export function describeParameterScale(options = {}) {
	const scale = normaliseParameterScale(options);
	const shape = scale.shape === 1 ? "" : ` shape ${formatNumber(scale.shape)}`;

	if (scale.curve === "gain") return "gain curve";
	if (scale.curve === "log") return `log curve${shape}`;
	if (scale.hasMid && isStrictlyBetween(scale.mid, scale.min, scale.max)) {
		return `linear curve, center ${formatNumber(scale.mid)}`;
	}
	return "linear curve";
}

/** Values where a piecewise scale changes slope, excluding its range edges. */
export function parameterScaleBreakpoints(options = {}) {
	const scale = normaliseParameterScale(options);
	if (scale.curve !== "gain") return [];
	const low = Math.min(scale.min, scale.max);
	const high = Math.max(scale.min, scale.max);
	return GAIN_POINTS.map(([value]) => value).filter(
		(value) => value > low && value < high,
	);
}

function usableCurve(curve, { min, max }) {
	if (curve === "log" && !(min > 0 && max > 0 && min !== max)) return "linear";
	return curve;
}

function logShapeForMid({ min, max, mid }) {
	if (!(min > 0 && max > 0 && min !== max && isBetween(mid, min, max)))
		return 1;
	if (Math.abs(mid - min) <= EPSILON || Math.abs(mid - max) <= EPSILON)
		return 1;

	const exponentAtHalf = Math.log(mid / min) / Math.log(max / min);
	if (!(exponentAtHalf > 0 && exponentAtHalf < 1)) return 1;
	return Math.log(exponentAtHalf) / Math.log(0.5);
}

function isBetween(value, a, b) {
	return value >= Math.min(a, b) && value <= Math.max(a, b);
}

function isStrictlyBetween(value, a, b) {
	return value > Math.min(a, b) && value < Math.max(a, b);
}

function linearPositionToValue(position, scale) {
	if (position <= 0.5) {
		return scale.min + (scale.mid - scale.min) * (position / 0.5);
	}

	return scale.mid + (scale.max - scale.mid) * ((position - 0.5) / 0.5);
}

function valueToLinearPosition(value, scale) {
	const firstHalf =
		scale.max >= scale.min ? value <= scale.mid : value >= scale.mid;

	if (firstHalf) {
		return clamp01(0.5 * ((value - scale.min) / (scale.mid - scale.min)));
	}

	return clamp01(0.5 + 0.5 * ((value - scale.mid) / (scale.max - scale.mid)));
}

function gainValueToPosition(value) {
	const index = GAIN_POINTS.findIndex(([pointValue]) => value <= pointValue);
	const upper = index === -1 ? GAIN_POINTS.length - 1 : index === 0 ? 1 : index;
	const lower = upper - 1;
	return interpolate(
		value,
		GAIN_POINTS[lower][0],
		GAIN_POINTS[upper][0],
		GAIN_POINTS[lower][1],
		GAIN_POINTS[upper][1],
	);
}

function gainPositionToValue(position) {
	const index = GAIN_POINTS.findIndex(
		([, pointPosition]) => position <= pointPosition,
	);
	const upper = index === -1 ? GAIN_POINTS.length - 1 : index === 0 ? 1 : index;
	const lower = upper - 1;
	return interpolate(
		position,
		GAIN_POINTS[lower][1],
		GAIN_POINTS[upper][1],
		GAIN_POINTS[lower][0],
		GAIN_POINTS[upper][0],
	);
}

function interpolate(value, sourceMin, sourceMax, targetMin, targetMax) {
	return (
		targetMin +
		((value - sourceMin) / (sourceMax - sourceMin)) * (targetMax - targetMin)
	);
}

function formatNumber(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return String(value);
	return number.toFixed(4).replace(/\.?0+$/u, "");
}
