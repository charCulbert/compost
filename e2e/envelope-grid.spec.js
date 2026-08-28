import { expect, test } from '@playwright/test';

test('envelope time and value grids are opt-in and logically derived', async ({ page }) => {
  await page.goto('/examples/index.html');
  const state = await page.evaluate(async () => {
    await import('/src/components/compost-envelope-editor.js');
    const editor = document.createElement('compost-envelope-editor');
    editor.style.cssText = 'display:block;width:240px;height:120px';
    document.body.replaceChildren(editor);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const surface = editor.shadowRoot.querySelector('.surface');
    const grid = editor.shadowRoot.querySelector('.grid');
    const timeAt = (fraction) => {
      const rect = surface.getBoundingClientRect();
      return editor.timeAtPointer({ clientX: rect.left + rect.width * fraction });
    };
    const initial = {
      grid: editor.grid,
      snap: editor.snapMode,
      background: grid.style.backgroundImage,
      valueLines: grid.querySelectorAll('.value-grid-line').length,
      time: timeAt(.037),
    };
    editor.setAttribute('min', '-1');
    editor.setAttribute('max', '1');
    const bipolarValues = [...grid.querySelectorAll('.value-grid-line')]
      .map((line) => Number(line.dataset.value));
    editor.setAttribute('min', '0');
    editor.setAttribute('max', '1');
    editor.setAttribute('stepped', '');
    editor.setAttribute('step', '.25');
    const steppedValues = [...grid.querySelectorAll('.value-grid-line')]
      .map((line) => Number(line.dataset.value));
    editor.setAttribute('grid', '.01');
    const configured = {
      grid: editor.grid,
      snap: editor.snapMode,
      backgroundSize: grid.style.backgroundSize,
      time: timeAt(.037),
    };
    editor.setAttribute('grid-lines', 'off');
    const hidden = {
      background: grid.style.backgroundImage,
      valueLines: grid.querySelectorAll('.value-grid-line').length,
      time: timeAt(.037),
    };
    return { initial, bipolarValues, steppedValues, configured, hidden };
  });

  expect(state.initial.grid).toBeNull();
  expect(state.initial.snap).toBe('off');
  expect(state.initial.background).toBe('none');
  expect(state.initial.valueLines).toBe(0);
  expect(state.initial.time).toBeCloseTo(.037, 3);
  expect(state.bipolarValues).toEqual([0]);
  expect(state.steppedValues).toEqual([.25, .5, .75]);
  expect(state.configured.grid).toBe(.01);
  expect(state.configured.snap).toBe('grid');
  expect(state.configured.backgroundSize).toBe('8% 100%');
  expect(state.configured.time).toBe(.04);
  expect(state.hidden.background).toBe('none');
  expect(state.hidden.valueLines).toBe(0);
  expect(state.hidden.time).toBe(.04);
});
