import assert from "node:assert/strict";
import test from "node:test";
import { createParameterController } from "../src/parameter-controller.js";
import { createValueControl } from "../src/value-control.js";
import { FakeControl, FakeRoot } from "./helpers/fakes.js";

function numericControl(options = {}) {
	const eventTarget = options.eventTarget ?? new EventTarget();
	const updates = [];
	const configurations = [];
	const control = {
		parameterID: options.parameterID ?? "gain",
		parameterKind: "continuous",
		name: options.name ?? options.parameterID ?? "gain",
		min: options.min ?? 0,
		max: options.max ?? 1,
		resetValue: options.resetValue ?? options.value ?? 0,
		step: options.step ?? 0,
		unit: options.unit ?? "",
		readOnly: false,
		value: options.value ?? 0,
		eventTarget,
		configure(definition) {
			configurations.push(definition);
			this.parameterKind = definition.kind;
			this.name = definition.name;
			this.min = definition.min;
			this.max = definition.max;
			this.resetValue = definition.defaultValue;
			this.step = definition.step;
			this.unit = definition.unit;
			this.readOnly = definition.readOnly;
		},
		setValue(value, shouldEmit, source) {
			this.value = value;
			updates.push({ value, shouldEmit, source });
		},
	};
	return { control, configurations, eventTarget, updates };
}

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

test("explicit structural controls survive refresh until unregistered", () => {
	const discovered = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const root = new FakeRoot([discovered]);
	const parameters = createParameterController({ root });
	parameters.registerControl(discovered);

	root.controls = [];
	parameters.refresh();
	assert.equal(parameters.applyValue("gain", 0.8), true);
	assert.equal(discovered.value, 0.8);

	parameters.unregisterControl(discovered);
	assert.equal(parameters.applyValue("gain", 0.4), true);
	assert.equal(discovered.value, 0.8);
});

test("detached discovered controls forward cancellation until refresh pruning", () => {
	const control = new FakeControl({
		"parameter-id": "gain",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const root = new FakeRoot([control]);
	const parameters = createParameterController({ root });
	parameters.refresh();
	parameters.refresh();
	const events = [];
	for (const type of ["parameter-begin", "parameter-edit", "parameter-end"]) {
		parameters.addEventListener(type, ({ detail }) =>
			events.push([type, detail.value, detail.cancelled]),
		);
	}

	root.controls = [];
	control.dispatchEvent(
		new CustomEvent("parameter-begin", {
			detail: { parameterID: "gain", value: 0.2 },
		}),
	);
	control.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "gain", value: 0.7 },
		}),
	);
	control.dispatchEvent(
		new CustomEvent("parameter-end", {
			detail: { parameterID: "gain", value: 0.2, cancelled: true },
		}),
	);

	assert.deepEqual(events, [
		["parameter-begin", 0.2, false],
		["parameter-edit", 0.7, false],
		["parameter-end", 0.2, true],
	]);
	assert.equal(parameters.value("gain"), 0.2);

	parameters.refresh();
	control.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "gain", value: 0.8 },
		}),
	);
	assert.equal(events.length, 3);
});

test("refresh and repeated registration reconcile changed parameter identities", () => {
	const discovered = new FakeControl({
		"parameter-id": "first",
		min: 0,
		max: 1,
		value: 0.2,
	});
	const root = new FakeRoot([discovered]);
	const parameters = createParameterController({ root });
	discovered.setAttribute("parameter-id", "second");
	parameters.refresh();
	assert.equal(parameters.applyValue("first", 0.7), true);
	assert.equal(discovered.value, 0.2);
	assert.equal(parameters.applyValue("second", 0.8), true);
	assert.equal(discovered.value, 0.8);

	const explicit = numericControl({ parameterID: "third", value: 0.1 });
	parameters.registerControl(explicit.control);
	explicit.control.parameterID = "fourth";
	parameters.registerControl(explicit.control);
	assert.equal(parameters.applyValue("third", 0.6), true);
	assert.equal(explicit.control.value, 0.1);
	assert.equal(parameters.applyValue("fourth", 0.9), true);
	assert.equal(explicit.control.value, 0.9);
});

test("structural controls derive metadata and receive controller definitions", () => {
	const local = numericControl({
		parameterID: "frequency",
		min: 20,
		max: 20000,
		resetValue: 440,
		value: 880,
		unit: "Hz",
	});
	const parameters = createParameterController({ root: null });
	parameters.registerControl(local.control);

	assert.deepEqual(parameters.definition("frequency"), {
		parameterID: "frequency",
		kind: "continuous",
		name: "frequency",
		min: 20,
		max: 20000,
		defaultValue: 440,
		step: 0,
		values: null,
		unit: "Hz",
		readOnly: false,
	});

	parameters.setDefinitions([
		{
			parameterID: "frequency",
			min: 100,
			max: 1000,
			defaultValue: 220,
			step: 10,
			unit: "Hz",
		},
	]);
	assert.equal(local.configurations.at(-1).min, 100);
	assert.deepEqual(local.updates.at(-1), {
		value: 440,
		shouldEmit: false,
		source: "definitions",
	});
});

test("shared explicit event targets forward each edit once", () => {
	const canvas = new EventTarget();
	const first = createValueControl(new FakeControl(), {
		parameterID: "gain",
		value: 0.2,
		eventTarget: canvas,
		pointerTarget: null,
	});
	const second = createValueControl(new FakeControl(), {
		parameterID: "gain",
		value: 0.2,
		eventTarget: canvas,
		pointerTarget: null,
	});
	const parameters = createParameterController({ root: null });
	parameters.registerControl(first);
	parameters.registerControl(second);
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));

	first.editValue(0.7);

	assert.equal(edits, 1);
	assert.equal(parameters.value("gain"), 0.7);
	assert.equal(first.value, 0.7);
	assert.equal(second.value, 0.7);
	first.endGesture();
	first.dispose();
	second.dispose();
	parameters.unregisterControl(first);
	parameters.unregisterControl(second);
});

test("shared event targets stop routing an unregistered parameter", () => {
	const canvas = new EventTarget();
	const gain = numericControl({ parameterID: "gain", eventTarget: canvas });
	const frequency = numericControl({
		parameterID: "frequency",
		min: 20,
		max: 20000,
		value: 440,
		eventTarget: canvas,
	});
	const parameters = createParameterController({ root: null });
	parameters.registerControl(gain.control);
	parameters.registerControl(frequency.control);
	parameters.unregisterControl(gain.control);
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));

	canvas.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "gain", value: 0.8 },
		}),
	);
	canvas.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "frequency", value: 880 },
		}),
	);

	assert.equal(edits, 1);
	assert.equal(parameters.value("gain"), 0);
	assert.equal(parameters.value("frequency"), 880);
});

test("an explicit event bubbling to the root is forwarded once", () => {
	const root = new FakeRoot();
	const target = new EventTarget();
	const handle = numericControl({ eventTarget: target });
	const parameters = createParameterController({ root });
	parameters.registerControl(handle.control);
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));
	const event = new CustomEvent("parameter-edit", {
		detail: { parameterID: "gain", value: 0.6 },
	});

	target.dispatchEvent(event);
	root.dispatchEvent(event);

	assert.equal(edits, 1);
});

test("an explicit ancestor does not swallow discovered child events", () => {
	const child = new FakeControl({
		"parameter-id": "frequency",
		min: 20,
		max: 20000,
		value: 440,
	});
	const root = new FakeRoot([child]);
	const wrapper = new EventTarget();
	const handle = numericControl({ eventTarget: wrapper });
	const parameters = createParameterController({ root });
	parameters.registerControl(handle.control);
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));
	const event = {
		type: "parameter-edit",
		target: child,
		currentTarget: wrapper,
		detail: { parameterID: "frequency", value: 880 },
	};

	parameters.handleEvent(event);
	event.currentTarget = root;
	parameters.handleEvent(event);

	assert.equal(edits, 1);
	assert.equal(parameters.value("frequency"), 880);
});

test("unregister and disconnect remove explicit event routing", () => {
	const first = numericControl();
	const parameters = createParameterController({ root: null });
	parameters.registerControl(first.control);
	let edits = 0;
	parameters.addEventListener("parameter-edit", () => (edits += 1));
	parameters.unregisterControl(first.control);
	first.eventTarget.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "gain", value: 0.5 },
		}),
	);
	assert.equal(edits, 0);

	const second = numericControl();
	parameters.registerControl(second.control);
	parameters.disconnect();
	second.eventTarget.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "gain", value: 0.5 },
		}),
	);
	assert.equal(edits, 0);
	assert.equal(parameters.registerControl(first.control), first.control);
	assert.equal(parameters.applyValue("gain", 0.8), true);
	assert.equal(first.control.value, 0);
	assert.equal(second.control.value, 0);
});

test("readonly definition changes forward cancellation before reconfiguration", () => {
	const target = new EventTarget();
	const handle = numericControl({ value: 0.2, eventTarget: target });
	const baseConfigure = handle.control.configure;
	handle.control.configure = function configure(definition) {
		if (definition.readOnly && this.active) {
			this.active = false;
			this.value = this.startValue;
			target.dispatchEvent(
				new CustomEvent("parameter-end", {
					detail: {
						parameterID: this.parameterID,
						value: this.value,
						cancelled: true,
					},
				}),
			);
		}
		baseConfigure.call(this, definition);
	};
	const parameters = createParameterController({ root: null });
	parameters.registerControl(handle.control);
	handle.control.startValue = 0.2;
	handle.control.active = true;
	target.dispatchEvent(
		new CustomEvent("parameter-edit", {
			detail: { parameterID: "gain", value: 0.7 },
		}),
	);
	const ends = [];
	parameters.addEventListener("parameter-end", ({ detail }) =>
		ends.push(detail),
	);

	parameters.setDefinitions([
		{
			parameterID: "gain",
			min: 0,
			max: 1,
			defaultValue: 0,
			readOnly: true,
		},
	]);

	assert.equal(ends.length, 1);
	assert.equal(ends[0].cancelled, true);
	assert.equal(ends[0].value, 0.2);
	assert.equal(parameters.value("gain"), 0.2);
	assert.equal(parameters.definition("gain").readOnly, true);
});
