import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.COMPOST_URL || "http://127.0.0.1:8000" });

test("audio editor upgrades cleanly and emits context intent from ruler and waveform", async ({
	page,
}) => {
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/examples/compost-audio-clip-editor/");
	const editor = page.locator("compost-audio-clip-editor").first();
	await expect(editor).toHaveAttribute("role", "group");
	const details = await editor.evaluate((element) => {
		const received = [];
		element.addEventListener("audio-context", (event) =>
			received.push(event.detail),
		);
		for (const selector of [".ruler", ".gridwrap"]) {
			const target = element.shadowRoot.querySelector(selector);
			const bounds = target.getBoundingClientRect();
			target.dispatchEvent(
				new MouseEvent("contextmenu", {
					bubbles: true,
					cancelable: true,
					clientX: bounds.left + 30,
					clientY: bounds.top + 5,
				}),
			);
		}
		return received;
	});
	expect(details).toHaveLength(2);
	for (const detail of details) expect(Number.isFinite(detail.beat)).toBe(true);
	expect(errors).toEqual([]);
});

test("warp pins preview across the waveform, cancel, commit once and stay between neighbors", async ({
	page,
}) => {
	await page.goto("/examples/compost-audio-clip-editor/");
	const editor = page.locator("compost-audio-clip-editor").first();
	await expect(editor).toHaveAttribute("role", "group");
	await editor.evaluate((element) => {
		element.setAttribute("warp", "");
		element.warpMarkers = [
			{ id: "a", beat: 4 },
			{ id: "b", beat: 12 },
		];
		element.warpEvents = [];
		for (const type of ["warp-input", "warp-change", "warp-remove"])
			element.addEventListener(type, (event) =>
				element.warpEvents.push({ type, ...event.detail }),
			);
	});
	const marker = editor.locator('[data-warp-id="a"]');
	const grid = await editor.locator(".gridwrap").boundingBox();
	let bounds = await marker.boundingBox();
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await page.mouse.down();
	// Deliberate capture loss reproduces the prior marker-drag failure mode.
	await editor.evaluate((element) =>
		element.shadowRoot
			.querySelector('[data-warp-id="a"]')
			.releasePointerCapture(element.warpDrag.pointerId),
	);
	await page.mouse.move(grid.x + grid.width * 0.55, grid.y + 60, { steps: 5 });
	expect(
		await editor.evaluate((element) => element.warpMarkers[0].beat),
	).toBeGreaterThan(4);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	expect(await editor.evaluate((element) => element.warpMarkers[0].beat)).toBe(
		4,
	);
	expect(
		await editor.evaluate(
			(element) =>
				element.warpEvents.filter((event) => event.type === "warp-change")
					.length,
		),
	).toBe(0);
	bounds = await marker.boundingBox();
	await page.mouse.move(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(grid.x + grid.width * 0.95, grid.y + 70, { steps: 5 });
	await page.mouse.up();
	const beat = await editor.evaluate((element) => element.warpMarkers[0].beat);
	expect(beat).toBeLessThan(12);
	expect(beat).toBeGreaterThan(4);
	expect(
		await editor.evaluate(
			(element) =>
				element.warpEvents.filter((event) => event.type === "warp-change")
					.length,
		),
	).toBe(1);
	await page.mouse.move(grid.x, grid.y + 30);
	expect(await editor.evaluate((element) => element.warpMarkers[0].beat)).toBe(
		beat,
	);
	await marker.focus();
	await page.keyboard.press("ArrowLeft");
	expect(
		await editor.evaluate((element) => element.warpMarkers[0].beat),
	).toBeLessThan(beat);
	await page.keyboard.press("Delete");
	expect(await editor.evaluate((element) => element.warpEvents.at(-1))).toEqual(
		{ type: "warp-remove", id: "a" },
	);
	await editor.evaluate((element) => element.setAttribute("readonly", ""));
	await expect(marker).toBeDisabled();
	await editor.evaluate((element) => element.removeAttribute("warp"));
	await expect(marker).not.toBeVisible();
});

test("transient suggestions remain intent only and nearby insertion snaps to the source candidate", async ({
	page,
}) => {
	await page.goto("/examples/compost-audio-clip-editor/");
	const editor = page.locator("compost-audio-clip-editor").first();
	await expect(editor).toHaveAttribute("role", "group");
	await editor.evaluate((element) => {
		element.setAttribute("warp", "");
		element.warpCandidates = [{ id: "onset", beat: 5.13 }];
		element.requests = [];
		element.addEventListener("warp-add", (event) =>
			element.requests.push(event.detail),
		);
	});
	await editor.locator('[part="warp-candidate"]').click();
	expect(await editor.evaluate((element) => element.requests.at(-1))).toEqual({
		beat: 5.13,
		candidateId: "onset",
	});
	expect(await editor.evaluate((element) => element.warpMarkers)).toEqual([]);
	const point = await editor.evaluate((element) => ({
		x:
			element.gridWrap.getBoundingClientRect().left +
			5.13 * element.pxPerBeat +
			3,
		y: element.gridWrap.getBoundingClientRect().top + 40,
	}));
	await page.mouse.dblclick(point.x, point.y);
	expect(await editor.evaluate((element) => element.requests.at(-1))).toEqual({
		beat: 5.13,
		candidateId: "onset",
	});
	await editor.evaluate((element) => element.setAttribute("snap", "off"));
	await page.mouse.dblclick(point.x, point.y);
	expect(
		await editor.evaluate((element) => element.requests.at(-1).candidateId),
	).toBeUndefined();
	await editor.evaluate((element) => element.setAttribute("readonly", ""));
	await expect(editor.locator('[part="warp-candidate"]')).toBeDisabled();
});

test("gain uses standard parameter gestures, scales peaks and cancels without committing", async ({
	page,
}) => {
	await page.goto("/examples/compost-audio-clip-editor/");
	const editor = page.locator("compost-audio-clip-editor").first();
	await expect(editor).toHaveAttribute("role", "group");
	await editor.evaluate((element) => {
		element.setGain(0);
		element.peaks = [{ min: -0.5, max: 0.5 }];
		element.gainEvents = [];
		for (const type of [
			"parameter-begin",
			"parameter-edit",
			"parameter-end",
			"gain-input",
			"gain-change",
		])
			element.addEventListener(type, (event) =>
				element.gainEvents.push({ type, ...event.detail }),
			);
	});
	const control = editor.locator(".gain compost-number-box");
	const spin = control.getByRole("spinbutton");
	await spin.focus();
	await spin.press("ArrowDown");
	const state = await editor.evaluate((element) => ({
		gain: element.gain,
		peaks: element.waveform.peaks,
		events: element.gainEvents,
	}));
	expect(state.gain).toBe(-0.1);
	expect(state.peaks[0].max).toBeCloseTo(0.5 * 10 ** (-0.1 / 20), 6);
	expect(
		state.events
			.filter((event) => event.type.startsWith("parameter-"))
			.map((event) => event.type),
	).toEqual(["parameter-begin", "parameter-edit", "parameter-end"]);
	expect(
		state.events.filter((event) => event.type === "gain-change"),
	).toHaveLength(1);
	await editor.evaluate((element) => {
		element.gainEvents = [];
	});
	const box = await spin.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 25, box.y - 40, { steps: 5 });
	expect(await editor.evaluate((element) => element.gain)).not.toBe(-0.1);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	const cancelled = await editor.evaluate((element) => ({
		gain: element.gain,
		peaks: element.waveform.peaks,
		events: element.gainEvents,
	}));
	expect(cancelled.gain).toBe(-0.1);
	expect(cancelled.peaks).toEqual(state.peaks);
	expect(
		cancelled.events.filter((event) => event.type === "gain-change"),
	).toHaveLength(0);
	expect(
		cancelled.events.find((event) => event.type === "parameter-end").cancelled,
	).toBe(true);
	expect(
		await editor.evaluate((element) => {
			element.gainEvents = [];
			element.setGain(-6);
			return element.gainEvents;
		}),
	).toEqual([]);
});
