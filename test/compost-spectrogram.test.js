import assert from "node:assert/strict";
import test from "node:test";

const colours = {
	background: "rgb(0, 0, 0)",
	"ramp-0": "rgb(0, 0, 0)",
	"ramp-1": "rgb(64, 64, 64)",
	"ramp-2": "rgb(128, 128, 128)",
	"ramp-3": "rgb(192, 192, 192)",
	"ramp-4": "rgb(255, 255, 255)",
};

class FakeElement {
	constructor() {
		this.attributes = new Map();
		this.isConnected = false;
	}

	attachShadow() {
		const context = {
			fillRect() {},
			drawImage() {
				context.drawCount = (context.drawCount ?? 0) + 1;
			},
			createImageData: (width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width,
				height,
			}),
			putImageData: (image, x = 0) => {
				context.image = image;
				context.imageX = x;
			},
		};
		const frame = { getBoundingClientRect: () => ({ width: 1, height: 1 }) };
		const canvas = {
			width: 0,
			height: 0,
			style: {},
			getContext: () => context,
		};
		this.testContext = context;
		this.testFrame = frame;
		return {
			innerHTML: "",
			querySelector(selector) {
				if (selector === ".frame") return frame;
				if (selector === "canvas") return canvas;
				const name = selector.match(/data-color="([^"]+)"/u)?.[1];
				return name ? { colour: colours[name] } : null;
			},
		};
	}

	getAttribute(name) {
		return this.attributes.get(name) ?? null;
	}

	hasAttribute(name) {
		return this.attributes.has(name);
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}
}

globalThis.HTMLElement = FakeElement;
globalThis.customElements = {
	elements: new Map(),
	get(name) {
		return this.elements.get(name);
	},
	define(name, elementClass) {
		this.elements.set(name, elementClass);
	},
};
globalThis.getComputedStyle = (element) => ({ color: element.colour });
globalThis.devicePixelRatio = 1;

const { CompostSpectrogram } = await import(
	"../src/components/compost-spectrogram.js"
);

function renderedValue(value, minimum, maximum) {
	const spectrogram = new CompostSpectrogram();
	spectrogram.setAttribute("time-span", "1");
	spectrogram.setAttribute("min-value", minimum);
	spectrogram.setAttribute("max-value", maximum);
	spectrogram.frequencies = [440];
	const source = new Float32Array([value]);
	spectrogram.appendColumns(source, { startTime: 0, timeStep: 1 });
	source[0] = minimum;
	spectrogram.paint();
	return [...spectrogram.testContext.image.data];
}

test("renders arbitrary linear and dB ranges through the same interface", () => {
	assert.deepEqual(renderedValue(0.5, 0, 1), renderedValue(-50, -100, 0));
});

test("copies inputs, validates the stream, and preserves timestamp gaps", () => {
	const spectrogram = new CompostSpectrogram();
	spectrogram.testFrame.getBoundingClientRect = () => ({ width: 4, height: 1 });
	spectrogram.setAttribute("time-span", "4");
	spectrogram.frequencies = [100, 1000];
	const values = new Float32Array([1, 1]);
	spectrogram.appendColumns(values, { startTime: 0, timeStep: 1 });
	spectrogram.appendColumns(values, { startTime: 2, timeStep: 1 });
	values.fill(0);
	spectrogram.paint();

	const pixels = spectrogram.testContext.image.data;
	assert.deepEqual(
		[pixels[0], pixels[4], pixels[8], pixels[12]],
		[0, 255, 0, 255],
	);
	assert.throws(
		() => spectrogram.appendColumns([0, 0], { startTime: 1, timeStep: 1 }),
		/times must increase/u,
	);
	spectrogram.clear();
	assert.doesNotThrow(() =>
		spectrogram.appendColumns([0, 0], { startTime: 0, timeStep: 1 }),
	);
});

test("joins successive batches across variable display-frame intervals", () => {
	const spectrogram = new CompostSpectrogram();
	spectrogram.setAttribute("time-span", ".04");
	spectrogram.frequencies = [100];
	spectrogram.appendColumns([1], { startTime: 0, timeStep: 0.016 });
	spectrogram.appendColumns([1], { startTime: 0.018, timeStep: 0.018 });

	const columns = spectrogram.columnsForPixels(80);
	const viewEnd = 0.018 + 0.018 * 0.5;
	const viewStart = viewEnd - 0.04;
	for (let x = 0; x < columns.length; x += 1) {
		const time = viewStart + ((x + 0.5) / columns.length) * 0.04;
		if (time >= 0 && time <= 0.018) assert.notEqual(columns[x], -1);
	}
});

test("scrolls and rasterises only the newly exposed strip", () => {
	const spectrogram = new CompostSpectrogram();
	spectrogram.testFrame.getBoundingClientRect = () => ({
		width: 100,
		height: 2,
	});
	spectrogram.setAttribute("time-span", "1");
	spectrogram.frequencies = [100];
	spectrogram.appendColumns([1], { startTime: 0, timeStep: 0.1 });
	spectrogram.paint();
	spectrogram.appendColumns([1], { startTime: 0.1, timeStep: 0.1 });
	spectrogram.paint();

	assert.equal(spectrogram.testContext.drawCount, 1);
	assert.equal(spectrogram.testContext.image.width, 11);
	assert.equal(spectrogram.testContext.imageX, 89);
});

test("keeps the fractional scroll remainder for smooth canvas movement", () => {
	const spectrogram = new CompostSpectrogram();
	spectrogram.testFrame.getBoundingClientRect = () => ({
		width: 100,
		height: 2,
	});
	spectrogram.setAttribute("time-span", "1");
	spectrogram.frequencies = [100];
	spectrogram.appendColumns([1], { startTime: 0, timeStep: 0.02 });
	spectrogram.paint();
	spectrogram.appendColumns([1], { startTime: 0.025, timeStep: 0.025 });
	spectrogram.paint();

	assert.equal(spectrogram.canvas.style.transform, "translateX(-0.75px)");
});

test("uses a caller-controlled display time between incoming columns", () => {
	const spectrogram = new CompostSpectrogram();
	spectrogram.testFrame.getBoundingClientRect = () => ({
		width: 100,
		height: 2,
	});
	spectrogram.setAttribute("time-span", "1");
	spectrogram.frequencies = [100];
	spectrogram.appendColumns([1], { startTime: 0, timeStep: 0.1 });
	spectrogram.viewEndTime = 0.25;
	spectrogram.paint();
	spectrogram.viewEndTime = 0.275;
	spectrogram.paint();

	assert.equal(spectrogram.viewEndTime, 0.275);
	assert.equal(spectrogram.canvas.style.transform, "translateX(-0.5px)");
	assert.throws(() => {
		spectrogram.viewEndTime = Number.NaN;
	}, /finite or null/u);
	spectrogram.viewEndTime = null;
	assert.equal(spectrogram.viewEndTime, null);
});

test("repaints a late column without redrawing the full canvas", () => {
	const spectrogram = new CompostSpectrogram();
	spectrogram.testFrame.getBoundingClientRect = () => ({
		width: 100,
		height: 2,
	});
	spectrogram.setAttribute("time-span", "1");
	spectrogram.frequencies = [100];
	spectrogram.viewEndTime = 0.25;
	spectrogram.appendColumns([1], { startTime: 0, timeStep: 0.1 });
	spectrogram.paint();
	spectrogram.appendColumns([1], { startTime: 0.1, timeStep: 0.1 });
	spectrogram.paint();

	assert.equal(spectrogram.testContext.imageX, 79);
	assert.equal(spectrogram.testContext.image.width, 21);
});

test("reports the time range retained by history", () => {
	const spectrogram = new CompostSpectrogram();
	assert.equal(spectrogram.retainedTimeRange, null);
	spectrogram.frequencies = [100];
	spectrogram.appendColumns([1, 1], { startTime: 2, timeStep: 0.5 });
	assert.deepEqual(spectrogram.retainedTimeRange, {
		startTime: 1.75,
		endTime: 2.75,
	});
});

test("reads fractional CSS sRGB palette colours", () => {
	const spectrogram = new CompostSpectrogram();
	const previousGetComputedStyle = globalThis.getComputedStyle;
	globalThis.getComputedStyle = () => ({ color: "color(srgb 0.5 0.25 1)" });
	try {
		assert.deepEqual(spectrogram.color("ramp-1").rgb, [128, 64, 255]);
	} finally {
		globalThis.getComputedStyle = previousGetComputedStyle;
	}
});

test("rejects invalid frequency and column shapes", () => {
	const spectrogram = new CompostSpectrogram();
	assert.throws(() => {
		spectrogram.frequencies = [1000, 100];
	}, /ascending/u);
	spectrogram.frequencies = [100, 1000];
	assert.throws(
		() => spectrogram.appendColumns([0], { startTime: 0, timeStep: 1 }),
		/one value per frequency/u,
	);
});
