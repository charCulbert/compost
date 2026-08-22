import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.HTMLElement ??= class HTMLElement { constructor() { this.attributes = new Set(); } hasAttribute(name) { return this.attributes.has(name); } };
globalThis.customElements ??= {
  elements: new Map(),
  get(name) { return this.elements.get(name); },
  define(name, constructor) { this.elements.set(name, constructor); },
};

const { DEFAULT_TAPER, dragAxis, parseTaper, washLevel, washPosition } = await import('../src/components/compost-channel-strip.js');
const { panBar, panText } = await import('../src/components/compost-channel-card.js');
const { slotIndexAt } = await import('../src/components/compost-clip-grid.js');
const { lengthText, rulerLabels } = await import('../src/components/compost-note-editor.js');
const { snapBeat, clipBox, loopPassLines, rulerStep } = await import('../src/components/compost-timeline.js');
const { boundedPosition, constrainedSize } = await import('../src/components/compost-window.js');
const { pointPlacement } = await import('../src/components/compost-popup.js');
const { duplicatedNotes, selectionSpan, trimmedNotes, velocityShiftedNotes } = await import('../src/piano-roll-model.js');

test('the wash taper puts unity at 70% and runs between the table points', () => {
  assert.equal(washPosition(0), 0.7);
  assert.equal(washPosition(12), 1);
  assert.equal(washPosition(-90), 0);
  assert.equal(washPosition(30), 1);
  assert.equal(washPosition(-120), 0);
  assert.ok(Math.abs(washPosition(-3) - 0.65) < 1e-9);
  assert.equal(washPosition(Number.NaN), 0);
});

test('a taper attribute is parsed, sorted and validated', () => {
  assert.equal(parseTaper(''), DEFAULT_TAPER);
  assert.equal(parseTaper('nonsense'), DEFAULT_TAPER);
  const linear = parseTaper('-60:0 0:1');
  assert.equal(washPosition(-30, linear), 0.5);
  const reversed = parseTaper('0:1 -60:0');
  assert.deepEqual(reversed, [[0, 1], [-60, 0]]);
});

test('the drag axis waits for a movement and favours vertical', () => {
  assert.equal(dragAxis(1, 2), null);
  assert.equal(dragAxis(0, 10), 'gain');
  assert.equal(dragAxis(10, 8), 'gain');
  assert.equal(dragAxis(15, 10), 'pan');
});

test('pan reads as C, L and R with the bar growing from the middle', () => {
  assert.equal(panText(0), 'C');
  assert.equal(panText(0.01), 'C');
  assert.equal(panText(-0.5), '50L');
  assert.equal(panText(1), '100R');
  assert.deepEqual(panBar(-0.5), { left: 25, width: 25 });
  assert.deepEqual(panBar(0.2), { left: 50, width: 10 });
});

test('a pointer lands in the slot whose box contains it', () => {
  const rows = [{ top: 0, bottom: 32 }, { top: 32, bottom: 64 }, { top: 64, bottom: 96 }];
  assert.equal(slotIndexAt(10, rows), 0);
  assert.equal(slotIndexAt(32, rows), 1);
  assert.equal(slotIndexAt(95.9, rows), 2);
  assert.equal(slotIndexAt(96, rows), -1);
});

test('note lengths and ruler labels read musically', () => {
  assert.equal(lengthText(1), '1 beat');
  assert.equal(lengthText(1.5), '1.2 beat');
  assert.equal(lengthText(2.5), '2.2 beats');
  assert.equal(lengthText(0.25), '0.25 beat');
  assert.deepEqual(rulerLabels(8, 4, 20).map((label) => label.text), ['1', '2']);
  assert.deepEqual(rulerLabels(8, 4, 60).map((label) => label.text),
    ['1', '1.2', '1.3', '1.4', '2', '2.2', '2.3', '2.4']);
});

test('timeline geometry snaps, scales and marks looping passes', () => {
  assert.equal(snapBeat(1.13, 4, 16, 'grid'), 1.25);
  assert.equal(snapBeat(1.13, 4, 16, 'off'), 1.13);
  assert.deepEqual(clipBox({ start: 4, length: 2 }, 20, 1), { left: 60, width: 40 });
  assert.deepEqual(clipBox({ start: 4, length: 0 }, 20, 1), { left: 60, width: 1 });
  assert.deepEqual(loopPassLines({ length: 10, duration: 4, offset: 1, loop: true }), [3, 7]);
  assert.deepEqual(loopPassLines({ length: 10, duration: 4, offset: 1, loop: false }), []);
  assert.equal(rulerStep(24, 4), 1);
  assert.equal(rulerStep(12, 4), 2);
  assert.equal(rulerStep(6, 4), 4);
  assert.equal(rulerStep(3, 4), 8);
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
});

test('washLevel is washPosition run backwards, so a drag keeps the edge under the pointer', () => {
  for (const db of [12, 6, 3, 0, -4.5, -12, -20, -36, -48, -60, -75, -90])
    assert.ok(Math.abs(washLevel(washPosition(db)) - db) < 1e-9, `${db} dB round-trips`);
  assert.equal(washLevel(0.7), 0);
  assert.equal(washLevel(1), 12);
  assert.equal(washLevel(0), -90);
  assert.equal(washLevel(1.4), 12);
  assert.equal(washLevel(-0.2), -90);
  assert.equal(washLevel(Number.NaN), -90);
  const taper = parseTaper('6:1 0:.5 -60:0');
  assert.equal(washLevel(0.75, taper), 3);
  assert.equal(washLevel(0.25, taper), -30);
});
