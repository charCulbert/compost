import "../../src/components/index.js";
import "../shared/example-page.js";
import {
	isNoteOffMessage,
	isNoteOnMessage,
	noteFromMessage,
} from "../../src/midi.js";
import { createMIDIMappings } from "../../src/midi-mappings.js";
import { createParameterController } from "../../src/parameter-controller.js";
import { quantizedNotes } from "../../src/piano-roll-model.js";
import { nextPeakHold } from "../shared/meter-demo.js";

const values = {
	waveShape: 0,
	amplitude: 0.8,
	offset: 0,
	outputGain: 0.5,
	tempo: 150,
	attack: 0.001,
	decay: 0.08,
	sustain: 0.07,
	release: 0.08,
};
const displayValues = { scopeRange: 1, scopeOffset: 0 };
let pitchEnvelope = [
	{ time: 0, value: 12, curve: -0.35 },
	{ time: 0.15, value: -12 },
	{ time: 1, value: -12 },
];
const kickNotes = [
	{
		id: "kick-1",
		note: 48,
		start: 0,
		duration: 0.25,
		velocity: 110,
		channel: 0,
	},
	{
		id: "kick-2",
		note: 55,
		start: 1.5,
		duration: 0.0625,
		velocity: 100,
		channel: 0,
	},
	{ id: "kick-3", note: 46, start: 3, duration: 1, velocity: 105, channel: 0 },
];
let notes = kickNotes.map((note) => ({ ...note }));

const audioControl = document.querySelector("compost-audio");
const scope = document.querySelector("compost-scope");
const meter = document.querySelector("compost-meter");
const piano = document.querySelector("compost-piano");
const noteEditor = document.querySelector("compost-note-editor");
const envelopeEditor = document.querySelector("compost-envelope-editor");
const midi = document.querySelector("compost-midi");
const midiDrawer = document.querySelector(".midi-drawer");
const mappingsView = document.querySelector("compost-midi-mappings");
const mapToggle = document.querySelector("[data-midi-map-toggle]");
const playButton = document.querySelector("[data-transport-play]");
const stopButton = document.querySelector("[data-transport-stop]");
const xLabels = document.querySelector("[data-scope-x-labels]");
const yLabels = document.querySelector("[data-scope-y-labels]");
const midiActivity = document.querySelector("[data-midi-activity]");
const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameterProvider: parameters });
let audio = null;
let audioSetup = null;
let playing = true;
let nextNoteID = 4;
let midiActivityTimeout = 0;
let meterPeakHold = { level: -60, remaining: 0 };
let previousMeterTime = 0;

noteEditor.noteIdFactory = () => `note-${nextNoteID++}`;
noteEditor.notes = notes;
envelopeEditor.points = pitchEnvelope;
mappingsView.mappings = mappings;
mappings.addEventListener("midi-mapping-request", ({ detail }) =>
	mappings.applyMapping(detail),
);
mappings.addEventListener("midi-unmapping-request", ({ detail }) =>
	mappings.applyClear(detail.parameterID),
);
mappings.applyMappings([
	{ parameterID: "outputGain", cc: 7 },
	{ parameterID: "amplitude", cc: 20 },
	{ parameterID: "offset", cc: 71 },
	{ parameterID: "waveShape", cc: 79 },
	{ parameterID: "tempo", cc: 76 },
	{ parameterID: "attack", cc: 73 },
	{ parameterID: "decay", cc: 75 },
	{ parameterID: "sustain", cc: 70 },
	{ parameterID: "release", cc: 72 },
	{ parameterID: "scopeRange", cc: 77 },
	{ parameterID: "scopeOffset", cc: 78 },
]);

parameters.addEventListener("parameter-edit", ({ detail }) =>
	applyParameterIntent(detail),
);
mappings.addEventListener("midi-parameter", ({ detail }) =>
	applyParameterIntent({ ...detail, source: "midi" }),
);

mapToggle.addEventListener("click", () => {
	const active = mapToggle.getAttribute("aria-pressed") !== "true";
	mapToggle.setAttribute("aria-pressed", String(active));
	if (active) mappingsView.controller?.beginSelecting();
	else mappingsView.controller?.cancel("toolbar");
});

playButton.addEventListener("click", async () => {
	const context = await audioControl.start();
	if (!context) return;
	await setupAudio(context);
	setPlaying(true);
});

stopButton.addEventListener("click", () => setPlaying(false));

xLabels.addEventListener("input", () =>
	scope.setAttribute("x-marker-labels", xLabels.value),
);
yLabels.addEventListener("input", () =>
	scope.setAttribute("y-marker-labels", yLabels.value),
);

noteEditor.addEventListener("notes-change", ({ detail }) => {
	notes = detail.notes;
	noteEditor.notes = notes;
	postSequence();
});
noteEditor.addEventListener("note-quantize", ({ detail }) => {
	notes = quantizedNotes(notes, detail.step, {
		ids: detail.ids,
		lengths: detail.lengths,
		beats: noteEditor.beats,
	});
	noteEditor.notes = notes;
	postSequence();
});
noteEditor.addEventListener("note-preview", ({ detail }) =>
	postNote("noteOn", detail, "editor"),
);
noteEditor.addEventListener("note-preview-end", ({ detail }) =>
	postNote("noteOff", detail, "editor"),
);
noteEditor.addEventListener("loop-change", postSequence);
noteEditor.addEventListener("range-change", postSequence);

envelopeEditor.addEventListener("envelope-input", ({ detail }) =>
	postPitchEnvelope(detail.points),
);
envelopeEditor.addEventListener("envelope-change", ({ detail }) => {
	pitchEnvelope = detail.points;
	envelopeEditor.points = pitchEnvelope;
	postPitchEnvelope(pitchEnvelope);
});

function syncDrawerLayout() {
	document.body.toggleAttribute("data-midi-drawer-open", midiDrawer.open);
	const occupiesLeftEdge =
		midiDrawer.open && midiDrawer.getAttribute("edge") === "left";
	document.documentElement.style.setProperty(
		"--midi-drawer-space",
		occupiesLeftEdge ? `${midiDrawer.getBoundingClientRect().width}px` : "0px",
	);
}

const narrowLayout = matchMedia("(max-width: 44em)");
function syncDrawerEdge() {
	midiDrawer.setAttribute("edge", narrowLayout.matches ? "top" : "left");
	requestAnimationFrame(syncDrawerLayout);
}

midiDrawer.addEventListener("toggle", () =>
	requestAnimationFrame(syncDrawerLayout),
);
midiDrawer.addEventListener("drawer-resize", () =>
	requestAnimationFrame(syncDrawerLayout),
);
narrowLayout.addEventListener("change", syncDrawerEdge);
syncDrawerEdge();
mappingsView.addEventListener("midi-map-mode-change", ({ detail }) => {
	mapToggle.setAttribute("aria-pressed", String(detail.active));
	if (detail.active) midiDrawer.open = true;
});

midi.addEventListener("midi-input-selected", ({ detail }) =>
	midi.selectInput(detail.id),
);
midi.addEventListener("midi-message", (event) => {
	clearTimeout(midiActivityTimeout);
	midiActivity.classList.add("active");
	midiActivityTimeout = setTimeout(
		() => midiActivity.classList.remove("active"),
		60,
	);
	mappings.handleMIDIMessage(event);
	piano.handleExternalMIDI(event.detail.message);
	handlePackedNote(event.detail.message, "midi");
});

piano.addEventListener("note-down", ({ detail }) =>
	postNote("noteOn", detail, "piano"),
);
piano.addEventListener("note-up", ({ detail }) =>
	postNote("noteOff", detail, "piano"),
);

audioControl.addEventListener("audio-started", ({ detail }) =>
	setupAudio(detail.context),
);
audioControl.addEventListener("audio-stopped", cleanupAudio);

async function setupAudio(context) {
	if (audio?.context === context) return audio;
	if (audioSetup) return audioSetup;
	audioSetup = (async () => {
		cleanupAudio();
		await context.audioWorklet.addModule("./worklets/monosynth.js");
		const synth = new AudioWorkletNode(context, "compost-mono-synth", {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			outputChannelCount: [2],
			parameterData: values,
		});
		synth.connect(context.destination);
		synth.port.onmessage = ({ data }) => {
			if (
				data?.type !== "scope-samples" ||
				!(data.samples instanceof Float32Array) ||
				!(data.outputSamples instanceof Float32Array)
			)
				return;
			scope.setSamples(data.samples);
			updateMeter(data.outputSamples);
			noteEditor.playhead = data.beat;
			noteEditor.refresh();
		};
		audio = { context, synth };
		syncAudioParameters();
		postSequence();
		postPitchEnvelope(pitchEnvelope);
		synth.port.postMessage({ type: "transport", playing });
		return audio;
	})();
	try {
		return await audioSetup;
	} finally {
		audioSetup = null;
	}
}

function cleanupAudio() {
	audio?.synth.disconnect();
	audio = null;
	meterPeakHold = { level: -60, remaining: 0 };
	previousMeterTime = 0;
	meter.setState({
		primaryLabel: "Peak",
		secondaryLabel: "RMS",
		holdLabel: "Hold",
		unit: "dB",
		channels: [{ primary: -60, secondary: -60, peak: -60 }],
	});
}

function applyParameterIntent({ parameterID, value, source }) {
	setValue(parameterID, value, source);
}

function setPlaying(nextPlaying) {
	playing = nextPlaying;
	playButton.setAttribute("aria-pressed", String(playing));
	audio?.synth.port.postMessage({ type: "transport", playing });
}

function updateMeter(samples) {
	let peak = 0;
	let squares = 0;
	for (const sample of samples) {
		const magnitude = Math.abs(sample);
		peak = Math.max(peak, magnitude);
		squares += sample * sample;
	}
	const time = performance.now();
	const elapsed = previousMeterTime ? (time - previousMeterTime) / 1000 : 0;
	previousMeterTime = time;
	const peakLevel = decibels(peak);
	meterPeakHold = nextPeakHold(meterPeakHold, peakLevel, elapsed);
	meter.setState({
		primaryLabel: "Peak",
		secondaryLabel: "RMS",
		holdLabel: "Hold",
		unit: "dB",
		channels: [
			{
				primary: peakLevel,
				secondary: decibels(Math.sqrt(squares / samples.length)),
				peak: meterPeakHold.level,
				clipped: peak >= 1,
			},
		],
	});
}

function decibels(value) {
	return Math.max(-60, 20 * Math.log10(Math.max(value, 0.001)));
}

function setValue(parameterID, value, source) {
	if (parameterID in values) setParameter(parameterID, value, source);
	else if (parameterID in displayValues)
		setDisplayValue(parameterID, value, source);
}

function setParameter(parameterID, value, source) {
	if (!(parameterID in values)) return;
	values[parameterID] = Number(value);
	parameters.applyValue(parameterID, values[parameterID], { source });
	const parameter = audio?.synth.parameters.get(parameterID);
	if (parameter)
		parameter.setTargetAtTime(
			values[parameterID],
			audio.context.currentTime,
			0.01,
		);
}

function setDisplayValue(parameterID, value, source) {
	displayValues[parameterID] = Number(value);
	parameters.applyValue(parameterID, displayValues[parameterID], { source });
	if (parameterID === "scopeRange")
		scope.setAttribute("value-range", String(displayValues[parameterID]));
	if (parameterID === "scopeOffset")
		scope.setAttribute("y-offset", String(displayValues[parameterID]));
}

function syncAudioParameters() {
	for (const [id, value] of Object.entries(values))
		setParameter(id, value, "setup");
}

function postPitchEnvelope(points) {
	audio?.synth.port.postMessage({ type: "pitchEnvelope", points });
}

function postSequence() {
	audio?.synth.port.postMessage({
		type: "sequence",
		notes,
		loopStart: noteEditor.loopEnabled
			? noteEditor.loopStart
			: noteEditor.rangeStart,
		loopEnd: noteEditor.loopEnabled ? noteEditor.loopEnd : noteEditor.rangeEnd,
	});
}

function postNote(type, detail, source) {
	audio?.synth.port.postMessage({ type, source, ...detail });
}

function handlePackedNote(message, source) {
	const detail = { note: noteFromMessage(message), velocity: 100, channel: 0 };
	if (isNoteOnMessage(message)) postNote("noteOn", detail, source);
	else if (isNoteOffMessage(message)) postNote("noteOff", detail, source);
}

cleanupAudio();
