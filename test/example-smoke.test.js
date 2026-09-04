import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { elementIDs, examples } from "../examples/shared/catalog.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);

test("the repository root redirects to the examples page", () => {
	const html = read("index.html");
	assert.match(html, /http-equiv="refresh" content="0; url=\.\/examples\/"/u);
});

test("the no-cache example server and checker share port 8000 by default", () => {
	assert.match(read("examples/serve.py"), /else 8000/u);
	assert.match(
		read("examples/check-example.mjs"),
		/process\.argv\[3\] \|\| ["']8000["']/u,
	);
	assert.match(
		read("examples/check-example.mjs"),
		/const root = resolve\(here, ["']\.\.["']\)/u,
	);
	assert.match(read("examples/check-example.mjs"), /process\.exitCode = 1/u);
});

test("the Pages assembly only copies tracked site directories", () => {
	const workflow = read(".github/workflows/pages.yml");
	assert.match(workflow, /cp -R examples src _site\//u);
	assert.doesNotMatch(workflow, /cp -R docs/u);
});

test("every catalog entry has one concise, specific summary", () => {
	for (const example of examples) {
		assert.equal(typeof example.summary, "string", example.id);
		assert.ok(
			example.summary.length > 0 && example.summary.length <= 70,
			example.id,
		);
		assert.doesNotMatch(
			example.summary,
			/\n|scenario with defaults/u,
			example.id,
		);
	}
});

test("every element example is its own page sharing the common shell", () => {
	const helper = read("examples/shared/element-page.js");
	for (const id of elementIDs) {
		assert.equal(
			examples.some(
				(example) => example.id === id && example.href === `./${id}/`,
			),
			true,
			id,
		);
		const page = read(`examples/${id}/index.html`);
		assert.match(
			page,
			new RegExp(`data-example-id="${id}"`, "u"),
			`${id} shell`,
		);
		assert.match(page, /<div class="row">/u, `${id} row`);
		assert.doesNotMatch(
			page,
			/<h2>Default<\/h2>/u,
			`${id} has no filler heading`,
		);
		assert.doesNotMatch(page, /<pre id="markup"/u, `${id} has no source dump`);
		assert.match(
			page,
			/shared\/element-page\.js/u,
			`${id} uses the shared helper`,
		);
		assert.match(
			page,
			new RegExp(`elementDemo\\('${id}`),
			`${id} mounts its demo`,
		);
	}
	assert.match(helper, /example-page\.js/u);
	assert.doesNotMatch(helper, /\breview\b/u);
});

test("the shared example readout includes every literal component event", () => {
	const helper = read("examples/shared/element-page.js");
	const readoutBlock = helper.match(
		/const EVENT_READOUT_IDS = new Set\(\[([^;]+)\]\)/su,
	);
	assert.ok(readoutBlock);
	const readoutIDs = new Set(
		[...readoutBlock[1].matchAll(/["']([^"']+)["']/gu)].map(
			(match) => match[1],
		),
	);
	for (const id of [
		"compost-audio",
		"compost-drawer",
		"compost-knob",
		"compost-midi-mappings",
		"compost-number-box",
		"compost-select",
		"compost-slider",
	])
		assert.equal(readoutIDs.has(id), true, id);
	for (const id of ["compost-meter", "compost-midi-monitor", "compost-scope"])
		assert.equal(readoutIDs.has(id), false, id);
	const block = helper.match(/const EVENT_TYPES = \[([^;]+)\]/su);
	assert.ok(block);
	const declared = new Set(
		[...block[1].matchAll(/["']([^"']+)["']/gu)].map((match) => match[1]),
	);
	const componentSource = filesUnder("src/components")
		.filter((file) => file.endsWith(".js"))
		.map(read)
		.join("\n");
	const emitted = [
		...componentSource.matchAll(
			/(?:new CustomEvent|eventOf)\(["']([^"']+)["']/gu,
		),
	].map((match) => match[1]);
	for (const type of new Set(emitted))
		assert.equal(declared.has(type), true, type);
	for (const type of ["locator-prev", "locator-next"])
		assert.equal(declared.has(type), true, type);
	assert.match(helper, /const elements = s\.querySelectorAll\(id\)/u);
	assert.match(helper, /EVENT_READOUT_IDS\.has\(id\)/u);
	assert.match(helper, /if \(payload === undefined\) return/u);
	assert.match(helper, /for \(const element of elements\)/u);
	assert.match(helper, /element\.addEventListener\(type/u);
	assert.doesNotMatch(helper, /s\.addEventListener\(type/u);
});

test("example instructions separate desktop and mobile usage", () => {
	for (const id of [
		"compost-clip-grid",
		"compost-drawer",
		"compost-envelope-editor",
		"compost-audio-clip-editor",
		"compost-knob",
		"compost-midi-mappings",
		"compost-note-editor",
		"compost-number-box",
		"compost-piano",
		"compost-popup",
		"compost-slider",
		"compost-timeline",
		"compost-window",
	]) {
		const page = read(`examples/${id}/index.html`);
		assert.match(page, /class="usage-notes"/u, id);
		assert.match(page, /<strong>Desktop<\/strong>/u, id);
		assert.match(page, /<strong>Mobile<\/strong>/u, id);
		assert.doesNotMatch(page, /Touch:|Mouse:/u, id);
	}
	const numberBox = read("examples/compost-number-box/index.html");
	assert.match(numberBox, /double-click to reset/iu);
	assert.doesNotMatch(numberBox, /double-click to type/iu);
	const noteEditor = read("examples/compost-note-editor/index.html");
	assert.match(noteEditor, /data-note-fit/u);
	assert.match(noteEditor, /data-note-fit[^\n]+zoomReset\(\)/u);
});

test("the meter example keeps its output name accessible but visually quiet", () => {
	const page = read("examples/compost-meter/index.html");
	assert.match(page, /<compost-meter label="Output"/u);
	assert.match(page, /compost-meter::part\(label\) \{ display: none; \}/u);
});

test("browser tests contain no diagnostic logging", () => {
	assert.doesNotMatch(
		read("e2e/compost.spec.js"),
		/console\.log\('U-22 rows'/u,
	);
});

test("every example page shares the light and dark color-scheme toggle", () => {
	const toggle = read("examples/shared/color-scheme.js");
	const styles = read("examples/shared/styles.css");
	assert.match(toggle, /dataset\.colorScheme/u);
	assert.match(toggle, /Light mode/u);
	assert.match(toggle, /Dark mode/u);
	assert.match(styles, /--bg: Canvas/u);
	assert.match(styles, /data-color-scheme="dark"/u);
	assert.match(read("examples/shared/example-page.js"), /color-scheme\.js/u);
	assert.match(read("examples/monosynth/main.js"), /example-page\.js/u);
});

test("the retired theme surface stays out of source and examples", () => {
	const packageJSON = JSON.parse(read("package.json"));
	const exampleText = filesUnder("examples")
		.filter((file) => /\.(?:css|html|js)$/u.test(file))
		.map(read)
		.join("\n");
	assert.equal(fs.existsSync(path.join(root, "src/themes.css")), false);
	assert.equal(packageJSON.exports["./themes"], undefined);
	assert.doesNotMatch(
		exampleText,
		/data-compost-theme|data-shared-theme-group|themes\.css/u,
	);
});

test("the Mono Synth uses current editor and one-channel scope contracts", () => {
	const html = read("examples/monosynth/index.html");
	const main = read("examples/monosynth/main.js");
	const worklet = read("examples/monosynth/worklets/monosynth.js");
	assert.match(html, /<compost-scope[^>]+value-range="1"/u);
	assert.match(html, /<compost-meter/u);
	assert.match(html, /<compost-number-box[^>]+parameter-id="scopeRange"/u);
	assert.match(html, /data-scope-x-labels[^>]+value=""/u);
	assert.match(html, /class="app-frame"/u);
	assert.match(html, /<compost-select[^>]+parameter-id="waveShape"/u);
	assert.doesNotMatch(`${html}\n${main}`, /data-synth-preset|applyPreset/u);
	assert.match(html, /<section class="sequence-panel">/u);
	assert.match(html, /<compost-envelope-editor/u);
	assert.match(html, /label="Pitch envelope"/u);
	for (const id of ["attack", "decay", "sustain", "release"]) {
		assert.match(html, new RegExp(`parameter-id="${id}"`, "u"));
	}
	assert.match(
		html,
		/<compost-note-editor[^>]+\bloop[^>]+adaptive-grid[^>]+note-count="25"/u,
	);
	assert.doesNotMatch(html, /fixed-viewport/u);
	assert.doesNotMatch(html, /<compost-envelope-editor[^>]+\bgrid=/u);
	assert.match(
		html,
		/class="transport header-transport"[^>]*>[\s\S]*data-transport-play/u,
	);
	assert.match(html, /data-transport-stop/u);
	assert.match(main, /playing = true/u);
	assert.match(html, /parameter-id="tempo"[^>]+value="150"/u);
	assert.match(main, /tempo: 150/u);
	assert.match(main, /scope\.setSamples\(data\.samples\)/u);
	assert.doesNotMatch(
		`${html}\n${main}\n${worklet}`,
		/phaseReset|resetPhase|transpose/u,
	);
	assert.match(main, /noteEditor\.addEventListener\(["']notes-change["']/u);
	assert.match(main, /loopStart: noteEditor\.loopEnabled/u);
	assert.match(main, /loopEnd: noteEditor\.loopEnabled/u);
	assert.match(
		main,
		/envelopeEditor\.addEventListener\(["']envelope-change["']/u,
	);
	assert.match(main, /type: ["']pitchEnvelope["']/u);
	assert.match(main, /kickNotes/u);
	assert.match(main, /isNoteOffMessage/u);
	assert.match(worklet, /type: ["']scope-samples["'], samples, outputSamples/u);
	assert.match(worklet, /this\.stage = ["']release["']/u);
	assert.match(worklet, /pitchEnvelopeValue/u);
	assert.match(worklet, /this\.playing/u);
	assert.doesNotMatch(
		`${html}\n${main}\n${worklet}`,
		/parameter-id="mute"|name: ["']mute["']|parameters\.mute/u,
	);
	assert.doesNotMatch(
		`${html}\n${main}`,
		/scopeWindow|scopeSamples|scopePeriods|scopeCapture|publishScopeWindow/u,
	);
	assert.doesNotMatch(
		`${html}\n${main}`,
		/triggerSamples|source-channels|trigger-channel|periods-shown|samples-shown|captureTrigger/u,
	);
	assert.match(main, /createParameterController/u);
	assert.match(main, /createMIDIMappings/u);
});

test("the integrated MIDI and parameter examples use current intent APIs", () => {
	const midiHTML = read("examples/midi-controller/index.html");
	const midiMain = read("examples/midi-controller/main.js");
	const syncMain = read("examples/parameter-sync/main.js");
	assert.match(midiHTML, /mode="trigger" parameter-id="all-notes-off"/u);
	assert.match(midiMain, /midi-output-selected[\s\S]+?selectOutput/u);
	assert.match(midiMain, /button-trigger/u);
	assert.match(syncMain, /createParameterController/u);
	assert.match(syncMain, /parameters\.applyValue/u);
});

test("README is the finished product documentation", () => {
	const readme = read("README.md");
	for (const id of elementIDs)
		assert.match(readme, new RegExp(`\`${id}\``, "u"), id);
	assert.match(readme, /not form-associated/u);
	assert.doesNotMatch(readme, /\breview\b/u);
	assert.equal(
		fs.existsSync(path.join(root, "docs/plans/2026-08-26-plain-html-style.md")),
		false,
	);
});

function read(file) {
	return fs.readFileSync(path.join(root, file), "utf8");
}

function filesUnder(directory) {
	const walk = (relative) =>
		fs
			.readdirSync(path.join(root, relative), { withFileTypes: true })
			.flatMap((entry) =>
				entry.isDirectory()
					? walk(path.join(relative, entry.name))
					: [path.join(relative, entry.name)],
			);
	return walk(directory);
}
