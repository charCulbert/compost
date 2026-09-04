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
		element.setView(0.25, 0.75);
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve)),
		);
		const canvas = element.shadowRoot.querySelector("canvas");
		const rect = canvas.getBoundingClientRect();
		return {
			peaks: element.peaks,
			view: element.view,
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
	expect(state.view).toEqual({ start: 0.25, end: 0.75 });
	expect(state.canvas[0]).toBeGreaterThanOrEqual(Math.round(state.css[0]));
	expect(state.canvas[1]).toBeGreaterThanOrEqual(Math.round(state.css[1]));
	expect(state.label).toBe("Updated waveform");
	expect(state.description).toContain("2 peak buckets");

	const sampleRate = 8000;
	const sampleCount = 800;
	const audio = Buffer.alloc(44 + sampleCount * 2);
	audio.write("RIFF", 0);
	audio.writeUInt32LE(audio.length - 8, 4);
	audio.write("WAVEfmt ", 8);
	audio.writeUInt32LE(16, 16);
	audio.writeUInt16LE(1, 20);
	audio.writeUInt16LE(1, 22);
	audio.writeUInt32LE(sampleRate, 24);
	audio.writeUInt32LE(sampleRate * 2, 28);
	audio.writeUInt16LE(2, 32);
	audio.writeUInt16LE(16, 34);
	audio.write("data", 36);
	audio.writeUInt32LE(sampleCount * 2, 40);
	for (let index = 0; index < sampleCount; index += 1)
		audio.writeInt16LE(
			Math.round(Math.sin((index * Math.PI * 2 * 440) / sampleRate) * 12000),
			44 + index * 2,
		);
	await page.locator("[data-file]").setInputFiles({
		name: "tone.wav",
		mimeType: "audio/wav",
		buffer: audio,
	});
	await expect(page.locator("[data-status]")).toContainText(
		"the demo wrapper decoded 1 channel",
	);
	expect(
		await waveform.evaluate((element) => ({
			label: element.getAttribute("aria-label"),
			peaks: element.peaks.length,
		})),
	).toEqual({ label: "tone.wav waveform", peaks: 256 });
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
			"time-select-input",
			"time-select",
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
			state: {
				start: element.rangeStart,
				end: element.rangeEnd,
				loopStart: element.loopStart,
				loopEnd: element.loopEnd,
				gain: element.gain,
			},
		};
	});
	expect(targets.range[0]).toBeGreaterThanOrEqual(30);
	expect(targets.range[1]).toBeGreaterThanOrEqual(20);
	expect(targets.loop[0]).toBeGreaterThanOrEqual(22);
	expect(targets.loop[1]).toBeGreaterThanOrEqual(18);
	expect(targets.state).toEqual({
		start: 1,
		end: 15,
		loopStart: 4,
		loopEnd: 12,
		gain: 0,
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
	expect(await editor.evaluate((element) => element.rangeStart)).toBe(2);

	const cancelBox = await rangeStart.boundingBox();
	await page.mouse.move(
		cancelBox.x + cancelBox.width / 2,
		cancelBox.y + cancelBox.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		cancelBox.x + cancelBox.width / 2 + targets.px,
		cancelBox.y + cancelBox.height / 2,
	);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	expect(await editor.evaluate((element) => element.rangeStart)).toBe(2);

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

	const gridWrap = editor.locator(".gridwrap");
	const gridBox = await gridWrap.boundingBox();
	const gridY = gridBox.y + gridBox.height / 2;
	await page.mouse.click(gridBox.x + 3 * targets.px, gridY);
	expect(await editor.evaluate((element) => element.timeSelection)).toEqual({
		start: 3,
		end: 3,
	});
	await expect(editor.locator(".time-selection")).toHaveAttribute(
		"data-cursor",
		"",
	);

	await page.mouse.move(gridBox.x + 4 * targets.px, gridY);
	await page.mouse.down();
	await page.mouse.move(gridBox.x + 6 * targets.px, gridY, { steps: 4 });
	await page.mouse.up();
	expect(await editor.evaluate((element) => element.timeSelection)).toEqual({
		start: 4,
		end: 6,
	});

	await page.mouse.move(gridBox.x + 8 * targets.px, gridY);
	await page.mouse.down();
	await page.mouse.move(gridBox.x + 10 * targets.px, gridY, { steps: 4 });
	await page.keyboard.press("Escape");
	await page.mouse.up();
	expect(await editor.evaluate((element) => element.timeSelection)).toEqual({
		start: 4,
		end: 6,
	});
	await page.keyboard.press("Escape");
	expect(await editor.evaluate((element) => element.timeSelection)).toBeNull();

	const gain = await editor.evaluate((element) => {
		const input = element.shadowRoot.querySelector('.gain input[type="range"]');
		input.value = "-6";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		element.setAttribute("playhead", "7");
		input.dispatchEvent(new Event("change", { bubbles: true }));
		element.disabled = true;
		return {
			value: element.gain,
			attribute: element.getAttribute("gain"),
			disabledIsReadonly: element.readonly,
		};
	});
	expect(gain).toEqual({
		value: -6,
		attribute: "-6",
		disabledIsReadonly: true,
	});
	await editor.evaluate((element) => {
		element.disabled = false;
	});

	const pinch = await editor.evaluate((element) => {
		element.zoomReset();
		const target = element.shadowRoot.querySelector(".gridwrap");
		const rect = target.getBoundingClientRect();
		const point = (type, pointerId, x) =>
			target.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					cancelable: true,
					pointerId,
					pointerType: "touch",
					button: 0,
					buttons: type === "pointerup" ? 0 : 1,
					clientX: rect.left + rect.width * x,
					clientY: rect.top + rect.height / 2,
				}),
			);
		const fit = element.pxPerBeat;
		point("pointerdown", 1, 0.35);
		point("pointerdown", 2, 0.65);
		point("pointermove", 1, 0.2);
		point("pointermove", 2, 0.8);
		point("pointerup", 1, 0.2);
		point("pointerup", 2, 0.8);
		return {
			fit,
			px: element.pxPerBeat,
			pointers: element.pointers.size,
			pinch: element.pinch,
		};
	});
	expect(pinch.px).toBeGreaterThan(pinch.fit);
	expect(pinch.pointers).toBe(0);
	expect(pinch.pinch).toBeNull();

	const zoomed = await editor.evaluate((element) => {
		element.zoomReset();
		element.setAttribute("adaptive-grid", "");
		const target = element.shadowRoot.querySelector(".gridwrap");
		const rect = target.getBoundingClientRect();
		const before = { px: element.pxPerBeat, step: element.step };
		for (let index = 0; index < 6; index += 1)
			target.dispatchEvent(
				new WheelEvent("wheel", {
					bubbles: true,
					cancelable: true,
					ctrlKey: true,
					deltaY: -100,
					clientX: rect.left + rect.width * 0.6,
					clientY: rect.top + rect.height / 2,
				}),
			);
		return {
			before,
			px: element.pxPerBeat,
			step: element.step,
			offset: element.offset,
			view: element.shadowRoot.querySelector("compost-waveform").view,
			readout: element.shadowRoot.querySelector(".division").textContent,
		};
	});
	expect(zoomed.px).toBeGreaterThan(zoomed.before.px);
	expect(zoomed.step).toBeLessThan(zoomed.before.step);
	expect(zoomed.offset).toBeGreaterThan(0);
	expect(zoomed.view.start).toBeGreaterThan(0);
	expect(zoomed.view.end).toBeLessThan(1);
	expect(zoomed.readout).not.toBe("off");

	const panned = await editor.evaluate((element) => {
		const target = element.shadowRoot.querySelector(".gridwrap");
		const rect = target.getBoundingClientRect();
		target.dispatchEvent(
			new WheelEvent("wheel", {
				bubbles: true,
				cancelable: true,
				shiftKey: true,
				deltaY: 1_000_000,
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2,
			}),
		);
		return { offset: element.offset, maxOffset: element.maxOffset };
	});
	expect(panned.offset).toBeCloseTo(panned.maxOffset, 5);

	const zoomedPoint = await editor.evaluate((element) => {
		const rect = element.shadowRoot
			.querySelector(".gridwrap")
			.getBoundingClientRect();
		const raw = (element.offset + rect.width / 2) / element.pxPerBeat;
		return {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
			beat: Math.round(raw / element.step) * element.step,
		};
	});
	await page.mouse.click(zoomedPoint.x, zoomedPoint.y);
	expect(await editor.evaluate((element) => element.timeSelection)).toEqual({
		start: zoomedPoint.beat,
		end: zoomedPoint.beat,
	});

	await page.locator("[data-fit]").click();
	expect(
		await editor.evaluate((element) => ({
			px: element.pxPerBeat,
			offset: element.offset,
			view: element.shadowRoot.querySelector("compost-waveform").view,
		})),
	).toEqual({ px: targets.px, offset: 0, view: { start: 0, end: 1 } });

	await editor.evaluate((element) => element.removeAttribute("adaptive-grid"));
	await page.locator("[data-grid]").selectOption("off");
	await expect(editor).toHaveAttribute("grid-lines", "off");
	await expect(editor.locator(".division")).toHaveText("off");
	await page.locator("[data-grid]").selectOption("1/8");
	await expect(editor).toHaveAttribute("grid", "1/8");
	await expect(editor).not.toHaveAttribute("grid-lines", "off");
	await expect(editor.locator(".division")).toHaveText("1/8");

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
			"time-select-input",
			"time-select",
			"audio-file-drop",
		]),
	);
	expect(events.filter(([type]) => type === "range-change")).toEqual([
		["range-change", { start: 2, end: 15 }],
	]);
	expect(events).toContainEqual(["loop-change", { start: 6, end: 14 }]);
	expect(events).toContainEqual(["gain-change", { gain: -6 }]);
	expect(events).toContainEqual(["time-select", { start: 3, end: 3 }]);
	expect(events).toContainEqual(["time-select", { start: 4, end: 6 }]);
	expect(events).toContainEqual(["time-select", { start: null }]);
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

test("note editor playback markers expose the same keyboard semantics", async ({
	page,
}) => {
	await page.goto(`${localBaseURL}/examples/compost-note-editor/`);
	const editor = page.locator("compost-note-editor");
	const rangeStart = editor.locator(".range-handle.start");
	const loopRegion = editor.locator(".region");

	await expect(rangeStart).toHaveAttribute("role", "slider");
	await expect(rangeStart).toHaveAttribute("tabindex", "0");
	await expect(rangeStart).toHaveAttribute("aria-label", "Playback start");
	await expect(rangeStart).toHaveAttribute("aria-valuenow", "2.5");
	await expect(loopRegion).toHaveAttribute("aria-label", "Move loop region");
	expect(await loopRegion.evaluate((element) => element.tagName)).toBe(
		"BUTTON",
	);

	await editor.evaluate((element) => {
		element.testMarkerEvents = [];
		for (const type of ["range-input", "range-change"])
			element.addEventListener(type, (event) =>
				element.testMarkerEvents.push([type, event.detail]),
			);
	});
	await rangeStart.focus();
	await page.keyboard.press("ArrowRight");
	await expect(editor).toHaveAttribute("start", "2.75");
	await expect(rangeStart).toHaveAttribute("aria-valuenow", "2.75");
	expect(await editor.evaluate((element) => element.testMarkerEvents)).toEqual([
		["range-input", { start: 2.75, end: 9 }],
		["range-change", { start: 2.75, end: 9 }],
	]);
});
