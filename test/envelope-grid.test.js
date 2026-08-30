import assert from "node:assert/strict";
import test from "node:test";
import {
	envelopeValueGuides,
	visibleEnvelopeGridStep,
} from "../src/internal/envelope-grid.js";

test("envelope grids keep snapping resolution separate from painted density", () => {
	assert.equal(visibleEnvelopeGridStep(null, 1, 240), null);
	assert.equal(visibleEnvelopeGridStep(0.01, 1, 240), 0.08);
	assert.equal(visibleEnvelopeGridStep(0.25, 4, 320), 0.25);
});

test("envelope value guides show only meaningful values", () => {
	assert.deepEqual(envelopeValueGuides(0, 1, { height: 100 }), []);
	assert.deepEqual(envelopeValueGuides(-1, 1, { height: 100 }), [0]);
	assert.deepEqual(
		envelopeValueGuides(0, 1, {
			height: 100,
			stepped: true,
			step: 0.25,
		}),
		[0.25, 0.5, 0.75],
	);
	assert.deepEqual(
		envelopeValueGuides(0, 1, {
			height: 30,
			stepped: true,
			step: 0.1,
		}),
		[0.5],
	);
});
