import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.HTMLElement ??= class HTMLElement { constructor() { this.attributes = new Set(); } hasAttribute(name) { return this.attributes.has(name); } };
globalThis.customElements ??= {
  elements: new Map(),
  get(name) { return this.elements.get(name); },
  define(name, constructor) { this.elements.set(name, constructor); },
};

const { slotIndexAt } = await import('../src/components/compost-clip-grid.js');
const { gridText, lengthText, rulerLabels } = await import('../src/components/compost-note-editor.js');
const {
  snapBeat, sortLocators, normalizeTimeSelection, clipBox, loopPassLines, clipNoteOpacity, previewTrimmedClip, rulerStep,
  automationValueToY, automationValueFromY,
  addAutomationPoint, moveAutomationPoint, deleteAutomationPoint,
  preserveAutomationEdgePoints,
  snapAutomationValue, effectiveAutomationStep, automationValueAtBeat, automationRangeEdgeValues,
  moveAutomationPointsByY, moveAutomationRangeByY, thinAutomationPoints, drawAutomationPoints,
  flattenAutomationRange, moveAutomationRange,
} = await import('../src/components/compost-timeline.js');
const { boundedPosition, constrainedSize } = await import('../src/components/compost-window.js');
const { pointPlacement } = await import('../src/components/compost-popup.js');
const { duplicatedNotes, selectionSpan, trimmedNotes, velocityShiftedNotes } = await import('../src/piano-roll-model.js');

test('a pointer lands in the slot whose box contains it', () => {
  const rows = [{ top: 0, bottom: 32 }, { top: 32, bottom: 64 }, { top: 64, bottom: 96 }];
  assert.equal(slotIndexAt(10, rows), 0);
  assert.equal(slotIndexAt(32, rows), 1);
  assert.equal(slotIndexAt(95.9, rows), 2);
  assert.equal(slotIndexAt(96, rows), -1);
});

test('note lengths and ruler labels read musically', () => {
  assert.equal(gridText(1), '1 bar');
  assert.equal(gridText(12), '1/8T');
  assert.equal(gridText(18, 3), '1/16T');
  assert.equal(lengthText(1), '1 beat');
  assert.equal(lengthText(1.5), '1.2 beat');
  assert.equal(lengthText(2.5), '2.2 beats');
  assert.equal(lengthText(0.25), '0.1 beat');
  assert.equal(lengthText(0.5), '0.2 beat');
  assert.equal(lengthText(0.75), '0.3 beat');
  assert.equal(lengthText(0.5, 0.5), '1 beat');
  assert.equal(lengthText(0.25, 0.5), '0.2 beat');
  assert.deepEqual(rulerLabels(8, 4, 20).map((label) => label.text), ['1', '2']);
  assert.deepEqual(rulerLabels(8, 4, 60).map((label) => label.text),
    ['1', '1.2', '1.3', '1.4', '2', '2.2', '2.3', '2.4']);
  assert.deepEqual(rulerLabels(2, 4, 160, 0.25).map((label) => label.text),
    ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.2.1', '1.2.2', '1.2.3', '1.2.4']);
  assert.deepEqual(rulerLabels(1, 4, 150, 1 / 3).map((label) => label.text),
    ['1.1.1', '1.1.2', '1.1.3']);
  assert.deepEqual(rulerLabels(1, 4, 320, 0.125).map((label) => label.text),
    ['1.1.1', '1.1.2', '1.1.3', '1.1.4']);
  assert.deepEqual(rulerLabels(3, { barLength: 3, beatLength: 0.5 }, 160, 0.25)
    .map((label) => label.text),
  ['1.1.1', '1.1.2', '1.2.1', '1.2.2', '1.3.1', '1.3.2',
    '1.4.1', '1.4.2', '1.5.1', '1.5.2', '1.6.1', '1.6.2']);
});

test('timeline geometry snaps, scales and marks looping passes', () => {
  assert.equal(snapBeat(1.13, 4, 16, 'grid'), 1.25);
  assert.equal(snapBeat(1.13, 4, 16, 'off'), 1.13);
  assert.deepEqual(clipBox({ start: 4, length: 2 }, 20, 1), { left: 60, width: 40 });
  assert.deepEqual(clipBox({ start: 4, length: 0 }, 20, 1), { left: 60, width: 1 });
  assert.deepEqual(loopPassLines({ length: 10, duration: 4, offset: 1, loop: true }), [3, 7]);
  assert.deepEqual(loopPassLines({ length: 10, duration: 4, offset: 1, loop: false }), []);
  assert.deepEqual(loopPassLines({ length: 10, duration: 1, offset: 0, loop: true }, 4), [1, 3, 5, 7, 9]);
  // a trim preview keeps the content in place: the left edge moves the offset, the right edge only the length
  const looped = { start: 4, length: 8, duration: 4, offset: 1, loop: true };
  assert.deepEqual(previewTrimmedClip(looped, 4, 6), { ...looped, length: 2 });
  assert.deepEqual(previewTrimmedClip(looped, 6, 12), { ...looped, start: 6, length: 6, offset: 3 });
  assert.deepEqual(previewTrimmedClip(looped, 9, 12), { ...looped, start: 9, length: 3, offset: 2 });
  const oneShot = { start: 4, length: 3, duration: 3, offset: 0, loop: false };
  assert.deepEqual(previewTrimmedClip(oneShot, 5, 7), { ...oneShot, start: 5, length: 2, offset: 1 });
  assert.equal(rulerStep(24, 4), 1);
  assert.equal(rulerStep(12, 4), 2);
  assert.equal(rulerStep(6, 4), 4);
  assert.equal(rulerStep(3, 4), 8);
});

test('velocity dashes retain the specified opacity at rest', () => {
  assert.ok(Math.abs(clipNoteOpacity(30) - .4417322834645669) < 1e-12);
  assert.ok(Math.abs(clipNoteOpacity(80) - .6779527559055118) < 1e-12);
  assert.ok(Math.abs(clipNoteOpacity(120) - .8669291338582677) < 1e-12);
  assert.equal(clipNoteOpacity(undefined), .55);
  assert.equal(clipNoteOpacity(null), .55);
  assert.equal(clipNoteOpacity(''), .55);
  assert.equal(clipNoteOpacity(-10), .3);
  assert.ok(Math.abs(clipNoteOpacity(200) - .9) < 1e-12);
});

test('locators stay stable and time selections snap and clamp', () => {
  assert.deepEqual(sortLocators([
    { id: 'drop', beat: 8, name: 'drop' },
    { id: 'intro', beat: 0, name: 'intro' },
    { id: 'late', beat: 4, name: 'late' },
    { id: 'duplicate', beat: 4, name: 'first' },
    { id: 'duplicate', beat: 2, name: 'second' },
    { id: 'bad', beat: Number.NaN, name: 'bad' },
  ]), [
    { id: 'intro', beat: 0, name: 'intro' },
    { id: 'late', beat: 4, name: 'late' },
    { id: 'duplicate', beat: 4, name: 'first' },
    { id: 'drop', beat: 8, name: 'drop' },
  ]);
  assert.deepEqual(normalizeTimeSelection(9, 1, ['b', 'a', 'b'], 8), { start: 1, end: 8, laneIds: ['b', 'a'] });
  assert.equal(normalizeTimeSelection(2, 2, ['a'], 8), null);
  assert.equal(normalizeTimeSelection(null, 4, ['a'], 8), null);
});

test('automation geometry follows linear and fader axes', () => {
  assert.equal(automationValueToY(1, 0, 1, 100), 0);
  assert.equal(automationValueToY(0, 0, 1, 100), 100);
  assert.equal(automationValueFromY(25, 0, 1, 100), .75);
  assert.ok(Math.abs(automationValueToY(0, -90, 12, 100, 'gain') - 30) < 1e-9);
  assert.ok(Math.abs(automationValueFromY(30, -90, 12, 100, 'gain')) < 1e-9);
});

test('automation display moves follow the gain curve and retain independent range edges', () => {
  const options = { min: -90, max: 12, height: 100, scale: 'gain' };
  const origin = [{ beat: 0, value: -12 }, { beat: 4, value: 0 }];
  const expected = automationValueFromY(automationValueToY(-12, options.min, options.max, options.height, options.scale) + 10,
    options.min, options.max, options.height, options.scale);
  const movedPoint = moveAutomationPointsByY(origin, [0], 10, options);
  assert.ok(Math.abs(movedPoint[0].value - expected) < 1e-9);
  const edges = automationRangeEdgeValues(origin, 1, 3, options);
  assert.notEqual(edges.start, edges.end);
  const movedRange = moveAutomationRangeByY(origin, 1, 3, 10, options);
  assert.equal(movedRange[0].value, origin[0].value);
  assert.notEqual(movedRange.find((point) => point.beat === 1).value,
    movedRange.find((point) => point.beat === 3).value);
});

test('automation point edits stay sorted, clamped and neighbour-safe', () => {
  const range = { min: 0, max: 1 };
  let points = [{ beat: 0, value: .25 }, { beat: 4, value: .75 }];
  points = addAutomationPoint(points, { beat: 2, value: 2 }, range);
  assert.deepEqual(points.map((point) => [point.beat, point.value]), [[0, .25], [2, 1], [4, .75]]);
  points = moveAutomationPoint(points, 1, { beat: 8, value: -.5 }, range);
  assert.deepEqual(points.map((point) => [point.beat, point.value]), [[0, .25], [4, 0], [4, .75]]);
  assert.deepEqual(deleteAutomationPoint(points, 1).map((point) => [point.beat, point.value]), [[0, .25], [4, .75]]);
});

test('moving breakpoint endpoints retains flat edge runs and active order', () => {
  const origin = [{ beat: 0, value: .2 }, { beat: 4, value: .8 }];
  const first = preserveAutomationEdgePoints(origin, moveAutomationPoint(origin, 0, { beat: 2, value: .3 }), 0);
  assert.deepEqual(first.map((point) => [point.beat, point.value]), [[0, .2], [2, .3], [4, .8]]);
  const last = preserveAutomationEdgePoints(first, moveAutomationPoint(first, 2, { beat: 3, value: .7 }), 2);
  assert.deepEqual(last.map((point) => [point.beat, point.value]), [[0, .2], [2, .3], [3, .7], [4, .8]]);
});

test('automation chooser values interpolate, step and clamp', () => {
  const points = [{ beat: 0, value: 0 }, { beat: 4, value: 1 }];
  assert.equal(automationValueAtBeat(points, 2, 0, 1), .5);
  assert.equal(automationValueAtBeat(points, 2, 0, 1, 'linear', true), 0);
  assert.equal(automationValueAtBeat([{ beat: 0, value: 0 }, { beat: 2, value: .5 }, { beat: 4, value: 1 }], 2, 0, 1, 'linear', true), .5);
  const gainMid = automationValueAtBeat([{ beat: 0, value: -90 }, { beat: 4, value: 12 }], 2, -90, 12, 'gain');
  assert.equal(gainMid, -39);
  assert.equal(snapAutomationValue(1.2, 0, 1), 1);
  assert.equal(snapAutomationValue(.63, 0, 1, .25), .75);
  assert.deepEqual(flattenAutomationRange([
    { beat: 0, value: 0 }, { beat: 2, value: 1 }, { beat: 4, value: 0 },
  ], 1, 3, .5, 0, 1).map((point) => [point.beat, point.value]), [
    [0, 0], [1, .5], [3, .5], [4, 0],
  ]);
  assert.deepEqual(moveAutomationRange([
    { beat: 0, value: .2 }, { beat: 2, value: .3 }, { beat: 4, value: .4 },
  ], 1, 3, .25, 0, 1).map((point) => [point.beat, point.value]), [
    [0, .2], [1, .5], [2, .55], [3, .6], [4, .4],
  ]);
});

test('stepped automation defaults to integer cells when no step is supplied', () => {
  assert.equal(effectiveAutomationStep(true), 1);
  assert.equal(effectiveAutomationStep(false), 0);
  assert.equal(effectiveAutomationStep(true, .25), .25);
  assert.deepEqual(drawAutomationPoints([], [
    { beat: 0, value: .2 }, { beat: 1, value: .8 },
  ], { min: 0, max: 1, stepped: true, gridStep: 1 }).map((point) => point.value), [0, 0, 1, 1]);
});

test('automation draw emits flat grid pairs and thins freehand once', () => {
  const grid = drawAutomationPoints([{ beat: 0, value: 0 }], [
    { beat: .1, value: .2 }, { beat: 1.1, value: .8 }, { beat: 2.1, value: .4 },
  ], { min: 0, max: 1, gridStep: 1 });
  assert.deepEqual(grid.map((point) => [point.beat, point.value]), [
    [0, .2], [1 - 1e-9, .2], [1, .8], [2 - 1e-9, .8], [2, .4], [3 - 1e-9, .4],
  ]);
  const revisited = drawAutomationPoints([], [
    { beat: 1.8, value: .9 }, { beat: .2, value: .1 },
    { beat: 1.2, value: .2 }, { beat: .8, value: .7 },
  ], { min: 0, max: 1, gridStep: 1 });
  assert.deepEqual(revisited.map((point) => [point.beat, point.value]), [
    [0, .7], [1 - 1e-9, .7], [1, .2], [2 - 1e-9, .2],
  ]);
  const untouched = drawAutomationPoints([
    { beat: 1 - 1e-6, value: .11 }, { beat: 3, value: .33 },
  ], [{ beat: 1.2, value: .8 }], { min: 0, max: 1, gridStep: 1 });
  assert.deepEqual(untouched.map((point) => [point.beat, point.value]), [
    [1 - 1e-6, .11], [1, .8], [2 - 1e-9, .8], [3, .33],
  ]);
  const samples = [{ beat: 0, value: 0 }, { beat: 1, value: .8 }, { beat: 2, value: 1 }];
  assert.deepEqual(thinAutomationPoints(samples, .01), samples);
  assert.deepEqual(drawAutomationPoints([], [
    { beat: 0, value: 0 }, { beat: 1, value: .8 }, { beat: 2, value: 1 },
  ], { min: 0, max: 1, freehand: true, tolerance: .01 }), samples);
  assert.equal(drawAutomationPoints([], [
    { beat: 0, value: 0 }, { beat: 1, value: .5 }, { beat: 2, value: 1 },
  ], { min: 0, max: 1, freehand: true, tolerance: 0 }).length, 3);
});

test('a window never leaves the viewport and resizes in ratio from the dominant edge', () => {
  assert.deepEqual(boundedPosition({ x: -20, y: 900, width: 300, height: 200, viewportWidth: 1000, viewportHeight: 600 }),
    { x: 0, y: 400 });
  assert.deepEqual(constrainedSize({ width: 100, height: 500, current: { width: 300, height: 200 },
    minWidth: 200, minHeight: 120, maxWidth: 400, maxHeight: 300 }), { width: 200, height: 300 });
  // the width moved further, so the height follows it into 4:3
  const ratio = constrainedSize({ width: 400, height: 210, current: { width: 300, height: 225 },
    minWidth: 100, minHeight: 100, maxWidth: 1000, maxHeight: 1000, aspectRatio: 4 / 3 });
  assert.deepEqual(ratio, { width: 400, height: 300 });
  // a bound on the height pulls the width back into ratio
  const bounded = constrainedSize({ width: 800, height: 600, current: { width: 300, height: 225 },
    minWidth: 100, minHeight: 100, maxWidth: 1000, maxHeight: 450, aspectRatio: 4 / 3 });
  assert.deepEqual(bounded, { width: 600, height: 450 });
  const vertical = constrainedSize({ width: 900, height: 260, current: { width: 300, height: 200 },
    minWidth: 100, minHeight: 100, maxWidth: 1000, maxHeight: 1000, axis: 'vertical' });
  assert.deepEqual(vertical, { width: 300, height: 260 });
});

test('a context menu is pulled back inside the viewport', () => {
  assert.deepEqual(pointPlacement({ x: 980, y: 590, viewportWidth: 1000, viewportHeight: 600, contentWidth: 150, contentHeight: 120 }),
    { left: 846, top: 476, width: 150, height: 120 });
  assert.deepEqual(pointPlacement({ x: 10, y: 10, viewportWidth: 1000, viewportHeight: 600, contentWidth: 150, contentHeight: 120 }),
    { left: 10, top: 10, width: 150, height: 120 });
});

test('trimming keeps the end, velocity pins to MIDI, duplicates land one span later', () => {
  const notes = [
    { id: 'a', note: 60, start: 1, duration: 1, velocity: 100, channel: 0 },
    { id: 'b', note: 64, start: 2.5, duration: 0.5, velocity: 120, channel: 0 },
  ];
  const trimmed = trimmedNotes(notes, ['a'], 0.5, 16, 0.25);
  assert.deepEqual([trimmed[0].start, trimmed[0].duration], [1.5, 0.5]);
  const overTrimmed = trimmedNotes(notes, ['a'], 5, 16, 0.25);
  assert.deepEqual([overTrimmed[0].start, overTrimmed[0].duration], [1.75, 0.25]);
  assert.equal(velocityShiftedNotes(notes, ['b'], 20)[1].velocity, 127);
  assert.equal(velocityShiftedNotes(notes, ['a'], -200)[0].velocity, 1);
  assert.deepEqual(selectionSpan(notes), { start: 1, end: 3 });
  assert.equal(selectionSpan([]), null);
  let next = 0;
  const copies = duplicatedNotes(notes, ['a', 'b'], 0.25, 16, () => `c${next += 1}`);
  assert.deepEqual(copies.map((note) => [note.id, note.start]), [['c1', 3], ['c2', 4.5]]);
  // a selected time range reaching past the notes stretches the spacing to match
  const spaced = duplicatedNotes(notes, ['a', 'b'], 0.25, 16, () => `d${next += 1}`, 'grid', { start: 1, end: 5 });
  assert.deepEqual(spaced.map((note) => [note.id, note.start]), [['d3', 5], ['d4', 6.5]]);
  // an explicit off-grid range is the spacing; duplication does not quantize it
  const freeSpaced = duplicatedNotes(notes, ['a', 'b'], 0.25, 16,
    () => `f${next += 1}`, 'grid', { start: 1, end: 4.1 });
  assert.deepEqual(freeSpaced.map((note) => [note.id, note.start]), [['f5', 4.1], ['f6', 5.6]]);
  // a range narrower than the notes leaves the span-based spacing alone
  const narrow = duplicatedNotes(notes, ['a', 'b'], 0.25, 16, () => `e${next += 1}`, 'grid', { start: 1, end: 1.5 });
  assert.deepEqual(narrow.map((note) => [note.id, note.start]), [['e7', 3], ['e8', 4.5]]);
});
