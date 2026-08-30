import assert from "node:assert/strict";
import test from "node:test";
import {
	addEnvelopePoint,
	deleteEnvelopePoint,
	drawEnvelopePoints,
	effectiveEnvelopeStep,
	envelopeCurvePosition,
	envelopeRangeEdgeValues,
	envelopeValueAtTime,
	envelopeValueFromY,
	envelopeValueToY,
	flattenEnvelopeRange,
	moveEnvelopePoint,
	moveEnvelopePointsByY,
	moveEnvelopeRange,
	moveEnvelopeRangeByY,
	preserveEnvelopeEdgePoints,
	sliceEnvelopeRange,
	snapEnvelopeValue,
	splitEnvelopeAtTime,
	thinEnvelopePoints,
} from "../src/envelope-model.js";

test("generic envelope geometry is independent of its caller time unit", () => {
	assert.equal(envelopeValueToY(1, 0, 1, 100), 0);
	assert.equal(envelopeValueFromY(75, 0, 1, 100), 0.25);
	assert.equal(
		envelopeValueAtTime(
			[
				{ time: 0, value: 0 },
				{ time: 2, value: 1 },
			],
			1,
		),
		0.5,
	);
});

test("segment curves preserve endpoints and bend interpolation in both directions", () => {
	assert.equal(envelopeCurvePosition(0, 1), 0);
	assert.equal(envelopeCurvePosition(1, -1), 1);
	assert.ok(envelopeCurvePosition(0.5, 1) < 0.5);
	assert.ok(envelopeCurvePosition(0.5, -1) > 0.5);
	assert.ok(
		envelopeValueAtTime(
			[
				{ time: 0, value: 0, curve: 1 },
				{ time: 1, value: 1 },
			],
			0.5,
		) < 0.5,
	);
});

test("splitting and slicing a curve preserve its exact shape", () => {
	const original = [
		{ time: 0, value: 0, curve: 0.8 },
		{ time: 1, value: 1 },
	];
	const split = splitEnvelopeAtTime(original, 0.4);
	assert.ok(Math.abs(split[0].curve - 0.32) < 1e-12);
	assert.ok(Math.abs(split[1].curve - 0.48) < 1e-12);
	for (const time of [0.1, 0.4, 0.7, 0.9]) {
		assert.ok(
			Math.abs(
				envelopeValueAtTime(split, time) - envelopeValueAtTime(original, time),
			) < 1e-12,
		);
	}

	const slice = sliceEnvelopeRange(original, 0.25, 0.75);
	for (const time of [0.25, 0.4, 0.6, 0.75]) {
		assert.ok(
			Math.abs(
				envelopeValueAtTime(slice, time) - envelopeValueAtTime(original, time),
			) < 1e-12,
		);
	}
});

test("generic envelope point edits stay sorted, bounded and neighbour-safe", () => {
	let points = [
		{ time: 0, value: 0 },
		{ time: 4, value: 1 },
	];
	const range = { min: 0, max: 1 };
	points = addEnvelopePoint(points, { time: 2, value: 2 }, range);
	assert.deepEqual(points, [
		{ time: 0, value: 0 },
		{ time: 2, value: 1 },
		{ time: 4, value: 1 },
	]);
	points = moveEnvelopePoint(points, 1, { time: 8, value: -0.5 }, range);
	assert.deepEqual(points[1], { time: 4, value: 0 });
	assert.deepEqual(
		deleteEnvelopePoint(points, 1).map((point) => [point.time, point.value]),
		[
			[0, 0],
			[4, 1],
		],
	);
});

test("generic envelope drawing supports snapped cells and free samples", () => {
	const snapped = drawEnvelopePoints(
		[],
		[
			{ time: 1.2, value: 0.25 },
			{ time: 2.2, value: 0.75 },
		],
		{
			min: 0,
			max: 1,
			gridStep: 1,
			snap: "grid",
		},
	);
	assert.deepEqual(snapped, [
		{ time: 1, value: 0.25 },
		{ time: 2 - 1e-9, value: 0.25 },
		{ time: 2, value: 0.75 },
		{ time: 3 - 1e-9, value: 0.75 },
	]);
	const free = drawEnvelopePoints(
		[],
		[
			{ time: 0.1, value: 0.2 },
			{ time: 0.2, value: 0.4 },
		],
		{
			min: 0,
			max: 1,
			snap: "off",
			tolerance: 0,
		},
	);
	assert.deepEqual(free, [
		{ time: 0.1, value: 0.2 },
		{ time: 0.2, value: 0.4 },
	]);
});

test("envelope geometry follows linear and fader axes", () => {
	assert.equal(envelopeValueToY(1, 0, 1, 100), 0);
	assert.equal(envelopeValueToY(0, 0, 1, 100), 100);
	assert.equal(envelopeValueFromY(25, 0, 1, 100), 0.75);
	assert.ok(Math.abs(envelopeValueToY(0, -90, 12, 100, "gain") - 30) < 1e-9);
	assert.ok(Math.abs(envelopeValueFromY(30, -90, 12, 100, "gain")) < 1e-9);
});

test("display moves follow the gain curve and retain independent range edges", () => {
	const options = { min: -90, max: 12, height: 100, scale: "gain" };
	const origin = [
		{ time: 0, value: -12 },
		{ time: 4, value: 0 },
	];
	const expected = envelopeValueFromY(
		envelopeValueToY(
			-12,
			options.min,
			options.max,
			options.height,
			options.scale,
		) + 10,
		options.min,
		options.max,
		options.height,
		options.scale,
	);
	const movedPoint = moveEnvelopePointsByY(origin, [0], 10, options);
	assert.ok(Math.abs(movedPoint[0].value - expected) < 1e-9);
	const edges = envelopeRangeEdgeValues(origin, 1, 3, options);
	assert.notEqual(edges.start, edges.end);
	const movedRange = moveEnvelopeRangeByY(origin, 1, 3, 10, options);
	assert.equal(movedRange[0].value, origin[0].value);
	assert.notEqual(
		movedRange.find((point) => point.time === 1).value,
		movedRange.find((point) => point.time === 3).value,
	);
});

test("moving breakpoint endpoints retains flat edge runs and active order", () => {
	const origin = [
		{ time: 0, value: 0.2 },
		{ time: 4, value: 0.8 },
	];
	const first = preserveEnvelopeEdgePoints(
		origin,
		moveEnvelopePoint(origin, 0, { time: 2, value: 0.3 }),
		0,
	);
	assert.deepEqual(
		first.map((point) => [point.time, point.value]),
		[
			[0, 0.2],
			[2, 0.3],
			[4, 0.8],
		],
	);
	const last = preserveEnvelopeEdgePoints(
		first,
		moveEnvelopePoint(first, 2, { time: 3, value: 0.7 }),
		2,
	);
	assert.deepEqual(
		last.map((point) => [point.time, point.value]),
		[
			[0, 0.2],
			[2, 0.3],
			[3, 0.7],
			[4, 0.8],
		],
	);
});

test("envelope values interpolate, step and clamp", () => {
	const points = [
		{ time: 0, value: 0 },
		{ time: 4, value: 1 },
	];
	assert.equal(envelopeValueAtTime(points, 2, 0, 1), 0.5);
	assert.equal(envelopeValueAtTime(points, 2, 0, 1, "linear", true), 0);
	assert.equal(
		envelopeValueAtTime(
			[
				{ time: 0, value: 0 },
				{ time: 2, value: 0.5 },
				{ time: 4, value: 1 },
			],
			2,
			0,
			1,
			"linear",
			true,
		),
		0.5,
	);
	const gainMid = envelopeValueAtTime(
		[
			{ time: 0, value: -90 },
			{ time: 4, value: 12 },
		],
		2,
		-90,
		12,
		"gain",
	);
	assert.equal(gainMid, -39);
	assert.equal(snapEnvelopeValue(1.2, 0, 1), 1);
	assert.equal(snapEnvelopeValue(0.63, 0, 1, 0.25), 0.75);
	assert.deepEqual(
		flattenEnvelopeRange(
			[
				{ time: 0, value: 0 },
				{ time: 2, value: 1 },
				{ time: 4, value: 0 },
			],
			1,
			3,
			0.5,
			0,
			1,
		).map((point) => [point.time, point.value]),
		[
			[0, 0],
			[1, 0.5],
			[3, 0.5],
			[4, 0],
		],
	);
	assert.deepEqual(
		moveEnvelopeRange(
			[
				{ time: 0, value: 0.2 },
				{ time: 2, value: 0.3 },
				{ time: 4, value: 0.4 },
			],
			1,
			3,
			0.25,
			0,
			1,
		).map((point) => [point.time, point.value]),
		[
			[0, 0.2],
			[1, 0.5],
			[2, 0.55],
			[3, 0.6],
			[4, 0.4],
		],
	);
});

test("stepped envelopes default to integer cells when no step is supplied", () => {
	assert.equal(effectiveEnvelopeStep(true), 1);
	assert.equal(effectiveEnvelopeStep(false), 0);
	assert.equal(effectiveEnvelopeStep(true, 0.25), 0.25);
	assert.deepEqual(
		drawEnvelopePoints(
			[],
			[
				{ time: 0, value: 0.2 },
				{ time: 1, value: 0.8 },
			],
			{ min: 0, max: 1, stepped: true, gridStep: 1 },
		).map((point) => point.value),
		[0, 0, 1, 1],
	);
});

test("envelope draw emits flat grid pairs and thins freehand once", () => {
	const grid = drawEnvelopePoints(
		[{ time: 0, value: 0 }],
		[
			{ time: 0.1, value: 0.2 },
			{ time: 1.1, value: 0.8 },
			{ time: 2.1, value: 0.4 },
		],
		{ min: 0, max: 1, gridStep: 1 },
	);
	assert.deepEqual(
		grid.map((point) => [point.time, point.value]),
		[
			[0, 0.2],
			[1 - 1e-9, 0.2],
			[1, 0.8],
			[2 - 1e-9, 0.8],
			[2, 0.4],
			[3 - 1e-9, 0.4],
		],
	);
	const revisited = drawEnvelopePoints(
		[],
		[
			{ time: 1.8, value: 0.9 },
			{ time: 0.2, value: 0.1 },
			{ time: 1.2, value: 0.2 },
			{ time: 0.8, value: 0.7 },
		],
		{ min: 0, max: 1, gridStep: 1 },
	);
	assert.deepEqual(
		revisited.map((point) => [point.time, point.value]),
		[
			[0, 0.7],
			[1 - 1e-9, 0.7],
			[1, 0.2],
			[2 - 1e-9, 0.2],
		],
	);
	const untouched = drawEnvelopePoints(
		[
			{ time: 1 - 1e-6, value: 0.11 },
			{ time: 3, value: 0.33 },
		],
		[{ time: 1.2, value: 0.8 }],
		{ min: 0, max: 1, gridStep: 1 },
	);
	assert.deepEqual(
		untouched.map((point) => [point.time, point.value]),
		[
			[1 - 1e-6, 0.11],
			[1, 0.8],
			[2 - 1e-9, 0.8],
			[3, 0.33],
		],
	);
	const samples = [
		{ time: 0, value: 0 },
		{ time: 1, value: 0.8 },
		{ time: 2, value: 1 },
	];
	assert.deepEqual(thinEnvelopePoints(samples, 0.01), samples);
	assert.deepEqual(
		drawEnvelopePoints(
			[],
			[
				{ time: 0, value: 0 },
				{ time: 1, value: 0.8 },
				{ time: 2, value: 1 },
			],
			{ min: 0, max: 1, freehand: true, tolerance: 0.01 },
		),
		samples,
	);
	assert.equal(
		drawEnvelopePoints(
			[],
			[
				{ time: 0, value: 0 },
				{ time: 1, value: 0.5 },
				{ time: 2, value: 1 },
			],
			{ min: 0, max: 1, freehand: true, tolerance: 0 },
		).length,
		3,
	);
});
