import { expect, test } from "@playwright/test";

test("timeline context preserves a rectangle when the clip is inside it", async ({
	page,
}) => {
	await page.goto("/examples/compost-timeline/");
	const timeline = page.locator("compost-timeline");
	const result = await timeline.evaluate((element) => {
		element.setLanes([
			{
				id: "lane",
				name: "Lane",
				clips: [
					{ id: "a", name: "A", start: 0, length: 2, duration: 2 },
					{ id: "b", name: "B", start: 3, length: 2, duration: 2 },
					{ id: "c", name: "C", start: 6, length: 2, duration: 2 },
				],
			},
		]);
		const context = (id) => {
			const clip = element.root.querySelector(`.clip[data-id="${id}"]`);
			const rect = clip.getBoundingClientRect();
			clip.dispatchEvent(
				new MouseEvent("contextmenu", {
					bubbles: true,
					composed: true,
					cancelable: true,
					clientX: rect.left + rect.width / 2,
					clientY: rect.top + rect.height / 2,
				}),
			);
		};
		element.setTimeSelection(0, 5, ["lane"]);
		context("a");
		const selectedContext = element.timeSelection;
		context("c");
		return { selectedContext, unselectedContext: element.timeSelection };
	});

	expect(result.selectedContext).toEqual({
		start: 0,
		end: 5,
		laneIds: ["lane"],
	});
	expect(result.unselectedContext).toEqual({
		start: 6,
		end: 8,
		laneIds: ["lane"],
	});
});
