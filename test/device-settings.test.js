import assert from "node:assert/strict";
import test from "node:test";
import {
	deviceSettingsDetailFromSnapshot,
	normaliseDeviceSelectorSnapshot,
} from "../src/device-settings.js";

test("normaliseDeviceSelectorSnapshot normalises canonical device selector snapshots", () => {
	const snapshot = normaliseDeviceSelectorSnapshot({
		audio: {
			api: "Core Audio",
			apis: ["Core Audio", "Core Audio"],
			inputDeviceId: "mic",
			outputDeviceId: "speakers",
			sampleRate: 48000,
			bufferSize: 128,
			inputDevices: [{ id: "mic", name: "Mic", channels: 2 }],
			outputDevices: [{ id: "speakers", name: "Speakers" }],
			sampleRates: [44100, 48000],
			bufferSizes: [64, 128],
			requiredInputChannels: 2,
			requiredOutputChannels: 2,
		},
		midi: {
			inputDevices: [
				{ id: "keyboard", name: "Keyboard" },
				{ id: "pads", name: "Pads" },
			],
			outputDevices: [
				{ id: "synth", name: "Synth" },
				{ id: "clock", name: "Clock" },
			],
			inputDeviceIds: ["keyboard", "keyboard"],
			outputDeviceIds: ["synth", "clock", "synth"],
		},
	});

	assert.equal(snapshot.audio.api, "Core Audio");
	assert.deepEqual(snapshot.audio.apis, ["Core Audio"]);
	assert.equal(snapshot.audio.inputDeviceId, "mic");
	assert.equal(snapshot.audio.outputDeviceId, "speakers");
	assert.deepEqual(snapshot.audio.sampleRates, [48000, 44100]);
	assert.deepEqual(snapshot.audio.bufferSizes, [128, 64]);
	assert.equal(snapshot.audio.requiredInputChannels, 2);
	assert.equal(snapshot.audio.requiredOutputChannels, 2);
	assert.deepEqual(
		snapshot.midi.inputDevices.map((device) => device.id),
		["keyboard", "pads"],
	);
	assert.deepEqual(
		snapshot.midi.outputDevices.map((device) => device.id),
		["synth", "clock"],
	);
	assert.deepEqual(snapshot.midi.inputDeviceIds, ["keyboard"]);
	assert.deepEqual(snapshot.midi.outputDeviceIds, ["synth", "clock"]);
});

test("deviceSettingsDetailFromSnapshot emits canonical nested settings only", () => {
	const detail = deviceSettingsDetailFromSnapshot(
		{
			audio: {
				api: "Core Audio",
				inputDeviceId: "mic",
				outputDeviceId: "speakers",
				sampleRate: 48000,
				bufferSize: 128,
			},
			midi: {
				inputDeviceIds: ["keyboard"],
				outputDeviceIds: ["synth"],
			},
		},
		{
			requestId: 4,
			changed: "audio.outputDeviceId",
			audio: {
				outputDeviceId: "interface",
				sampleRate: 96000,
				bufferSize: 64,
			},
			midi: {
				inputDeviceIds: ["keyboard", "pads"],
				outputDeviceIds: ["synth", "clock"],
			},
		},
	);

	assert.equal(detail.requestId, 4);
	assert.equal(detail.changed, "audio.outputDeviceId");
	assert.equal(detail.settings.audio.outputDeviceId, "interface");
	assert.equal(detail.settings.audio.sampleRate, 96000);
	assert.equal(detail.settings.audio.bufferSize, 64);
	assert.deepEqual(detail.settings.midi.inputDeviceIds, ["keyboard", "pads"]);
	assert.deepEqual(detail.settings.midi.outputDeviceIds, ["synth", "clock"]);
	assert.ok(!("audioAPI" in detail));
	assert.ok(!("inputDeviceID" in detail));
	assert.ok(!("outputDeviceID" in detail));
	assert.ok(!("sampleRate" in detail));
	assert.ok(!("blockSize" in detail));
	assert.ok(!("midiInputDevices" in detail));
	assert.ok(!("midiOutputDevice" in detail));
	assert.ok(!("midiOutputDevices" in detail));
	assert.ok(!("outputDeviceId" in detail.settings.midi));
});

test("normaliseDeviceSelectorSnapshot leaves absent channel requirements visible", () => {
	const snapshot = normaliseDeviceSelectorSnapshot({
		audio: {
			outputDevices: [{ id: "out", name: "Output" }],
			outputDeviceId: "out",
		},
	});

	assert.equal(snapshot.audio.requiredInputChannels, null);
	assert.equal(snapshot.audio.requiredOutputChannels, null);
});
