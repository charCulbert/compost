import assert from "node:assert/strict";
import test from "node:test";
import { createValueControl } from "../src/value-control.js";
import { FakeControl } from "./helpers/fakes.js";

class FakeDocument extends EventTarget {
	constructor() {
		super();
		this.defaultView = new EventTarget();
		this.pointerLockElement = null;
		this.exitCount = 0;
	}

	exitPointerLock() {
		this.pointerLockElement = null;
		this.exitCount += 1;
	}
}

class FakeElement extends FakeControl {
	constructor(attrs = {}) {
		super(attrs, "div");
		this.ownerDocument = new FakeDocument();
		this.tabIndex = -1;
		this.captured = new Set();
		this.bounds = {
			left: 0,
			top: 0,
			right: 100,
			bottom: 100,
			width: 100,
			height: 100,
		};
	}

	focus() {
		this.dispatchEvent(new Event("focus"));
	}

	setPointerCapture(pointerID) {
		this.captured.add(pointerID);
	}

	hasPointerCapture(pointerID) {
		return this.captured.has(pointerID);
	}

	releasePointerCapture(pointerID) {
		this.captured.delete(pointerID);
	}

	getBoundingClientRect() {
		return this.bounds;
	}
}

function dispatch(target, type, fields = {}) {
	const event = new Event(type, { cancelable: true });
	for (const [name, value] of Object.entries(fields)) {
		Object.defineProperty(event, name, { configurable: true, value });
	}
	target.dispatchEvent(event);
	return event;
}

function pointerEvent(pointerId, x, y, fields = {}) {
	return {
		button: 0,
		pointerId,
		clientX: x,
		clientY: y,
		preventDefault() {},
		...fields,
	};
}

function recordParameterEvents(target) {
	const events = [];
	for (const type of ["parameter-begin", "parameter-edit", "parameter-end"]) {
		target.addEventListener(type, ({ detail }) => events.push([type, detail]));
	}
	return events;
}

test("configures slider semantics, draws state, and applies host values silently", () => {
	const element = new FakeElement({ role: "button", tabindex: "3" });
	element.ownerDocument.activeElement = element;
	const draws = [];
	const events = recordParameterEvents(element);
	const control = createValueControl(element, {
		parameterID: "gain",
		label: "Gain",
		min: -60,
		max: 6,
		value: -12,
		resetValue: 0,
		step: 1,
		unit: "dB",
		orientation: "horizontal",
		draw: (state) => draws.push(state),
	});

	assert.equal(element.getAttribute("role"), "slider");
	assert.equal(element.getAttribute("aria-label"), "Gain");
	assert.equal(element.getAttribute("aria-valuemin"), "-60");
	assert.equal(element.getAttribute("aria-valuemax"), "6");
	assert.equal(element.getAttribute("aria-valuenow"), "-12");
	assert.equal(element.getAttribute("aria-valuetext"), "-12 dB");
	assert.equal(element.getAttribute("aria-orientation"), "horizontal");
	assert.equal(draws.at(-1).value, -12);
	assert.equal(draws.at(-1).disabled, false);
	assert.equal(draws.at(-1).focused, true);
	dispatch(element, "blur");
	assert.equal(draws.at(-1).focused, false);

	control.setValue(-6, false, "backend");
	assert.equal(control.value, -6);
	assert.equal(events.length, 0);

	control.dispose();
	assert.equal(element.getAttribute("role"), "button");
	assert.equal(element.getAttribute("tabindex"), "3");
});

test("shared event target keeps manually hit-tested controls independent", () => {
	const canvas = new EventTarget();
	const first = createValueControl(new FakeElement(), {
		parameterID: "first",
		eventTarget: canvas,
		pointerTarget: null,
		value: 0.2,
		drag: { axis: "x", mode: "relative", distance: 100 },
	});
	const second = createValueControl(new FakeElement(), {
		parameterID: "second",
		eventTarget: canvas,
		pointerTarget: null,
		value: 0.8,
	});
	const events = recordParameterEvents(canvas);
	const hitTarget = new FakeElement();

	first.startPointerDrag(
		pointerEvent(4, 0, 0, { currentTarget: hitTarget, target: hitTarget }),
	);
	dispatch(first.element.ownerDocument.defaultView, "pointermove", {
		pointerId: 4,
		clientX: 20,
		clientY: 0,
	});
	dispatch(first.element.ownerDocument.defaultView, "pointerup", {
		pointerId: 4,
		clientX: 20,
		clientY: 0,
	});

	assert.equal(first.value, 0.4);
	assert.equal(second.value, 0.8);
	assert.deepEqual(
		events.map(([type, detail]) => [type, detail.parameterID]),
		[
			["parameter-begin", "first"],
			["parameter-edit", "first"],
			["parameter-end", "first"],
		],
	);
});

test("relative drag accumulates sub-step motion and rebases on host values", () => {
	const element = new FakeElement();
	const control = createValueControl(element, {
		parameterID: "stepped",
		min: 0,
		max: 10,
		value: 2,
		step: 1,
		drag: { axis: "x", mode: "relative", distance: 100, fineScale: 0.1 },
	});

	control.startPointerDrag(pointerEvent(1, 0, 0));
	dispatch(element, "keydown", {
		key: "End",
		composedPath: () => [element],
	});
	assert.equal(control.value, 2);
	for (let x = 1; x <= 6; x += 1) {
		dispatch(element.ownerDocument.defaultView, "pointermove", {
			pointerId: 1,
			clientX: x,
			clientY: 0,
		});
	}
	assert.equal(control.value, 3);

	control.setValue(7, false, "backend");
	dispatch(element.ownerDocument.defaultView, "pointermove", {
		pointerId: 1,
		clientX: 16,
		clientY: 0,
		shiftKey: true,
	});
	assert.equal(control.value, 7);
	dispatch(element.ownerDocument.defaultView, "pointermove", {
		pointerId: 1,
		clientX: 26,
		clientY: 0,
	});
	assert.equal(control.value, 8);
});

test("step quantization stays within the last legal value", () => {
	const control = createValueControl(new FakeElement(), {
		min: 0,
		max: 1,
		step: 0.3,
		value: 2,
		resetValue: 0.5,
		pointerTarget: null,
	});

	assert.equal(control.value, 0.8999999999999999);
	assert.equal(control.resetValue, 0.6);
	control.reset();
	assert.equal(control.value, 0.6);
	control.configure({ min: 0, max: 4.1, step: 0.1 });
	control.setValue(4.1);
	assert.equal(control.value, 4.1);
});

test("emitted edits begin before mutation so cancellation restores the old value", () => {
	const element = new FakeElement();
	const control = createValueControl(element, {
		parameterID: "mix",
		value: 0.2,
	});
	const events = recordParameterEvents(element);

	control.editValue(0.8);
	control.endGesture(true);

	assert.equal(control.value, 0.2);
	assert.deepEqual(
		events.map(([type, detail]) => [type, detail.value, detail.cancelled]),
		[
			["parameter-begin", 0.2, false],
			["parameter-edit", 0.8, false],
			["parameter-end", 0.2, true],
		],
	);
});

test("synchronous host reflection rebases the next relative delta", () => {
	const element = new FakeElement();
	const control = createValueControl(element, {
		parameterID: "mix",
		value: 0.2,
		drag: { axis: "x", distance: 100 },
	});
	element.addEventListener(
		"parameter-edit",
		() => control.setValue(0.7, false, "host"),
		{ once: true },
	);

	control.startPointerDrag(pointerEvent(1, 0, 0));
	dispatch(element.ownerDocument.defaultView, "pointermove", {
		pointerId: 1,
		clientX: 10,
		clientY: 0,
	});
	assert.equal(control.value, 0.7);
	dispatch(element.ownerDocument.defaultView, "pointermove", {
		pointerId: 1,
		clientX: 20,
		clientY: 0,
	});
	assert.equal(control.value, 0.7999999999999999);
});

test("keyboard edits real values and ignores events from an inline editor", () => {
	const element = new FakeElement();
	const control = createValueControl(element, {
		parameterID: "frequency",
		min: 20,
		max: 20000,
		value: 200,
		curve: "log",
	});
	const events = recordParameterEvents(element);

	dispatch(element, "keydown", {
		key: "ArrowUp",
		composedPath: () => [element],
	});
	assert.ok(control.value > 200);
	assert.equal(events.at(-1)[0], "parameter-end");

	const before = control.value;
	const editor = { closest: () => true };
	dispatch(element, "keydown", {
		key: "End",
		composedPath: () => [editor, element],
	});
	assert.equal(control.value, before);
});

test("capture loss, configuration, disabled edits, and disposal settle gestures once", () => {
	const element = new FakeElement({ role: "group" });
	const events = recordParameterEvents(element);
	const control = createValueControl(element, {
		parameterID: "old",
		value: 0.2,
		drag: { axis: "x", mode: "relative" },
	});

	control.startPointerDrag(pointerEvent(7, 0, 0));
	dispatch(element, "lostpointercapture", { pointerId: 7 });
	assert.equal(control.value, 0.2);
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 1);
	assert.equal(events.at(-1)[1].cancelled, true);

	control.startPointerDrag(pointerEvent(8, 0, 0));
	control.configure({ parameterID: "new", min: -1, max: 1, value: 0.5 });
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 2);
	assert.equal(events.at(-1)[1].parameterID, "old");
	assert.equal(control.parameterID, "new");

	control.configure({ disabled: true });
	const count = events.length;
	control.setValue(0.8, true);
	assert.equal(events.length, count);
	control.setValue(0.8, false, "backend");
	assert.equal(control.value, 0.8);

	control.configure({ disabled: false });
	control.startPointerDrag(pointerEvent(9, 0, 0));
	control.dispose();
	control.dispose();
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 3);
	assert.equal(element.getAttribute("role"), "group");
	assert.equal(control.startPointerDrag(pointerEvent(10, 0, 0)), false);
});

test("pointer double-tap resets once and suppresses the following dblclick", () => {
	const element = new FakeElement();
	const control = createValueControl(element, {
		parameterID: "gain",
		value: 0.8,
		resetValue: 0.5,
	});
	const events = recordParameterEvents(element);

	control.startPointerDrag(pointerEvent(1, 10, 10));
	dispatch(element.ownerDocument.defaultView, "pointerup", {
		pointerId: 1,
		clientX: 10,
		clientY: 10,
	});
	control.startPointerDrag(pointerEvent(2, 10, 10));
	dispatch(element.ownerDocument.defaultView, "pointerup", {
		pointerId: 2,
		clientX: 10,
		clientY: 10,
	});
	dispatch(element, "dblclick");

	assert.equal(control.value, 0.5);
	assert.equal(events.filter(([type]) => type === "parameter-begin").length, 2);
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 2);
});

test("pointer-lock loss cancels and late lock completion exits cleanly", async () => {
	const element = new FakeElement();
	const document = element.ownerDocument;
	const events = recordParameterEvents(element);
	let completeLock;
	element.requestPointerLock = () =>
		new Promise((resolve) => {
			completeLock = () => {
				document.pointerLockElement = element;
				resolve();
			};
		});
	const control = createValueControl(element, {
		parameterID: "locked",
		value: 0.4,
		drag: { pointerLock: true },
	});

	control.startPointerDrag(pointerEvent(1, 0, 0));
	dispatch(document.defaultView, "pointercancel", { pointerId: 1 });
	completeLock();
	await Promise.resolve();
	assert.equal(document.pointerLockElement, null);
	assert.equal(document.exitCount, 1);
	assert.equal(events.at(-1)[1].cancelled, true);

	element.requestPointerLock = () => {
		document.pointerLockElement = element;
		return Promise.resolve();
	};
	control.startPointerDrag(pointerEvent(2, 0, 0));
	dispatch(document, "pointerlockchange");
	document.pointerLockElement = null;
	dispatch(document, "pointerlockchange");
	assert.equal(events.at(-1)[1].cancelled, true);
	assert.equal(events.filter(([type]) => type === "parameter-begin").length, 2);
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 2);

	document.pointerLockElement = null;
	control.startPointerDrag(pointerEvent(3, 0, 0));
	dispatch(document, "pointerlockchange");
	await new Promise((resolve) => setTimeout(resolve, 370));
	assert.equal(document.pointerLockElement, null);
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 2);
	dispatch(document.defaultView, "pointerup", {
		pointerId: 3,
		clientX: 0,
		clientY: 0,
	});
	assert.equal(events.filter(([type]) => type === "parameter-end").length, 3);
});

test("event reentrancy settles without stale edits or replacement gestures", () => {
	const disposeElement = new FakeElement();
	const disposeControl = createValueControl(disposeElement, {
		parameterID: "dispose",
		value: 0.2,
		drag: { axis: "x" },
	});
	const disposeEvents = recordParameterEvents(disposeElement);
	disposeElement.addEventListener(
		"parameter-edit",
		() => disposeControl.dispose(),
		{ once: true },
	);
	disposeControl.startPointerDrag(pointerEvent(1, 0, 0));
	assert.doesNotThrow(() =>
		dispatch(disposeElement.ownerDocument.defaultView, "pointermove", {
			pointerId: 1,
			clientX: 20,
			clientY: 0,
		}),
	);
	assert.equal(
		disposeEvents.filter(([type]) => type === "parameter-end").length,
		1,
	);
	assert.equal(disposeEvents.at(-1)[1].cancelled, true);

	const configureElement = new FakeElement();
	const configureControl = createValueControl(configureElement, {
		parameterID: "old",
		value: 0.2,
	});
	const configureEvents = recordParameterEvents(configureElement);
	configureElement.addEventListener(
		"parameter-begin",
		() => configureControl.configure({ parameterID: "new", min: -1 }),
		{ once: true },
	);
	assert.equal(configureControl.startPointerDrag(pointerEvent(2, 0, 0)), false);
	assert.equal(configureControl.parameterID, "new");
	assert.equal(
		configureEvents.filter(([type]) => type === "parameter-edit").length,
		0,
	);
	assert.deepEqual(
		configureEvents.map(([type, detail]) => [type, detail.parameterID]),
		[
			["parameter-begin", "old"],
			["parameter-end", "old"],
		],
	);

	let restarted = null;
	configureElement.addEventListener(
		"parameter-end",
		() => {
			restarted = configureControl.startPointerDrag(pointerEvent(3, 0, 0));
		},
		{ once: true },
	);
	configureControl.beginGesture();
	configureControl.dispose();
	assert.equal(restarted, false);
});
