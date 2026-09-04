import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.COMPOST_URL || "http://127.0.0.1:8000" });

test("audio editor upgrades cleanly and emits context intent from ruler and waveform", async ({ page }) => {
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.goto("/examples/compost-audio-clip-editor/");
	const editor = page.locator("compost-audio-clip-editor").first();
	await expect(editor).toHaveAttribute("role", "group");
	const details = await editor.evaluate(element => {
		const received = [];
		element.addEventListener("audio-context", event => received.push(event.detail));
		for (const selector of [".ruler", ".gridwrap"]) {
			const target = element.shadowRoot.querySelector(selector);
			const bounds = target.getBoundingClientRect();
			target.dispatchEvent(new MouseEvent("contextmenu", {
				bubbles: true, cancelable: true, clientX: bounds.left + 30, clientY: bounds.top + 5,
			}));
		}
		return received;
	});
	expect(details).toHaveLength(2);
	for (const detail of details) expect(Number.isFinite(detail.beat)).toBe(true);
	expect(errors).toEqual([]);
});
