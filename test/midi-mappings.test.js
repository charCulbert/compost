import assert from "node:assert/strict";
import test from "node:test";
import { createMIDIMappings } from "../src/midi-mappings.js";
import { createParameterController } from "../src/parameter-controller.js";
import { FakeControl, FakeRoot } from "./helpers/fakes.js";

function setup(kind = "continuous") {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
		definitions: [
			{
				parameterID: "gain",
				kind,
				min: 0,
				max: 1,
				defaultValue: 0,
				step: kind === "trigger" ? 1 : 0,
			},
		],
	});
	return {
		control,
		parameters,
		mappings: createMIDIMappings({ parameterProvider: parameters }),
	};
}

test("needs only a parameter definition provider", () => {
	const parameterProvider = {
		definition(parameterID) {
			return parameterID === "gain"
				? {
						parameterID,
						name: "Gain",
						kind: "continuous",
						min: 0,
						max: 1,
						step: 0,
					}
				: null;
		},
	};
	const mappings = createMIDIMappings({ parameterProvider });

	assert.equal(mappings.applyMapping({ parameterID: "gain", cc: 7 }), true);
	assert.equal(mappings.get("gain").label, "Gain");
	assert.throws(
		() => createMIDIMappings({ parameters: parameterProvider }),
		/parameter definition provider/u,
	);
});

test("mapping request stays unconfirmed until applyMapping", () => {
	const { mappings } = setup();
	let requested = null;
	mappings.addEventListener("midi-mapping-request", (event) => {
		requested = event.detail;
	});
	assert.equal(
		mappings.requestSet({ parameterID: "gain", cc: 7, channel: 1 }),
		true,
	);
	assert.equal(mappings.get("gain"), null);
	assert.equal(requested.cc, 7);
	assert.equal(mappings.applyMapping(requested), true);
	assert.equal(mappings.get("gain").channel, 1);
});

test("learning completes with a mapping request without cancelling map mode", () => {
	const { mappings } = setup();
	const events = [];
	mappings.addEventListener("midi-learn-cancel", () => events.push("cancel"));
	mappings.addEventListener("midi-mapping-request", ({ detail }) =>
		events.push(detail.cc),
	);
	assert.equal(mappings.beginLearn("gain"), true);
	assert.equal(mappings.handleMIDIMessage([0xb2, 74, 100]), true);
	assert.deepEqual(events, [74]);
	assert.equal(mappings.isLearning(), false);
});

test("external backend mode learns and confirms mappings without local MIDI execution", () => {
	const { parameters, mappings } = setup();
	let backendLearning = null;
	mappings.addEventListener("midi-learn-begin", ({ detail }) => {
		backendLearning = detail.parameterID;
	});

	assert.equal(mappings.beginLearn("gain"), true);
	assert.equal(backendLearning, "gain");
	assert.equal(
		mappings.applyMapping({ parameterID: backendLearning, cc: 74, channel: 4 }),
		true,
	);
	assert.equal(mappings.get("gain").cc, 74);
	assert.equal(parameters.value("gain"), 0);
});

test("local MIDI emits intent without mutating ParameterController", () => {
	const { parameters, mappings } = setup();
	mappings.applyMapping({ parameterID: "gain", cc: 7, channel: null });
	let intent = null;
	mappings.addEventListener("midi-parameter", (event) => {
		intent = event.detail;
	});
	assert.equal(mappings.handleMIDIMessage([0xb0, 7, 127]), true);
	assert.equal(intent.value, 1);
	assert.equal(parameters.value("gain"), 0);
});

test("one MIDI address fans out to multiple parameter targets", () => {
	const parameters = createParameterController({
		root: new FakeRoot([
			new FakeControl({ "parameter-id": "gain", min: 0, max: 1, value: 0 }),
			new FakeControl({ "parameter-id": "tone", min: 0, max: 1, value: 0 }),
		]),
		definitions: [
			{
				parameterID: "gain",
				kind: "continuous",
				min: 0,
				max: 1,
				defaultValue: 0,
				step: 0,
			},
			{
				parameterID: "tone",
				kind: "continuous",
				min: 0,
				max: 1,
				defaultValue: 0,
				step: 0,
			},
		],
	});
	const mappings = createMIDIMappings({ parameterProvider: parameters });
	assert.equal(
		mappings.applyMapping({ parameterID: "gain", cc: 7, channel: 1 }),
		true,
	);
	assert.equal(
		mappings.applyMapping({ parameterID: "tone", cc: 7, channel: 1 }),
		true,
	);
	assert.equal(mappings.get("gain").cc, 7);
	assert.equal(mappings.get("tone").cc, 7);
	const targets = [];
	mappings.addEventListener("midi-parameter", ({ detail }) =>
		targets.push(detail.parameterID),
	);
	assert.equal(mappings.handleMIDIMessage([0xb0, 7, 127]), true);
	assert.deepEqual(targets, ["gain", "tone"]);
});

test("fixed-channel and wildcard MIDI mappings both receive matching CCs", () => {
	const parameters = createParameterController({
		root: new FakeRoot([
			new FakeControl({ "parameter-id": "gain", min: 0, max: 1, value: 0 }),
			new FakeControl({ "parameter-id": "tone", min: 0, max: 1, value: 0 }),
		]),
		definitions: [
			{
				parameterID: "gain",
				kind: "continuous",
				min: 0,
				max: 1,
				defaultValue: 0,
				step: 0,
			},
			{
				parameterID: "tone",
				kind: "continuous",
				min: 0,
				max: 1,
				defaultValue: 0,
				step: 0,
			},
		],
	});
	const mappings = createMIDIMappings({ parameterProvider: parameters });
	mappings.applyMapping({ parameterID: "gain", cc: 7, channel: null });
	mappings.applyMapping({ parameterID: "tone", cc: 7, channel: 1 });
	const targets = [];
	mappings.addEventListener("midi-parameter", ({ detail }) =>
		targets.push(detail.parameterID),
	);

	mappings.handleMIDIMessage([0xb0, 7, 127]);
	mappings.handleMIDIMessage([0xb1, 7, 127]);
	assert.deepEqual(targets, ["gain", "tone", "gain"]);
});

test("trigger mapping fires once on rising edge", () => {
	const { mappings } = setup("trigger");
	mappings.applyMapping({ parameterID: "gain", cc: 64, channel: null });
	let count = 0;
	mappings.addEventListener("midi-parameter", () => (count += 1));
	mappings.handleMIDIMessage([0xb0, 64, 127]);
	mappings.handleMIDIMessage([0xb0, 64, 127]);
	mappings.handleMIDIMessage([0xb0, 64, 0]);
	mappings.handleMIDIMessage([0xb0, 64, 127]);
	assert.equal(count, 2);
});

test("mapping snapshots expose ranges and cannot mutate controller state", () => {
	const control = new FakeControl({
		"parameter-id": "mode",
		min: 0,
		max: 3,
		value: 0,
	});
	const parameters = createParameterController({
		root: new FakeRoot([control]),
		definitions: [
			{
				parameterID: "mode",
				kind: "discrete",
				min: 0,
				max: 3,
				defaultValue: 0,
				step: 1,
				values: [0, 1, 2, 3],
			},
		],
	});
	const mappings = createMIDIMappings({ parameterProvider: parameters });

	assert.equal(
		mappings.applyMapping({ parameterID: "mode", cc: 9, min: 1, max: 2 }),
		true,
	);
	const snapshot = mappings.get("mode");
	assert.equal(snapshot.min, 1);
	assert.equal(snapshot.max, 2);
	snapshot.values.push(999);
	snapshot.min = -100;
	assert.deepEqual(mappings.get("mode").values, [0, 1, 2, 3]);
	assert.equal(mappings.get("mode").min, 1);
});

test("mapping ranges and curve metadata stay inside parameter legality", () => {
	const { mappings } = setup();
	assert.equal(
		mappings.requestSet({ parameterID: "gain", cc: 3, min: -0.1, max: 1 }),
		false,
	);
	assert.equal(
		mappings.requestSet({ parameterID: "gain", cc: 3, min: 0, max: 1.1 }),
		false,
	);
	assert.equal(
		mappings.requestSet({ parameterID: "gain", cc: 3, min: 0.8, max: 0.2 }),
		false,
	);
	assert.equal(
		mappings.requestSet({ parameterID: "gain", cc: 3, min: 0, max: 1, mid: 2 }),
		false,
	);
	assert.equal(
		mappings.requestSet({
			parameterID: "gain",
			cc: 3,
			min: 0,
			max: 1,
			shape: 0,
		}),
		false,
	);
	assert.equal(
		mappings.requestSet({
			parameterID: "gain",
			cc: 3,
			min: 0,
			max: 1,
			shape: "bad",
		}),
		false,
	);
});

test("accepted mappings snapshot the parameter definition scale", () => {
	const parameters = createParameterController({
		root: new FakeRoot(),
		definitions: [
			{
				parameterID: "gain",
				name: "Gain",
				min: -90,
				max: 12,
				defaultValue: 0,
				curve: "gain",
			},
		],
	});
	const mappings = createMIDIMappings({ parameterProvider: parameters });
	const values = [];
	mappings.addEventListener("midi-parameter", ({ detail }) =>
		values.push(detail.value),
	);

	assert.equal(mappings.applyMapping({ parameterID: "gain", cc: 7 }), true);
	assert.equal(mappings.get("gain").curve, "gain");
	mappings.handleMIDIMessage([0xb0, 7, 0]);
	mappings.handleMIDIMessage([0xb0, 7, 127]);
	assert.deepEqual(values, [-90, 12]);
});

test("discrete and stepped mappings use stable MIDI buckets", () => {
	const { mappings } = setup();
	const discrete = createParameterController({
		root: new FakeRoot([new FakeControl({ "parameter-id": "mode", value: 0 })]),
		definitions: [
			{
				parameterID: "mode",
				kind: "discrete",
				min: 0,
				max: 3,
				defaultValue: 0,
				step: 1,
				values: [0, 1, 2, 3],
			},
		],
	});
	const discreteMappings = createMIDIMappings({ parameterProvider: discrete });
	discreteMappings.applyMapping({ parameterID: "mode", cc: 1 });
	const values = [];
	discreteMappings.addEventListener("midi-parameter", ({ detail }) =>
		values.push(detail.value),
	);
	discreteMappings.handleMIDIMessage([0xb0, 1, 0]);
	discreteMappings.handleMIDIMessage([0xb0, 1, 127]);
	assert.deepEqual(values, [0, 3]);

	mappings.applyMapping({ parameterID: "gain", cc: 2 });
	const steppedValues = [];
	mappings.addEventListener("midi-parameter", ({ detail }) =>
		steppedValues.push(detail.value),
	);
	mappings.handleMIDIMessage([0xb0, 2, 0]);
	mappings.handleMIDIMessage([0xb0, 2, 127]);
	assert.deepEqual(steppedValues, [0, 1]);
});

test("applyMappings validates the full snapshot before replacing mappings", () => {
	const { mappings } = setup();
	mappings.applyMapping({ parameterID: "gain", cc: 7 });

	assert.equal(
		mappings.applyMappings([
			{ parameterID: "gain", cc: 8 },
			{ parameterID: "gain", cc: 9 },
		]),
		false,
	);
	assert.equal(mappings.get("gain").cc, 7);
	assert.equal(
		mappings.applyMappings([{ parameterID: "missing", cc: 10 }]),
		false,
	);
	assert.equal(mappings.get("gain").cc, 7);

	const multiParameters = createParameterController({
		root: new FakeRoot([
			new FakeControl({ "parameter-id": "gain", min: 0, max: 1, value: 0 }),
			new FakeControl({ "parameter-id": "tone", min: 0, max: 1, value: 0 }),
		]),
		definitions: [
			{
				parameterID: "gain",
				kind: "continuous",
				min: 0,
				max: 1,
				defaultValue: 0,
				step: 0,
			},
			{
				parameterID: "tone",
				kind: "continuous",
				min: 0,
				max: 1,
				defaultValue: 0,
				step: 0,
			},
		],
	});
	const multiMappings = createMIDIMappings({
		parameterProvider: multiParameters,
	});
	assert.equal(
		multiMappings.applyMappings([
			{ parameterID: "gain", cc: 7, channel: 1 },
			{ parameterID: "tone", cc: 7, channel: 1 },
		]),
		true,
	);
	assert.equal(
		multiMappings.applyMappings([
			{ parameterID: "gain", cc: 7, channel: 1 },
			{ parameterID: "gain", cc: 9, channel: 1 },
		]),
		false,
	);
});
