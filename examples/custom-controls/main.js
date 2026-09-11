import "../../src/components/compost-knob.js";
import { createParameterController } from "../../src/parameter-controller.js";
import { createValueControl } from "../../src/value-control.js";

const canvas = document.querySelector("#custom-canvas");
const amountElement = document.querySelector("#amount-control");
const stepsElement = document.querySelector("#steps-control");
const eventReadout = document.querySelector("#events");
const controlStates = [null, null];

const parameters = createParameterController({
	root: document,
	definitions: [
		{
			parameterID: "amount",
			kind: "continuous",
			name: "Amount",
			min: 0,
			max: 1,
			defaultValue: 0.25,
			step: 0.01,
		},
		{
			parameterID: "steps",
			kind: "continuous",
			name: "Steps",
			min: 1,
			max: 16,
			defaultValue: 4,
			step: 1,
		},
	],
});

const amountControl = createValueControl(amountElement, {
	parameterID: "amount",
	label: "Amount",
	min: 0,
	max: 1,
	value: 0.25,
	resetValue: 0.25,
	step: 0.01,
	formatValue: (value) => Number(value).toFixed(2),
	eventTarget: canvas,
	pointerTarget: null,
	draw: (state) => drawControl(state, 0),
});

const stepsControl = createValueControl(stepsElement, {
	parameterID: "steps",
	label: "Steps",
	min: 1,
	max: 16,
	value: 4,
	resetValue: 4,
	step: 1,
	formatValue: (value) => String(Math.round(value)),
	eventTarget: canvas,
	pointerTarget: null,
	draw: (state) => drawControl(state, 1),
});

parameters.registerControl(amountControl);
parameters.registerControl(stepsControl);

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
		parameters.applyValue("amount", 0.75, { source: "host" }),
	);
document.querySelector("#refresh-controls").addEventListener("click", () => {
	parameters.refresh();
	resizeCanvas();
});

canvas.addEventListener("pointerdown", (event) => {
	if (event.button !== 0) return;
	const index = controlIndexForEvent(event);
	(index === 0 ? amountControl : stepsControl).startPointerDrag(event);
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
		drawAmountWave(context, controlStates[0], 0, width / 2, height);
	if (controlStates[1])
		drawStepGrid(context, controlStates[1], width / 2, width / 2, height);
}

function drawFrame(context, state, left, width, height, title, subtitle) {
	const centerX = left + width / 2;
	const color = getComputedStyle(canvas).color;
	context.fillStyle = color;
	context.globalAlpha = 0.7;
	context.font = "700 12px ui-sans-serif, system-ui, sans-serif";
	context.textAlign = "center";
	context.fillText(title, centerX, 24);
	context.globalAlpha = 0.45;
	context.font = "10px ui-sans-serif, system-ui, sans-serif";
	context.fillText(subtitle, centerX, 40);
	context.globalAlpha = 1;
	context.font = "13px ui-sans-serif, system-ui, sans-serif";
	context.fillText(state.valueText, centerX, height - 16);
	context.globalAlpha = 0.45;
	context.font = "700 10px ui-sans-serif, system-ui, sans-serif";
	context.fillText("DRAG ↑↓", centerX, height - 34);
	context.globalAlpha = 1;

	if (!state.focused) return;
	context.strokeStyle = color;
	context.lineWidth = 2;
	context.setLineDash([5, 4]);
	context.strokeRect(left + 12, 8, width - 24, height - 16);
	context.setLineDash([]);
}

function drawAmountWave(context, state, left, width, height) {
	drawFrame(context, state, left, width, height, "AMOUNT", "WAVE AMPLITUDE");
	const centerX = left + width / 2;
	const centerY = height / 2;
	const waveWidth = Math.max(60, width - 58);
	const startX = centerX - waveWidth / 2;
	const amplitude = 5 + state.position * Math.min(48, height * 0.2);
	const color = getComputedStyle(canvas).color;

	context.strokeStyle = color;
	context.lineWidth = 1;
	context.globalAlpha = 0.18;
	context.beginPath();
	context.moveTo(startX, centerY);
	context.lineTo(startX + waveWidth, centerY);
	context.stroke();

	context.lineWidth = state.dragging ? 5 : 3;
	context.globalAlpha = 0.9;
	context.beginPath();
	for (let point = 0; point <= 64; point += 1) {
		const phase = point / 64;
		const x = startX + phase * waveWidth;
		const envelope = Math.sin(phase * Math.PI);
		const y = centerY + Math.sin(phase * Math.PI * 6) * amplitude * envelope;
		if (point === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.stroke();
	context.globalAlpha = 1;
}

function drawStepGrid(context, state, left, width, height) {
	drawFrame(context, state, left, width, height, "STEPS", "ACTIVE CELLS");
	const gridSize = Math.min(132, width - 54, height - 92);
	const gap = Math.max(4, gridSize * 0.06);
	const cellSize = (gridSize - gap * 3) / 4;
	const startX = left + (width - gridSize) / 2;
	const startY = 52 + (height - 92 - gridSize) / 2;
	const activeCells = Math.round(state.value);
	context.fillStyle = getComputedStyle(canvas).color;

	for (let cell = 0; cell < 16; cell += 1) {
		const column = cell % 4;
		const row = Math.floor(cell / 4);
		context.globalAlpha = cell < activeCells ? 0.9 : 0.13;
		const inset = state.dragging && cell < activeCells ? 0 : 2;
		context.fillRect(
			startX + column * (cellSize + gap) + inset,
			startY + row * (cellSize + gap) + inset,
			cellSize - inset * 2,
			cellSize - inset * 2,
		);
	}
	context.font = "13px ui-sans-serif, system-ui, sans-serif";
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
	amountControl.dispose();
	stepsControl.dispose();
	parameters.unregisterControl(amountControl);
	parameters.unregisterControl(stepsControl);
	parameters.disconnect();
}
