import "../../src/components/compost-midi.js";
import "../../src/components/compost-piano.js";
import "../../src/components/compost-knob.js";
import "../../src/components/compost-button.js";

const midi = document.querySelector("compost-midi");
const keyboard = document.querySelector("compost-piano");
const logElement = document.querySelector("[data-log]");
const DEFAULT_VELOCITY = 100;
midi.addEventListener("midi-output-selected", ({ detail }) =>
	midi.selectOutput(detail.id),
);
const ccKnobs = [...document.querySelectorAll("[data-cc-knob]")].map(
	(knob, index) => {
		const name = knob.getAttribute("name");
		const assignment = document.querySelector(`[data-cc-assignment="${name}"]`);
		const state = {
			name,
			knob,
			assignment,
			cc: clampMidiValue(readNumber(assignment?.value, 20 + index)),
			value: clampMidiValue(readNumber(knob.getAttribute("value"), 64)),
		};

		setKnobCC(state, state.cc);

		assignment?.addEventListener("input", () => {
			const nextCC = parseAssignableCC(assignment.value);
			if (nextCC !== null) setKnobCC(state, nextCC);
		});

		assignment?.addEventListener("change", () => {
			const nextCC = parseAssignableCC(assignment.value) ?? state.cc;
			setKnobCC(state, nextCC);
			writeLog(`${knobLabel(state)} assigned to CC ${state.cc}`);
		});

		return state;
	},
);
const ccKnobsByName = new Map(ccKnobs.map((state) => [state.name, state]));

document.addEventListener("parameter-edit", (event) => {
	const name = event.detail.parameterID;

	if (ccKnobsByName.has(name)) {
		sendKnobCC(name, event.detail.value, "knob");
	}
});

document
	.querySelector('compost-button[parameter-id="all-notes-off"]')
	.addEventListener("button-trigger", panic);

keyboard.addEventListener("note-down", (event) => {
	const note = clampMidiValue(event.detail.note);
	midiSendAllChannels(0x90, note, DEFAULT_VELOCITY);
	writeLog(`note on  all ch note ${note} vel ${DEFAULT_VELOCITY}`);
});

keyboard.addEventListener("note-up", (event) => {
	const note = clampMidiValue(event.detail.note);
	midiSendAllChannels(0x80, note, 0);
	writeLog(`note off all ch note ${note}`);
});

function sendKnobCC(name, value, source) {
	const state = ccKnobsByName.get(name);
	if (!state) return;

	state.value = clampMidiValue(value);
	const cc = clampMidiValue(state.cc);
	midiSendAllChannels(0xb0, cc, state.value);
	writeLog(`${source} ${knobLabel(state)} all ch CC ${cc} = ${state.value}`);
}

function setKnobCC(state, cc) {
	state.cc = clampMidiValue(cc);
	if (state.assignment) state.assignment.value = String(state.cc);
}

function parseAssignableCC(value) {
	if (String(value).trim() === "") return null;
	const cc = Number(value);
	return Number.isFinite(cc) ? clampMidiValue(cc) : null;
}

function readNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function knobLabel(state) {
	return state.knob.getAttribute("label") || state.name;
}

function panic() {
	for (let channel = 0; channel < 16; channel += 1) {
		midi.send([0xb0 | channel, 123, 0]);
		midi.send([0xb0 | channel, 120, 0]);
	}

	keyboard.allNotesOff();
	writeLog("all notes off on all channels");
}

function midiSendAllChannels(status, data1, data2) {
	for (let channel = 0; channel < 16; channel += 1) {
		midi.send([status | channel, data1, data2]);
	}
}

function clampMidiValue(value) {
	return Math.max(0, Math.min(127, Math.round(value)));
}

function writeLog(line) {
	const next = `${new Date().toLocaleTimeString()}  ${line}\n${logElement.textContent}`;
	logElement.textContent = next.split("\n").slice(0, 80).join("\n");
}
