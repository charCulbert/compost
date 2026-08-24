import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeParameterScale,
  moveValueByNormalisedDelta,
  normalisedKeyboardStep,
  normalisedPositionToValue,
  valueToNormalisedPosition,
} from '../src/parameter-scale.js';

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be close to ${expected}`);
}

test('linear curve maps normalized position to value and back', () => {
  const scale = {
    min: -1,
    max: 1,
  };

  assert.equal(normalisedPositionToValue(0, scale), -1);
  assert.equal(normalisedPositionToValue(0.5, scale), 0);
  assert.equal(normalisedPositionToValue(1, scale), 1);
  assertClose(valueToNormalisedPosition(0, scale), 0.5);
});

test('linear curve uses explicit mid as a two-segment center', () => {
  const scale = {
    min: 0,
    max: 100,
    mid: 10,
  };

  assert.equal(normalisedPositionToValue(0, scale), 0);
  assert.equal(normalisedPositionToValue(0.25, scale), 5);
  assert.equal(normalisedPositionToValue(0.5, scale), 10);
  assert.equal(normalisedPositionToValue(0.75, scale), 55);
  assert.equal(normalisedPositionToValue(1, scale), 100);
  assertClose(valueToNormalisedPosition(5, scale), 0.25);
  assertClose(valueToNormalisedPosition(10, scale), 0.5);
  assertClose(valueToNormalisedPosition(55, scale), 0.75);
});

test('linear curve ignores fallback mid when it was not explicit', () => {
  const scale = {
    min: 0,
    max: 100,
    mid: 10,
    hasMid: false,
  };

  assert.equal(normalisedPositionToValue(0.5, scale), 50);
  assertClose(valueToNormalisedPosition(50, scale), 0.5);
});

test('log curve maps positive ranges exponentially', () => {
  const scale = {
    min: 20,
    max: 20000,
    curve: 'log',
  };

  assertClose(normalisedPositionToValue(0.5, scale), Math.sqrt(20 * 20000));
  assertClose(valueToNormalisedPosition(Math.sqrt(20 * 20000), scale), 0.5);
});

test('log curve can derive shape from mid', () => {
  const scale = {
    min: 20,
    max: 20000,
    mid: 1000,
    curve: 'log',
  };

  assertClose(normalisedPositionToValue(0.5, scale), 1000);
  assertClose(valueToNormalisedPosition(1000, scale), 0.5);
});

test('explicit log shape overrides derived mid shape', () => {
  const scale = {
    min: 20,
    max: 20000,
    mid: 1000,
    curve: 'log',
    shape: 1,
  };

  assertClose(normalisedPositionToValue(0.5, scale), Math.sqrt(20 * 20000));
});

test('gain curve uses one stable calibrated dB response', () => {
  const scale = { min: -90, max: 12, curve: 'gain' };
  const points = [
    [-90, 0], [-60, 0.1], [-48, 0.17], [-36, 0.25], [-24, 0.35],
    [-12, 0.5], [-6, 0.6], [0, 0.7], [6, 0.85], [12, 1],
  ];

  for (const [value, position] of points) {
    assertClose(valueToNormalisedPosition(value, scale), position);
    assertClose(normalisedPositionToValue(position, scale), value);
  }
});

test('gain curve crops the same absolute response to custom dB ranges', () => {
  const scale = { min: -60, max: 6, curve: 'gain' };

  assert.equal(valueToNormalisedPosition(-60, scale), 0);
  assert.equal(valueToNormalisedPosition(6, scale), 1);
  assertClose(valueToNormalisedPosition(0, scale), 0.8);
  assertClose(normalisedPositionToValue(0.8, scale), 0);
});

test('gain curve remains invertible beyond the canonical range', () => {
  const scale = { min: -120, max: 24, curve: 'gain' };

  for (const value of [-120, -90, 0, 12, 24]) {
    assertClose(normalisedPositionToValue(valueToNormalisedPosition(value, scale), scale), value);
  }
});

test('normalised drag moves through the selected curve', () => {
  const scale = {
    min: 20,
    max: 20000,
    mid: 1000,
    curve: 'log',
  };

  assertClose(moveValueByNormalisedDelta(1000, 0.5, scale), 20000);
  assertClose(moveValueByNormalisedDelta(1000, -0.5, scale), 20);
});

test('keyboard movement has global fine and explicit position steps', () => {
  assert.equal(normalisedKeyboardStep({
    min: 80,
    max: 16000,
    step: 15.92,
  }), 0.01);
  assert.equal(normalisedKeyboardStep({
    min: 0,
    max: 1,
    step: 0.25,
  }), 0.25);
  assert.equal(normalisedKeyboardStep({
    min: 0,
    max: 1,
    step: 0.000001,
    positionStep: 0.02,
  }), 0.02);
});

test('unsupported curves fall back to linear', () => {
  assert.equal(normalisedPositionToValue(0.5, { min: 0, max: 10, curve: 'unknown', shape: 2 }), 5);
  assert.equal(valueToNormalisedPosition(5, { min: 0, max: 10, curve: 'unknown', shape: 2 }), 0.5);
});

test('curve and shape do not accept aliases', () => {
  for (const alias of [{ taper: 'log' }, { scale: 'log' }]) {
    assert.equal(normalisedPositionToValue(0.5, { min: 0, max: 10, ...alias }), 5);
  }
  for (const curve of ['exp', 'exponential']) {
    assert.equal(normalisedPositionToValue(0.5, { min: 0, max: 10, curve }), 5);
  }
  assertClose(normalisedPositionToValue(0.5, {
    min: 20,
    max: 20000,
    mid: 1000,
    curve: 'log',
    curveShape: 1,
    taperShape: 1,
  }), 1000);
});

test('scale description is stable for previews', () => {
  assert.equal(describeParameterScale({ curve: 'linear' }), 'linear curve');
  assert.equal(
    describeParameterScale({ min: 0, max: 100, mid: 10 }),
    'linear curve, center 10',
  );
  assert.equal(
    describeParameterScale({ min: 20, max: 20000, mid: 1000, curve: 'log' }),
    'log curve shape 0.8203',
  );
  assert.equal(describeParameterScale({ min: -90, max: 12, curve: 'gain' }), 'gain curve');
});
