import { expect, test } from "@playwright/test";

test("cycle buttons expose discrete choices and silent host updates", async ({
	page,
}) => {
	await page.goto("/examples/compost-button/");
	const cycle = page.locator('compost-button[parameter-id="medium"]');
	const button = page.getByRole("button", { name: "Medium: Tape" });

	await expect(button).toBeVisible();
	expect(
		await cycle.evaluate((element) => ({
			kind: element.parameterKind,
			min: element.min,
			max: element.max,
			step: element.step,
			values: element.parameterValues,
		})),
	).toEqual({
		kind: "discrete",
		min: 0,
		max: 4,
		step: 1,
		values: [0, 1, 2, 3, 4],
	});

	const hostUpdate = await cycle.evaluate(async (element) => {
		const { createParameterController } = await import(
			"/src/parameter-controller.js"
		);
		const controller = createParameterController();
		const events = [];
		for (const type of ["parameter-begin", "parameter-edit", "parameter-end"])
			element.addEventListener(type, () => events.push(type));
		const definition = controller.definition("medium");
		const applied = controller.applyValue("medium", 3, { source: "host" });
		controller.disconnect();
		return { applied, definition, events };
	});

	expect(hostUpdate.applied).toBe(true);
	expect(hostUpdate.definition).toMatchObject({
		kind: "discrete",
		min: 0,
		max: 4,
		step: 1,
		values: [0, 1, 2, 3, 4],
	});
	expect(hostUpdate.events).toEqual([]);
	await expect(cycle).toHaveAttribute("value", "3");
	await expect(
		page.getByRole("button", { name: "Medium: Tide" }),
	).toBeVisible();
});

test("cycle button pointer and keyboard presses wrap complete gestures", async ({
	page,
}) => {
	await page.goto("/examples/compost-button/");
	const cycle = page.locator('compost-button[parameter-id="medium"]');
	const button = page.getByRole("button", { name: "Medium: Tape" });

	await cycle.evaluate((element) => {
		element.testEvents = [];
		for (const type of [
			"button-trigger",
			"parameter-begin",
			"parameter-edit",
			"change",
			"parameter-end",
		]) {
			element.addEventListener(type, () => element.testEvents.push(type));
		}
	});

	await button.click();
	await expect(cycle).toHaveAttribute("value", "1");
	expect(await cycle.evaluate((element) => element.testEvents)).toEqual([
		"parameter-begin",
		"parameter-edit",
		"change",
		"parameter-end",
	]);

	await page.getByRole("button", { name: "Medium: Oil can" }).click({
		modifiers: ["Shift"],
	});
	await expect(cycle).toHaveAttribute("value", "0");

	await page.getByRole("button", { name: "Medium: Tape" }).focus();
	await page.keyboard.press("ArrowLeft");
	await expect(cycle).toHaveAttribute("value", "4");
	await page.keyboard.press("Home");
	await expect(cycle).toHaveAttribute("value", "0");
	await page.keyboard.press("End");
	await expect(cycle).toHaveAttribute("value", "4");
	await page.keyboard.press("Space");
	await expect(cycle).toHaveAttribute("value", "0");
	await page.keyboard.press("Shift+Enter");
	await expect(cycle).toHaveAttribute("value", "4");
});
