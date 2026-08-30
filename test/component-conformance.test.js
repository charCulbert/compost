import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);

// Common boolean contracts. Components absent from a column do not promise it.
const componentContracts = [
	{ id: "compost-button", disabled: true },
	{ id: "compost-clip-grid", disabled: true },
	{ id: "compost-device-selector", disabled: true },
	{ id: "compost-envelope-editor", disabled: true, readonly: true },
	{ id: "compost-knob", disabled: true },
	{ id: "compost-midi-mappings", disabled: true },
	{ id: "compost-note-editor", disabled: true, readonly: true },
	{ id: "compost-number-box", disabled: true },
	{ id: "compost-select", disabled: true },
	{ id: "compost-slider", disabled: true },
	{ id: "compost-timeline", disabled: true, readonly: true },
];

test("common boolean attributes have reflected properties", () => {
	for (const contract of componentContracts) {
		const source = fs.readFileSync(
			path.join(root, `src/components/${contract.id}.js`),
			"utf8",
		);
		const declaration = fs.readFileSync(
			path.join(root, `src/components/${contract.id}.d.ts`),
			"utf8",
		);
		for (const name of ["disabled", "readonly"]) {
			if (!contract[name]) continue;
			assert.match(
				source,
				new RegExp(`['"]${name}['"]`, "u"),
				`${contract.id} observes ${name}`,
			);
			assert.match(
				source,
				new RegExp(`get ${name}\\s*\\(`, "u"),
				`${contract.id}.${name} getter`,
			);
			assert.match(
				source,
				new RegExp(`set ${name}\\s*\\(`, "u"),
				`${contract.id}.${name} setter`,
			);
			assert.match(
				declaration,
				new RegExp(`get ${name}\\(\\): boolean`, "u"),
				`${contract.id}.${name} declared getter`,
			);
			assert.match(
				declaration,
				new RegExp(`set ${name}\\(value: boolean\\)`, "u"),
				`${contract.id}.${name} declared setter`,
			);
		}
	}
});

test("every public JavaScript export has a declaration", () => {
	const packageJSON = JSON.parse(
		fs.readFileSync(path.join(root, "package.json"), "utf8"),
	);
	for (const target of new Set(Object.values(packageJSON.exports))) {
		assert.equal(target.endsWith(".js"), true, target);
		assert.equal(
			fs.existsSync(path.join(root, target.replace(/\.js$/u, ".d.ts"))),
			true,
			target,
		);
	}
});

test("every timeline intent is present in its public detail map", () => {
	const source = fs.readFileSync(
		path.join(root, "src/components/compost-timeline.js"),
		"utf8",
	);
	const declaration = fs.readFileSync(
		path.join(root, "src/components/compost-timeline.d.ts"),
		"utf8",
	);
	const emitted = [...source.matchAll(/eventOf\(["']([^"']+)["']/gu)].map(
		(match) => match[1],
	);
	for (const name of new Set(emitted)) {
		assert.match(declaration, new RegExp(`['"]?${name}['"]?:`, "u"), name);
	}
	assert.match(declaration, /["']locator-prev["']:/u);
	assert.match(declaration, /["']locator-next["']:/u);
});

// Public attributes supported outside attributeChangedCallback.
const publicAttributeExtras = new Map([
	["compost-audio", ["modal"]],
	["compost-button", ["parameter-kind"]],
	["compost-drawer", ["resizable"]],
	["compost-knob", ["parameter-kind"]],
	["compost-midi", ["sysex"]],
	["compost-number-box", ["parameter-kind"]],
	["compost-select", ["parameter-kind"]],
	["compost-slider", ["parameter-kind"]],
]);

function observedAttributeNames(source) {
	const block = source.match(
		/static get observedAttributes\(\)\s*\{[\s\S]*?\n\s*\}/u,
	);
	assert.ok(block, "observedAttributes block");
	return new Set(
		[...block[0].matchAll(/["']([a-z][a-z0-9-]*)["']/gu)].map(
			(match) => match[1],
		),
	);
}

test("every observed attribute is declared with an exact @attribute tag", () => {
	const files = fs
		.readdirSync(path.join(root, "src/components"))
		.filter((file) => file.startsWith("compost-") && file.endsWith(".js"));
	for (const file of files) {
		const id = file.replace(/\.js$/u, "");
		const source = fs.readFileSync(
			path.join(root, "src/components", file),
			"utf8",
		);
		const declaration = fs.readFileSync(
			path.join(root, `src/components/${id}.d.ts`),
			"utf8",
		);
		const declared = new Set(
			[...declaration.matchAll(/@attribute ([a-z][a-z0-9-]*)/gu)].map(
				(match) => match[1],
			),
		);
		const expected = new Set(observedAttributeNames(source));
		for (const name of publicAttributeExtras.get(id) ?? []) expected.add(name);
		assert.deepEqual(declared, expected, `${id} @attribute list`);
	}
});

test("moved public types remain available from their original modules", () => {
	const noteEditor = fs.readFileSync(
		path.join(root, "src/components/compost-note-editor.js"),
		"utf8",
	);
	const noteEditorDeclaration = fs.readFileSync(
		path.join(root, "src/components/compost-note-editor.d.ts"),
		"utf8",
	);
	const parameterControllerDeclaration = fs.readFileSync(
		path.join(root, "src/parameter-controller.d.ts"),
		"utf8",
	);
	assert.match(
		noteEditor,
		/export \{ rulerLabels \} from ["']\.\.\/internal\/time-ruler\.js["']/u,
	);
	assert.match(noteEditorDeclaration, /export function rulerLabels\(/u);
	assert.match(
		parameterControllerDeclaration,
		/export type \{ ParameterKind \} from ["']\.\/utils\.js["']/u,
	);
});

test("public envelope geometry declarations match their object-range overloads", () => {
	const declaration = fs.readFileSync(
		path.join(root, "src/envelope-model.d.ts"),
		"utf8",
	);
	assert.match(
		declaration,
		/ValueToY\(\s*value: number,\s*range: \{\s*min: number;?\s*max: number\s*\},\s*height: number,\s*scale\?: ["']linear["'] \| ["']gain["']/u,
	);
	assert.match(
		declaration,
		/ValueFromY\(\s*y: number,\s*range: \{\s*min: number;?\s*max: number\s*\},\s*height: number,\s*scale\?: ["']linear["'] \| ["']gain["']/u,
	);
});

test("timeline preserves Element.scrollTo and exposes beat scrolling explicitly", () => {
	const source = fs.readFileSync(
		path.join(root, "src/components/compost-timeline.js"),
		"utf8",
	);
	const declaration = fs.readFileSync(
		path.join(root, "src/components/compost-timeline.d.ts"),
		"utf8",
	);
	assert.doesNotMatch(source, /^\s+scrollTo\(/mu);
	assert.match(source, /^\s+scrollToBeat\(beat\)/mu);
	assert.match(declaration, /scrollToBeat\(beat: number\): void/u);
	assert.doesNotMatch(declaration, /scroll to beat 0/u);
});
