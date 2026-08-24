import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEnvelopePoint,
  drawEnvelopePoints,
  envelopeValueAtTime,
  envelopeValueFromY,
  envelopeValueToY,
  moveEnvelopePoint,
} from '../src/envelope-model.js';

test('generic envelope geometry is independent of its caller time unit', () => {
  assert.equal(envelopeValueToY(1, 0, 1, 100), 0);
  assert.equal(envelopeValueFromY(75, 0, 1, 100), .25);
  assert.equal(envelopeValueAtTime([
    { time: 0, value: 0 }, { time: 2, value: 1 },
  ], 1), .5);
});

test('generic envelope point edits stay sorted, bounded and neighbour-safe', () => {
  let points = [{ time: 0, value: 0 }, { time: 4, value: 1 }];
  points = addEnvelopePoint(points, { time: 2, value: 2 });
  assert.deepEqual(points, [{ time: 0, value: 0 }, { time: 2, value: 1 }, { time: 4, value: 1 }]);
  points = moveEnvelopePoint(points, 1, { time: 8, value: -.5 });
  assert.deepEqual(points[1], { time: 4, value: 0 });
});

test('generic envelope drawing supports snapped cells and free samples', () => {
  const snapped = drawEnvelopePoints([], [{ time: 1.2, value: .25 }, { time: 2.2, value: .75 }], {
    min: 0, max: 1, gridStep: 1, snap: 'grid',
  });
  assert.deepEqual(snapped, [
    { time: 1, value: .25 }, { time: 2 - 1e-9, value: .25 },
    { time: 2, value: .75 }, { time: 3 - 1e-9, value: .75 },
  ]);
  const free = drawEnvelopePoints([], [{ time: .1, value: .2 }, { time: .2, value: .4 }], {
    min: 0, max: 1, snap: 'off', tolerance: 0,
  });
  assert.deepEqual(free, [{ time: .1, value: .2 }, { time: .2, value: .4 }]);
});
