import assert from "node:assert/strict";
import test from "node:test";

globalThis.HTMLElement = class HTMLElement {};
globalThis.customElements = {
	elements: new Map(),
	get(name) {
		return this.elements.get(name);
	},
	define(name, constructor) {
		this.elements.set(name, constructor);
	},
};

const { CompostMIDI } = await import("../src/components/compost-midi.js");

function inputDevice(id = "keyboard") {
	const listeners = new Map();
	return {
		id,
		name: id,
		state: "connected",
		connection: "closed",
		opens: 0,
		listeners,
		async open() {
			this.opens += 1;
			this.connection = "open";
		},
		addEventListener(type, listener) {
			const entries = listeners.get(type) || new Set();
			entries.add(listener);
			listeners.set(type, entries);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		},
	};
}

function midiHarness(inputID = "__none__") {
	return Object.assign(Object.create(CompostMIDI.prototype), {
		selectedInputID: inputID,
		selectedOutputID: "",
		inputs: [],
		outputs: [],
		currentInputs: [],
		inputListeners: new Map(),
		attachVersion: 0,
		status: "",
		hasAttribute() {
			return false;
		},
	});
}

test("input attachment opens ports and removes only its own named listeners", async () => {
	const input = inputDevice();
	const external = () => {};
	input.addEventListener("midimessage", external);
	const midi = midiHarness(input.id);
	midi.inputs = [input];

	await midi.attachInput();
	assert.equal(input.opens, 1);
	assert.equal(input.listeners.get("midimessage").size, 2);

	midi.detachInput();
	assert.deepEqual([...input.listeners.get("midimessage")], [external]);
});

test("missing selected input remains desired and reconnects by the same ID", async () => {
	const midi = midiHarness("keyboard");
	await midi.attachInput();
	assert.equal(midi.selectedInputID, "keyboard");
	assert.equal(midi.deviceState().inputConnected, false);

	const input = inputDevice();
	midi.inputs = [input];
	await midi.attachInput();
	assert.equal(midi.selectedInputID, "keyboard");
	assert.equal(midi.deviceState().inputConnected, true);
	assert.equal(input.listeners.get("midimessage").size, 1);
});

test("picker selection emits intent without changing controlled state", () => {
	const input = inputDevice();
	const midi = midiHarness();
	midi.inputs = [input];
	midi.refresh = () => {};
	let event = null;
	midi.dispatchEvent = (next) => {
		event = next;
	};

	midi.requestInput(input.id);
	assert.equal(midi.selectedInputID, "__none__");
	assert.equal(event.type, "midi-input-selected");
	assert.equal(event.detail.id, input.id);
	assert.equal(event.detail.device, input);
});

test("midi-ready waits until selected input opening settles", async () => {
	const previousNavigator = globalThis.navigator;
	let finishOpen = null;
	const input = inputDevice();
	input.open = () =>
		new Promise((resolve) => {
			finishOpen = () => {
				input.connection = "open";
				resolve();
			};
		});
	const access = {
		inputs: new Map([[input.id, input]]),
		outputs: new Map(),
		addEventListener() {},
		removeEventListener() {},
	};
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { requestMIDIAccess: async () => access },
	});
	try {
		const midi = midiHarness(input.id);
		Object.assign(midi, {
			connectVersion: 0,
			isConnected: true,
			applyVisibility() {},
			refresh() {},
		});
		const events = [];
		midi.dispatchEvent = (event) => events.push(event.type);

		const connecting = midi.connect();
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.deepEqual(events, []);
		finishOpen();
		await connecting;
		assert.deepEqual(events, ["midi-devices-changed", "midi-ready"]);
	} finally {
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: previousNavigator,
		});
	}
});
