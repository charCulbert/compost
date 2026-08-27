import assert from 'node:assert/strict';
import test from 'node:test';

import { gridStepOf, gridTextOf, snapModeWith, snapTime, timeGridLines, timeSignatureOf } from '../src/time-grid.js';

test('time signatures expose bar and denominator-beat lengths in quarter-note beats', () => {
  assert.deepEqual(timeSignatureOf('6/8'), {
    numerator: 6, denominator: 8, beatLength: 0.5, barLength: 3, pulseLength: 1.5, text: '6/8',
  });
  assert.deepEqual(timeSignatureOf('12/8'), {
    numerator: 12, denominator: 8, beatLength: 0.5, barLength: 6, pulseLength: 1.5, text: '12/8',
  });
  assert.deepEqual(timeSignatureOf(null, 5), {
    numerator: 5, denominator: 4, beatLength: 1, barLength: 5, pulseLength: null, text: '5/4',
  });
  assert.equal(timeSignatureOf('7/3', 3).text, '3/4');
});

test('compound meters add pulse lines without losing beats or note-value cells', () => {
  assert.deepEqual(timeGridLines(3, {
    gridStep: 0.25, beatLength: 0.5, pulseLength: 1.5, barLength: 3,
  }).map(({ time, kind }) => [time, kind]), [
    [0, 'bar'], [.25, 'cell'], [.5, 'beat'], [.75, 'cell'], [1, 'beat'], [1.25, 'cell'],
    [1.5, 'pulse'], [1.75, 'cell'], [2, 'beat'], [2.25, 'cell'], [2.5, 'beat'],
    [2.75, 'cell'], [3, 'bar'],
  ]);
});

test('a grid step is a bar divided into cells', () => {
  assert.equal(gridStepOf(4, 16), 0.25);
  assert.equal(gridStepOf(3, 8), 0.375);
  assert.equal(gridStepOf(4, 1), 4);
});

test('note-value grids are independent of meter and numeric grids stay legacy', () => {
  assert.equal(gridStepOf(3, '1/16'), 0.25);
  assert.equal(gridStepOf(3, '1/8T'), 1 / 3);
  assert.equal(gridStepOf(6, '1/16'), 0.25);
  assert.equal(gridStepOf(3, 'bar'), 3);
  assert.equal(gridStepOf(3, 16), 3 / 16);
  assert.equal(gridTextOf('1/16'), '1/16');
  assert.equal(gridTextOf('1/8t'), '1/8T');
  assert.equal(gridTextOf('bar'), '1 bar');
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
