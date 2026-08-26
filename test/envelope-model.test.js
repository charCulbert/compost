import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEnvelopePoint,
  drawEnvelopePoints,
  envelopeCurvePosition,
  envelopeValueAtTime,
  envelopeValueFromY,
  envelopeValueToY,
  moveEnvelopePoint,
  sliceEnvelopeRange,
  splitEnvelopeAtTime,
} from '../src/envelope-model.js';

test('generic envelope geometry is independent of its caller time unit', () => {
  assert.equal(envelopeValueToY(1, 0, 1, 100), 0);
  assert.equal(envelopeValueFromY(75, 0, 1, 100), .25);
  assert.equal(envelopeValueAtTime([
    { time: 0, value: 0 }, { time: 2, value: 1 },
  ], 1), .5);
});

test('segment curves preserve endpoints and bend interpolation in both directions', () => {
  assert.equal(envelopeCurvePosition(0, 1), 0);
  assert.equal(envelopeCurvePosition(1, -1), 1);
  assert.ok(envelopeCurvePosition(.5, 1) < .5);
  assert.ok(envelopeCurvePosition(.5, -1) > .5);
  assert.ok(envelopeValueAtTime([
    { time: 0, value: 0, curve: 1 }, { time: 1, value: 1 },
  ], .5) < .5);
});

test('splitting and slicing a curve preserve its exact shape', () => {
  const original = [{ time: 0, value: 0, curve: .8 }, { time: 1, value: 1 }];
  const split = splitEnvelopeAtTime(original, .4);
  assert.ok(Math.abs(split[0].curve - .32) < 1e-12);
  assert.ok(Math.abs(split[1].curve - .48) < 1e-12);
  for (const time of [.1, .4, .7, .9]) {
    assert.ok(Math.abs(envelopeValueAtTime(split, time)
      - envelopeValueAtTime(original, time)) < 1e-12);
  }

  const slice = sliceEnvelopeRange(original, .25, .75);
  for (const time of [.25, .4, .6, .75]) {
    assert.ok(Math.abs(envelopeValueAtTime(slice, time)
      - envelopeValueAtTime(original, time)) < 1e-12);
  }
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
