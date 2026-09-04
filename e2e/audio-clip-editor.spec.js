import { expect, test } from "@playwright/test";

const localBaseURL = process.env.COMPOST_TEST_BASE_URL ?? "";

test("waveform owns a clamped copy of peaks and repaints at rendered size", async ({
	page,
}) => {
	await page.goto(`${localBaseURL}/examples/compost-waveform/`);
	const waveform = page.locator("compost-waveform");
	await expect(waveform).toHaveAttribute("role", "img");

	const state = await waveform.evaluate(async (element) => {
		const input = [
			{ min: -2, max: 2 },
			{ min: 0.8, max: -0.4 },
			{ min: Number.NaN, max: 1 },
		];
		element.peaks = input;
		input[0].min = 0;
		element.setAttribute("label", "Updated waveform");
		element.style.height = "72px";
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve)),
		);
		const canvas = element.shadowRoot.querySelector("canvas");
		const rect = canvas.getBoundingClientRect();
		return {
			peaks: element.peaks,
			canvas: [canvas.width, canvas.height],
			css: [rect.width, rect.height],
			label: element.getAttribute("aria-label"),
			description: element.getAttribute("aria-description"),
		};
	});

	expect(state.peaks).toEqual([
		{ min: -1, max: 1 },
		{ min: -0.4, max: 0.8 },
	]);
	expect(state.canvas[0]).toBeGreaterThanOrEqual(Math.round(state.css[0]));
	expect(state.canvas[1]).toBeGreaterThanOrEqual(Math.round(state.css[1]));
	expect(state.label).toBe("Updated waveform");
	expect(state.description).toContain("2 peak buckets");
});

test("audio clip editor composes the waveform and edits bounded clip metadata", async ({
	page,
}) => {
	await page.goto(`${localBaseURL}/examples/compost-audio-clip-editor/`);
	const editor = page.locator("compost-audio-clip-editor");
	await expect(editor).toHaveAttribute("role", "group");
	await expect(editor.locator("compost-waveform")).toHaveCount(1);

	const targets = await editor.evaluate((element) => {
		element.testEvents = [];
		for (const type of [
			"range-input",
			"range-change",
			"loop-input",
			"loop-change",
			"gain-input",
			"gain-change",
			"audio-file-drop",
		])
			element.addEventListener(type, (event) =>
				element.testEvents.push([type, event.detail]),
			);
		const range = element.shadowRoot
			.querySelector(".range-handle.start")
			.getBoundingClientRect();
		const loop = element.shadowRoot
			.querySelector(".loop-handle.start")
			.getBoundingClientRect();
		return {
			range: [range.width, range.height],
			loop: [loop.width, loop.height],
			px: element.pxPerBeat,
			value: element.value,
		};
	});
	expect(targets.range[0]).toBeGreaterThanOrEqual(30);
	expect(targets.range[1]).toBeGreaterThanOrEqual(20);
	expect(targets.loop[0]).toBeGreaterThanOrEqual(22);
	expect(targets.loop[1]).toBeGreaterThanOrEqual(18);
	expect(targets.value).toEqual({
		playStartBeat: 1,
		playEndBeat: 15,
		loopStartBeat: 4,
		loopEndBeat: 12,
		gainDb: 0,
	});

	const rangeStart = editor.locator(".range-handle.start");
	const rangeBox = await rangeStart.boundingBox();
	await page.mouse.move(
		rangeBox.x + rangeBox.width / 2,
		rangeBox.y + rangeBox.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		rangeBox.x + rangeBox.width / 2 + targets.px,
		rangeBox.y + rangeBox.height / 2,
	);
	await page.mouse.up();
	expect(await editor.evaluate((element) => element.value.playStartBeat)).toBe(
		2,
	);

	const loopRegion = editor.locator(".region");
	const loopBox = await loopRegion.boundingBox();
	await page.mouse.move(
		loopBox.x + loopBox.width / 2,
		loopBox.y + loopBox.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		loopBox.x + loopBox.width / 2 + 2 * targets.px,
		loopBox.y + loopBox.height / 2,
	);
	await page.mouse.up();
	expect(
		await editor.evaluate((element) => [element.loopStart, element.loopEnd]),
	).toEqual([6, 14]);

	const gain = await editor.evaluate((element) => {
		const input = element.shadowRoot.querySelector('.gain input[type="range"]');
		input.value = "-6";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		element.setAttribute("playhead", "7");
		input.dispatchEvent(new Event("change", { bubbles: true }));
		return {
			value: element.value.gainDb,
			attribute: element.getAttribute("gain"),
		};
	});
	expect(gain).toEqual({ value: -6, attribute: "-6" });

	await editor.evaluate((element) => {
		const data = new DataTransfer();
		data.items.add(new File(["audio"], "take.wav", { type: "audio/wav" }));
		element.shadowRoot
			.querySelector(".gridwrap")
			.dispatchEvent(
				new DragEvent("drop", { bubbles: true, dataTransfer: data }),
			);
	});
	const events = await editor.evaluate((element) =>
		element.testEvents.map(([type, detail]) => [
			type,
			detail.file?.name ?? detail,
		]),
	);
	expect(events.map(([type]) => type)).toEqual(
		expect.arrayContaining([
			"range-input",
			"range-change",
			"loop-input",
			"loop-change",
			"gain-input",
			"gain-change",
			"audio-file-drop",
		]),
	);
	expect(events).toContainEqual(["audio-file-drop", "take.wav"]);

	const resized = await editor.evaluate(async (element) => {
		const sizes = [];
		for (const height of [120, 420]) {
			element.style.height = `${height}px`;
			await new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
			const frame = element.shadowRoot
				.querySelector(".frame")
				.getBoundingClientRect();
			const waveform = element.shadowRoot
				.querySelector("compost-waveform")
				.getBoundingClientRect();
			sizes.push({ frame: frame.height, waveform: waveform.height });
		}
		return sizes;
	});
	expect(resized[0].frame).toBeCloseTo(120, 0);
	expect(resized[0].waveform).toBeGreaterThan(60);
	expect(resized[1].frame).toBeCloseTo(420, 0);
	expect(resized[1].waveform).toBeGreaterThan(resized[0].waveform);
});
