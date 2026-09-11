import "../../src/components/compost-knob.js";
import { createParameterController } from "../../src/parameter-controller.js";
import { createValueControl } from "../../src/value-control.js";

const canvas = document.querySelector("#custom-canvas");
const driveElement = document.querySelector("#drive-control");
const repeatsElement = document.querySelector("#repeats-control");
const eventReadout = document.querySelector("#events");
const controlStates = [null, null];

const parameters = createParameterController({
	root: document,
	definitions: [
		{
			parameterID: "drive",
			kind: "continuous",
			name: "Drive",
			min: 0,
			max: 1,
			defaultValue: 0.25,
			step: 0.01,
		},
		{
			parameterID: "repeats",
			kind: "continuous",
			name: "Number of repeats",
			min: 1,
			max: 16,
			defaultValue: 4,
			step: 1,
		},
	],
});

const driveControl = createValueControl(driveElement, {
	parameterID: "drive",
	label: "Drive",
	min: 0,
	max: 1,
	value: 0.25,
	resetValue: 0.25,
	step: 0.01,
	formatValue: (value) => `${Math.round(Number(value) * 100)}%`,
	eventTarget: canvas,
	pointerTarget: null,
	draw: (state) => drawControl(state, 0),
});

const repeatsControl = createValueControl(repeatsElement, {
	parameterID: "repeats",
	label: "Number of repeats",
	min: 1,
	max: 16,
	value: 4,
	resetValue: 4,
	step: 1,
	drag: { axis: "x", mode: "position" },
	formatValue: (value) => String(Math.round(value)),
	eventTarget: canvas,
	pointerTarget: repeatsElement,
	draw: (state) => drawControl(state, 1),
});

parameters.registerControl(driveControl);
parameters.registerControl(repeatsControl);

const eventLines = [];
for (const type of ["parameter-begin", "parameter-edit", "parameter-end"]) {
	document.addEventListener(type, (event) => {
		const detail = event.detail || {};
		const suffix = detail.cancelled ? " cancelled" : "";
		eventLines.unshift(
			`${type} ${detail.parameterID}: ${formatEventValue(detail.value)}${suffix}`,
		);
		eventLines.splice(12);
		eventReadout.textContent = eventLines.join("\n");
	});
}

document
	.querySelector("#host-value")
	.addEventListener("click", () =>
		parameters.applyValue("drive", 0.75, { source: "host" }),
	);
canvas.addEventListener("pointerdown", (event) => {
	if (event.button !== 0) return;
	if (controlIndexForEvent(event) === 0) driveControl.startPointerDrag(event);
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvas);
const colorObserver = new MutationObserver(drawControls);
colorObserver.observe(document.documentElement, {
	attributes: true,
	attributeFilter: ["data-color-scheme"],
});
resizeCanvas();

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) cleanup();
});

function controlIndexForEvent(event) {
	const rect = canvas.getBoundingClientRect();
	return event.clientX - rect.left < rect.width / 2 ? 0 : 1;
}

function resizeCanvas() {
	const rect = canvas.getBoundingClientRect();
	const ratio = window.devicePixelRatio || 1;
	canvas.width = Math.max(1, Math.round(rect.width * ratio));
	canvas.height = Math.max(1, Math.round(rect.height * ratio));
	canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
	drawControls();
}

function drawControl(state, index) {
	controlStates[index] = state;
	drawControls();
}

function drawControls() {
	const context = canvas.getContext("2d");
	if (!context) return;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (!(width > 0 && height > 0)) return;
	context.clearRect(0, 0, width, height);
	if (controlStates[0])
		drawDriveCurve(context, controlStates[0], 0, width / 2, height);
	if (controlStates[1])
		drawRepeats(context, controlStates[1], width / 2, width / 2, height);
}

function drawFrame(context, state, left, width, height, dragLabel) {
	const centerX = left + width / 2;
	const color = getComputedStyle(canvas).color;
	context.fillStyle = color;
	context.globalAlpha = 1;
	context.font = "13px ui-sans-serif, system-ui, sans-serif";
	context.textAlign = "center";
	context.fillText(state.valueText, centerX, height - 16);
	context.globalAlpha = 0.45;
	context.font = "700 10px ui-sans-serif, system-ui, sans-serif";
	context.fillText(dragLabel, centerX, height - 34);
	context.globalAlpha = 1;

	if (!state.focused) return;
	context.strokeStyle = color;
	context.lineWidth = 2;
	context.setLineDash([5, 4]);
	context.strokeRect(left + 12, 8, width - 24, height - 16);
	context.setLineDash([]);
}

function drawDriveCurve(context, state, left, width, height) {
	drawFrame(context, state, left, width, height, "DRAG ↑↓");
	const size = Math.min(width - 76, height - 120, 190);
	const startX = left + (width - size) / 2;
	const startY = 24 + (height - 70 - size) / 2;
	const centerX = startX + size / 2;
	const centerY = startY + size / 2;
	const color = getComputedStyle(canvas).color;

	context.strokeStyle = color;
	context.lineWidth = 1;
	context.globalAlpha = 0.18;
	context.beginPath();
	context.moveTo(startX, centerY);
	context.lineTo(startX + size, centerY);
	context.moveTo(centerX, startY);
	context.lineTo(centerX, startY + size);
	context.moveTo(startX, startY + size);
	context.lineTo(startX + size, startY);
	context.stroke();

	const gain = 0.2 + state.position * 5.8;
	const limit = Math.tanh(gain);
	context.lineWidth = state.dragging ? 5 : 3.5;
	context.globalAlpha = 0.9;
	context.beginPath();
	for (let point = 0; point <= 64; point += 1) {
		const input = (point / 64) * 2 - 1;
		const output = Math.tanh(input * gain) / limit;
		const x = centerX + input * (size / 2);
		const y = centerY - output * (size / 2);
		if (point === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.stroke();
	context.globalAlpha = 1;
}

function drawRepeats(context, state, left, width, height) {
	drawFrame(context, state, left, width, height, "PLACE END ←→");
	const color = getComputedStyle(canvas).color;
	const count = Math.round(state.value);
	const startX = left + 42;
	const endX = left + width - 42;
	const centerY = height / 2 + 6;
	const spacing = (endX - startX) / 15;
	context.strokeStyle = color;
	context.fillStyle = color;
	context.lineCap = "round";
	context.globalAlpha = 0.16;
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(startX, centerY);
	context.lineTo(endX, centerY);
	context.stroke();

	for (let echo = 0; echo < 16; echo += 1) {
		const x = startX + echo * spacing;
		const strength = 1 - echo / 20;
		const pulseHeight = Math.max(18, (height - 150) * strength);
		context.globalAlpha = echo < count ? 0.92 * strength : 0.12;
		context.lineWidth = state.dragging && echo < count ? 5 : 3;
		context.beginPath();
		context.moveTo(x, centerY - pulseHeight / 2);
		context.lineTo(x, centerY + pulseHeight / 2);
		context.stroke();
		context.beginPath();
		context.arc(x, centerY, echo < count ? 4 : 2.5, 0, Math.PI * 2);
		context.fill();
	}

	const handleX = startX + (count - 1) * spacing;
	const handleHeight = Math.max(18, height - 150);
	const handleTop = centerY - handleHeight / 2 - 7;
	const handleBottom = centerY + handleHeight / 2 + 7;
	context.globalAlpha = 1;
	context.lineWidth = state.dragging ? 4 : 2.5;
	context.beginPath();
	context.moveTo(handleX - 9, handleTop);
	context.lineTo(handleX, handleTop);
	context.lineTo(handleX, handleBottom);
	context.lineTo(handleX - 9, handleBottom);
	context.stroke();
	context.lineCap = "butt";
	context.globalAlpha = 1;
}

function formatEventValue(value) {
	return Number.isFinite(Number(value))
		? Number(value).toFixed(2)
		: String(value);
}

function cleanup() {
	resizeObserver.disconnect();
	colorObserver.disconnect();
	driveControl.dispose();
	repeatsControl.dispose();
	parameters.unregisterControl(driveControl);
	parameters.unregisterControl(repeatsControl);
	parameters.disconnect();
}
