import assert from 'node:assert/strict';
import test from 'node:test';
import { envelopeValueGuides, visibleEnvelopeGridStep } from '../src/internal/envelope-grid.js';

test('envelope grids keep snapping resolution separate from painted density', () => {
  assert.equal(visibleEnvelopeGridStep(null, 1, 240), null);
  assert.equal(visibleEnvelopeGridStep(.01, 1, 240), .08);
  assert.equal(visibleEnvelopeGridStep(.25, 4, 320), .25);
});

test('envelope value guides show only meaningful values', () => {
  assert.deepEqual(envelopeValueGuides(0, 1, { height: 100 }), []);
  assert.deepEqual(envelopeValueGuides(-1, 1, { height: 100 }), [0]);
  assert.deepEqual(envelopeValueGuides(0, 1, {
    height: 100, stepped: true, step: .25,
  }), [.25, .5, .75]);
  assert.deepEqual(envelopeValueGuides(0, 1, {
    height: 30, stepped: true, step: .1,
  }), [.5]);
});
