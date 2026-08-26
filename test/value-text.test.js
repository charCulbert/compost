import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fractionDigitsForStep,
  formatNumber,
  formatValue,
  rangeDragIncrement,
  snap,
  splitValueTextOptions,
  valueTextOption,
} from '../src/utils.js';

test('formatValue uses pipe-delimited text labels for integer values', () => {
  const text = 'Saw|Pulse|Triangle|Sine|Noise|Ramp|Beam';

  assert.equal(formatValue(0, 1, '', text), 'Saw');
  assert.equal(formatValue(1, 1, '', text), 'Pulse');
  assert.equal(formatValue(6, 1, '', text), 'Beam');
});

test('formatValue falls back to numeric formatting without a matching text label', () => {
  const text = 'Saw|Pulse|Triangle';

  assert.equal(formatValue(3, 1, '', text), '3');
  assert.equal(formatValue(1.5, 0.1, '', text), '1.5');
  assert.equal(formatValue(0.25, 0.01, ' Hz', ''), '0.25 Hz');
});

test('continuous values default to sensible display precision', () => {
  assert.equal(formatValue(0.68471234, 0, ' s'), '0.68 s');
  assert.equal(formatNumber(0.68471234, 0), '0.68');
  // Guessed precision never shows as trailing zeros; stepped precision does.
  assert.equal(formatValue(800, 0, ' Hz'), '800 Hz');
  assert.equal(formatNumber(0.6, 0), '0.6');
  assert.equal(formatNumber(100, 0), '100');
  assert.equal(formatNumber(1, 0.1), '1.0');
  assert.equal(formatNumber(800, 0, 2), '800.00');
  assert.equal(
    formatValue(0.68471234, 0, ' s', '', 3),
    '0.685 s',
  );
  assert.equal(fractionDigitsForStep(0.0010000000474974513), 3);
});

test('value text helpers accept comma-separated aliases for component options', () => {
  assert.deepEqual(splitValueTextOptions('Off, On, Auto'), ['Off', 'On', 'Auto']);
  assert.equal(valueTextOption(2, 'Off, On, Auto'), 'Auto');
});

test('range drag increment scales small stepped ranges across the drag distance', () => {
  const perPixel = rangeDragIncrement(1, 6);

  assert.equal(perPixel, 5 / 180);
  assert.equal(snap(1 + 5 * perPixel, 1), 1);
  assert.equal(snap(1 + 18 * perPixel, 1), 2);
  assert.equal(snap(1 + 180 * perPixel, 1), 6);
  assert.equal(rangeDragIncrement(1, 10000), 9999 / 180);
});
