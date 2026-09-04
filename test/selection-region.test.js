import assert from "node:assert/strict";
import test from "node:test";

import {
	extendSelectionRegion,
	normalizeSelectionRegion,
	normalizeTimeRange,
} from "../src/selection-region.js";

test("time ranges preserve a collapsed edit cursor", () => {
	assert.deepEqual(normalizeTimeRange(2, 2, 8), { start: 2, end: 2 });
	assert.deepEqual(normalizeTimeRange(7, 3, 6), { start: 3, end: 6 });
	assert.equal(normalizeTimeRange(null, 2, 8), null);
});

test("selection regions normalize time and optional rows for editors", () => {
	assert.deepEqual(
		normalizeSelectionRegion(5, 1, ["lane-b", "lane-a", "lane-b"], 8),
		{
			start: 1,
			end: 5,
			items: ["lane-b", "lane-a"],
		},
	);
	assert.equal(normalizeSelectionRegion(2, 2, [], 8), null);
});

test("selection regions extend from their start or a supplied anchor", () => {
	assert.deepEqual(
		extendSelectionRegion({ start: 2, end: 4, items: [60] }, 7, 99),
		{
			start: 2,
			end: 7,
			items: [60],
		},
	);
	assert.deepEqual(extendSelectionRegion(null, 5, 1, [64]), {
		start: 1,
		end: 5,
		items: [64],
	});
});
