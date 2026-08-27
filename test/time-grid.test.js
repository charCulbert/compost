import assert from 'node:assert/strict';
import test from 'node:test';

import { gridStepOf, snapModeWith, snapTime } from '../src/time-grid.js';

test('a grid step is a bar divided into cells', () => {
  assert.equal(gridStepOf(4, 16), 0.25);
  assert.equal(gridStepOf(3, 8), 0.375);
  assert.equal(gridStepOf(4, 1), 4);
});

test('the snap modifier inverts whatever the host set', () => {
  assert.equal(snapModeWith('grid', false), 'grid');
  assert.equal(snapModeWith('grid', true), 'off');
  assert.equal(snapModeWith('off', false), 'off');
  assert.equal(snapModeWith('off', true), 'grid');
});

test('snapping keeps an origin offset when that is nearer than the grid', () => {
  // a note at 0.31 moved by ~1 lands at 1.31, not 1.25
  assert.ok(Math.abs(snapTime(1.29, { step: 0.25, origin: 0.31 }) - 1.31) < 1e-12);
  // moved by ~1.2 the grid line is nearer
  assert.ok(Math.abs(snapTime(1.49, { step: 0.25, origin: 0.31 }) - 1.5) < 1e-12);
  // no origin: absolute grid
  assert.equal(snapTime(1.13, { step: 0.25 }), 1.25);
  assert.equal(snapTime(-0.2, { step: 0.25 }), 0);
});

test('anchors attract within reach and snapping can be off', () => {
  assert.equal(snapTime(3.9, { step: 1, anchors: [3.8], reach: 0.5 }), 3.8);
  assert.equal(snapTime(3.9, { step: 1, anchors: [3.8], reach: 0.05 }), 4);
  assert.equal(snapTime(3.9, { step: 1, mode: 'off', anchors: [3.8] }), 3.9);
  assert.equal(snapTime(2.2, { anchors: [2.1, 2.5] }), 2.1);
});
