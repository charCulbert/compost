import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/e2e/fixtures/viewport.html");
	await page.locator("compost-window").waitFor();
});

test("popups translate fixed coordinates without reopening on viewport changes", async ({
	page,
}) => {
	const result = await page.locator("compost-popup").evaluate((popup) => {
		let opened = 0;
		let measurements = 0;
		popup.addEventListener("popup-open", () => opened++);
		popup.fixedOriginProbe.getBoundingClientRect = () => {
			measurements++;
			return new DOMRect(-30, -40, 0, 0);
		};
		popup.open({ x: 200, y: 180 });
		const point = [popup.menu.style.left, popup.menu.style.top];
		popup.close();
		popup.open({ anchor: new DOMRect(100, 100, 100, 20) });
		popup.setActive(1, false);
		window.visualViewport.dispatchEvent(new Event("resize"));
		window.visualViewport.dispatchEvent(new Event("scroll"));
		const anchor = [popup.menu.style.left, popup.menu.style.top];
		const active = popup.activeIndex;
		popup.remove();
		const before = measurements;
		window.visualViewport.dispatchEvent(new Event("resize"));
		return { point, anchor, active, opened, detached: measurements === before };
	});
	expect(result).toEqual({
		point: ["230px", "220px"],
		anchor: ["130px", "160px"],
		active: 1,
		opened: 2,
		detached: true,
	});
});

test("desktop height resizes keep windows reachable", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 800 });
	await page
		.locator("compost-window")
		.evaluate((panel) => panel.moveTo(600, 550));
	await page.setViewportSize({ width: 1000, height: 400 });
	await expect
		.poll(() =>
			page
				.locator("compost-window")
				.evaluate((panel) => panel.getBoundingClientRect().bottom),
		)
		.toBeLessThanOrEqual(400);
});

test.describe("touch viewport", () => {
	test.use({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 800, height: 900 },
	});
	test("height changes preserve position; width changes constrain it", async ({
		page,
	}) => {
		const panel = page.locator("compost-window");
		await panel.evaluate((element) => element.moveTo(500, 600));
		await page.setViewportSize({ width: 800, height: 500 });
		await page.evaluate(() => window.dispatchEvent(new Event("resize")));
		await expect(panel).toHaveAttribute("y", "600");
		await page.setViewportSize({ width: 400, height: 500 });
		await expect
			.poll(() =>
				panel.evaluate((element) => element.getBoundingClientRect().right),
			)
			.toBeLessThanOrEqual(400);
	});
});

test("interrupted context replacement is opt-in and announces the new context", async ({
	page,
}) => {
	const result = await page.locator("compost-audio").evaluate(async (audio) => {
		class Context extends EventTarget {
			state = "suspended";
			closed = false;
			async resume() {
				this.state = "running";
			}
			close() {
				this.closed = true;
				return new Promise(() => {});
			}
		}
		window.AudioContext = Context;
		const original = await audio.start();
		original.state = "interrupted";
		const resumed = await audio.start();
		const defaultResumes = resumed === original && !original.closed;
		original.state = "interrupted";
		audio.setAttribute("restart-interrupted", "");
		let announced;
		audio.addEventListener("audio-started", (event) => {
			announced = event.detail.context;
		});
		let finish;
		let retainedBeforeClose = false;
		audio.addEventListener(
			"audio-restarting",
			(event) => {
				retainedBeforeClose =
					event.detail.previousContext === original &&
					!original.closed &&
					audio.context.state === "running";
				event.detail.waitUntil(
					new Promise((resolve) => {
						finish = resolve;
					}),
				);
			},
			{ once: true },
		);
		const restarting = audio.start();
		await Promise.resolve();
		const waited = !original.closed;
		finish();
		const replacement = await restarting;
		let staleEvents = 0;
		audio.addEventListener("audio-state-change", () => staleEvents++);
		original.dispatchEvent(new Event("statechange"));
		return {
			defaultResumes,
			retainedBeforeClose,
			waited,
			replaced: replacement !== original,
			closed: original.closed,
			announced: announced === replacement,
			staleEvents,
		};
	});
	expect(result).toEqual({
		defaultResumes: true,
		retainedBeforeClose: true,
		waited: true,
		replaced: true,
		closed: true,
		announced: true,
		staleEvents: 0,
	});
});
