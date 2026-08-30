import assert from "node:assert/strict";
import test from "node:test";

globalThis.HTMLElement ??= class HTMLElement {
	constructor() {
		this.attributes = new Set();
	}
	hasAttribute(name) {
		return this.attributes.has(name);
	}
};
globalThis.customElements ??= {
	elements: new Map(),
	get(name) {
		return this.elements.get(name);
	},
	define(name, elementClass) {
		this.elements.set(name, elementClass);
	},
};

const { rectangularClipSelection, slotIndexAt, translatedClipPositions } =
	await import("../src/components/compost-clip-grid.js");
const { gridText, lengthText } = await import(
	"../src/components/compost-note-editor.js"
);
const { rulerLabels } = await import("../src/internal/time-ruler.js");
const {
	snapBeat,
	sortLocators,
	normalizeTimeSelection,
	clipBox,
	loopPassLines,
	clipNoteOpacity,
	previewTrimmedClip,
	rulerStep,
} = await import("../src/components/compost-timeline.js");
const { boundedPosition, constrainedSize } = await import(
	"../src/components/compost-window.js"
);
const { pointPlacement } = await import("../src/components/compost-popup.js");
const { duplicatedNotes, selectionSpan, trimmedNotes, velocityShiftedNotes } =
	await import("../src/piano-roll-model.js");

test("clip-grid rectangles select occupied slots and preserve sparse spacing", () => {
	const tracks = [
		{ id: "a", clips: [{ name: "a0" }, null, { name: "a2" }] },
		{ id: "b", clips: [null, { name: "b1" }, { name: "b2" }] },
		{ id: "c", clips: [{ name: "c0" }, null, null] },
	];
	assert.deepEqual(
		rectangularClipSelection(
			tracks,
			{ trackId: "a", slot: 0 },
			{ trackId: "b", slot: 2 },
		),
		[
			{ trackId: "a", slot: 0 },
			{ trackId: "a", slot: 2 },
			{ trackId: "b", slot: 1 },
			{ trackId: "b", slot: 2 },
		],
	);
	assert.deepEqual(
		translatedClipPositions(
			tracks,
			[
				{ trackId: "a", slot: 0 },
				{ trackId: "b", slot: 2 },
			],
			{ trackId: "b", slot: 3 },
		),
		[
			{ trackId: "b", slot: 3 },
			{ trackId: "c", slot: 5 },
		],
	);
});

test("a pointer lands in the slot whose box contains it", () => {
	const rows = [
		{ top: 0, bottom: 32 },
		{ top: 32, bottom: 64 },
		{ top: 64, bottom: 96 },
	];
	assert.equal(slotIndexAt(10, rows), 0);
	assert.equal(slotIndexAt(32, rows), 1);
	assert.equal(slotIndexAt(95.9, rows), 2);
	assert.equal(slotIndexAt(96, rows), -1);
});

test("note lengths and ruler labels read musically", () => {
	assert.equal(gridText(1), "1 bar");
	assert.equal(gridText(12), "1/8T");
	assert.equal(gridText(18, 3), "1/16T");
	assert.equal(lengthText(1), "1 beat");
	assert.equal(lengthText(1.5), "1.2 beat");
	assert.equal(lengthText(2.5), "2.2 beats");
	assert.equal(lengthText(0.25), "0.1 beat");
	assert.equal(lengthText(0.5), "0.2 beat");
	assert.equal(lengthText(0.75), "0.3 beat");
	assert.equal(lengthText(0.5, 0.5), "1 beat");
	assert.equal(lengthText(0.25, 0.5), "0.2 beat");
	assert.deepEqual(
		rulerLabels(8, 4, 20).map((label) => label.text),
		["1", "2"],
	);
	assert.deepEqual(
		rulerLabels(8, 4, 60).map((label) => label.text),
		["1", "1.2", "1.3", "1.4", "2", "2.2", "2.3", "2.4"],
	);
	assert.deepEqual(
		rulerLabels(2, 4, 160, 0.25).map((label) => label.text),
		["1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.2.1", "1.2.2", "1.2.3", "1.2.4"],
	);
	assert.deepEqual(
		rulerLabels(1, 4, 150, 1 / 3).map((label) => label.text),
		["1.1.1", "1.1.2", "1.1.3"],
	);
	assert.deepEqual(
		rulerLabels(1, 4, 320, 0.125).map((label) => label.text),
		["1.1.1", "1.1.2", "1.1.3", "1.1.4"],
	);
	assert.deepEqual(
		rulerLabels(3, { barLength: 3, beatLength: 0.5 }, 160, 0.25).map(
			(label) => label.text,
		),
		[
			"1.1.1",
			"1.1.2",
			"1.2.1",
			"1.2.2",
			"1.3.1",
			"1.3.2",
			"1.4.1",
			"1.4.2",
			"1.5.1",
			"1.5.2",
			"1.6.1",
			"1.6.2",
		],
	);
});

test("timeline geometry snaps, scales and marks looping passes", () => {
	assert.equal(snapBeat(1.13, 4, 16, "grid"), 1.25);
	assert.equal(snapBeat(1.13, 4, 16, "off"), 1.13);
	assert.deepEqual(clipBox({ start: 4, length: 2 }, 20, 1), {
		left: 60,
		width: 40,
	});
	assert.deepEqual(clipBox({ start: 4, length: 0 }, 20, 1), {
		left: 60,
		width: 1,
	});
	assert.deepEqual(
		loopPassLines({ length: 10, duration: 4, offset: 1, loop: true }),
		[3, 7],
	);
	assert.deepEqual(
		loopPassLines({ length: 10, duration: 4, offset: 1, loop: false }),
		[],
	);
	assert.deepEqual(
		loopPassLines({ length: 10, duration: 1, offset: 0, loop: true }, 4),
		[1, 3, 5, 7, 9],
	);
	// a trim preview keeps the content in place: the left edge moves the offset, the right edge only the length
	const looped = { start: 4, length: 8, duration: 4, offset: 1, loop: true };
	assert.deepEqual(previewTrimmedClip(looped, 4, 6), { ...looped, length: 2 });
	assert.deepEqual(previewTrimmedClip(looped, 6, 12), {
		...looped,
		start: 6,
		length: 6,
		offset: 3,
	});
	assert.deepEqual(previewTrimmedClip(looped, 9, 12), {
		...looped,
		start: 9,
		length: 3,
		offset: 2,
	});
	const oneShot = { start: 4, length: 3, duration: 3, offset: 0, loop: false };
	assert.deepEqual(previewTrimmedClip(oneShot, 5, 7), {
		...oneShot,
		start: 5,
		length: 2,
		offset: 1,
	});
	assert.equal(rulerStep(24, 4), 1);
	assert.equal(rulerStep(12, 4), 2);
	assert.equal(rulerStep(6, 4), 4);
	assert.equal(rulerStep(3, 4), 8);
});

test("velocity dashes retain the specified opacity at rest", () => {
	assert.ok(Math.abs(clipNoteOpacity(30) - 0.4417322834645669) < 1e-12);
	assert.ok(Math.abs(clipNoteOpacity(80) - 0.6779527559055119) < 1e-12);
	assert.ok(Math.abs(clipNoteOpacity(120) - 0.8669291338582678) < 1e-12);
	assert.equal(clipNoteOpacity(undefined), 0.55);
	assert.equal(clipNoteOpacity(null), 0.55);
	assert.equal(clipNoteOpacity(""), 0.55);
	assert.equal(clipNoteOpacity(-10), 0.3);
	assert.ok(Math.abs(clipNoteOpacity(200) - 0.9) < 1e-12);
});

test("locators stay stable and time selections snap and clamp", () => {
	assert.deepEqual(
		sortLocators([
			{ id: "drop", beat: 8, name: "drop" },
			{ id: "intro", beat: 0, name: "intro" },
			{ id: "late", beat: 4, name: "late" },
			{ id: "duplicate", beat: 4, name: "first" },
			{ id: "duplicate", beat: 2, name: "second" },
			{ id: "bad", beat: Number.NaN, name: "bad" },
		]),
		[
			{ id: "intro", beat: 0, name: "intro" },
			{ id: "late", beat: 4, name: "late" },
			{ id: "duplicate", beat: 4, name: "first" },
			{ id: "drop", beat: 8, name: "drop" },
		],
	);
	assert.deepEqual(normalizeTimeSelection(9, 1, ["b", "a", "b"], 8), {
		start: 1,
		end: 8,
		laneIds: ["b", "a"],
	});
	assert.deepEqual(normalizeTimeSelection(2, 2, ["a"], 8), {
		start: 2,
		end: 2,
		laneIds: ["a"],
	});
	assert.equal(normalizeTimeSelection(null, 4, ["a"], 8), null);
});

test("a window never leaves the viewport and resizes in ratio from the dominant edge", () => {
	assert.deepEqual(
		boundedPosition({
			x: -20,
			y: 900,
			width: 300,
			height: 200,
			viewportWidth: 1000,
			viewportHeight: 600,
		}),
		{ x: 0, y: 400 },
	);
	assert.deepEqual(
		constrainedSize({
			width: 100,
			height: 500,
			current: { width: 300, height: 200 },
			minWidth: 200,
			minHeight: 120,
			maxWidth: 400,
			maxHeight: 300,
		}),
		{ width: 200, height: 300 },
	);
	// the width moved further, so the height follows it into 4:3
	const ratio = constrainedSize({
		width: 400,
		height: 210,
		current: { width: 300, height: 225 },
		minWidth: 100,
		minHeight: 100,
		maxWidth: 1000,
		maxHeight: 1000,
		aspectRatio: 4 / 3,
	});
	assert.deepEqual(ratio, { width: 400, height: 300 });
	// a bound on the height pulls the width back into ratio
	const bounded = constrainedSize({
		width: 800,
		height: 600,
		current: { width: 300, height: 225 },
		minWidth: 100,
		minHeight: 100,
		maxWidth: 1000,
		maxHeight: 450,
		aspectRatio: 4 / 3,
	});
	assert.deepEqual(bounded, { width: 600, height: 450 });
	const vertical = constrainedSize({
		width: 900,
		height: 260,
		current: { width: 300, height: 200 },
		minWidth: 100,
		minHeight: 100,
		maxWidth: 1000,
		maxHeight: 1000,
		axis: "vertical",
	});
	assert.deepEqual(vertical, { width: 300, height: 260 });
});

test("a context menu is pulled back inside the viewport", () => {
	assert.deepEqual(
		pointPlacement({
			x: 980,
			y: 590,
			viewportWidth: 1000,
			viewportHeight: 600,
			contentWidth: 150,
			contentHeight: 120,
		}),
		{ left: 846, top: 476, width: 150, height: 120 },
	);
	assert.deepEqual(
		pointPlacement({
			x: 10,
			y: 10,
			viewportWidth: 1000,
			viewportHeight: 600,
			contentWidth: 150,
			contentHeight: 120,
		}),
		{ left: 10, top: 10, width: 150, height: 120 },
	);
});

test("trimming keeps the end, velocity pins to MIDI, duplicates land one span later", () => {
	const notes = [
		{ id: "a", note: 60, start: 1, duration: 1, velocity: 100, channel: 0 },
		{ id: "b", note: 64, start: 2.5, duration: 0.5, velocity: 120, channel: 0 },
	];
	const trimmed = trimmedNotes(notes, ["a"], 0.5, 16, 0.25);
	assert.deepEqual([trimmed[0].start, trimmed[0].duration], [1.5, 0.5]);
	const overTrimmed = trimmedNotes(notes, ["a"], 5, 16, 0.25);
	assert.deepEqual(
		[overTrimmed[0].start, overTrimmed[0].duration],
		[1.75, 0.25],
	);
	assert.equal(velocityShiftedNotes(notes, ["b"], 20)[1].velocity, 127);
	assert.equal(velocityShiftedNotes(notes, ["a"], -200)[0].velocity, 1);
	assert.deepEqual(selectionSpan(notes), { start: 1, end: 3 });
	assert.equal(selectionSpan([]), null);
	let next = 0;
	const copies = duplicatedNotes(notes, ["a", "b"], 0.25, 16, () => {
		next += 1;
		return `c${next}`;
	});
	assert.deepEqual(
		copies.map((note) => [note.id, note.start]),
		[
			["c1", 3],
			["c2", 4.5],
		],
	);
	// a selected time range reaching past the notes stretches the spacing to match
	const spaced = duplicatedNotes(
		notes,
		["a", "b"],
		0.25,
		16,
		() => {
			next += 1;
			return `d${next}`;
		},
		"grid",
		{ start: 1, end: 5 },
	);
	assert.deepEqual(
		spaced.map((note) => [note.id, note.start]),
		[
			["d3", 5],
			["d4", 6.5],
		],
	);
	// an explicit off-grid range is the spacing; duplication does not quantize it
	const freeSpaced = duplicatedNotes(
		notes,
		["a", "b"],
		0.25,
		16,
		() => {
			next += 1;
			return `f${next}`;
		},
		"grid",
		{ start: 1, end: 4.1 },
	);
	assert.deepEqual(
		freeSpaced.map((note) => [note.id, note.start]),
		[
			["f5", 4.1],
			["f6", 5.6],
		],
	);
	// a range narrower than the notes leaves the span-based spacing alone
	const narrow = duplicatedNotes(
		notes,
		["a", "b"],
		0.25,
		16,
		() => {
			next += 1;
			return `e${next}`;
		},
		"grid",
		{ start: 1, end: 1.5 },
	);
	assert.deepEqual(
		narrow.map((note) => [note.id, note.start]),
		[
			["e7", 3],
			["e8", 4.5],
		],
	);
});
