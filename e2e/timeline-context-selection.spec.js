import { test, expect } from '@playwright/test';

test('timeline context preserves an existing multi-clip selection', async ({ page }) => {
  await page.goto('/examples/review/review.html?el=compost-timeline&context=plain');
  const timeline = page.locator('compost-timeline');
  const result = await timeline.evaluate((element) => {
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [
      { id: 'a', name: 'A', start: 0, length: 2, duration: 2 },
      { id: 'b', name: 'B', start: 3, length: 2, duration: 2 },
      { id: 'c', name: 'C', start: 6, length: 2, duration: 2 },
    ] }]);
    const context = (id) => element.root.querySelector(`.clip[data-id="${id}"]`).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true }));
    element.selected = ['a', 'b'];
    context('a');
    const selectedContext = element.selected;
    context('c');
    return { selectedContext, unselectedContext: element.selected };
  });

  expect(result.selectedContext).toEqual(['a', 'b']);
  expect(result.unselectedContext).toEqual(['c']);
});
