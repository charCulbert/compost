import { expect, test } from "@playwright/test";

const localBaseURL = process.env.COMPOST_TEST_BASE_URL ?? "";

for (const editorName of ["note", "audio-clip"]) {
	test(`${editorName} editor ends pinch cleanly and recovers touch editing`, async ({
		page,
	}) => {
		await page.goto(`${localBaseURL}/examples/compost-${editorName}-editor/`);
		const editor = page.locator(`compost-${editorName}-editor`).first();
		await expect(editor).toHaveAttribute("role", "group");

		const state = await editor.evaluate((element, name) => {
			const target = name === "note" ? element.gridElement : element.gridWrap;
			target.setPointerCapture = () => {};
			target.hasPointerCapture = () => true;
			const pointer = (type, pointerId, x, y) =>
				new PointerEvent(type, {
					bubbles: true,
					composed: true,
					cancelable: true,
					pointerId,
					pointerType: "touch",
					button: 0,
					clientX: x,
					clientY: y,
				});
			const rect = target.getBoundingClientRect();
			const x = rect.left + rect.width * 0.4;
			const y = rect.top + rect.height * 0.5;
			target.dispatchEvent(pointer("pointerdown", 1, x - 30, y));
			target.dispatchEvent(pointer("pointerdown", 2, x + 30, y));
			target.dispatchEvent(pointer("pointermove", 2, x + 50, y));
			target.dispatchEvent(pointer("pointerup", 2, x + 50, y));
			const afterSecondUp = {
				pinch: element.pinch,
				pointers: element.pointers.size,
				navigating: element.touchNavigation,
			};
			target.dispatchEvent(pointer("pointermove", 1, x + 20, y));
			const remainingDidNotEdit =
				name === "note"
					? element.drag === null
					: element.selectionDrag === null;
			target.dispatchEvent(pointer("pointerup", 1, x + 20, y));
			target.dispatchEvent(pointer("pointerdown", 3, x, y));
			const nextTouchEdits =
				name === "note"
					? element.drag !== null
					: element.selectionDrag !== null;
			target.dispatchEvent(pointer("pointerup", 3, x, y));

			const cleanup = [];
			for (const ending of ["pointercancel", "outside", "lost", "blur"]) {
				target.dispatchEvent(pointer("pointerdown", 10, x - 20, y));
				target.dispatchEvent(pointer("pointerdown", 11, x + 20, y));
				if (ending === "outside")
					document.body.dispatchEvent(pointer("pointerup", 11, 0, 0));
				else if (ending === "lost") {
					target.dispatchEvent(pointer("lostpointercapture", 11, x, y));
					target.dispatchEvent(pointer("pointerup", 11, x, y));
				} else if (ending === "blur") window.dispatchEvent(new Event("blur"));
				else target.dispatchEvent(pointer(ending, 11, x, y));
				if (ending !== "blur") {
					target.dispatchEvent(pointer("pointerup", 10, x, y));
				}
				cleanup.push([
					ending,
					element.pointers.size,
					element.pinch,
					element.touchNavigation,
				]);
			}
			return { afterSecondUp, remainingDidNotEdit, nextTouchEdits, cleanup };
		}, editorName);

		expect(state.afterSecondUp).toEqual({
			pinch: null,
			pointers: 1,
			navigating: true,
		});
		expect(state.remainingDidNotEdit).toBe(true);
		expect(state.nextTouchEdits).toBe(true);
		expect(state.cleanup).toEqual([
			["pointercancel", 0, null, false],
			["outside", 0, null, false],
			["lost", 0, null, false],
			["blur", 0, null, false],
		]);
	});

	test(`${editorName} editor supports a real touch pinch followed by selection`, async ({
		page,
		browserName,
	}) => {
		test.skip(browserName !== "chromium", "CDP touch input requires Chromium");
		await page.goto(`${localBaseURL}/examples/compost-${editorName}-editor/`);
		const editor = page.locator(`compost-${editorName}-editor`).first();
		await expect(editor).toHaveAttribute("role", "group");
		const target = editor.locator(
			editorName === "note" ? ".grid" : ".gridwrap",
		);
		const box = await target.boundingBox();
		expect(box).not.toBeNull();
		const x = box.x + box.width * 0.45;
		const y = box.y + box.height * 0.5;
		const touch = (id, pointX) => ({
			id,
			x: pointX,
			y,
			radiusX: 8,
			radiusY: 8,
			force: 1,
		});
		const client = await page.context().newCDPSession(page);
		await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
		await client.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [touch(1, x - 30)],
		});
		await client.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [touch(1, x - 30), touch(2, x + 30)],
		});
		const zoomBefore = await editor.evaluate((element) => element.pxPerBeat);
		await client.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [touch(1, x - 50), touch(2, x + 50)],
		});
		expect(
			await editor.evaluate((element) => element.pxPerBeat),
		).toBeGreaterThan(zoomBefore);
		await client.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [touch(1, x - 50)],
		});
		expect(
			await editor.evaluate((element) => ({
				pointers: element.pointers.size,
				navigating: element.touchNavigation,
			})),
		).toEqual({ pointers: 1, navigating: true });
		await client.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await client.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [touch(3, x)],
		});
		expect(
			await editor.evaluate(
				(element, name) =>
					name === "note"
						? element.drag !== null
						: element.selectionDrag !== null,
				editorName,
			),
		).toBe(true);
		await client.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
	});
}
