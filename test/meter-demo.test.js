import assert from "node:assert/strict";
import test from "node:test";

import { nextPeakHold } from "../examples/shared/meter-demo.js";

test("meter demo peaks hold before falling at a steady rate", () => {
	let hold = nextPeakHold({ level: -90, remaining: 0 }, -6, 0);
	assert.deepEqual(hold, { level: -6, remaining: 1.5 });

	hold = nextPeakHold(hold, -18, 1);
	assert.deepEqual(hold, { level: -6, remaining: 0.5 });

	hold = nextPeakHold({ ...hold, remaining: 0 }, -18, 0.5);
	assert.deepEqual(hold, { level: -15, remaining: 0 });
});
