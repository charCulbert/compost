import assert from "node:assert/strict";
import test from "node:test";
import { normaliseMIDIMessage as normaliseCoreMIDIMessage } from "../src/midi.js";
import {
	formatMIDIMapping,
	mapMIDIValueToRange,
	midiChannelFromMessage,
	midiControllerFromMessage,
	midiControllerValueFromMessage,
	midiMappingFromMessage,
	midiMappingMatchesMessage,
	normaliseMIDIMapping,
	normaliseMIDIMessage,
} from "../src/midi-mapping.js";

test("MIDI mapping re-exports the core decoder and accessors", () => {
	const message = 0xb24a64;

	assert.equal(normaliseMIDIMessage, normaliseCoreMIDIMessage);
	assert.deepEqual(normaliseMIDIMessage(message), [0xb2, 74, 100]);
	assert.deepEqual(normaliseMIDIMessage(null), [0, 0, 0]);
	assert.equal(midiChannelFromMessage(message), 2);
	assert.equal(midiControllerFromMessage(message), 74);
	assert.equal(midiControllerValueFromMessage(message), 100);
});

test("normaliseMIDIMapping accepts CC and optional 1-based channel", () => {
	assert.deepEqual(normaliseMIDIMapping({ cc: 70, channel: 1 }), {
		cc: 70,
		midiCC: 70,
		channel: 1,
		midiChannel: 1,
	});
	assert.deepEqual(normaliseMIDIMapping({ midiCC: 3 }), {
		cc: 3,
		midiCC: 3,
		channel: null,
		midiChannel: null,
	});
});

test("normaliseMIDIMapping rejects invalid CC or channel", () => {
	assert.equal(normaliseMIDIMapping({ cc: -1 }), null);
	assert.equal(normaliseMIDIMapping({ cc: 128 }), null);
	assert.equal(normaliseMIDIMapping({ cc: 7, channel: 0 }), null);
	assert.equal(normaliseMIDIMapping({ cc: 7, channel: 17 }), null);
});

test("midiMappingFromMessage learns CC and channel from a CC message", () => {
	assert.deepEqual(midiMappingFromMessage([0xb2, 74, 100]), {
		cc: 74,
		midiCC: 74,
		channel: 3,
		midiChannel: 3,
	});
	assert.deepEqual(
		midiMappingFromMessage([0xb2, 74, 100], { learnChannel: false }),
		{
			cc: 74,
			midiCC: 74,
			channel: null,
			midiChannel: null,
		},
	);
});

test("midiMappingMatchesMessage honors fixed channel and wildcard channel", () => {
	assert.equal(
		midiMappingMatchesMessage({ cc: 10, channel: 2 }, [0xb1, 10, 64]),
		true,
	);
	assert.equal(
		midiMappingMatchesMessage({ cc: 10, channel: 2 }, [0xb2, 10, 64]),
		false,
	);
	assert.equal(
		midiMappingMatchesMessage({ cc: 10, channel: null }, [0xbf, 10, 64]),
		true,
	);
});

test("mapMIDIValueToRange maps 7-bit MIDI to the full parameter range", () => {
	assert.equal(mapMIDIValueToRange(0, { min: -1, max: 1 }), -1);
	assert.equal(mapMIDIValueToRange(127, { min: -1, max: 1 }), 1);
	assert.ok(
		Math.abs(mapMIDIValueToRange(64, { min: 0, max: 10 }) - 5.03937) < 0.0001,
	);
});

test("mapMIDIValueToRange uses linear mid as a two-segment center", () => {
	assert.equal(
		mapMIDIValueToRange(63.5, {
			min: 0,
			max: 100,
			mid: 10,
		}),
		10,
	);
});

test("mapMIDIValueToRange supports log curves", () => {
	assert.ok(
		Math.abs(
			mapMIDIValueToRange(63.5, {
				min: 20,
				max: 20000,
				mid: 1000,
				curve: "log",
			}) - 1000,
		) < 0.0001,
	);

	assert.ok(
		Math.abs(
			mapMIDIValueToRange(63.5, {
				min: 20,
				max: 20000,
				curve: "log",
			}) - Math.sqrt(20 * 20000),
		) < 0.0001,
	);
});

test("formatMIDIMapping matches UI label order", () => {
	assert.equal(formatMIDIMapping({ cc: 70, channel: 1 }), "ch 1 CC 70");
	assert.equal(formatMIDIMapping({ cc: 70 }), "CC 70");
	assert.equal(formatMIDIMapping(null), "Unmapped");
});
