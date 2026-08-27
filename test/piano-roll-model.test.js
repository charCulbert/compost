import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_DURATION,
  gridStep,
  movedNotes,
  normaliseNotes,
  notesInBox,
  quantizedNotes,
  resolveOverlaps,
  resizedNotes,
  snapBeats,
  snapDuration,
  snapWithOffset,
} from '../src/piano-roll-model.js';

const note = (over = {}) => ({
  id: 'a', note: 60, start: 0, duration: 1, velocity: 100, channel: 0, ...over,
});

test('gridStep turns a division into beats per cell', () => {
  assert.equal(gridStep(4), 1);
  assert.equal(gridStep(16), 0.25);
  assert.equal(gridStep(8), 0.5);
  assert.equal(gridStep(1), 4);
  assert.equal(gridStep(8, 3), 0.375);
  assert.equal(gridStep(0), 0);
  assert.equal(gridStep('nonsense'), 0);
});

test('snapping rounds to the grid and never goes negative', () => {
  assert.equal(snapBeats(0.3, 0.25), 0.25);
  assert.equal(snapBeats(0.4, 0.25), 0.5);
  assert.equal(snapBeats(-3, 0.25), 0);
  assert.equal(snapBeats(0.3, 0.25, 'off'), 0.3);
});

test('snapping preserves a note offset when that anchor is nearer', () => {
  assert.equal(snapWithOffset(0.32, 0.1, 0.25), 0.35);
  assert.equal(snapWithOffset(0.22, 0.1, 0.25), 0.25);
  const offset = note({ start: 0.1, duration: 0.6 });
  assert.equal(movedNotes([offset], ['a'], 0.22, 0, 4, 0.25)[0].start, 0.35);
  assert.equal(resizedNotes([offset], ['a'], 0.22, 4, 0.25)[0].duration, 0.85);
});

test('a snapped duration keeps at least one cell', () => {
  assert.equal(snapDuration(0.01, 0.25), 0.25);
  assert.equal(snapDuration(0.6, 0.25), 0.5);
  assert.ok(snapDuration(0, 0, 'off') >= MIN_DURATION);
});

test('free editing preserves sub-sample-scale beat values', () => {
  const precise = 1.23456789e-7;
  assert.ok(MIN_DURATION < precise);
  assert.equal(snapBeats(precise, 0.25, 'off'), precise);
  assert.equal(snapDuration(precise, 0.25, 'off'), precise);
  assert.equal(normaliseNotes([note({ start: precise, duration: precise })], 1)[0].start,
    precise);
});

test('normalising clamps notes into the clip and sorts them', () => {
  const notes = normaliseNotes([
    note({ id: 'b', start: 2 }),
    note({ id: 'a', start: 0, duration: 99 }),
    note({ id: 'c', start: 9, note: 300, velocity: 0, channel: 44 }),
  ], 4);
  assert.deepEqual(notes.map((entry) => entry.id), ['a', 'b', 'c']);
  assert.equal(notes[0].duration, 4, 'a note cannot run past the clip');
  assert.equal(notes[2].note, 127);
  assert.equal(notes[2].velocity, 1);
  assert.equal(notes[2].channel, 15);
  assert.ok(notes[2].start < 4);
});

test('moving shifts only the chosen notes and stays in range', () => {
  const notes = [note({ id: 'a' }), note({ id: 'b', start: 1 })];
  const moved = movedNotes(notes, ['b'], 0.25, 2, 4, 0.25);
  assert.equal(moved[0].start, 0, 'untouched note stays put');
  assert.equal(moved[1].start, 1.25);
  assert.equal(moved[1].note, 62);

  const pinned = movedNotes(notes, ['a'], 99, 0, 4, 0.25);
  assert.equal(pinned[0].start + pinned[0].duration, 4);
});

test('resizing grows from the right edge and is capped by the clip', () => {
  const notes = [note({ start: 3, duration: 0.5 })];
  assert.equal(resizedNotes(notes, ['a'], 0.25, 4, 0.25)[0].duration, 0.75);
  assert.equal(resizedNotes(notes, ['a'], 99, 4, 0.25)[0].duration, 1);
  assert.equal(resizedNotes(notes, ['a'], -99, 4, 0.25)[0].duration, 0.25,
    'a note never collapses past one cell');
});

test('resolveOverlaps shortens an earlier stationary note', () => {
  const active = note({ id: 'active', start: 1, duration: 1, channel: 2 });
  const earlier = note({ id: 'earlier', start: 0, duration: 1.5, channel: 2 });
  assert.deepEqual(resolveOverlaps([earlier, active], ['active']), [
    { ...earlier, duration: 1 }, active,
  ]);
});

test('resolveOverlaps removes covered starts only on the same pitch and channel', () => {
  const active = note({ id: 'active', start: 1, duration: 1, channel: 2 });
  const covered = note({ id: 'covered', start: 1.5, duration: 1, channel: 2 });
  const touching = note({ id: 'touching', start: 2, duration: 1, channel: 2 });
  const otherChannel = note({ id: 'channel', start: 1.5, duration: 1, channel: 3 });
  const otherPitch = note({ id: 'pitch', note: 61, start: 1.5, duration: 1, channel: 2 });
  assert.deepEqual(resolveOverlaps(
    [active, covered, touching, otherChannel, otherPitch], ['active'],
  ), [active, touching, otherChannel, otherPitch]);
});

test('resolveOverlaps removes a shortened note below the numerical minimum', () => {
  const stationary = note({ id: 'stationary', start: 1, duration: 1 });
  const active = note({ id: 'active', start: 1 + MIN_DURATION / 2, duration: 1 });
  assert.deepEqual(resolveOverlaps([stationary, active], ['active']), [active]);
});

test('resolveOverlaps lets the later-starting edited note win', () => {
  const earlier = note({ id: 'earlier', start: 1, duration: 2 });
  const later = note({ id: 'later', start: 2, duration: 1 });
  assert.deepEqual(resolveOverlaps([earlier, later], ['earlier', 'later']), [
    { ...earlier, duration: 1 }, later,
  ]);
});

test('quantize snaps starts, and lengths only when asked', () => {
  const notes = [note({ start: 0.31, duration: 0.6 })];
  const starts = quantizedNotes(notes, 0.25, { beats: 4 });
  assert.equal(starts[0].start, 0.25);
  assert.equal(starts[0].duration, 0.6, 'length is left alone by default');

  const both = quantizedNotes(notes, 0.25, { lengths: true, beats: 4 });
  assert.equal(both[0].duration, 0.5);
});

test('quantize can be limited to a selection', () => {
  const notes = [note({ id: 'a', start: 0.31 }), note({ id: 'b', start: 1.31 })];
  const quantized = quantizedNotes(notes, 0.25, { ids: ['b'], beats: 4 });
  assert.equal(quantized[0].start, 0.31, 'unselected note is untouched');
  assert.equal(quantized[1].start, 1.25);
});

test('a marquee catches notes that overlap it, not just those inside', () => {
  const notes = [
    note({ id: 'a', note: 60, start: 0, duration: 2 }),
    note({ id: 'b', note: 72, start: 0, duration: 1 }),
    note({ id: 'c', note: 60, start: 3, duration: 1 }),
  ];
  const hit = notesInBox(notes, { fromBeat: 1.5, toBeat: 0.5, fromNote: 65, toNote: 55 });
  assert.deepEqual(hit.map((entry) => entry.id), ['a'],
    'overlapping counts, out-of-pitch and out-of-time do not');
});
