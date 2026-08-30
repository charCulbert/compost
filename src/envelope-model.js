import {
	normalisedPositionToValue,
	valueToNormalisedPosition,
} from "./parameter-scale.js";
import { clamp } from "./utils.js";

// A numerical guard for coincident points, not a timeline resolution.
export const MIN_ENVELOPE_TIME = 1e-9;

const finiteClamp = (value, min, max) =>
	clamp(Number.isFinite(value) ? value : min, min, max);

export function envelopeRange(min, max) {
	const source = min && typeof min === "object" ? min : { min, max };
	const low = Number.isFinite(Number(source.min)) ? Number(source.min) : 0;
	const high = Number.isFinite(Number(source.max)) ? Number(source.max) : 1;
	return low <= high ? { min: low, max: high } : { min: high, max: low };
}

function geometryArgs(min, max, height, scale) {
	if (min && typeof min === "object") {
		return {
			range: envelopeRange(min),
			height: max,
			scale: typeof height === "string" ? height : "linear",
		};
	}
	return { range: envelopeRange(min, max), height, scale };
}

export function envelopeValueToY(value, min, max, height, scale = "linear") {
	const args = geometryArgs(min, max, height, scale);
	const rowHeight = Math.max(1, Number(args.height) || 1);
	const bounded = finiteClamp(Number(value), args.range.min, args.range.max);
	const fraction =
		args.scale === "gain"
			? valueToNormalisedPosition(bounded, { ...args.range, curve: "gain" })
			: args.range.max === args.range.min
				? 0.5
				: (bounded - args.range.min) / (args.range.max - args.range.min);
	return (1 - clamp(fraction, 0, 1)) * rowHeight;
}

export function envelopeValueFromY(y, min, max, height, scale = "linear") {
	const args = geometryArgs(min, max, height, scale);
	const rowHeight = Math.max(1, Number(args.height) || 1);
	const fraction = clamp(1 - (Number(y) || 0) / rowHeight, 0, 1);
	const value =
		args.scale === "gain"
			? normalisedPositionToValue(fraction, { ...args.range, curve: "gain" })
			: args.range.min + fraction * (args.range.max - args.range.min);
	return finiteClamp(value, args.range.min, args.range.max);
}

export function addEnvelopePoint(points, point, min = 0, max = 1) {
	const range = envelopeRange(min, max);
	const next = Array.isArray(points)
		? points.map((entry) => ({ ...entry }))
		: [];
	next.push({
		...point,
		time: Math.max(0, Number(point?.time) || 0),
		value: finiteClamp(Number(point?.value), range.min, range.max),
	});
	return next.sort((a, b) => a.time - b.time);
}

export function moveEnvelopePoint(points, index, point, min = 0, max = 1) {
	const range = envelopeRange(min, max);
	const next = Array.isArray(points)
		? points.map((entry) => ({ ...entry }))
		: [];
	const current = next[Number(index)];
	if (!current) return next;
	const before = next[Number(index) - 1]?.time ?? 0;
	const after = next[Number(index) + 1]?.time ?? Number.POSITIVE_INFINITY;
	current.time = clamp(Math.max(0, Number(point?.time) || 0), before, after);
	current.value = finiteClamp(Number(point?.value), range.min, range.max);
	return next;
}

export function preserveEnvelopeEdgePoints(originPoints, movedPoints, index) {
	const source = Array.isArray(originPoints) ? originPoints : [];
	const next = (Array.isArray(movedPoints) ? movedPoints : []).map((point) => ({
		...point,
	}));
	const pointIndex = Number(index);
	const origin = source[pointIndex];
	const moved = next[pointIndex];
	if (!origin || !moved) return next;
	if (
		pointIndex === 0 &&
		Number(moved.time) > Number(origin.time) + MIN_ENVELOPE_TIME
	)
		next.push({ ...origin });
	if (
		pointIndex === source.length - 1 &&
		Number(moved.time) < Number(origin.time) - MIN_ENVELOPE_TIME
	)
		next.push({ ...origin });
	return next.sort((a, b) => Number(a.time) - Number(b.time));
}

export function deleteEnvelopePoint(points, index) {
	return (Array.isArray(points) ? points : [])
		.filter((_, entryIndex) => entryIndex !== Number(index))
		.map((entry) => ({ ...entry }));
}

export function snapEnvelopeValue(value, min = 0, max = 1, step = 0) {
	const range = envelopeRange(min, max);
	const increment = Number(step);
	const bounded = finiteClamp(Number(value), range.min, range.max);
	if (!(increment > 0) || !Number.isFinite(increment)) return bounded;
	return finiteClamp(
		Math.round((bounded - range.min) / increment) * increment + range.min,
		range.min,
		range.max,
	);
}

export function effectiveEnvelopeStep(stepped = false, step) {
	if (step === undefined || step === null || step === "")
		return stepped ? 1 : 0;
	const increment = Number(step);
	return increment > 0 && Number.isFinite(increment) ? increment : 0;
}

/** Map linear segment progress through a signed, endpoint-preserving curve. */
export function envelopeCurvePosition(position, curve = 0) {
	const amount = clamp(Number(position) || 0, 0, 1);
	const bend = clamp(Number(curve) || 0, -1, 1);
	if (Math.abs(bend) < 1e-9) return amount;
	const exponent = bend * 8;
	return Math.expm1(exponent * amount) / Math.expm1(exponent);
}

export function envelopeValueAtTime(
	points,
	time,
	min = 0,
	max = 1,
	scale = "linear",
	stepped = false,
) {
	const range = envelopeRange(min, max);
	const sorted = (Array.isArray(points) ? points : [])
		.filter(
			(point) =>
				Number.isFinite(Number(point?.time)) &&
				Number.isFinite(Number(point?.value)),
		)
		.map((point) => ({
			...point,
			time: Math.max(0, Number(point.time)),
			value: finiteClamp(Number(point.value), range.min, range.max),
		}))
		.sort((a, b) => a.time - b.time);
	if (!sorted.length) return range.min;
	const at = Math.max(0, Number(time) || 0);
	if (at <= sorted[0].time) return sorted[0].value;
	const last = sorted.at(-1);
	if (at >= last.time) return last.value;
	for (let index = 1; index < sorted.length; index += 1) {
		const next = sorted[index];
		const previous = sorted[index - 1];
		if (at > next.time) continue;
		if (stepped) return at === next.time ? next.value : previous.value;
		if (next.time <= previous.time) return previous.value;
		const amount = envelopeCurvePosition(
			(at - previous.time) / (next.time - previous.time),
			previous.curve,
		);
		return finiteClamp(
			previous.value + (next.value - previous.value) * amount,
			range.min,
			range.max,
		);
	}
	return last.value;
}

/** Insert a point on the existing envelope without changing its shape. */
export function splitEnvelopeAtTime(
	points,
	time,
	min = 0,
	max = 1,
	scale = "linear",
	stepped = false,
) {
	const at = Math.max(0, Number(time) || 0);
	const source = (Array.isArray(points) ? points : [])
		.map((point) => ({ ...point }))
		.sort((a, b) => Number(a.time) - Number(b.time));
	if (
		source.some(
			(point) => Math.abs(Number(point.time) - at) <= MIN_ENVELOPE_TIME,
		)
	)
		return source;
	const value = envelopeValueAtTime(source, at, min, max, scale, stepped);
	const beforeIndex = source.findLastIndex((point) => Number(point.time) < at);
	const before = source[beforeIndex];
	const after = source[beforeIndex + 1];
	const inserted = { time: at, value };
	if (!stepped && before && after && Number(after.time) > Number(before.time)) {
		const position =
			(at - Number(before.time)) / (Number(after.time) - Number(before.time));
		const curve = clamp(Number(before.curve) || 0, -1, 1);
		before.curve = curve * position;
		inserted.curve = curve * (1 - position);
	}
	source.push(inserted);
	return source.sort((a, b) => Number(a.time) - Number(b.time));
}

/** Copy a bounded envelope shape, including exact partial curves at its edges. */
export function sliceEnvelopeRange(
	points,
	start,
	end,
	min = 0,
	max = 1,
	scale = "linear",
	stepped = false,
) {
	const low = Math.max(0, Math.min(Number(start) || 0, Number(end) || 0));
	const high = Math.max(low, Math.max(Number(start) || 0, Number(end) || 0));
	if (!(high > low + MIN_ENVELOPE_TIME)) return [];
	let split = splitEnvelopeAtTime(points, low, min, max, scale, stepped);
	split = splitEnvelopeAtTime(split, high, min, max, scale, stepped);
	const result = split.filter(
		(point) =>
			Number(point.time) >= low - MIN_ENVELOPE_TIME &&
			Number(point.time) <= high + MIN_ENVELOPE_TIME,
	);
	if (result.length) delete result.at(-1).curve;
	return result;
}

function editOptions(options = {}) {
	const range = envelopeRange(options.min ?? options.range ?? 0, options.max);
	return {
		range,
		height: Math.max(1, Number(options.height) || 1),
		scale: options.scale === "gain" ? "gain" : "linear",
		stepped: Boolean(options.stepped),
		step: effectiveEnvelopeStep(
			Boolean(options.stepped),
			options.step ?? options.valueStep,
		),
	};
}

export function envelopeRangeEdgeValues(points, start, end, options = {}) {
	const { range, scale, stepped } = editOptions(options);
	const low = Math.min(Number(start) || 0, Number(end) || 0);
	const high = Math.max(Number(start) || 0, Number(end) || 0);
	return {
		start: envelopeValueAtTime(points, low, range, undefined, scale, stepped),
		end: envelopeValueAtTime(points, high, range, undefined, scale, stepped),
	};
}

function valueMovedByY(value, deltaY, options = {}) {
	const { range, height, scale, step } = editOptions(options);
	const y =
		envelopeValueToY(value, range, height, scale) + (Number(deltaY) || 0);
	return snapEnvelopeValue(
		envelopeValueFromY(y, range, height, scale),
		range,
		undefined,
		step || 0,
	);
}

export function moveEnvelopePointsByY(points, indexes, deltaY, options = {}) {
	const selected = new Set((Array.isArray(indexes) ? indexes : []).map(Number));
	return (Array.isArray(points) ? points : []).map((point, index) =>
		selected.has(index)
			? { ...point, value: valueMovedByY(point.value, deltaY, options) }
			: { ...point },
	);
}

export function moveEnvelopeRangeByY(points, start, end, deltaY, options = {}) {
	const { range, height, scale, stepped, step } = editOptions(options);
	const low = Math.min(Number(start) || 0, Number(end) || 0);
	const high = Math.max(Number(start) || 0, Number(end) || 0);
	const source = (Array.isArray(points) ? points : []).map((point) => ({
		...point,
	}));
	if (!(high > low + MIN_ENVELOPE_TIME)) return source;
	const edgeValues = envelopeRangeEdgeValues(source, low, high, {
		range,
		height,
		scale,
		stepped,
		step,
	});
	const selected = source
		.filter(
			(point) =>
				Number(point.time) >= low - MIN_ENVELOPE_TIME &&
				Number(point.time) <= high + MIN_ENVELOPE_TIME,
		)
		.map((point) => ({
			...point,
			value: valueMovedByY(point.value, deltaY, {
				range,
				height,
				scale,
				stepped,
				step,
			}),
		}));
	const edges = [
		{
			time: low,
			value: valueMovedByY(edgeValues.start, deltaY, {
				range,
				height,
				scale,
				stepped,
				step,
			}),
		},
		{
			time: high,
			value: valueMovedByY(edgeValues.end, deltaY, {
				range,
				height,
				scale,
				stepped,
				step,
			}),
		},
	];
	const outside = source.filter(
		(point) =>
			Number(point.time) < low - MIN_ENVELOPE_TIME ||
			Number(point.time) > high + MIN_ENVELOPE_TIME,
	);
	const unique = new Map();
	for (const point of [...outside, ...selected, ...edges])
		unique.set(Number(point.time).toFixed(9), point);
	return [...unique.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

export function thinEnvelopePoints(points, tolerance = 0) {
	const source = (Array.isArray(points) ? points : [])
		.filter(
			(point) =>
				Number.isFinite(Number(point?.time)) &&
				Number.isFinite(Number(point?.value)),
		)
		.map((point) => ({
			time: Math.max(0, Number(point.time)),
			value: Number(point.value),
		}))
		.sort((a, b) => a.time - b.time);
	if (source.length < 3) return source;
	const limit = Math.max(0, Number(tolerance) || 0);
	const result = [source[0]];
	for (let index = 1; index < source.length - 1; index += 1) {
		const previous = result.at(-1);
		const current = source[index];
		const next = source[index + 1];
		const span = next.time - previous.time;
		const expected =
			span > MIN_ENVELOPE_TIME
				? previous.value +
					((next.value - previous.value) * (current.time - previous.time)) /
						span
				: previous.value;
		if (span <= MIN_ENVELOPE_TIME || Math.abs(current.value - expected) > limit)
			result.push(current);
	}
	result.push(source.at(-1));
	return result;
}

export function drawEnvelopePoints(originPoints, samples, options = {}) {
	const range = envelopeRange(options.min ?? 0, options.max ?? 1);
	const valueStep = effectiveEnvelopeStep(
		Boolean(options.stepped),
		options.step ?? options.valueStep,
	);
	const raw = (Array.isArray(samples) ? samples : []).map((point) => ({
		time: Math.max(0, Number(point?.time) || 0),
		value: snapEnvelopeValue(Number(point?.value), range, undefined, valueStep),
	}));
	if (!raw.length)
		return (Array.isArray(originPoints) ? originPoints : []).map((point) => ({
			...point,
		}));
	const freehand = options.freehand || options.snap === "off";
	const tolerance =
		options.tolerance === undefined
			? (range.max - range.min) * 0.004
			: Math.max(0, Number(options.tolerance) || 0);
	let replacementStart = null;
	let replacementEnd = null;
	const generated = freehand
		? tolerance > 0
			? thinEnvelopePoints(raw, tolerance)
			: raw
		: (() => {
				const width = Math.max(
					MIN_ENVELOPE_TIME,
					Number(options.gridStep) || 1,
				);
				const cells = new Map();
				for (const point of raw)
					cells.set(Math.floor(point.time / width), point.value);
				const first = Math.min(...cells.keys());
				const last = Math.max(...cells.keys());
				replacementStart = first * width;
				replacementEnd = (last + 1) * width;
				const result = [];
				let previous = cells.get(first);
				for (let cell = first; cell <= last; cell += 1) {
					if (cells.has(cell)) previous = cells.get(cell);
					const start = cell * width;
					const end = (cell + 1) * width;
					result.push(
						{ time: start, value: previous },
						{ time: Math.max(start, end - MIN_ENVELOPE_TIME), value: previous },
					);
				}
				return result;
			})();
	const start = generated[0].time;
	const end = generated.at(-1).time;
	const outside = (Array.isArray(originPoints) ? originPoints : [])
		.filter((point) =>
			freehand
				? Number(point.time) < start - MIN_ENVELOPE_TIME ||
					Number(point.time) > end + MIN_ENVELOPE_TIME
				: Number(point.time) <= replacementStart - MIN_ENVELOPE_TIME ||
					Number(point.time) >= replacementEnd,
		)
		.map((point) => ({ ...point }));
	return [...outside, ...generated].sort((a, b) => a.time - b.time);
}

export function flattenEnvelopeRange(
	points,
	start,
	end,
	value,
	min = 0,
	max = 1,
	step = 0,
) {
	const range = envelopeRange(min, max);
	const low = Math.min(Number(start) || 0, Number(end) || 0);
	const high = Math.max(Number(start) || 0, Number(end) || 0);
	if (!(high > low + MIN_ENVELOPE_TIME))
		return (Array.isArray(points) ? points : []).map((point) => ({ ...point }));
	const leftValue = value && typeof value === "object" ? value.start : value;
	const rightValue =
		value && typeof value === "object" ? (value.end ?? leftValue) : value;
	const source = (Array.isArray(points) ? points : []).map((point) => ({
		...point,
	}));
	const outside = source.filter(
		(point) =>
			Number(point.time) < low - MIN_ENVELOPE_TIME ||
			Number(point.time) > high + MIN_ENVELOPE_TIME,
	);
	const edges = [
		{ time: low, value: snapEnvelopeValue(leftValue, range, undefined, step) },
		{
			time: high,
			value: snapEnvelopeValue(rightValue, range, undefined, step),
		},
	];
	return [...outside, ...edges].sort((a, b) => Number(a.time) - Number(b.time));
}

export function moveEnvelopeRange(
	points,
	start,
	end,
	delta,
	min = 0,
	max = 1,
	step = 0,
) {
	const range = envelopeRange(min, max);
	const low = Math.min(Number(start) || 0, Number(end) || 0);
	const high = Math.max(Number(start) || 0, Number(end) || 0);
	if (!(high > low + MIN_ENVELOPE_TIME))
		return (Array.isArray(points) ? points : []).map((point) => ({ ...point }));
	const source = (Array.isArray(points) ? points : []).map((point) => ({
		...point,
	}));
	const selected = source.filter(
		(point) =>
			Number(point.time) >= low - MIN_ENVELOPE_TIME &&
			Number(point.time) <= high + MIN_ENVELOPE_TIME,
	);
	const edgeValue = (time) => envelopeValueAtTime(source, time, range);
	const edgePoints = [
		{ time: low, value: edgeValue(low) },
		{ time: high, value: edgeValue(high) },
	];
	const moved = [...selected, ...edgePoints].map((point) => ({
		...point,
		value: snapEnvelopeValue(
			Number(point.value) + Number(delta || 0),
			range,
			undefined,
			step,
		),
	}));
	const outside = source.filter(
		(point) =>
			Number(point.time) < low - MIN_ENVELOPE_TIME ||
			Number(point.time) > high + MIN_ENVELOPE_TIME,
	);
	const unique = new Map();
	for (const point of [...outside, ...moved])
		unique.set(Number(point.time).toFixed(9), point);
	return [...unique.values()].sort((a, b) => Number(a.time) - Number(b.time));
}
