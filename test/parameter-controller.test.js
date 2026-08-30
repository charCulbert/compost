import assert from "node:assert/strict";
import test from "node:test";
import { createParameterController } from "../src/parameter-controller.js";
import { FakeControl, FakeRoot } from "./helpers/fakes.js";

test("external definitions override control semantics but preserve presentation", () => {
	const control = new FakeControl({
		"parameter-id": "frequency",
		min: 1,
		max: 2,
		curve: "log",
		mid: 1000,
		value: 440,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
		definitions: [
			{
				parameterID: "frequency",
				kind: "continuous",
				min: 20,
				max: 20000,
				defaultValue: 440,
				step: 0,
				unit: "Hz",
			},
		],
	});
	assert.equal(parameters.definition("frequency").min, 20);
	assert.equal(control.getAttribute("min"), "20");
	assert.equal(control.getAttribute("curve"), "log");
});

test("parameter definitions can supply the shared response scale", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: -90,
		max: 12,
		value: 0,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
		definitions: [
			{
				parameterID: "gain",
				min: -90,
				max: 12,
				defaultValue: 0,
				curve: "gain",
			},
		],
	});

	assert.equal(parameters.definition("gain").curve, "gain");
	assert.equal(control.getAttribute("curve"), "gain");
});

test("applyValue synchronizes controls silently and rejects invalid backend values", () => {
	const first = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const second = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const parameters = createParameterController({
		root: new FakeRoot([first, second]),
	});
	let changes = 0;
	parameters.addEventListener("parameter-value", () => (changes += 1));
	assert.equal(parameters.applyValue("gain", 0.8), true);
	assert.equal(first.value, 0.8);
	assert.equal(second.value, 0.8);
	assert.equal(changes, 1);
	assert.equal(parameters.applyValue("gain", 2), false);
	assert.equal(changes, 1);
});

test("controller updates generic parameter-id elements without setValue", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	control.setValue = undefined;
	const parameters = createParameterController({
		root: new FakeRoot([control]),
	});
	assert.equal(parameters.applyValue("gain", 0.8), true);
	assert.equal(control.value, 0.8);
});

test("controller re-emits lifecycle and synchronizes sibling user edits", () => {
	const first = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const second = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const parameters = createParameterController({
		root: new FakeRoot([first, second]),
	});
	const events = [];
	for (const type of ["parameter-begin", "parameter-edit", "parameter-end"]) {
		parameters.addEventListener(type, ({ detail }) =>
			events.push([type, detail.cancelled]),
		);
	}
	parameters.handleEvent({
		type: "parameter-begin",
		detail: { parameterID: "gain", value: 0.2 },
	});
	parameters.handleEvent({
		type: "parameter-edit",
		target: first,
		detail: { parameterID: "gain", value: 0.7 },
	});
	parameters.handleEvent({
		type: "parameter-end",
		detail: { parameterID: "gain", value: 0.7 },
	});
	assert.deepEqual(events, [
		["parameter-begin", false],
		["parameter-edit", false],
		["parameter-end", false],
	]);
	assert.equal(second.value, 0.7);
});

test("controller restores accepted state when a gesture is cancelled", () => {
	const first = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const second = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const parameters = createParameterController({
		root: new FakeRoot([first, second]),
	});

	parameters.handleEvent({
		type: "parameter-begin",
		target: first,
		detail: { parameterID: "gain", value: 0.2 },
	});
	parameters.handleEvent({
		type: "parameter-edit",
		target: first,
		detail: { parameterID: "gain", value: 0.7 },
	});
	parameters.handleEvent({
		type: "parameter-end",
		target: first,
		detail: { parameterID: "gain", value: 0.2, cancelled: true },
	});

	assert.equal(parameters.value("gain"), 0.2);
	assert.equal(second.value, 0.2);
});

test("local DOM mode derives a definition from the first control", () => {
	const control = new FakeControl({
		"parameter-id": "mode",
		"parameter-kind": "discrete",
		min: 0,
		max: 2,
		step: 1,
		"reset-value": 1,
		value: 0,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
	});
	assert.deepEqual(parameters.definition("mode"), {
		parameterID: "mode",
		kind: "discrete",
		name: "mode",
		min: 0,
		max: 2,
		defaultValue: 1,
		step: 1,
		values: null,
		unit: "",
		readOnly: false,
	});
	assert.equal(parameters.value("mode"), 1);
});

test("local definitions retain explicitly rendered scale metadata", () => {
	const control = new FakeControl({
		"parameter-id": "frequency",
		min: 20,
		max: 20000,
		mid: 1000,
		curve: "log",
		shape: 1.2,
		value: 440,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
	});

	assert.equal(parameters.definition("frequency").mid, 1000);
	assert.equal(parameters.definition("frequency").curve, "log");
	assert.equal(parameters.definition("frequency").shape, 1.2);
});

test("local definitions use the current value when no reset is declared", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.25,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
	});
	assert.equal(parameters.definition("gain").defaultValue, 0.25);
	assert.equal(parameters.value("gain"), 0.25);
});

test("local trigger definitions default to a legal binary step", () => {
	const control = new FakeControl({
		"parameter-id": "panic",
		"parameter-kind": "trigger",
		min: 0,
		max: 1,
		value: 0,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
	});
	assert.equal(parameters.definition("panic").step, 1);
	assert.equal(parameters.applyValue("panic", 0.5), false);
});

test("only explicit non-empty parameter IDs register", () => {
	const named = new FakeControl({
		name: "frequency",
		min: 20,
		max: 20000,
		value: 440,
	});
	const empty = new FakeControl({
		"parameter-id": "",
		min: 0,
		max: 1,
		value: 0,
	});
	const parameters = createParameterController({
		root: new FakeRoot([named, empty]),
	});

	assert.equal(parameters.definition("frequency"), null);
	assert.equal(parameters.definition(""), null);
});

test("local controls with conflicting semantics fail clearly", () => {
	const first = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0,
	});
	const second = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 2,
		value: 0,
	});
	assert.throws(
		() => createParameterController({ root: new FakeRoot([first, second]) }),
		/Conflicting parameter definition/u,
	);
});

test("definitions reject defaults outside their legal contract", () => {
	assert.throws(
		() =>
			createParameterController({
				root: new FakeRoot(),
				definitions: [{ parameterID: "gain", min: 0, max: 1, defaultValue: 2 }],
			}),
		/Invalid default value/u,
	);
});

test("external definitions mirror defaults without rendered controls", () => {
	const parameters = createParameterController({
		root: new FakeRoot(),
		definitions: [{ parameterID: "gain", min: 0, max: 1, defaultValue: 0.25 }],
	});
	assert.equal(parameters.value("gain"), 0.25);
	assert.equal(parameters.applyValue("gain", 0.9), true);
	parameters.setDefinitions([
		{ parameterID: "gain", min: 0, max: 0.5, defaultValue: 0.1 },
	]);
	assert.equal(parameters.value("gain"), 0.1);
});

test("definition rescans update semantics without changing presentation", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		curve: "log",
		value: 0.5,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
		definitions: [{ parameterID: "gain", min: 0, max: 1, defaultValue: 0.5 }],
	});
	parameters.setDefinitions([
		{ parameterID: "gain", min: -1, max: 1, defaultValue: 0 },
	]);
	assert.equal(control.getAttribute("min"), "-1");
	assert.equal(control.getAttribute("curve"), "log");
	assert.equal(parameters.value("gain"), 0.5);
});

test("backend updates apply immediately during an active interaction and stay silent", () => {
	const first = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const second = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const parameters = createParameterController({
		root: new FakeRoot([first, second]),
	});
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));
	first._parameterGestureActive = true;
	assert.equal(parameters.applyValue("gain", 0.9), true);
	assert.equal(first.value, 0.9);
	assert.equal(second.value, 0.9);
	assert.equal(edits, 0);
});

test("applyValues rejects an invalid batch without partial updates", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
	});
	assert.equal(
		parameters.applyValues([
			{ parameterID: "gain", value: 0.8 },
			{ parameterID: "missing", value: 1 },
		]),
		false,
	);
	assert.equal(parameters.value("gain"), 0.2);
});

test("disconnect removes root listeners cleanly", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0,
	});
	const root = new FakeRoot([control]);
	const parameters = createParameterController({ root });
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));
	root.dispatchEvent(
		new CustomEvent("parameter-edit", {
			bubbles: true,
			detail: { parameterID: "gain", value: 0.4 },
		}),
	);
	assert.equal(edits, 1);
	parameters.disconnect();
	root.dispatchEvent(
		new CustomEvent("parameter-edit", {
			bubbles: true,
			detail: { parameterID: "gain", value: 0.8 },
		}),
	);
	assert.equal(edits, 1);
});
