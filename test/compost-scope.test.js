import assert from "node:assert/strict";
import test from "node:test";

class FakeContext {
	clearRect() {}
	beginPath() {}
	moveTo() {}
	lineTo() {}
	stroke() {}
	setLineDash() {}
	fillText() {}
}

const scopeElement = {
	style: {},
	getBoundingClientRect: () => ({ width: 640, height: 320 }),
};

const waveCanvas = {
	width: 640,
	height: 320,
	getContext: () => new FakeContext(),
};

const overlayCanvas = {
	width: 640,
	height: 320,
	getContext: () => new FakeContext(),
};

globalThis.HTMLElement = class HTMLElement {};
globalThis.HTMLElement.prototype.attachShadow = () => ({
	innerHTML: "",
	querySelector(selector) {
		if (selector === ".scope") return scopeElement;
		if (selector === ".wave") return waveCanvas;
		if (selector === ".overlay") return overlayCanvas;
		return null;
	},
});

globalThis.customElements = {
	elements: new Map(),
	get(name) {
		return this.elements.get(name);
	},
	define(name, constructor) {
		this.elements.set(name, constructor);
	},
};

const { CompostScope } = await import("../src/components/compost-scope.js");

test("canvas colors resolve through inherited style probes", () => {
	const previousGetComputedStyle = globalThis.getComputedStyle;
	globalThis.getComputedStyle = (element) => ({ color: element.resolvedColor });
	const scope = new CompostScope();
	scope.root.querySelector = () => ({ resolvedColor: "rgb(12, 34, 56)" });

	try {
		assert.equal(scope.color("trace-1"), "rgb(12, 34, 56)");
	} finally {
		globalThis.getComputedStyle = previousGetComputedStyle;
	}
});

test("scope label fonts scale with the canvas pixel ratio", () => {
	const scope = new CompostScope();
	const font = scope.canvasFont(
		{
			font: "14px sans-serif",
			fontFamily: "sans-serif",
			fontSize: "14px",
			fontStyle: "normal",
			fontWeight: "400",
		},
		2,
	);

	assert.equal(font, "normal 400 28px sans-serif");
});

test("scope exposes a stable one-channel presentation description", () => {
	const scope = new CompostScope();
	const attributes = new Map();
	scope.getAttribute = (name) => attributes.get(name) ?? null;
	scope.setAttribute = (name, value) => attributes.set(name, String(value));
	scope.valueRange = 1;
	scope.yOffset = 0;

	scope.refreshAccessibilityDescription();

	assert.equal(
		attributes.get("aria-description"),
		"One-channel waveform; vertical range -1 to 1.",
	);
});

test("setSamples retains one typed array without copying or reducing precision", () => {
	const scope = new CompostScope();
	const samples = new Float64Array([0.123456789012345, -0.25, 0.5]);

	assert.equal(scope.setSamples(samples), scope);
	assert.equal(scope.samples, samples);
	assert.equal(scope.samples[0], 0.123456789012345);
});

test("setSamples can own typed and plain sample snapshots", () => {
	const scope = new CompostScope();
	const typed = new Float64Array([0.1, 0.2, 0.3]);
	scope.setSamples(typed, { copy: true });
	assert.notEqual(scope.samples, typed);
	assert.deepEqual(scope.samples, typed);

	const plain = [0.4, 0.5];
	scope.setSamples(plain, { copy: true });
	assert.notEqual(scope.samples, plain);
	assert.deepEqual(scope.samples, plain);
});

test("setSamples rejects empty, nonnumeric, and multichannel inputs", () => {
	const scope = new CompostScope();
	assert.throws(() => scope.setSamples(new Float32Array()), /requires samples/);
	assert.throws(() => scope.setSamples(["nope"]), /one numeric sample array/);
	assert.throws(
		() => scope.setSamples([new Float32Array([0]), new Float32Array([1])]),
		/one numeric sample array/,
	);
});

test("setSamples coalesces updates to one browser-frame draw", () => {
	const previousRAF = globalThis.requestAnimationFrame;
	const callbacks = [];
	globalThis.requestAnimationFrame = (callback) => {
		callbacks.push(callback);
		return callbacks.length;
	};

	const scope = new CompostScope();
	scope.isConnected = true;
	let draws = 0;
	let events = 0;
	scope.draw = () => {
		draws += 1;
		return true;
	};
	scope.dispatchEvent = () => {
		events += 1;
	};

	try {
		scope.setSamples([0, 1]);
		scope.setSamples([1, 0]);
		assert.equal(callbacks.length, 1);
		assert.deepEqual(scope.samples, [1, 0]);
		callbacks[0](12);
		assert.equal(draws, 1);
		assert.equal(events, 1);
	} finally {
		globalThis.requestAnimationFrame = previousRAF;
	}
});

test("scope draws the complete supplied sample array across its width", () => {
	const previousWindow = globalThis.window;
	globalThis.window = { devicePixelRatio: 1 };
	const points = [];
	const scope = new CompostScope();
	scope.samples = new Float32Array([0, 0.5, -0.5]);
	scope.waveCtx = {
		clearRect() {},
		beginPath() {},
		moveTo: (x) => points.push(x),
		lineTo: (x) => points.push(x),
		stroke() {},
	};
	scope.color = () => "black";

	try {
		assert.equal(scope.drawWave(100, 50, 25), true);
		assert.deepEqual(points, [0, 50, 100]);
	} finally {
		globalThis.window = previousWindow;
	}
});

test("scope keeps acquisition and signal policy outside the renderer", () => {
	const scope = new CompostScope();
	assert.equal(typeof scope.setSamples, "function");
	for (const member of ["connectAudio", "captureTrigger", "start", "stop"]) {
		assert.equal(member in scope, false);
	}
	for (const attribute of [
		"frequency",
		"trigger",
		"trigger-level",
		"samples-shown",
		"periods-shown",
		"sample-rate",
		"channels",
		"source-channels",
		"trigger-channel",
		"fft-size",
		"smoothing-time-constant",
	])
		assert.equal(CompostScope.observedAttributes.includes(attribute), false);
});
