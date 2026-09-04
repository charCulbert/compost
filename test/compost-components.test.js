import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

globalThis.HTMLElement = class HTMLElement {
	constructor() {
		this.attributes = new Set();
	}

	hasAttribute(name) {
		return this.attributes.has(name);
	}
};

globalThis.customElements = {
	elements: new Map(),
	get(name) {
		return this.elements.get(name);
	},
	define(name, constructor) {
		this.elements.set(name, constructor);
	},
};

const { CompostAudio } = await import("../src/components/compost-audio.js");
const { CompostKnob } = await import("../src/components/compost-knob.js");
const { CompostNumberBox } = await import(
	"../src/components/compost-number-box.js"
);
const { CompostScope } = await import("../src/components/compost-scope.js");
const { CompostSelect } = await import("../src/components/compost-select.js");
const { CompostEnvelopeEditor } = await import(
	"../src/components/compost-envelope-editor.js"
);
const { CompostNoteEditor } = await import(
	"../src/components/compost-note-editor.js"
);
const { CompostAudioClipEditor } = await import(
	"../src/components/compost-audio-clip-editor.js"
);
const { CompostPiano } = await import("../src/components/compost-piano.js");
const { CompostSlider } = await import("../src/components/compost-slider.js");
const { CompostDrawer } = await import("../src/components/compost-drawer.js");
const { CompostButton } = await import("../src/components/compost-button.js");
const { CompostMIDIMappings } = await import(
	"../src/components/compost-midi-mappings.js"
);
const { envelopeValueAtTime } = await import("../src/envelope-model.js");
const { beginParameterGesture, editParameterGesture, endParameterGesture } =
	await import("../src/utils.js");

test("a suspended audio context is resumable rather than treated as running", async () => {
	const audio = Object.create(CompostAudio.prototype);
	audio.context = { state: "suspended" };
	let starts = 0;
	let stops = 0;
	audio.start = async () => {
		starts += 1;
	};
	audio.stop = async () => {
		stops += 1;
	};

	assert.equal(audio.isRunning, false);
	await audio.toggle();
	assert.equal(starts, 1);
	assert.equal(stops, 0);
});

test("audio can separate an icon label from its accessible name", () => {
	assert.ok(CompostAudio.observedAttributes.includes("start-aria-label"));
	assert.ok(CompostAudio.observedAttributes.includes("stop-aria-label"));

	const audio = Object.create(CompostAudio.prototype);
	audio.getAttribute = (name) =>
		({
			"start-label": "⏻",
			"stop-label": "⏻",
			"start-aria-label": "Start audio",
			"stop-aria-label": "Suspend audio",
		})[name] ?? null;

	assert.equal(audio.startLabel, "⏻");
	assert.equal(audio.stopLabel, "⏻");
	assert.equal(audio.startAriaLabel, "Start audio");
	assert.equal(audio.stopAriaLabel, "Suspend audio");
});

test("styled select exposes native-like value and disabled attributes", () => {
	assert.ok(CompostSelect.observedAttributes.includes("value"));
	assert.ok(CompostSelect.observedAttributes.includes("disabled"));
	assert.ok(CompostSelect.observedAttributes.includes("aria-label"));
	assert.ok(CompostSelect.observedAttributes.includes("aria-labelledby"));
	assert.ok(CompostSelect.observedAttributes.includes("aria-description"));
	assert.ok(CompostSelect.observedAttributes.includes("aria-describedby"));
});

test("select exposes numeric enum metadata and accepts silent host updates", () => {
	const { control, events } = lifecycleHarness(CompostSelect, {
		"parameter-id": "waveform",
		value: "0",
	});
	const options = [
		{ value: "0", disabled: false },
		{ value: "2", disabled: false },
		{ value: "7", disabled: false },
	];
	Object.assign(control, {
		parameterID: "waveform",
		optionElements: () => options,
	});

	assert.equal(control.parameterKind, "discrete");
	assert.deepEqual(control.parameterValues, [0, 2, 7]);
	assert.equal(control.min, 0);
	assert.equal(control.max, 7);
	assert.equal(control.setValue(2, false, "backend"), true);
	assert.equal(control.value, "2");
	assert.deepEqual(events, []);
});

test("select user choices emit one complete discrete parameter gesture", () => {
	const { control, events } = lifecycleHarness(CompostSelect, {
		"parameter-id": "waveform",
		value: "0",
	});
	Object.assign(control, {
		parameterID: "waveform",
		select: { value: "2" },
		optionElements: () => [
			{ value: "0", disabled: false },
			{ value: "2", disabled: false },
		],
	});

	control.handleChange({ stopPropagation() {} });

	assert.equal(control.value, "2");
	assert.deepEqual(lifecycleTypes(events), [
		"parameter-begin",
		"parameter-edit",
		"parameter-end",
	]);
	assert.deepEqual(
		events.slice(0, 3).map((event) => event.detail.value),
		[0, 2, 2],
	);
});

test("stopping suspends the context and keeps the audio graph alive", async () => {
	const audio = Object.create(CompostAudio.prototype);
	const events = [];
	const context = {
		state: "running",
		async suspend() {
			this.state = "suspended";
		},
	};
	Object.assign(audio, {
		context,
		setStatus() {},
		dispatchAudioEvent(type) {
			events.push(type);
		},
		refresh() {},
		focusPowerButton() {},
	});

	await audio.stop();

	assert.equal(audio.context, context);
	assert.equal(context.state, "suspended");
	assert.deepEqual(events, ["audio-suspended"]);
});

test("force-stopping reflects a closed context before close resolves", async () => {
	const audio = Object.create(CompostAudio.prototype);
	const events = [];
	let resolveClose;
	const context = {
		state: "running",
		close() {
			return new Promise((resolve) => {
				resolveClose = resolve;
			});
		},
	};
	let refreshes = 0;
	Object.assign(audio, {
		context,
		setStatus() {},
		dispatchAudioEvent(type) {
			events.push(type);
		},
		refresh() {
			refreshes += 1;
		},
		focusPowerButton() {},
	});

	const closing = audio.stop(true);
	await Promise.resolve();
	assert.equal(audio.context, null);
	assert.equal(refreshes, 1);

	resolveClose();
	await closing;
	assert.deepEqual(events, ["audio-stopped"]);
	assert.equal(refreshes, 2);
});

test("resuming emits audio-resumed instead of rebuilding the graph", async () => {
	const previousWindow = globalThis.window;
	globalThis.window = { AudioContext: class AudioContext {} };
	const audio = Object.create(CompostAudio.prototype);
	const events = [];
	const context = {
		state: "suspended",
		async resume() {
			this.state = "running";
		},
	};
	Object.assign(audio, {
		context,
		dispatchAudioEvent(type) {
			events.push(type);
		},
		handleStateChange() {},
	});

	try {
		await audio.start();
	} finally {
		globalThis.window = previousWindow;
	}

	assert.equal(audio.context, context);
	assert.deepEqual(events, ["audio-resumed"]);
});

test("an interrupted audio context resumes from the next user start gesture", async () => {
	const previousWindow = globalThis.window;
	globalThis.window = { AudioContext: class AudioContext {} };
	const audio = Object.create(CompostAudio.prototype);
	const events = [];
	let resumes = 0;
	const context = {
		state: "interrupted",
		async resume() {
			resumes += 1;
			this.state = "running";
		},
	};
	Object.assign(audio, {
		context,
		dispatchAudioEvent(type) {
			events.push(type);
		},
		handleStateChange() {},
		setStatus() {},
	});

	try {
		await audio.start();
	} finally {
		globalThis.window = previousWindow;
	}

	assert.equal(resumes, 1);
	assert.equal(audio.context, context);
	assert.deepEqual(events, ["audio-resumed"]);
	assert.equal(events.includes("audio-started"), false);

	const stillInterrupted = {
		state: "interrupted",
		async resume() {
			resumes += 1;
		},
	};
	audio.context = stillInterrupted;
	events.length = 0;
	globalThis.window = { AudioContext: class AudioContext {} };
	try {
		await audio.start();
	} finally {
		globalThis.window = previousWindow;
	}
	assert.equal(resumes, 2);
	assert.deepEqual(events, []);
});

test("piano touch drag transfers the active note between keys", () => {
	const piano = Object.create(CompostPiano.prototype);
	const events = [];
	Object.assign(piano, {
		touchNotes: new Map([[1, 60]]),
		root: { elementFromPoint: (x) => ({ note: x < 20 ? 60 : 62 }) },
		getNoteFromElement: (element) => element.note,
		isPlayableNote: (note) => note >= 0,
		addKeyboardNote: (note) => events.push(["down", note]),
		removeKeyboardNote: (note) => events.push(["up", note]),
	});
	const event = {
		cancelable: true,
		changedTouches: [{ identifier: 1, clientX: 25, clientY: 10 }],
		preventDefault() {
			this.defaultPrevented = true;
		},
	};

	piano.handleTouchMove(event);

	assert.deepEqual(events, [
		["up", 60],
		["down", 62],
	]);
	assert.equal(piano.touchNotes.get(1), 62);
	assert.equal(event.defaultPrevented, true);
});

test("scope keeps signal acquisition, policy, and palette choices outside the display", () => {
	for (const attribute of [
		"drive",
		"gain",
		"gate",
		"background-color",
		"grid-color",
		"zero-color",
		"trace-color",
		"trace-colors",
		"trigger-color",
		"marker-color",
		"label-color",
	]) {
		assert.equal(CompostScope.observedAttributes.includes(attribute), false);
	}
	assert.equal("generateDemoSamples" in CompostScope.prototype, false);
});

test("envelope Cmd/Ctrl modifier inverts the configured time snapping mode", () => {
	const editor = Object.create(CompostEnvelopeEditor.prototype);
	Object.assign(editor, {
		duration: 4,
		grid: 0.25,
		surface: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
	});
	const event = { clientX: 33, metaKey: false, ctrlKey: false };

	editor.snapMode = "grid";
	assert.equal(editor.timeAtPointer(event, editor.freeTime(event)), 1.25);
	event.metaKey = true;
	assert.equal(editor.timeAtPointer(event, editor.freeTime(event)), 1.32);

	editor.snapMode = "off";
	event.metaKey = false;
	assert.equal(editor.timeAtPointer(event, editor.freeTime(event)), 1.32);
	event.ctrlKey = true;
	assert.equal(editor.timeAtPointer(event, editor.freeTime(event)), 1.25);
});

test("note editor Cmd/Ctrl inverts snapping and Shift provides precise pointer travel", () => {
	const editor = Object.create(CompostNoteEditor.prototype);
	editor.snapMode = "grid";
	assert.equal(editor.gestureIsFree({ metaKey: false, ctrlKey: false }), false);
	assert.equal(editor.gestureIsFree({ metaKey: true, ctrlKey: false }), true);
	editor.snapMode = "off";
	assert.equal(editor.gestureIsFree({ metaKey: false, ctrlKey: false }), true);
	assert.equal(editor.gestureIsFree({ metaKey: false, ctrlKey: true }), false);
	editor.grid = 16;
	editor.beatsPerBar = 4;
	assert.equal(
		editor.snapBeat(
			1.13,
			editor.gestureIsFree({ ctrlKey: true, metaKey: false }),
		),
		1.25,
	);
	assert.equal(editor.gestureFactor({ shiftKey: false }), 1);
	assert.equal(editor.gestureFactor({ shiftKey: true }), 0.25);
});

test("audio editor Cmd/Ctrl+L enables a loop for a non-empty time selection", () => {
	const events = [];
	const editor = Object.create(CompostAudioClipEditor.prototype);
	Object.assign(editor, {
		_timeSelection: { start: 2, end: 5 },
		rangeStart: 0,
		rangeEnd: 8,
		loopStart: 0,
		loopEnd: 8,
		zoomPxPerBeat: 120,
		offset: 40,
		setRange() {},
		setLoop(start, end, emit) {
			this.loopStart = start;
			this.loopEnd = end;
			if (emit) this.emitLoop("loop-change");
		},
		setAttribute(name) {
			if (name === "loop") this.loopEnabled = true;
		},
		hasAttribute: () => false,
		dispatchEvent(event) {
			events.push(event);
		},
	});
	let prevented = false;
	editor.handleWindowKey({
		key: "l",
		metaKey: true,
		ctrlKey: false,
		composedPath: () => [editor],
		preventDefault() {
			prevented = true;
		},
		stopPropagation() {},
	});

	assert.equal(prevented, true);
	assert.equal(editor.loopEnabled, true);
	assert.deepEqual(events.map((event) => [event.type, event.detail]), [
		["loop-change", { start: 2, end: 5 }],
	]);
	assert.deepEqual([editor.zoomPxPerBeat, editor.offset], [120, 40]);
});

test("audio editor Cmd/Ctrl+L ignores collapsed selections", () => {
	const editor = Object.create(CompostAudioClipEditor.prototype);
	Object.assign(editor, {
		_timeSelection: { start: 3, end: 3 },
		hasAttribute: () => false,
	});
	let prevented = false;
	editor.handleWindowKey({
		key: "L",
		metaKey: false,
		ctrlKey: true,
		composedPath: () => [editor],
		preventDefault() {
			prevented = true;
		},
	});
	assert.equal(prevented, false);
});

test("MIDI loop-to-selection preserves the current zoom and scroll", () => {
	const editor = Object.create(CompostNoteEditor.prototype);
	Object.assign(editor, {
		selectionRegion: { start: 1, end: 3 },
		selection: new Set(),
		_notes: [],
		rangeStart: 0,
		rangeEnd: 8,
		zoomPxPerBeat: 150,
		offset: 75,
		hasAttribute: () => false,
		setRange() {},
		setAttribute() {},
		setLoop() {},
	});
	editor.loopToSelection();
	assert.deepEqual([editor.zoomPxPerBeat, editor.offset], [150, 75]);
});

test("envelope curve hover distinguishes point insertion from the segment handle around it", () => {
	const editor = Object.create(CompostEnvelopeEditor.prototype);
	Object.assign(editor, {
		duration: 1,
		min: 0,
		max: 1,
		scale: "linear",
		stepped: false,
		grid: 0.1,
		snapMode: "off",
		_points: [
			{ time: 0, value: 0.5 },
			{ time: 1, value: 0.5 },
		],
		surface: {
			getBoundingClientRect: () => ({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
			}),
		},
	});

	assert.equal(
		editor.curveTargetAtPointer({ clientX: 50, clientY: 50, altKey: false })
			.kind,
		"point",
	);
	assert.equal(
		editor.curveTargetAtPointer({ clientX: 50, clientY: 56, altKey: false })
			.kind,
		"segment",
	);
	assert.equal(
		editor.curveTargetAtPointer({ clientX: 50, clientY: 44, altKey: false })
			.kind,
		"segment",
	);
	assert.equal(
		editor.curveTargetAtPointer({ clientX: 50, clientY: 50, altKey: true })
			.kind,
		"segment",
	);
});

test("envelope Cmd+D duplicates the selected range and advances its selection", () => {
	const events = [];
	const editor = Object.create(CompostEnvelopeEditor.prototype);
	Object.assign(editor, {
		duration: 4,
		selection: { start: 1, end: 2 },
		selectionPointIndexes: [1, 2],
		_points: [
			{ time: 0, value: 0 },
			{ time: 1, value: 0.25 },
			{ time: 2, value: 0.75 },
			{ time: 2.5, value: 1 },
			{ time: 4, value: 0 },
		],
		setSelection(start, end) {
			this.selection = { start, end };
		},
		dispatchEvent(event) {
			events.push(event);
		},
	});

	editor.duplicateSelection();

	assert.deepEqual(editor.selection, { start: 2, end: 3 });
	assert.deepEqual(
		events.map((event) => event.type),
		["envelope-selection", "envelope-change"],
	);
	assert.deepEqual(
		events.at(-1).detail.points.map(({ time, value }) => [time, value]),
		[
			[0, 0],
			[1, 0.25],
			[2, 0.75],
			[2, 0.25],
			[3, 0.75],
			[4, 0],
		],
	);
});

test("envelope Cmd+D preserves a partial curved selection and its source shape", () => {
	const original = [
		{ time: 0, value: 0, curve: 0.8 },
		{ time: 1, value: 1 },
		{ time: 2, value: 0 },
	];
	const events = [];
	const editor = Object.create(CompostEnvelopeEditor.prototype);
	Object.assign(editor, {
		duration: 2,
		min: 0,
		max: 1,
		scale: "linear",
		stepped: false,
		selection: { start: 0.25, end: 0.75 },
		selectionPointIndexes: [],
		_points: original.map((point) => ({ ...point })),
		dispatchEvent(event) {
			events.push(event);
		},
	});

	editor.duplicateSelection();

	const points = events.find((event) => event.type === "envelope-change").detail
		.points;
	for (const position of [0.1, 0.3, 0.5, 0.7, 0.9]) {
		const sourceTime = 0.25 + position * 0.5;
		const duplicateTime = 0.75 + position * 0.5;
		const expected = envelopeValueAtTime(original, sourceTime);
		assert.ok(
			Math.abs(envelopeValueAtTime(points, sourceTime) - expected) < 1e-9,
		);
		assert.ok(
			Math.abs(envelopeValueAtTime(points, duplicateTime) - expected) < 1e-9,
		);
	}
});

test("dragging a point inside an envelope selection starts a section move", () => {
	const editor = Object.create(CompostEnvelopeEditor.prototype);
	const marker = { focus() {} };
	Object.assign(editor, {
		draw: false,
		snapMode: "grid",
		selection: { start: 1, end: 2 },
		selectionPointIndexes: [0],
		_points: [{ time: 1.5, value: 0.5 }],
		line: {},
		segmentHighlight: { setAttribute() {} },
		pointPreview: {},
		selectionMarquee: { style: {} },
		surface: {
			dataset: {},
			getBoundingClientRect: () => ({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
			}),
			setPointerCapture() {},
		},
		longPress: { cancel() {}, start() {} },
		pointFromEvent: () => ({ marker, index: 0 }),
		timeAtPointer: () => 1.5,
		valueAtPointer: () => 0.5,
		hasAttribute: () => false,
		setAttribute() {},
	});

	editor.startPointer({
		pointerId: 1,
		pointerType: "mouse",
		button: 0,
		clientX: 50,
		clientY: 50,
		altKey: false,
		preventDefault() {},
		stopPropagation() {},
		composedPath: () => [marker],
	});

	assert.equal(editor.drag.mode, "range");
});

test("knobs and sliders expose disabled as a real control state", () => {
	assert.ok(CompostKnob.observedAttributes.includes("disabled"));
	assert.ok(CompostSlider.observedAttributes.includes("disabled"));

	for (const Control of [CompostKnob, CompostSlider]) {
		const control = Object.create(Control.prototype);
		control.attributes = new Set(["disabled", "editable"]);
		control.beginValueEdit();
		assert.notEqual(control.isEditingValue, true);
	}
});

test("knobs and sliders share range and curve attributes while sliders add orientation and interaction", () => {
	const sliderOnly = ["orientation", "interaction"];
	assert.deepEqual(
		CompostKnob.observedAttributes.filter(
			(attribute) => attribute !== "pointer-lock",
		),
		CompostSlider.observedAttributes.filter(
			(attribute) => !sliderOnly.includes(attribute),
		),
	);
	for (const attribute of sliderOnly) {
		assert.ok(CompostSlider.observedAttributes.includes(attribute));
	}
	for (const Control of [CompostKnob, CompostSlider, CompostNumberBox]) {
		assert.equal(Control.observedAttributes.includes("taper"), false);
		assert.equal(Control.observedAttributes.includes("scale"), false);
	}
});

test("relative slider drag preserves the grabbed value and follows rail travel", () => {
	const control = Object.create(CompostSlider.prototype);
	const values = [];
	Object.assign(control, {
		min: 0,
		max: 1,
		mid: null,
		curve: "linear",
		shape: 1,
		input: { getBoundingClientRect: () => ({ width: 200, height: 100 }) },
		pointerStart: {
			pointerId: 1,
			x: 40,
			y: 50,
			value: 0.25,
			fineCandidate: false,
			fine: false,
			moved: false,
			orientation: "horizontal",
			relative: true,
		},
		setValue(value) {
			values.push(value);
		},
	});

	control.movePointer({
		pointerId: 1,
		clientX: 90,
		clientY: 50,
		preventDefault() {},
	});
	assert.equal(values.at(-1), 0.5);
});

test("slider exposes separate track, fill, and thumb styling parts", () => {
	const source = fs.readFileSync(
		new URL("../src/components/compost-slider.js", import.meta.url),
		"utf8",
	);
	assert.match(source, /class="track" part="track"/u);
	assert.match(source, /class="fill" part="fill"/u);
	assert.match(source, /class="thumb" part="thumb"/u);
	assert.doesNotMatch(source, /\.range-input::after/u);
});

test("slider orientation controls pointer travel and accessible metadata", () => {
	const control = Object.create(CompostSlider.prototype);
	const aria = new Map();
	const values = [];
	let orientation = "vertical";
	Object.assign(control, {
		_value: 0.5,
		min: 0,
		max: 1,
		mid: null,
		curve: "linear",
		shape: 1,
		step: 0,
		positionStep: null,
		displayFractionDigits: null,
		valueText: "",
		unit: "",
		label: "Level",
		isEditingValue: false,
		input: {
			getBoundingClientRect: () => ({
				left: 10,
				top: 20,
				width: 200,
				height: 200,
			}),
		},
		labelElement: {},
		output: { removeAttribute() {} },
		style: { setProperty() {} },
		hasAttribute: () => false,
		getAttribute: (name) => (name === "orientation" ? orientation : null),
		setAttribute(name, value) {
			aria.set(name, value);
		},
		setValue(value) {
			values.push(value);
		},
	});

	assert.equal(control.valueFromPointer({ clientX: 10, clientY: 20 }), 1);
	assert.equal(control.valueFromPointer({ clientX: 10, clientY: 220 }), 0);
	control.pointerStart = {
		pointerId: 1,
		x: 10,
		y: 200,
		value: 0.5,
		fineCandidate: true,
		fine: false,
		moved: false,
		orientation: "vertical",
	};
	control.movePointer({
		pointerId: 1,
		clientX: 10,
		clientY: 110,
		preventDefault() {},
	});
	assert.equal(values.at(-1), 0.55);

	control.pointerStart = null;
	control.refresh();
	assert.equal(aria.get("aria-orientation"), "vertical");
	orientation = null;
	assert.equal(control.orientation, "horizontal");
});

test("knobs and sliders use global fine and coarse keyboard travel", () => {
	for (const Control of [CompostKnob, CompostSlider]) {
		const control = Object.create(Control.prototype);
		Object.defineProperties(control, {
			disabled: { value: false },
			value: {
				get() {
					return this.currentValue;
				},
			},
		});
		Object.assign(control, {
			currentValue: 0.2,
			min: 0,
			max: 1,
			mid: null,
			curve: "linear",
			shape: 1,
			step: 0.000001,
			positionStep: null,
			resetValue: 0.5,
			handleValueEditKey: () => false,
			parameterID: "keyboard-test",
			dispatchEvent: () => {},
			setValue(value) {
				this.currentValue = value;
			},
		});

		const press = (key, altKey = false) => {
			let prevented = false;
			control.handleKey({
				key,
				altKey,
				preventDefault() {
					prevented = true;
				},
			});
			assert.equal(prevented, true);
		};

		press("ArrowRight");
		assert.ok(Math.abs(control.value - 0.21) < 1e-9);
		press("ArrowRight", true);
		assert.ok(Math.abs(control.value - 0.31) < 1e-9);
		press("PageDown");
		assert.ok(Math.abs(control.value - 0.21) < 1e-9);
		press("Delete");
		assert.equal(control.value, 0.5);
	}
});

test("exact-value editors use the shared visible precision", () => {
	for (const Control of [CompostKnob, CompostSlider, CompostNumberBox]) {
		const control = Object.create(Control.prototype);
		Object.assign(control, {
			_value: 0.68471234,
			step: 0,
			displayFractionDigits: null,
			empty: false,
		});
		assert.equal(control.editableValueText(), "0.68");
	}
});

test("an untitled drawer keeps an accessible title name", () => {
	let ariaLabel = "";
	const drawer = Object.create(CompostDrawer.prototype);
	Object.assign(drawer, {
		getAttribute() {
			return "";
		},
		titleSlot: {
			assignedNodes() {
				return [];
			},
		},
		titleBar: {
			setAttribute(name, value) {
				if (name === "aria-label") ariaLabel = value;
			},
			removeAttribute() {
				ariaLabel = "";
			},
		},
	});

	drawer.refreshLabel();
	assert.equal(ariaLabel, "Toggle drawer");
});

test("drawer resizing follows its attached edge", () => {
	const drawer = Object.create(CompostDrawer.prototype);
	let edge = "bottom";
	Object.assign(drawer, {
		getAttribute(name) {
			return name === "edge" ? edge : null;
		},
	});

	assert.equal(drawer.resizePosition({ clientX: 20, clientY: 80 }), -80);
	edge = "top";
	assert.equal(drawer.resizePosition({ clientX: 20, clientY: 80 }), 80);
	edge = "left";
	assert.equal(drawer.resizePosition({ clientX: 20, clientY: 80 }), 20);
	edge = "right";
	assert.equal(drawer.resizePosition({ clientX: 20, clientY: 80 }), -20);
});

test("parameter lifecycle details always state whether the gesture was cancelled", () => {
	const events = [];
	const control = {
		parameterID: "gain",
		parameterKind: "continuous",
		value: 0.5,
		dispatchEvent(event) {
			events.push(event);
		},
	};

	beginParameterGesture(control);
	editParameterGesture(control, 0.75);
	endParameterGesture(control, 0.75);

	assert.deepEqual(
		events.map((event) => event.detail.cancelled),
		[false, false, false],
	);

	control.value = 0.75;
	beginParameterGesture(control);
	control.value = 1;
	editParameterGesture(control, 1);
	endParameterGesture(control, 1, { cancelled: true });
	assert.equal(control.value, 0.75);
	assert.equal(events.at(-1).detail.value, 0.75);
	assert.equal(events.at(-1).detail.cancelled, true);
});

test("trigger button ignores silent backend reflection", () => {
	const button = Object.create(CompostButton.prototype);
	let triggers = 0;
	Object.assign(button, {
		wasMappedActive: false,
		getAttribute(name) {
			return name === "mode" ? "trigger" : null;
		},
		trigger() {
			triggers += 1;
		},
	});
	button.setValue(1, false, "backend");
	assert.equal(triggers, 0);
});

function lifecycleHarness(Control, attrs = {}) {
	const attributes = new Map(
		Object.entries({
			"parameter-id": "gain",
			...attrs,
		}),
	);
	const events = [];
	const control = Object.create(Control.prototype);

	Object.assign(control, {
		_parameterGestureActive: false,
		lastUpdateSource: "control",
		dispatchEvent(event) {
			events.push(event);
			return true;
		},
		getAttribute(name) {
			return attributes.has(name) ? attributes.get(name) : null;
		},
		hasAttribute(name) {
			return attributes.has(name);
		},
		setAttribute(name, value) {
			attributes.set(name, String(value));
		},
		removeAttribute(name) {
			attributes.delete(name);
		},
		toggleAttribute(name, force) {
			if (force) attributes.set(name, "");
			else attributes.delete(name);
		},
		refresh() {},
	});

	return { control, events };
}

function lifecycleTypes(events) {
	return events
		.filter((event) => event.type.startsWith("parameter-"))
		.map((event) => event.type);
}

test("knob executes keyboard/reset edits and keeps silent backend updates silent", () => {
	const { control, events } = lifecycleHarness(CompostKnob, {
		min: "0",
		max: "1",
	});
	Object.assign(control, {
		_value: 0.5,
		min: 0,
		max: 1,
		step: 0,
		mid: null,
		curve: "linear",
		shape: 1,
		positionStep: null,
		resetValue: 0.25,
		displayFractionDigits: null,
		valueText: "",
		unit: "",
	});

	control.mid = 0.8;
	assert.equal(control.scaleOptions().mid, 0.8);
	control.handleKey({ key: "ArrowRight", preventDefault() {} });
	assert.deepEqual(lifecycleTypes(events), [
		"parameter-begin",
		"parameter-edit",
		"parameter-end",
	]);
	assert.ok(control.value > 0.5);

	events.length = 0;
	control.handleKey({ key: "Delete", preventDefault() {} });
	assert.equal(control.value, 0.25);
	assert.deepEqual(lifecycleTypes(events), [
		"parameter-begin",
		"parameter-edit",
		"parameter-end",
	]);

	events.length = 0;
	control.setValue(0.8, false, "backend");
	assert.equal(control.value, 0.8);
	assert.deepEqual(events, []);
});

test("knob pointer and typed gestures close once with cancellation details", () => {
	const previousWindow = globalThis.window;
	const previousDocument = globalThis.document;
	const previousFocus = HTMLElement.prototype.focus;
	const windowListeners = new Map();
	const documentListeners = new Map();
	const dialListeners = new Map();
	globalThis.window = {
		addEventListener(type, listener) {
			windowListeners.set(type, listener);
		},
		removeEventListener(type, listener) {
			if (windowListeners.get(type) === listener) windowListeners.delete(type);
		},
	};
	globalThis.document = {
		pointerLockElement: null,
		addEventListener(type, listener) {
			documentListeners.set(type, listener);
		},
		removeEventListener(type, listener) {
			if (documentListeners.get(type) === listener)
				documentListeners.delete(type);
		},
		createElement() {
			return fakeInput();
		},
		exitPointerLock() {},
	};
	HTMLElement.prototype.focus = () => {};

	try {
		const { control, events } = lifecycleHarness(CompostKnob, {
			min: "0",
			max: "1",
			editable: "",
			"parameter-id": "gain",
		});
		Object.assign(control, {
			_value: 0.5,
			min: 0,
			max: 1,
			step: 0,
			mid: null,
			curve: "linear",
			shape: 1,
			positionStep: null,
			resetValue: 0.25,
			displayFractionDigits: null,
			valueText: "",
			unit: "",
			label: "Gain",
			valueElement: {
				replaceChildren(input) {
					this.child = input;
				},
			},
			dial: {
				setPointerCapture() {},
				hasPointerCapture() {
					return false;
				},
				releasePointerCapture() {},
				addEventListener(type, listener) {
					dialListeners.set(type, listener);
				},
				removeEventListener(type, listener) {
					if (dialListeners.get(type) === listener) dialListeners.delete(type);
				},
			},
		});

		control.beginDrag({
			pointerId: 1,
			clientX: 0,
			clientY: 0,
			preventDefault() {},
		});
		control.setValue(0.7, true, "control");
		windowListeners.get("pointerup")?.({ pointerId: 1, type: "pointerup" });
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, false);

		events.length = 0;
		control.beginDrag({
			pointerId: 2,
			clientX: 0,
			clientY: 0,
			preventDefault() {},
		});
		control.setValue(0.8, true, "control");
		windowListeners.get("blur")?.();
		windowListeners.get("blur")?.();
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);

		// A secondary button (context menu) must not start a drag at all.
		events.length = 0;
		control.beginDrag({
			pointerId: 3,
			button: 2,
			clientX: 0,
			clientY: 0,
			preventDefault() {},
		});
		assert.deepEqual(lifecycleTypes(events), []);
		assert.equal(windowListeners.has("pointermove"), false);

		events.length = 0;
		control.beginValueEdit("0.5");
		const validInput = control.valueElement.child;
		validInput.value = "0.75";
		validInput.dispatch("blur");
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, false);

		events.length = 0;
		control.beginValueEdit("0.5");
		const invalidInput = control.valueElement.child;
		invalidInput.value = "bad";
		invalidInput.dispatch("blur");
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);
	} finally {
		HTMLElement.prototype.focus = previousFocus;
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
	}
});

test("slider pointer cancellation, typed edits, reset, and silent updates close once", () => {
	const previousWindow = globalThis.window;
	const previousDocument = globalThis.document;
	const windowListeners = new Map();
	globalThis.window = {
		addEventListener(type, listener) {
			windowListeners.set(type, listener);
		},
		removeEventListener(type, listener) {
			if (windowListeners.get(type) === listener) windowListeners.delete(type);
		},
	};
	globalThis.document = {
		createElement() {
			return fakeInput();
		},
	};
	try {
		const { control, events } = lifecycleHarness(CompostSlider, {
			min: "0",
			max: "1",
			editable: "",
			"parameter-id": "gain",
		});
		Object.assign(control, {
			_value: 0.5,
			min: 0,
			max: 1,
			step: 0,
			mid: null,
			curve: "linear",
			shape: 1,
			positionStep: null,
			resetValue: 0.25,
			displayFractionDigits: null,
			valueText: "",
			unit: "",
			label: "Gain",
			output: {
				replaceChildren(input) {
					this.child = input;
				},
			},
		});
		control.handleWindowBlur = () => control.cancelPointer();

		control.beginPointer({ pointerId: 1, clientX: 0, clientY: 0 });
		control.setValue(0.7, true, "control");
		control.endPointer({ pointerId: 1, clientX: 0, clientY: 10 });
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, false);

		events.length = 0;
		control.beginPointer({ pointerId: 2, clientX: 0, clientY: 0 });
		control.setValue(0.8, true, "control");
		control.cancelPointer();
		control.cancelPointer();
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);

		events.length = 0;
		control.beginPointer({ pointerId: 3, clientX: 0, clientY: 0 });
		control.setValue(0.6, true, "control");
		windowListeners.get("blur")?.();
		windowListeners.get("blur")?.();
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);

		events.length = 0;
		control.handleKey({ key: "ArrowRight", preventDefault() {} });
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);

		events.length = 0;
		control.reset();
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(control.value, 0.25);

		events.length = 0;
		control.beginValueEdit("0.5");
		const validInput = control.output.child;
		validInput.value = "0.75";
		validInput.dispatch("blur");
		assert.equal(control.value, 0.75);
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, false);

		events.length = 0;
		control.beginValueEdit("0.5");
		const invalidInput = control.output.child;
		invalidInput.value = "bad";
		invalidInput.dispatch("blur");
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);

		events.length = 0;
		control.setValue(0.9, false, "backend");
		assert.deepEqual(events, []);
	} finally {
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
	}
});

function fakeInput() {
	const listeners = new Map();
	return {
		value: "",
		addEventListener(type, listener) {
			listeners.set(type, listener);
		},
		setAttribute() {},
		focus() {},
		select() {},
		setSelectionRange() {},
		dispatch(type, event = {}) {
			listeners.get(type)?.({ ...event, target: this });
		},
	};
}

test("number box pointer, typed commit/cancel, reset, and silent backend paths are executable", () => {
	const previousDocument = globalThis.document;
	const previousWindow = globalThis.window;
	const windowListeners = new Map();
	globalThis.window = {
		addEventListener(type, listener) {
			windowListeners.set(type, listener);
		},
		removeEventListener(type, listener) {
			if (windowListeners.get(type) === listener) windowListeners.delete(type);
		},
	};
	const documentListeners = new Map();
	const documentStub = {
		pointerLockElement: null,
		addEventListener(type, listener) {
			documentListeners.set(type, listener);
		},
		removeEventListener(type, listener) {
			if (documentListeners.get(type) === listener)
				documentListeners.delete(type);
		},
		createElement() {
			return fakeInput();
		},
	};
	globalThis.document = documentStub;
	try {
		const { control, events } = lifecycleHarness(CompostNumberBox, {
			min: "0",
			max: "1",
			"pointer-lock": "",
			"parameter-id": "gain",
		});
		let pointerLockRequests = 0;
		const box = {
			isConnected: false,
			focus() {},
			setPointerCapture() {},
			requestPointerLock() {
				pointerLockRequests += 1;
			},
		};
		Object.assign(control, {
			_value: 0.5,
			min: 0,
			max: 1,
			step: 0,
			mid: null,
			curve: "linear",
			shape: 1,
			resetValue: 0.25,
			empty: false,
			editing: false,
			box,
			valueElement: {
				replaceChildren(input) {
					this.child = input;
				},
			},
			isConnected: false,
		});
		control.handleWindowBlur = () => control.endActiveDrag(false);

		control.beginDrag({
			pointerId: 1,
			clientX: 0,
			clientY: 0,
			button: 0,
			preventDefault() {},
		});
		control.applyDragDistance(40, { preventDefault() {} });
		control.endDrag({ pointerId: 1 });
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, false);
		assert.equal(pointerLockRequests, 1);

		events.length = 0;
		control.beginDrag({
			pointerId: 2,
			clientX: 0,
			clientY: 0,
			button: 0,
			preventDefault() {},
		});
		control.applyDragDistance(20, { preventDefault() {} });
		control.endDrag({ pointerId: 2 }, false);
		control.endDrag({ pointerId: 2 }, false);
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);

		events.length = 0;
		control.beginDrag({
			pointerId: 3,
			clientX: 0,
			clientY: 0,
			button: 0,
			preventDefault() {},
		});
		control.applyDragDistance(20, { preventDefault() {} });
		windowListeners.get("blur")?.();
		windowListeners.get("blur")?.();
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);
		assert.equal(events.at(-1).detail.cancelled, true);

		events.length = 0;
		control.handleKey({ key: "Escape", preventDefault() {} });
		assert.equal(control.value, 0.25);
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);

		events.length = 0;
		control.beginEdit("0.5");
		const invalidInput = control.valueElement.child;
		assert.equal(control.editing, true);
		invalidInput.value = "not a number";
		invalidInput.dispatch("blur");
		assert.equal(control.editing, false);
		assert.equal(events.at(-1).type, "parameter-end");
		assert.equal(events.at(-1).detail.cancelled, true);

		events.length = 0;
		control.beginEdit("0.5");
		const validInput = control.valueElement.child;
		validInput.value = "0.75";
		validInput.dispatch("blur");
		assert.equal(control.value, 0.75);
		assert.deepEqual(lifecycleTypes(events), [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
		]);

		events.length = 0;
		control.setValue(0.9, false, "backend");
		assert.deepEqual(events, []);
	} finally {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
		if (previousWindow === undefined) delete globalThis.window;
		else globalThis.window = previousWindow;
	}
});

test("number box keyboard input ends an active pointer drag", () => {
	const control = Object.create(CompostNumberBox.prototype);
	let pointerMoves = 0;
	Object.assign(control, {
		drag: { pointerId: 7, x: 0, y: 0, locked: false },
		editing: false,
		hasAttribute: () => false,
		beginEdit() {},
		endActiveDrag() {
			this.drag = null;
		},
		applyDragDistance() {
			pointerMoves += 1;
		},
	});

	control.handleKey({ key: "5", preventDefault() {} });
	control.moveDrag({ pointerId: 7, clientX: 20, clientY: 0 });

	assert.equal(control.drag, null);
	assert.equal(pointerMoves, 0);
});

test("number box uses normal, split-zone, and second-click fine drag scaling", () => {
	const control = Object.create(CompostNumberBox.prototype);
	const values = [];
	Object.assign(control, {
		drag: {
			value: 0.5,
			moved: false,
			fineCandidate: false,
			fine: false,
			zoneScale: 1,
		},
		min: 0,
		max: 1,
		mid: null,
		curve: "linear",
		shape: 1,
		toggleAttribute() {},
		setValue(value) {
			values.push(value);
		},
	});

	control.applyDragDistance(90, { preventDefault() {} });
	assert.equal(values.at(-1), 1);

	control.drag = {
		value: 0.5,
		moved: false,
		fineCandidate: false,
		fine: false,
		zoneScale: 4,
	};
	control.applyDragDistance(9, { preventDefault() {} });
	assert.equal(values.at(-1), 0.7);

	control.drag = {
		value: 0.5,
		moved: false,
		fineCandidate: true,
		fine: false,
	};
	control.applyDragDistance(90, { preventDefault() {} });
	assert.equal(values.at(-1), 0.55);
	assert.equal(
		CompostNumberBox.observedAttributes.includes("split-drag"),
		true,
	);
	assert.equal(
		CompostNumberBox.observedAttributes.includes("drag-step-left"),
		true,
	);
	assert.equal(
		CompostNumberBox.observedAttributes.includes("drag-step-middle"),
		true,
	);
	assert.equal(
		CompostNumberBox.observedAttributes.includes("drag-step-right"),
		true,
	);
	assert.equal(CompostSlider.observedAttributes.includes("compact"), false);
});

test("number box split-drag selects configurable left, middle, and right rates", () => {
	const values = new Map([
		["drag-step-left", "6"],
		["drag-step-middle", "1.5"],
		["drag-step-right", "0.2"],
	]);
	const control = Object.create(CompostNumberBox.prototype);
	Object.assign(control, {
		box: { getBoundingClientRect: () => ({ left: 10, width: 90 }) },
		hasAttribute(name) {
			return name === "split-drag" || values.has(name);
		},
		getAttribute(name) {
			return values.get(name) ?? "";
		},
	});

	assert.equal(control.dragScaleFor({ clientX: 12 }), 6);
	assert.equal(control.dragScaleFor({ clientX: 55 }), 1.5);
	assert.equal(control.dragScaleFor({ clientX: 98 }), 0.2);
});

test("MIDI mapping range editors use the full parameter bounds", () => {
	const editor = Object.create(CompostMIDIMappings.prototype);
	editor._mappings = {
		parameterProvider: {
			definition(parameterID) {
				return parameterID === "frequency" ? { min: 20, max: 20000 } : null;
			},
		},
	};

	assert.deepEqual(
		editor.parameterBoundsFor({
			parameterID: "frequency",
			min: 440,
			max: 1000,
		}),
		{
			min: 20,
			max: 20000,
		},
	);
	assert.deepEqual(
		editor.parameterBoundsFor({ parameterID: "unknown", min: 0, max: 1 }),
		{
			min: 0,
			max: 1,
		},
	);
});

test("MIDI mapping row delete buttons request one clear", () => {
	const editor = Object.create(CompostMIDIMappings.prototype);
	let cleared = "";
	Object.assign(editor, {
		_mappings: {},
		hasAttribute: () => false,
		clearMapping(parameterID) {
			cleared = parameterID;
		},
	});

	editor.handleRowClick({
		target: {
			closest: () => ({ dataset: { clearMapping: "frequency" } }),
		},
	});

	assert.equal(cleared, "frequency");
});

test("button triggers emit exact pulses and silent setters do nothing", () => {
	const button = lifecycleHarness(CompostButton);
	button.control.flashActive = () => {};
	button.control.trigger("control");
	assert.deepEqual(lifecycleTypes(button.events), [
		"parameter-begin",
		"parameter-edit",
		"parameter-edit",
		"parameter-end",
	]);
	button.events.length = 0;
	button.control.setValue(1, false, "backend");
	assert.deepEqual(button.events, []);

	const switchButton = lifecycleHarness(CompostButton, { mode: "switch" });
	switchButton.control.setValue(1, true, "api");
	assert.equal(switchButton.control.value, 1);
	assert.deepEqual(lifecycleTypes(switchButton.events), [
		"parameter-begin",
		"parameter-edit",
		"parameter-end",
	]);
	assert.equal(switchButton.events.at(-1).detail.cancelled, false);
	switchButton.events.length = 0;
	switchButton.control.setValue(0, false, "backend");
	assert.equal(switchButton.control.value, 0);
	assert.deepEqual(switchButton.events, []);
});
