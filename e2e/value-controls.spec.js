import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/examples/custom-controls/");
	await expect(page.locator("#amount-control")).toHaveAttribute(
		"role",
		"slider",
	);
	await page.evaluate(() => {
		window.controlEvents = [];
		for (const type of ["parameter-begin", "parameter-edit", "parameter-end"]) {
			document.addEventListener(type, ({ detail, target }) => {
				window.controlEvents.push({
					type,
					parameterID: detail.parameterID,
					value: detail.value,
					cancelled: detail.cancelled,
					target: target.id,
				});
			});
		}
	});
});

test("custom visuals expose independent keyboard values and shared parameter intent", async ({
	page,
}) => {
	const amount = page.locator("#amount-control");
	const steps = page.locator("#steps-control");
	await expect(page.locator("#custom-canvas")).toHaveCSS(
		"touch-action",
		"none",
	);
	await expect(amount).toHaveAccessibleName("Amount");
	await expect(amount).toHaveAttribute("aria-valuemin", "0");
	await expect(amount).toHaveAttribute("aria-valuemax", "1");
	await expect(amount).toHaveAttribute("aria-valuenow", "0.25");
	await expect(steps).toHaveAccessibleName("Steps");
	await expect(steps).toHaveAttribute("aria-valuenow", "4");
	await amount.focus();
	await page.keyboard.press("ArrowUp");
	await expect(amount).toHaveAttribute("aria-valuenow", "0.26");
	await expect(page.locator("compost-knob")).toHaveJSProperty("value", 0.26);
	await expect(steps).toHaveAttribute("aria-valuenow", "4");
	await page.keyboard.press("Tab");
	await expect(steps).toBeFocused();
	await page.keyboard.press("ArrowUp");
	await expect(steps).toHaveAttribute("aria-valuenow", "5");
	await expect(amount).toHaveAttribute("aria-valuenow", "0.26");
	const events = await page.evaluate(() => window.controlEvents);
	expect(events.map(({ type }) => type)).toEqual([
		"parameter-begin",
		"parameter-edit",
		"parameter-end",
		"parameter-begin",
		"parameter-edit",
		"parameter-end",
	]);
	expect(events.map(({ parameterID }) => parameterID)).toEqual([
		"amount",
		"amount",
		"amount",
		"steps",
		"steps",
		"steps",
	]);
	expect(events.every(({ target }) => target === "custom-canvas")).toBe(true);
	await page.keyboard.press("End");
	await expect(steps).toHaveAttribute("aria-valuenow", "16");
	await page.keyboard.press("Home");
	await expect(steps).toHaveAttribute("aria-valuenow", "1");
});

test("host values stay silent and explicit controls survive controller refresh", async ({
	page,
}) => {
	await page.locator("#refresh-controls").click();
	await page.locator("#host-value").click();
	await expect(page.locator("#amount-control")).toHaveAttribute(
		"aria-valuenow",
		"0.75",
	);
	await expect(page.locator("compost-knob")).toHaveJSProperty("value", 0.75);
	expect(await page.evaluate(() => window.controlEvents)).toEqual([]);
	await page.locator("#amount-control").focus();
	await page.keyboard.press("ArrowDown");
	await expect(page.locator("compost-knob")).toHaveJSProperty("value", 0.74);
});

test("custom canvas drag cancels once and restores both synchronized views", async ({
	page,
}) => {
	const canvas = page.locator("#custom-canvas");
	const rect = await canvas.boundingBox();
	const x = rect.x + rect.width / 4;
	const y = rect.y + rect.height * 0.65;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y - 35, { steps: 3 });
	await expect(page.locator("#amount-control")).toBeFocused();
	expect(
		Number(await page.locator("#amount-control").getAttribute("aria-valuenow")),
	).toBeGreaterThan(0.25);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	await expect(page.locator("#amount-control")).toHaveAttribute(
		"aria-valuenow",
		"0.25",
	);
	await expect(page.locator("compost-knob")).toHaveJSProperty("value", 0.25);
	const events = await page.evaluate(() => window.controlEvents);
	expect(events.filter(({ type }) => type === "parameter-begin")).toHaveLength(
		1,
	);
	expect(events.filter(({ type }) => type === "parameter-end")).toEqual([
		{
			type: "parameter-end",
			parameterID: "amount",
			value: 0.25,
			cancelled: true,
			target: "custom-canvas",
		},
	]);
});

test("removing a dragged builtin closes its controller gesture and restores siblings", async ({
	page,
}) => {
	const knob = page.locator("compost-knob");
	await knob.evaluate((element) => {
		window.detachedEnds = [];
		element.addEventListener("parameter-end", ({ detail }) => {
			window.detachedEnds.push({
				value: detail.value,
				cancelled: detail.cancelled,
			});
		});
	});
	const dial = knob.locator(".dial");
	await dial.scrollIntoViewIfNeeded();
	const rect = await dial.boundingBox();
	const x = rect.x + rect.width / 2;
	const y = rect.y + rect.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y - 30);
	expect(
		Number(await page.locator("#amount-control").getAttribute("aria-valuenow")),
	).toBeGreaterThan(0.25);
	await knob.evaluate((element) => element.remove());
	await page.mouse.up();
	await expect(page.locator("#amount-control")).toHaveAttribute(
		"aria-valuenow",
		"0.25",
	);
	expect(await page.evaluate(() => window.detachedEnds)).toEqual([
		{ value: 0.25, cancelled: true },
	]);
});

test("relative canvas movement rebases after a host update and Shift change", async ({
	page,
}) => {
	const rect = await page.locator("#custom-canvas").boundingBox();
	const x = rect.x + rect.width / 4;
	const y = rect.y + rect.height * 0.7;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y - 20);
	await page.locator("#host-value").evaluate((button) => button.click());
	await expect(page.locator("#amount-control")).toHaveAttribute(
		"aria-valuenow",
		"0.75",
	);
	await page.mouse.move(x, y - 30);
	const beforeFine = Number(
		await page.locator("#amount-control").getAttribute("aria-valuenow"),
	);
	expect(beforeFine).toBeGreaterThan(0.75);
	expect(beforeFine).toBeLessThan(0.9);
	await page.keyboard.down("Shift");
	await page.mouse.move(x, y - 35);
	const afterFine = Number(
		await page.locator("#amount-control").getAttribute("aria-valuenow"),
	);
	expect(afterFine).toBeGreaterThanOrEqual(beforeFine);
	expect(afterFine - beforeFine).toBeLessThanOrEqual(0.02);
	await page.keyboard.up("Shift");
	await page.mouse.up();
	await expect(page.locator("compost-knob")).toHaveJSProperty(
		"value",
		afterFine,
	);
});

test("custom controls remain usable at desktop and narrow widths", async ({
	page,
}, testInfo) => {
	for (const width of [1100, 390]) {
		await page.setViewportSize({ width, height: 844 });
		await page.locator("#amount-control").focus();
		await expect(page.locator("#amount-control")).toBeFocused();
		await expect(page.locator("#custom-canvas")).toBeVisible();
		await page.screenshot({
			path: testInfo.outputPath(`custom-controls-${width}.png`),
			fullPage: true,
		});
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(width);
		await page.locator("#host-value").click();
		await expect(page.locator("#amount-control")).toHaveAttribute(
			"aria-valuenow",
			"0.75",
		);
	}
});

test("custom canvas redraws for dark mode", async ({ page }, testInfo) => {
	await page.locator(".color-scheme-toggle").click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-color-scheme",
		"dark",
	);
	await expect(page.locator("#custom-canvas")).toHaveCSS("cursor", "ns-resize");
	await page.locator("#amount-control").focus();
	await page.screenshot({
		path: testInfo.outputPath("custom-controls-dark.png"),
		fullPage: true,
	});
});

for (const component of ["compost-knob", "compost-slider"]) {
	test(`${component} preserves property-driven values across connection and host updates`, async ({
		page,
	}) => {
		await page.goto(`/examples/${component}/`);
		await expect(page.locator(component).first()).toHaveAttribute(
			"role",
			"slider",
		);
		const values = await page.evaluate((tag) => {
			const control = document.createElement(tag);
			control.min = 10;
			control.max = 100;
			control.value = 50;
			document.body.append(control);
			const initial = control.value;
			control.setAttribute("value", "30");
			control.value = 80;
			control.remove();
			document.body.append(control);
			const reconnected = control.value;
			control.min = 0;
			control.max = 200;
			control.step = 1;
			control.value = 150;
			return {
				initial,
				reconnected,
				updated: control.value,
				maximum: control.getAttribute("aria-valuemax"),
			};
		}, component);
		expect(values).toEqual({
			initial: 50,
			reconnected: 80,
			updated: 150,
			maximum: "200",
		});
	});

	test(`${component} keeps its default appearance and cancels an active drag`, async ({
		page,
	}) => {
		await page.goto(`/examples/${component}/`);
		const control = page.locator(component).first();
		await expect(control).toHaveAttribute("role", "slider");
		const original = await control.evaluate((element) => element.value);
		const surface = control.locator(
			component === "compost-knob" ? ".dial" : ".range-input",
		);
		const rect = await surface.boundingBox();
		await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			rect.x + rect.width / 2 + 30,
			rect.y + rect.height / 2 - 30,
		);
		await page.keyboard.press("Escape");
		await page.mouse.up();
		await expect(control).toHaveJSProperty("value", original);
		await expect(surface).toBeVisible();
	});
}
