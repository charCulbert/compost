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

const { CompostMeter } = await import("../src/components/compost-meter.js");

function makeMeter(attributes = {}) {
	const meter = Object.create(CompostMeter.prototype);
	meter.getAttribute = (name) => attributes[name] ?? null;
	meter.hasAttribute = (name) => attributes[name] !== undefined;
	return meter;
}

test("meter shares the gain response used by controls", () => {
	const meter = makeMeter({ min: "-90", max: "12", curve: "gain" });

	assert.equal(meter.position(-90), 0);
	assert.equal(meter.position(-12), 0.5);
	assert.equal(meter.position(0), 0.7);
	assert.equal(meter.position(12), 1);
});

test("meter accepts mono or multichannel state without interpreting its labels", () => {
	const meter = makeMeter();
	meter.state = {
		primaryLabel: "Primary",
		secondaryLabel: "",
		holdLabel: "",
		unit: "",
		channels: [],
	};
	meter.render = () => {};
	const channels = [
		{ label: "L", primary: -12, secondary: -20, peak: -8, clipped: false },
		{ label: "R", primary: -9, secondary: -18, peak: -6, clipped: true },
	];

	meter.setState({ primaryLabel: "Peak", secondaryLabel: "Average", channels });
	channels[0].primary = 0;
	assert.equal(meter.state.primaryLabel, "Peak");
	assert.equal(meter.state.secondaryLabel, "Average");
	assert.equal(meter.state.channels.length, 2);
	assert.equal(meter.state.channels[0].primary, -12);
});

test("meter maps infinite signal levels to its finite display bounds", () => {
	const meter = makeMeter({ min: "-90", max: "12" });
	assert.equal(meter.level(Number.NEGATIVE_INFINITY), -90);
	assert.equal(meter.level(Number.POSITIVE_INFINITY), 12);
	assert.equal(meter.level(undefined), null);
});
