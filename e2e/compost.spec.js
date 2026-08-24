import { test, expect } from '@playwright/test';
import { examples } from '../examples/shared/catalog.js';

for (const example of examples) {
  test(`${example.id} loads`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const href = `/examples/${example.href.replace(/^\.\//u, '')}`;
    const response = await page.goto(href);

    expect(response?.ok()).toBe(true);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);

    const undefinedElements = await page.locator(':not(:defined)').evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.localName).filter((name) => name.includes('-'))),
    ]);
    expect(undefinedElements).toEqual([]);
    await expect(page.locator('select')).toHaveCount(0);
  });
}

test('envelope editor stays state-in and emits generic time/value intent', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-envelope-editor/');
  const editor = page.locator('compost-envelope-editor');
  await expect(editor).toHaveAttribute('aria-label', 'Envelope');
  await expect(editor.locator('.point')).toHaveCount(3);

  const box = await editor.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(editor.locator('.point')).toHaveCount(4);
  expect(await editor.evaluate((element) => element.points.every((point) => 'time' in point && 'value' in point))).toBe(true);

  await editor.locator('.point').nth(1).focus();
  await page.keyboard.press('Delete');
  await expect(editor.locator('.point')).toHaveCount(3);
});

test('documentation renders the overview', async ({ page }) => {
  await page.goto('/docs/');

  await expect(page.locator('[data-doc-content] h1')).toHaveText('Compost');
  await expect(page.locator('[data-doc-content]')).toContainText('Use through npm');
});

test('knob keyboard edits use a complete parameter gesture', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-knob/');
  const knob = page.locator('compost-knob[data-option-target="knob"]');
  await expect(knob).toHaveAttribute('role', 'slider');
  await expect(page.locator('input[type="range"]')).toHaveCount(0);

  await knob.evaluate((element) => {
    window.compostTestEvents = [];
    for (const type of ['parameter-begin', 'parameter-edit', 'parameter-end']) {
      element.addEventListener(type, () => window.compostTestEvents.push(type));
    }
  });

  const initialValue = Number(await knob.getAttribute('aria-valuenow'));
  await knob.focus();
  await page.keyboard.press('ArrowUp');

  await expect.poll(async () => Number(await knob.getAttribute('aria-valuenow')))
    .toBeGreaterThan(initialValue);
  expect(await page.evaluate(() => window.compostTestEvents)).toEqual([
    'parameter-begin',
    'parameter-edit',
    'parameter-end',
  ]);
});

test('select supports keyboard selection', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-select/');
  const select = page.locator('compost-select[aria-label="Wave shape"]');
  const combobox = page.getByRole('combobox', { name: 'Wave shape' });

  await expect(select).toHaveAttribute('value', 'saw');
  await combobox.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(select).toHaveAttribute('value', 'square');
  await expect(combobox).toContainText('Square');
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
});

test('drawer summary toggles its public open state', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-drawer/');
  const drawer = page.locator('compost-drawer[data-drawer-id="bottom"]');
  const summary = drawer.locator('summary');
  const resizeHandle = page.getByRole('separator', { name: 'Resize Instrument drawer' });

  await expect(drawer).toHaveAttribute('open', '');
  await summary.click();
  await expect(drawer).not.toHaveAttribute('open', '');
  await summary.click();
  await expect(drawer).toHaveAttribute('open', '');

  await expect(resizeHandle).toHaveAttribute('aria-valuemin', '100');
  await expect(resizeHandle).toHaveAttribute('aria-valuemax', '420');
  await resizeHandle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '236');
  await expect(resizeHandle).toHaveAttribute('aria-valuetext', '236 pixels');

  for (let press = 0; press < 20; press += 1) {
    await page.keyboard.press('ArrowUp');
  }
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '420');

  await summary.click();
  await summary.click();
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', '420');
});

test('centered audio keeps its toolbar footprint while moving', async ({ page }) => {
  await page.goto('/examples/signal-generator/');
  const audio = page.locator('compost-audio');
  const slider = page.locator('.audio-output > compost-slider');
  const offHostWidth = await audio.evaluate((element) => element.getBoundingClientRect().width);
  const sliderLeft = await slider.evaluate((element) => element.getBoundingClientRect().left);

  const animationDuration = await audio.evaluate((element) => {
    element.context = { state: 'running', close: async () => {} };
    element.refresh();
    return element.panelMoveAnimation?.effect.getTiming().duration ?? 0;
  });

  expect(await audio.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(offHostWidth);
  expect(await slider.evaluate((element) => element.getBoundingClientRect().left))
    .toBeCloseTo(sliderLeft);
  expect(animationDuration).toBe(220);
});

test('parameter controller reflects host updates to both controls', async ({ page }) => {
  await page.goto('/examples/parameter-sync/');
  const controls = page.locator('[parameter-id="frequency"]');

  await page.locator('#set-880').click();
  await expect(controls).toHaveCount(2);
  await expect(controls.nth(0)).toHaveAttribute('aria-valuenow', '880');
  await expect(controls.nth(1)).toHaveAttribute('aria-valuenow', '880');
});

test('device selector applies host settings and restores focus', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-device-selector/');
  const openButton = page.getByRole('button', { name: 'Device settings' });
  const dialog = page.getByRole('dialog', { name: 'Audio & MIDI settings' });

  await expect(page.locator('[data-device-demo-state="output"]')).toHaveText('speakers');
  await openButton.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(openButton).toHaveAttribute('aria-expanded', 'true');

  const output = dialog.getByRole('combobox', { name: 'Audio output' });
  await output.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-device-demo-state="output"]')).toHaveText('headphones');

  const sampleRate = dialog.getByRole('combobox', { name: 'Sample rate' });
  await sampleRate.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-device-demo-state="sampleRate"]')).toHaveText('96000 Hz');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(openButton).toBeFocused();
  await expect(openButton).toHaveAttribute('aria-expanded', 'false');
});

test('number box commits, cancels, and drags through the real editor', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-number-box/');
  const numberBox = page.locator('compost-number-box[data-option-target="number"]');
  const spinbutton = page.getByRole('spinbutton', { name: 'Ratio' });

  await numberBox.evaluate((element) => {
    element.testEvents = [];
    for (const type of ['parameter-begin', 'parameter-edit', 'parameter-end']) {
      element.addEventListener(type, (event) => {
        element.testEvents.push({ type, cancelled: event.detail.cancelled });
      });
    }
  });

  await spinbutton.focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('textbox', { name: 'Set Ratio' });
  await editor.fill('12.34');
  await editor.press('Enter');
  await expect(spinbutton).toHaveAttribute('aria-valuenow', '12.34');

  await spinbutton.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Set Ratio' }).fill('55');
  await page.keyboard.press('Escape');
  await expect(spinbutton).toHaveAttribute('aria-valuenow', '12.34');

  const bounds = await spinbutton.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2 - 24);
  await page.mouse.up();
  await expect.poll(async () => Number(await spinbutton.getAttribute('aria-valuenow')))
    .toBeGreaterThan(12.34);

  const events = await numberBox.evaluate((element) => element.testEvents);
  expect(events.slice(0, 3).map(({ type }) => type)).toEqual([
    'parameter-begin',
    'parameter-edit',
    'parameter-end',
  ]);
  expect(events[4]).toEqual({ type: 'parameter-end', cancelled: true });
});

test('slider typed editing uses real focus and lifecycle events', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-slider/');
  const slider = page.locator('compost-slider[data-option-target="slider"]');

  await slider.evaluate((element) => {
    element.testEvents = [];
    for (const type of ['parameter-begin', 'parameter-edit', 'parameter-end']) {
      element.addEventListener(type, () => element.testEvents.push(type));
    }
  });

  await slider.focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('textbox', { name: 'Set Log Cutoff value' });
  await editor.fill('5000');
  await editor.press('Enter');

  await expect(slider).toHaveAttribute('role', 'slider');
  await expect(slider).toHaveAttribute('aria-valuenow', '5000');
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  expect(await slider.evaluate((element) => element.testEvents)).toEqual([
    'parameter-begin',
    'parameter-edit',
    'parameter-end',
  ]);
});

test('piano keyboard emits notes and its dock option changes layout state', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-piano/');
  const piano = page.locator('compost-piano[data-option-target="piano"]');

  await piano.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('note-down', (event) => element.testEvents.push(['down', event.detail.note]));
    element.addEventListener('note-up', (event) => element.testEvents.push(['up', event.detail.note]));
  });

  await piano.focus();
  await page.keyboard.down('a');
  await expect(piano.locator('#note72')).toHaveClass(/active/u);
  await page.keyboard.up('a');
  await expect(piano.locator('#note72')).not.toHaveClass(/active/u);
  expect(await piano.evaluate((element) => element.testEvents)).toEqual([
    ['down', 72],
    ['up', 72],
  ]);

  await piano.evaluate((element) => { element.testEvents = []; });
  const keptFocus = await piano.locator('#note72').evaluate((note) => {
    const marker = document.createElement('button');
    document.body.append(marker);
    marker.focus();

    const touch = { identifier: 1, target: note };
    const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, 'changedTouches', { value: [touch] });
    note.dispatchEvent(touchStart);
    return document.activeElement === marker;
  });
  expect(keptFocus).toBe(true);
  await expect(piano.locator('#note72')).toHaveClass(/active/u);

  await piano.locator('#note72').evaluate((note) => {
    const touchEnd = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(touchEnd, 'changedTouches', {
      value: [{ identifier: 1, target: note }],
    });
    note.dispatchEvent(touchEnd);
  });
  await expect(piano.locator('#note72')).not.toHaveClass(/active/u);
  expect(await piano.evaluate((element) => element.testEvents)).toEqual([
    ['down', 72],
    ['up', 72],
  ]);

  await page.locator('[data-option="piano-root"]').fill('120');
  await page.locator('[data-option="piano-count"]').fill('8');
  await piano.evaluate((element) => { element.testEvents = []; });
  await piano.focus();
  await page.keyboard.press('a');
  expect(await piano.evaluate((element) => element.testEvents)).toEqual([]);

  await page.locator('[data-option="piano-docked"]').uncheck();
  await expect(piano).not.toHaveAttribute('dock', '');
  await expect(piano).toHaveAttribute('inline', '');

  const constructorName = await page.evaluate(() => {
    const defaultPiano = document.createElement('compost-piano');
    defaultPiano.id = 'default-piano';
    document.body.append(defaultPiano);
    return defaultPiano.constructor.name;
  });
  const defaultPiano = page.locator('#default-piano');
  expect(constructorName).toBe('PianoKeyboard');
  await expect(defaultPiano).toHaveAttribute('role', 'group');
  await expect(defaultPiano).toHaveAttribute('data-docked', '');
});

test('buttons expose real momentary and switch behavior', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-button/');
  const ping = page.locator('compost-button[parameter-id="ping"]');
  const latch = page.locator('compost-button[parameter-id="latch"]');

  await ping.evaluate((element) => {
    element.testEvents = [];
    for (const type of ['button-trigger', 'parameter-begin', 'parameter-edit', 'parameter-end']) {
      element.addEventListener(type, () => element.testEvents.push(type));
    }
  });

  await page.getByRole('button', { name: 'Ping' }).click();
  expect(await ping.evaluate((element) => element.testEvents)).toEqual([
    'button-trigger',
    'parameter-begin',
    'parameter-edit',
    'parameter-edit',
    'parameter-end',
  ]);
  await expect(ping).not.toHaveAttribute('pressed', '');

  const latchButton = page.getByRole('button', { name: 'Latch' });
  await latchButton.click();
  await expect(latch).toHaveAttribute('pressed', '');
  await expect(latchButton).toHaveAttribute('aria-pressed', 'true');
  await latchButton.click();
  await expect(latch).not.toHaveAttribute('pressed', '');
  await expect(latchButton).toHaveAttribute('aria-pressed', 'false');

  const styles = await ping.evaluate((element) => {
    const button = getComputedStyle(element.shadowRoot.querySelector('button'));
    const slot = getComputedStyle(element.shadowRoot.querySelector('slot'));
    return {
      borderRadius: button.borderRadius,
      overflowWrap: slot.overflowWrap,
      whiteSpace: slot.whiteSpace,
    };
  });
  expect(styles).toEqual({
    borderRadius: '0px',
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  });
});

test('MIDI monitor stays quiet by default and renders bounded messages', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-midi-monitor/');
  const monitor = page.locator('compost-midi-monitor');
  const log = page.getByRole('log', { name: 'MIDI message log' });

  await expect(log).toHaveAttribute('aria-live', 'off');
  await monitor.evaluate((element) => {
    for (let note = 60; note < 70; note += 1) {
      element.handleMIDIMessage([0x90, note, 100]);
    }
  });
  await expect(log.locator('.entry')).toHaveCount(8);
  await expect(log).toContainText('note on');

  await monitor.evaluate((element) => element.setAttribute('announce', ''));
  await expect(log).toHaveAttribute('aria-live', 'polite');
});

test('clip grid reports launches, stops and drops between grids', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-clip-grid/');
  const drums = page.locator('compost-clip-grid[data-grid="0"]');
  const bass = page.locator('compost-clip-grid[data-grid="1"]');
  const state = page.locator('[data-option-state]');

  // every clip button says which track it is on
  await expect(drums.getByRole('button', { name: 'Launch fill.b on Drums' })).toHaveCount(1);
  await expect(bass.getByRole('button', { name: /^ride\.c on Bass, stopped/u })).toHaveCount(0);
  await drums.getByRole('button', { name: 'Launch fill.b on Drums' }).click();
  await expect(state).toHaveText('fill.b queued · stopped');
  await expect(state).toHaveText('fill.b playing · stopped', { timeout: 3000 });
  await expect(drums.locator('.row[data-state="playing"] .progress')).toHaveCount(1);
  await drums.getByRole('button', { name: 'Stop Drums' }).click();
  await expect(drums).toHaveAttribute('stop', 'queued');
  await expect(state).toHaveText('stopped · stopped', { timeout: 3000 });

  // a name dragged onto the other grid's empty slot lands there
  const name = drums.getByRole('button', { name: /^ride\.c/ });
  const from = await name.boundingBox();
  const targetRow = bass.locator('.row').nth(3);
  const to = await targetRow.boundingBox();
  await page.mouse.move(from.x + 5, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 8 });
  await expect(targetRow).toHaveAttribute('data-occupied', 'move');
  await page.mouse.up();
  await expect(bass.getByRole('button', { name: /^ride\.c/ })).toHaveCount(1);
  await expect(drums.getByRole('button', { name: /^ride\.c/ })).toHaveCount(0);

  // an armed track offers a record ring in an empty slot
  await page.locator('[data-option="grid-armed"]').check();
  await drums.getByRole('button', { name: 'Record into Drums slot 5' }).click();
  await expect(drums.getByRole('button', { name: /^take 5/ })).toHaveCount(1);

  // a focused name opens from the keyboard too: Shift-Enter, or e
  const log = page.locator('[data-log]');
  await drums.getByRole('button', { name: /^break\.a/ }).focus();
  await page.keyboard.press('Shift+Enter');
  await expect(log).toContainText('clip-open break.a');
  await page.locator('[data-log]').evaluate((node) => { node.textContent = ''; });
  await drums.getByRole('button', { name: /^break\.a/ }).focus();
  await page.keyboard.press('e');
  await expect(log).toContainText('clip-open break.a');
});

test('clip grid paints a noninteractive timeline provenance row below stop', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-clip-grid/');
  const timelineGrid = page.locator('compost-clip-grid[data-grid="0"]');
  const overriddenGrid = page.locator('compost-clip-grid[data-grid="1"]');
  const metrics = await timelineGrid.evaluate((element) => {
    const root = element.shadowRoot;
    const rows = root.querySelectorAll('.row:not(.stop)');
    const stop = root.querySelector('.row.stop').getBoundingClientRect();
    const from = root.querySelector('.from').getBoundingClientRect();
    const style = getComputedStyle(root.querySelector('.from'));
    return {
      rows: rows.length,
      stopBottom: stop.bottom,
      fromTop: from.top,
      fromHeight: from.height,
      expectedHeight: parseFloat(style.fontSize) * 2.2,
    };
  });
  expect(metrics.rows).toBe(5);
  expect(Math.abs(metrics.fromTop - metrics.stopBottom)).toBeLessThan(1);
  expect(Math.abs(metrics.fromHeight - metrics.expectedHeight)).toBeLessThan(1);

  const from = timelineGrid.locator('.from');
  await expect(from).toContainText('timeline ▶');
  await expect(from).toContainText('verse');
  await expect(from).toHaveAttribute('role', 'status');
  await expect(from).not.toHaveAttribute('aria-hidden');
  await expect(timelineGrid.getByRole('status')).toContainText('timeline ▶');
  const nodeIdentity = await timelineGrid.evaluate((element) => {
    const root = element.shadowRoot;
    const before = {
      progress: root.querySelector('.from-progress'),
      label: root.querySelector('.from-label'),
      name: root.querySelector('.from-name'),
    };
    element.setFrom({ kind: 'timeline', name: 'verse', progress: 0.2 });
    const after = {
      progress: root.querySelector('.from-progress'),
      label: root.querySelector('.from-label'),
      name: root.querySelector('.from-name'),
    };
    return {
      sameProgress: before.progress === after.progress,
      sameLabel: before.label === after.label,
      sameName: before.name === after.name,
      width: after.progress.style.width,
      pointerEvents: getComputedStyle(root.querySelector('.from')).pointerEvents,
    };
  });
  expect(nodeIdentity).toEqual({
    sameProgress: true, sameLabel: true, sameName: true, width: '20%', pointerEvents: 'none',
  });
  await timelineGrid.evaluate((element) => {
    element.setFrom({ kind: 'timeline', name: 'verse', progress: 0.62 });
  });
  const progress = await from.locator('.from-progress').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    parent: element.parentElement.getBoundingClientRect().width,
  }));
  expect(progress.width / progress.parent).toBeCloseTo(0.62, 2);
  const defaultWash = await from.locator('.from-progress')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await timelineGrid.evaluate((element) => {
    element.style.setProperty('--compost-clip-grid-signal', 'rgb(20, 120, 240)');
  });
  const customWash = await from.locator('.from-progress')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(customWash).not.toBe(defaultWash);
  expect(customWash).toContain('0.15');

  await timelineGrid.evaluate((element) => {
    element.testEvents = [];
    for (const type of ['clip-launch', 'clip-stop', 'clip-select', 'clip-drop']) {
      element.addEventListener(type, () => element.testEvents.push(type));
    }
    element.shadowRoot.querySelector('.from').dispatchEvent(new MouseEvent('click', {
      bubbles: true, composed: true,
    }));
  });
  expect(await timelineGrid.evaluate((element) => element.testEvents)).toEqual([]);

  await expect(overriddenGrid.locator('.from .from-label')).toHaveText('timeline ◂');
  await expect(overriddenGrid.locator('.from .from-name')).toHaveText('overridden');
  const overriddenColours = await overriddenGrid.locator('.from').evaluate((element) => ({
    label: getComputedStyle(element.querySelector('.from-label')).color,
    name: getComputedStyle(element.querySelector('.from-name')).color,
  }));
  expect(overriddenColours.label).toBe(overriddenColours.name);
  await overriddenGrid.evaluate((element) => element.setFrom(null));
  await expect(overriddenGrid.locator('.from')).toHaveAttribute('hidden', '');
  expect(await overriddenGrid.locator('.row:not(.stop)').count()).toBe(5);
});

test('timeline reports move, trim, delete and ruler seek intents', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const clip = timeline.locator('.clip[data-id="beat"]');
  const ruler = timeline.locator('.ruler-wrap');
  await timeline.evaluate((element) => {
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [{ id: 'beat', name: 'beat', start: 0, length: 8, duration: 2, loop: true }] }]);
    element.testEvents = [];
    for (const type of ['clip-move', 'clip-trim', 'clip-delete', 'seek']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
  });
  const pxPerBeat = await timeline.evaluate((element) => element.pxPerBeat);

  let box = await clip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  let events = await timeline.evaluate((element) => element.testEvents);
  const move = events.find((event) => event.type === 'clip-move');
  expect(move.detail.deltaBeats).toBe(200 / pxPerBeat);

  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.setAttribute('snap', 'grid');
  });
  box = await clip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat * .63,
    box.y + box.height / 2, { steps: 4 });
  const snappedPreview = await timeline.evaluate((element) => ({
    delta: element.drag?.previewDelta,
    transform: element.shadowRoot.querySelector('.clip[data-id="beat"]')?.style.transform,
  }));
  expect(snappedPreview.delta).toBe(1);
  expect(snappedPreview.transform).toContain(`translate(${pxPerBeat}px`);
  await page.mouse.up();
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.find((event) => event.type === 'clip-move').detail.deltaBeats).toBe(1);
  await timeline.evaluate((element) => element.setAttribute('snap', 'off'));

  box = await clip.boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'clip-trim')).toBe(true);

  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [{ id: 'beat', name: 'beat', start: 0, length: 8, duration: 2, loop: true }] }]);
  });
  box = await clip.boundingBox();
  const originalTrim = await clip.boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 4 });
  const previewTrim = await clip.boundingBox();
  const trimPointerId = await timeline.evaluate((element) => element.drag?.pointerId);
  await timeline.evaluate((element, id) => element.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, composed: true, pointerId: id, pointerType: 'mouse', button: 0,
  })), trimPointerId);
  const restoredTrim = await clip.boundingBox();
  expect(previewTrim.width).not.toBeCloseTo(originalTrim.width, 0);
  expect(Math.abs(restoredTrim.x - originalTrim.x)).toBeLessThan(1);
  expect(Math.abs(restoredTrim.width - originalTrim.width)).toBeLessThan(1);
  expect(await timeline.evaluate((element) => element.testEvents)).toEqual([]);
  await page.mouse.up();

  await clip.press('Delete');
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'clip-delete')).toBe(true);

  const rulerBox = await ruler.boundingBox();
  await page.mouse.click(rulerBox.x + 100, rulerBox.y + rulerBox.height / 2);
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'seek' && event.detail.source === 'ruler')).toBe(true);
});

test('timeline rulers expose locators, time selections and measured row geometry', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    document.documentElement.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-automation-row-height');
    element.style.removeProperty('--compost-timeline-row-height');
    element.setAttribute('snap', 'grid');
    element.testEvents = [];
    for (const type of ['locator-jump', 'locator-move', 'locator-create', 'locator-rename', 'locator-context', 'locator-prev', 'locator-next', 'time-select-input', 'time-select', 'time-delete', 'clip-select', 'clip-split', 'seek', 'fit-request', 'loop-change']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([
      { id: 'a', name: 'A', clips: [], automation: [{ id: 'volume', label: 'Volume', min: 0, max: 1, points: [] }] },
      { id: 'b', name: 'B', clips: [{ id: 'inside', name: 'inside', start: 5, length: 1, duration: 1, notes: [] }] },
      { id: 'c', name: 'C', compact: true, clips: [{ id: 'crossing', name: 'crossing', start: 3, length: 6, duration: 6, notes: [] }] },
    ]);
    element.setLocators([{ id: 'drop', beat: 8, name: 'drop' }, { id: 'intro', beat: 0, name: 'intro' }]);
    element.setTimeSelection(null, null);
    element.setLoop(0, 8, false);
  });
  const geometry = await timeline.evaluate((element) => {
    const root = element.shadowRoot;
    const frame = root.querySelector('.frame');
    const ruler = root.querySelector('.ruler-wrap').getBoundingClientRect();
    const header = root.querySelector('.lane-header[data-lane-id="a"]').getBoundingClientRect();
    const body = root.querySelector('.lane[data-lane-id="a"]').getBoundingClientRect();
    const thinHeader = root.querySelector('.lane-header[data-lane-id="c"]').getBoundingClientRect();
    const thinBody = root.querySelector('.lane[data-lane-id="c"]').getBoundingClientRect();
    return {
      columns: Number.parseFloat(getComputedStyle(frame).gridTemplateColumns),
      ruler: ruler.height,
      header: header.height,
      body: body.height,
      base: root.querySelector('.lane[data-lane-id="a"] .lane-base').getBoundingClientRect().height,
      automationHeader: root.querySelector('.lane-header[data-lane-id="a"] .automation-header').getBoundingClientRect().height,
      automationRow: root.querySelector('.lane[data-lane-id="a"] .automation-row').getBoundingClientRect().height,
      thinHeader: thinHeader.height,
      thinBody: thinBody.height,
      locators: [...root.querySelectorAll('.ruler-locator')].map((node) => ({ id: node.dataset.locatorId, left: node.getBoundingClientRect().left })),
      rulerScrollbar: getComputedStyle(root.querySelector('.ruler-wrap')).scrollbarWidth,
      lanesScrollbar: getComputedStyle(root.querySelector('.lanes-wrap')).scrollbarWidth,
    };
  });
  expect(Math.abs(geometry.columns - 121)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.ruler - 36.3)).toBeLessThan(1);
  expect(Math.abs(geometry.header - 70)).toBeLessThan(1);
  expect(Math.abs(geometry.body - 70)).toBeLessThan(1);
  expect(Math.abs(geometry.base - 44)).toBeLessThan(1);
  expect(Math.abs(geometry.automationHeader - 26)).toBeLessThan(1);
  expect(Math.abs(geometry.automationRow - 26)).toBeLessThan(1);
  expect(Math.abs(geometry.thinHeader - 27.5)).toBeLessThan(1);
  expect(Math.abs(geometry.thinBody - 27.5)).toBeLessThan(1);
  expect(geometry.locators.map(({ id }) => id)).toEqual(['intro', 'drop']);
  expect(geometry.rulerScrollbar).toBe('none');
  expect(geometry.lanesScrollbar).toBe('none');
  await expect(timeline.locator('.ruler-locator[data-locator-id="intro"]')).toHaveAttribute('tabindex', '0');

  await timeline.locator('.ruler-locator[data-locator-id="drop"]').click();
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'locator-jump'))).toEqual({ type: 'locator-jump', detail: { id: 'drop' } });
  await timeline.locator('.ruler-locator[data-locator-id="intro"]').focus();
  await page.keyboard.press('Space');
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'locator-jump').at(-1))).toEqual({ type: 'locator-jump', detail: { id: 'intro' } });
  await page.keyboard.press('F2');
  await timeline.locator('.ruler-locator-editor').fill('opening');
  await timeline.locator('.ruler-locator-editor').press('Enter');
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'locator-rename'))).toEqual({ type: 'locator-rename', detail: { id: 'intro', name: 'opening' } });
  const locator = timeline.locator('.ruler-locator[data-locator-id="intro"]');
  const locatorBox = await locator.boundingBox();
  const rulerBox = await timeline.locator('.ruler-wrap').boundingBox();
  await page.mouse.move(locatorBox.x + 2, locatorBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(rulerBox.x + 48, locatorBox.y + 4, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'locator-move'))).toEqual({ type: 'locator-move', detail: { id: 'intro', beat: 2 } });
  await locator.click({ button: 'right' });
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'locator-context'))).toMatchObject({ type: 'locator-context', detail: { id: 'intro' } });

  await page.mouse.dblclick(rulerBox.x + 100, rulerBox.y + 5);
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'locator-create'))).toEqual({ type: 'locator-create', detail: { beat: 4 } });

  await timeline.evaluate((element) => { element.testEvents = []; element.setTimeSelection(null, null); });
  const lanesBox = await timeline.locator('.lanes-wrap').boundingBox();
  const laneB = await timeline.locator('.lane[data-lane-id="b"]').boundingBox();
  const laneC = await timeline.locator('.lane[data-lane-id="c"]').boundingBox();
  const pxPerBeat = await timeline.evaluate((element) => element.pxPerBeat);
  const startX = lanesBox.x + 4 * pxPerBeat;
  const endX = lanesBox.x + 8 * pxPerBeat;
  await page.mouse.move(startX, laneB.y + laneB.height / 2);
  await page.mouse.down();
  await page.mouse.move(endX, laneC.y + laneC.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'time-select'))).toEqual({ type: 'time-select', detail: { start: 4, end: 8, laneIds: ['b', 'c'] } });
  expect(await timeline.evaluate((element) => ({
    selection: element.timeSelection,
    selected: element.selected,
    bands: [...element.shadowRoot.querySelectorAll('.time-selection')].map((node) => node.dataset.laneId),
    rulerBand: element.shadowRoot.querySelector('.ruler-time-selection').getBoundingClientRect().width,
  }))).toEqual({ selection: { start: 4, end: 8, laneIds: ['b', 'c'] }, selected: ['inside'], bands: ['b', 'c'], rulerBand: 96 });
  expect(await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'clip-select'))).toEqual([
    { type: 'clip-select', detail: { ids: ['inside'] } },
  ]);
  await timeline.evaluate((element) => element.setTimeSelection(null, null));
  expect(await timeline.evaluate((element) => ({ selection: element.timeSelection, selected: element.selected }))).toEqual({ selection: null, selected: ['inside'] });

  await timeline.evaluate((element) => { element.testEvents = []; element.setTimeSelection(null, null); });
  const laneA = await timeline.locator('.lane[data-lane-id="a"]').boundingBox();
  await page.mouse.move(lanesBox.x + 4 * pxPerBeat, laneA.y + laneA.height / 2);
  await page.mouse.down();
  await page.mouse.move(lanesBox.x + 8 * pxPerBeat, laneC.y + laneC.height + 8, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'time-select'))).toEqual({ type: 'time-select', detail: { start: 4, end: 8, laneIds: ['a', 'b', 'c'] } });
  await timeline.evaluate((element) => { element.testEvents = []; element.setTimeSelection(4, 8, ['b', 'c']); });

  await timeline.focus();
  await page.keyboard.press('l');
  await expect.poll(() => timeline.evaluate((element) => element.loopEnd)).toBe(8);
  await page.keyboard.press('Shift+Delete');
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'time-delete'))).toEqual({ type: 'time-delete', detail: { start: 4, end: 8, laneIds: ['b', 'c'], removeTime: true } });
  await page.keyboard.press('Control+e');
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'clip-split'))).toEqual({ type: 'clip-split', detail: { ids: ['inside'], beats: [4, 8], laneIds: ['b', 'c'] } });
  await timeline.evaluate((element) => { element.testEvents = []; element.setTimeSelection(4, 8, ['c']); });
  await page.keyboard.press('Control+e');
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'clip-split'))).toEqual({ type: 'clip-split', detail: { ids: [], beats: [4, 8], laneIds: ['c'] } });

  await timeline.evaluate((element) => { element.testEvents = []; element.setTimeSelection(2, 4, ['b']); element.scrollBeat = 0; element.pxPerBeat = 24; });
  const beforeScroll = await timeline.evaluate((element) => element.shadowRoot.querySelector('.ruler-time-selection').getBoundingClientRect().width);
  await timeline.evaluate((element) => { element.scrollBeat = 2; });
  const afterScroll = await timeline.evaluate((element) => element.shadowRoot.querySelector('.ruler-time-selection').getBoundingClientRect().width);
  expect(Math.abs(beforeScroll - afterScroll)).toBeLessThan(1);
  const row2Y = rulerBox.y + 2.0 * 11;
  await page.mouse.move(rulerBox.x + 180, row2Y);
  await page.mouse.down();
  await page.mouse.move(rulerBox.x + 120, row2Y, { steps: 4 });
  await page.mouse.up();
  expect(await timeline.evaluate((element) => element.scrollBeat)).toBeGreaterThan(2);

  await timeline.evaluate((element) => { element.scrollBeat = 0; element.pxPerBeat = 24; });
  await page.keyboard.down('Control');
  await page.mouse.move(rulerBox.x + 120, row2Y);
  await page.mouse.down();
  await page.mouse.move(rulerBox.x + 160, row2Y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  expect(await timeline.evaluate((element) => element.pxPerBeat)).toBeGreaterThan(24);
  await page.mouse.dblclick(rulerBox.x + 160, row2Y);
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'fit-request'))).toMatchObject({ type: 'fit-request', detail: {} });

  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.setTimeSelection(2, 4, ['b']);
    element.setLaneAutomation('a', []);
  });
  const beforeAutomationHeight = await timeline.evaluate((element) => {
    const overlay = element.shadowRoot.querySelector('.time-selection[data-lane-id="b"]').getBoundingClientRect();
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="b"]').getBoundingClientRect();
    return {
      selection: element.timeSelection,
      bands: [...element.shadowRoot.querySelectorAll('.time-selection')].map((node) => node.dataset.laneId),
      overlayTop: overlay.top,
      overlayHeight: overlay.height,
      laneTop: lane.top,
      laneHeight: lane.height,
    };
  });
  expect(beforeAutomationHeight.selection).toEqual({ start: 2, end: 4, laneIds: ['b'] });
  expect(beforeAutomationHeight.bands).toEqual(['b']);
  expect(Math.abs(beforeAutomationHeight.overlayTop - beforeAutomationHeight.laneTop)).toBeLessThan(1);
  expect(Math.abs(beforeAutomationHeight.overlayHeight - beforeAutomationHeight.laneHeight)).toBeLessThan(1);
  const cancelLane = await timeline.locator('.lane[data-lane-id="b"]').boundingBox();
  const cancelStart = lanesBox.x + 2 * 24;
  await page.mouse.move(cancelStart, cancelLane.y + cancelLane.height / 2);
  await page.mouse.down();
  await page.mouse.move(lanesBox.x + 7 * 24, cancelLane.y + cancelLane.height / 2, { steps: 3 });
  await timeline.evaluate((element) => { element.testEvents = []; });
  const cancelPointerId = await timeline.evaluate((element) => element.drag?.pointerId);
  await timeline.evaluate((element, id) => element.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, composed: true, pointerId: id, pointerType: 'mouse', button: 0,
  })), cancelPointerId);
  expect(await timeline.evaluate((element) => ({
    selection: element.timeSelection,
    events: element.testEvents,
    drag: element.drag,
    pointers: element.pointers.size,
  }))).toEqual({ selection: { start: 2, end: 4, laneIds: ['b'] }, events: [], drag: null, pointers: 0 });
  await page.mouse.up();

  await timeline.evaluate((element) => {
    element.setTimeSelection(2, 4, ['b']);
    element.setLaneAutomation('a', [{ id: 'volume', label: 'Volume', min: 0, max: 1, points: [] }]);
  });
  const afterAutomationHeight = await timeline.evaluate((element) => {
    const overlay = element.shadowRoot.querySelector('.time-selection[data-lane-id="b"]').getBoundingClientRect();
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="b"]').getBoundingClientRect();
    return { overlayTop: overlay.top, overlayHeight: overlay.height, laneTop: lane.top, laneHeight: lane.height };
  });
  expect(Math.abs(afterAutomationHeight.overlayTop - afterAutomationHeight.laneTop)).toBeLessThan(1);
  expect(Math.abs(afterAutomationHeight.overlayHeight - afterAutomationHeight.laneHeight)).toBeLessThan(1);
  expect(afterAutomationHeight.laneTop).toBeGreaterThan(beforeAutomationHeight.laneTop);

  await timeline.evaluate((element) => { element.testEvents = []; element.setPlayhead(4); });
  await timeline.locator('.ruler-locator[data-locator-id="intro"]').focus();
  await page.keyboard.press(',');
  await page.keyboard.press('.');
  await expect.poll(() => timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'locator-prev' || event.type === 'locator-next'))).toEqual([
    { type: 'locator-prev', detail: { id: 'intro' } },
    { type: 'locator-next', detail: { id: 'drop' } },
  ]);
});

test('timeline enters from the keyboard and nudges before arrow navigation', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [{ id: 'beat', name: 'beat', start: 0, length: 8, duration: 2, loop: true }] }]);
    element.testEvents = [];
    element.addEventListener('clip-select', (event) => element.testEvents.push({ type: 'clip-select', detail: event.detail }));
    element.addEventListener('clip-nudge', (event) => element.testEvents.push({ type: 'clip-nudge', detail: event.detail }));
  });

  await timeline.focus();
  await page.keyboard.press('ArrowRight');
  const entry = await timeline.evaluate((element) => ({
    activeId: element.shadowRoot.activeElement?.dataset.id,
    selected: element.selected,
  }));
  expect(entry.activeId).toBe('beat');
  expect(entry.selected).toEqual(['beat']);

  await timeline.evaluate((element) => { element.testEvents = []; });
  await page.keyboard.press('Alt+ArrowRight');
  const nudge = await timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'clip-nudge'));
  expect(nudge.detail).toEqual({ ids: ['beat'], deltaBeats: 1 });
  expect(await timeline.evaluate((element) => element.selected)).toEqual(['beat']);
});

test('timeline keeps lane headers aligned and touch drags scroll time', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('seek', (event) => element.testEvents.push({ type: 'seek', detail: event.detail }));
    element.setLanes(Array.from({ length: 12 }, (_, index) => ({
      id: `lane-${index}`,
      name: `Lane ${index}`,
      clips: index === 0 ? [{ id: 'beat', name: 'beat', start: 0, length: 8, duration: 2, loop: true }] : [],
    })));
  });

  const alignment = await timeline.evaluate((element) => {
    const lanes = element.shadowRoot.querySelector('.lanes-wrap');
    lanes.scrollTop = 84;
    lanes.dispatchEvent(new Event('scroll'));
    const header = element.shadowRoot.querySelector('.lane-header[data-lane-id="lane-4"]');
    const row = element.shadowRoot.querySelector('.lane[data-lane-id="lane-4"]');
    return { delta: header.getBoundingClientRect().top - row.getBoundingClientRect().top, scrollTop: lanes.scrollTop };
  });
  expect(alignment.scrollTop).toBe(84);
  expect(Math.abs(alignment.delta)).toBeLessThan(0.5);

  const touchDrag = await timeline.evaluate((element) => {
    const lanes = element.shadowRoot.querySelector('.lanes-wrap');
    lanes.scrollTop = 0;
    lanes.dispatchEvent(new Event('scroll'));
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="lane-11"]');
    const send = (type, clientX, clientY) => lane.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 17, pointerType: 'touch', button: 0, clientX, clientY,
    }));
    send('pointerdown', 320, 180);
    send('pointermove', 200, 180);
    send('pointerup', 200, 180);
    return element.scrollBeat;
  });
  expect(touchDrag).toBe(5);

  const verticalTouchDrag = await timeline.evaluate((element) => {
    const lanes = element.shadowRoot.querySelector('.lanes-wrap');
    lanes.scrollTop = 0;
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="lane-11"]');
    const send = (type, clientX, clientY) => lane.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 19, pointerType: 'touch', button: 0, clientX, clientY,
    }));
    send('pointerdown', 320, 180);
    send('pointermove', 320, 60);
    send('pointerup', 320, 60);
    return lanes.scrollTop;
  });
  expect(verticalTouchDrag).toBe(120);

  const touchTap = await timeline.evaluate((element) => {
    element.testEvents = [];
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="lane-11"]');
    const send = (type) => lane.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 18, pointerType: 'touch', button: 0, clientX: 320, clientY: 180,
    }));
    send('pointerdown');
    send('pointerup');
    return element.testEvents.find((event) => event.type === 'seek');
  });
  expect(touchTap.detail.source).toBe('lane');
});

test('timeline defaults to bounded neutral clips with ordinary selection', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([{ id: 'lane', name: 'Lane A', clips: [
      { id: 'playing', name: 'playing', start: 0, length: 4, duration: 4, state: 'playing', progress: .5 },
    ] }]);
    element.selected = ['playing'];
  });
  const measured = await timeline.evaluate((element) => {
    const lane = element.shadowRoot.querySelector('.lane');
    const header = element.shadowRoot.querySelector('.lane-header');
    const clip = element.shadowRoot.querySelector('.clip');
    const clipProgress = clip.querySelector('.clip-progress');
    return {
      laneBackground: getComputedStyle(lane).backgroundColor,
      clipBackground: getComputedStyle(clip).backgroundColor,
      clipBorder: getComputedStyle(clip).boxShadow,
      clipRadius: getComputedStyle(clip).borderRadius,
      selectedOutline: getComputedStyle(clip).outlineStyle,
      cornerOpacity: getComputedStyle(clip, '::before').opacity,
      headerWidth: header.getBoundingClientRect().width,
      progressWidth: clipProgress?.getBoundingClientRect().width ?? 0,
      hasNumber: Boolean(header.querySelector('.number')),
    };
  });
  expect(measured.clipBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(measured.clipBorder).not.toBe('none');
  expect(measured.clipRadius).toBe('2px');
  expect(measured.selectedOutline).toBe('solid');
  expect(measured.cornerOpacity).toBe('0');
  expect(measured.headerWidth).toBeLessThan(250);
  expect(measured.progressWidth).toBeGreaterThan(0);
  expect(measured.hasNumber).toBe(false);
});

test('timeline swaps structured note marks for a caller-owned clip preview', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const result = await timeline.evaluate((element) => {
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [{ id: 'clip', name: 'Clip',
      start: 0, length: 4, duration: 4, notes: [{ start: 0, duration: 1, note: 60 }] }] }]);
    const before = element.shadowRoot.querySelectorAll('.clip-note').length;
    const preview = document.createElement('div');
    preview.textContent = 'caller preview';
    element.setClipPreview('clip', preview);
    const slot = element.shadowRoot.querySelector('.clip-preview');
    const custom = {
      marks: element.shadowRoot.querySelectorAll('.clip-note').length,
      assigned: slot.assignedElements()[0] === preview,
      part: slot.getAttribute('part'),
    };
    element.setClipPreview('clip', null);
    return { before, custom, restored: element.shadowRoot.querySelectorAll('.clip-note').length };
  });
  expect(result).toEqual({ before: 1, custom: { marks: 0, assigned: true, part: 'clip-preview' }, restored: 1 });
});

test('timeline paints velocity dashes, hidden envelopes and clip drop targets', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.removeAttribute('automation');
    element.setLanes([
      { id: 'source', name: 'Source', color: 'rgb(40, 120, 180)', envelope: {
        min: 0, max: 1, stepped: false, points: [{ beat: 0, value: .4 }, { beat: 2, value: .8 }, { beat: 4, value: .5 }],
      }, clips: [{ id: 'velocity', name: 'velocity', start: 0, length: 4, duration: 4, loop: false, notes: [
        { start: 0, duration: .25, note: 60, velocity: 30 },
        { start: 1, duration: .25, note: 64, velocity: 80 },
        { start: 2, duration: .25, note: 67, velocity: 120 },
        { start: 3, duration: .25, note: 72 },
      ] }, { id: 'lit', name: 'lit', start: 5, length: 1, duration: 1, state: 'playing', notes: [{ start: 0, duration: .25, note: 60, velocity: 30 }] }] },
      { id: 'target', name: 'Target', clips: [] },
      { id: 'dimmed', name: 'Dimmed', dimmed: true, clips: [{ id: 'dimmed-clip', name: 'dimmed', start: 0, length: 1, duration: 1, notes: [] }] },
    ]);
  });
  const painted = await timeline.evaluate((element) => {
    const root = element.shadowRoot;
    const notes = [...root.querySelectorAll('.clip[data-id="velocity"] .clip-note')];
    const envelope = root.querySelector('.lane-envelope-line');
    const overlay = root.querySelector('.lane-envelope-overlay');
    const playingNotes = root.querySelector('.clip[data-id="lit"] .clip-notes');
    const dimmedLane = root.querySelector('.lane[data-lane-id="dimmed"]');
    const dimmedClip = root.querySelector('.clip[data-id="dimmed-clip"]');
    const sourceBase = root.querySelector('.lane[data-lane-id="source"] .lane-base');
    const lanesWorld = root.querySelector('.lanes-world');
    return {
      opacities: notes.map((node) => Number(getComputedStyle(node).opacity)),
      envelopeOpacity: Number(getComputedStyle(envelope).opacity),
      envelopePath: envelope.getAttribute('d'),
      overlayPointerEvents: getComputedStyle(overlay).pointerEvents,
      playingNotesOpacity: Number(getComputedStyle(playingNotes).opacity),
      dimmed: dimmedLane.hasAttribute('data-dimmed'),
      dimmedClipOpacity: Number(getComputedStyle(dimmedClip).opacity),
      dimmedFilter: getComputedStyle(dimmedLane).filter,
      envelopeHeight: overlay.getBoundingClientRect().height,
      baseHeight: sourceBase.getBoundingClientRect().height,
      envelopeWidth: overlay.getBoundingClientRect().width,
      worldWidth: lanesWorld.getBoundingClientRect().width,
    };
  });
  expect(painted.opacities[0]).toBeCloseTo(.4417, 3);
  expect(painted.opacities[1]).toBeCloseTo(.678, 3);
  expect(painted.opacities[2]).toBeCloseTo(.867, 3);
  expect(painted.opacities[3]).toBeCloseTo(.55, 3);
  expect(painted.envelopeOpacity).toBeCloseTo(.3, 3);
  expect(painted.envelopePath).toContain('L');
  expect(painted.overlayPointerEvents).toBe('none');
  expect(painted.playingNotesOpacity).toBeCloseTo(1, 3);
  expect(painted.dimmed).toBe(true);
  expect(painted.dimmedClipOpacity).toBeCloseTo(.4, 3);
  expect(painted.dimmedFilter).toBe('none');
  expect(Math.abs(painted.envelopeHeight - painted.baseHeight)).toBeLessThan(1);
  expect(Math.abs(painted.envelopeWidth - painted.worldWidth)).toBeLessThan(1);

  await timeline.evaluate((element) => element.setAttribute('automation', ''));
  await expect(timeline.locator('.lane-envelope-overlay')).toHaveCount(0);
  await timeline.evaluate((element) => element.removeAttribute('automation'));
  await expect(timeline.locator('.lane-envelope-overlay')).toHaveCount(1);

  const source = timeline.locator('.clip[data-id="velocity"]');
  const target = timeline.locator('.lane[data-lane-id="target"]');
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 40, targetBox.y + targetBox.height / 2, { steps: 3 });
  await expect(target).toHaveAttribute('data-drop-target', '');
  await page.mouse.up();
  await expect(target).not.toHaveAttribute('data-drop-target', '');
  await expect(source).not.toHaveAttribute('data-dragging', '');
  expect(await source.evaluate((node) => node.style.transform)).toBe('');

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 40, targetBox.y + targetBox.height / 2, { steps: 3 });
  await expect(source).toHaveAttribute('data-dragging', '');
  const pointerId = await timeline.evaluate((element) => element.drag?.pointerId);
  await timeline.evaluate((element, id) => element.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, composed: true, pointerId: id, pointerType: 'mouse', button: 0,
  })), pointerId);
  await expect(source).not.toHaveAttribute('data-dragging', '');
  expect(await source.evaluate((node) => node.style.transform)).toBe('');
  await expect(target).not.toHaveAttribute('data-drop-target', '');
  await page.mouse.up();
});

test('timeline slots caller-owned lane headers without taking over their controls', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([{ id: 'caller', name: 'Fallback', clips: [] }]);
    const header = document.createElement('div');
    header.className = 'caller-header';
    header.innerHTML = '<span>Caller header</span><button type="button">route</button>';
    header.querySelector('button').addEventListener('click', () => { header.dataset.clicked = ''; });
    element.setLaneHeader('caller', header);
  });
  const header = timeline.locator(':scope > .caller-header');
  await expect(header).toHaveAttribute('slot', 'lane-header-caller');
  await expect(header).toBeVisible();
  await expect(header).toContainText('Caller header');
  await header.locator('button').click();
  await expect(header).toHaveAttribute('data-clicked', '');
});

test('timeline dimming is a generic presentation flag', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => element.setLanes([{ id: 'lane', name: 'Track', color: 'rgb(40, 120, 180)', clips: [
    { id: 'clip', name: 'clip', start: 0, length: 1, duration: 1, notes: [] },
  ] }]));
  await timeline.evaluate((element) => element.setLanes([{ id: 'lane', name: 'Track', color: 'rgb(40, 120, 180)', dimmed: true, clips: [
    { id: 'clip', name: 'clip', start: 0, length: 1, duration: 1, notes: [] },
  ] }]));
  const dimmed = await timeline.evaluate((element) => {
    const lane = element.shadowRoot.querySelector('.lane');
    return {
      dimmed: lane.hasAttribute('data-dimmed'),
      filter: getComputedStyle(lane).filter,
      clipOpacity: getComputedStyle(lane.querySelector('.clip')).opacity,
    };
  });
  expect(dimmed.dimmed).toBe(true);
  expect(dimmed.filter).toBe('none');
  expect(dimmed.clipOpacity).toBe('0.4');
});

test('timeline keeps low-zoom loop caps at least 8px apart', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([{ id: 'lane', name: 'Loop', clips: [{ id: 'loop', name: 'loop', start: 0, length: 12, duration: 1, loop: true, notes: [] }] }]);
    element.pxPerBeat = 4;
  });
  const geometry = await timeline.evaluate((element) => {
    const lines = [...element.shadowRoot.querySelectorAll('.clip-loop-line')].map((node) => node.getBoundingClientRect().left);
    return { count: lines.length, gaps: lines.slice(1).map((left, index) => left - lines[index]) };
  });
  expect(geometry.count).toBe(6);
  expect(Math.min(...geometry.gaps)).toBeGreaterThanOrEqual(8);
});

test('timeline leaves most of a phone-width view for arrangement editing', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const widths = await timeline.evaluate((element) => {
    element.style.width = '375px';
    const root = element.shadowRoot;
    return {
      host: element.getBoundingClientRect().width,
      header: root.querySelector('.header-wrap').getBoundingClientRect().width,
      lanes: root.querySelector('.lanes-wrap').getBoundingClientRect().width,
    };
  });
  expect(widths.host).toBe(375);
  expect(widths.header).toBeLessThanOrEqual(widths.host * .44 + 1);
  expect(widths.lanes).toBeGreaterThanOrEqual(widths.host * .56 - 1);
});

test('timeline aligns regular and compact lanes with automation rows', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    document.documentElement.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-automation-row-height');
    element.style.removeProperty('--compost-timeline-row-height');
    element.syncAttributes();
    element.setLanes([
      { id: 'regular', name: 'Regular', picked: true, clips: [], automation: [
        { id: 'env', label: 'Env', min: 0, max: 1, stepped: false, points: [] },
      ] },
      { id: 'compact', name: 'Compact', compact: true, clips: [] },
    ]);
  });
  const measured = await timeline.evaluate((element) => {
    const root = element.shadowRoot;
    const bounds = (selector) => root.querySelector(selector).getBoundingClientRect();
    return {
      regularHeader: bounds('.lane-header[data-lane-id="regular"]').height,
      regularLane: bounds('.lane[data-lane-id="regular"]').height,
      regularBase: bounds('.lane[data-lane-id="regular"] .lane-base').height,
      compactHeader: bounds('.lane-header[data-lane-id="compact"]').height,
      compactLane: bounds('.lane[data-lane-id="compact"]').height,
      compactBase: bounds('.lane[data-lane-id="compact"] .lane-base').height,
      automationHeader: bounds('.lane-header[data-lane-id="regular"] .automation-header').height,
      automationRow: bounds('.lane[data-lane-id="regular"] .automation-row').height,
      pickedCornerOpacity: getComputedStyle(root.querySelector('.lane-name[data-picked]'), '::before').opacity,
      pickedOutline: getComputedStyle(root.querySelector('.lane-name[data-picked]')).outlineStyle,
    };
  });
  expect(Math.abs(measured.regularHeader - measured.regularLane)).toBeLessThan(1);
  expect(Math.abs(measured.compactHeader - measured.compactLane)).toBeLessThan(1);
  expect(Math.abs(measured.regularHeader - 70)).toBeLessThan(1);
  expect(Math.abs(measured.regularBase - 44)).toBeLessThan(1);
  expect(Math.abs(measured.compactHeader - 27.5)).toBeLessThan(1);
  expect(Math.abs(measured.compactBase - 27.5)).toBeLessThan(1);
  expect(Math.abs(measured.automationHeader - 26)).toBeLessThan(1);
  expect(Math.abs(measured.automationRow - 26)).toBeLessThan(1);
  expect(measured.pickedCornerOpacity).toBe('0');
  expect(measured.pickedOutline).toBe('solid');
});

test('timeline generic header intents stay local', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const events = await timeline.evaluate((element) => {
    element.testEvents = [];
    for (const type of ['lanes-context', 'lanes-create', 'lane-move']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([
      { id: 'a', name: 'A', picked: true, clips: [] },
      { id: 'b', name: 'B', clips: [] },
    ]);
    const root = element.shadowRoot;
    const wrap = root.querySelector('.header-wrap');
    wrap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, clientX: 20, clientY: 30 }));
    wrap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, clientX: 20, clientY: 30 }));
    const first = root.querySelector('.lane-header[data-lane-id="a"]');
    const second = root.querySelector('.lane-header[data-lane-id="b"]');
    const y = second.getBoundingClientRect().bottom - 1;
    const pointer = (type, clientY) => first.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 44, pointerType: 'mouse', button: 0,
      clientX: first.getBoundingClientRect().left + 20, clientY,
    }));
    pointer('pointerdown', first.getBoundingClientRect().top + 8);
    pointer('pointermove', y);
    pointer('pointerup', y);
    return element.testEvents;
  });
  expect(events.some((event) => event.type === 'lanes-context')).toBe(true);
  expect(events.some((event) => event.type === 'lanes-create')).toBe(true);
  expect(events.some((event) => event.type === 'lane-move')).toBe(true);
});

test('a real double-click on an empty MIDI lane emits one lane-create', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([{ id: 'midi', name: 'MIDI 1', clips: [] }]);
    element.testEvents = [];
    element.addEventListener('lane-create', (event) => element.testEvents.push({ type: 'lane-create', detail: event.detail }));
  });
  const lane = timeline.locator('.lane[data-lane-id="midi"]');
  const box = await lane.boundingBox();
  await page.mouse.dblclick(box.x + 44, box.y + box.height / 2);
  await expect.poll(() => timeline.evaluate((element) => element.testEvents)).toHaveLength(1);
  expect(await timeline.evaluate((element) => element.testEvents[0])).toMatchObject({
    type: 'lane-create', detail: { laneId: 'midi' },
  });
});

test('timeline automation rows draw and commit sorted edits without clip selection', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('snap', 'grid');
    element.style.setProperty('--compost-timeline-automation-row-height', '32px');
    element.testEvents = [];
    for (const type of ['automation-change', 'automation-context', 'clip-select']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([{ id: 'lane', name: 'MIDI 1', color: 'rgb(40, 120, 180)', clips: [
      { id: 'clip', name: 'clip', start: 0, length: 4, duration: 4, notes: [] },
    ], automation: [{
      id: 'volume', label: 'Volume', min: -90, max: 12, stepped: false, scale: 'gain', value: -3,
      points: [{ beat: 0, value: -12 }, { beat: 4, value: 0 }],
    }] }]);
  });
  const geometry = await timeline.evaluate((element) => {
    const lane = element.shadowRoot.querySelector('.lane');
    const base = element.shadowRoot.querySelector('.lane-base');
    const row = element.shadowRoot.querySelector('.automation-row');
    const on = { laneHeight: lane.getBoundingClientRect().height, baseHeight: base.getBoundingClientRect().height,
      rows: element.shadowRoot.querySelectorAll('.automation-row').length,
      baseLane: element.laneAtPoint(base.getBoundingClientRect().top + 4),
      rowLane: element.laneAtPoint(row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2) };
    element.removeAttribute('automation');
    const offLane = element.shadowRoot.querySelector('.lane');
    const off = { laneHeight: offLane.getBoundingClientRect().height,
      rows: element.shadowRoot.querySelectorAll('.automation-row').length };
    element.setAttribute('automation', '');
    return { on, off };
  });
  expect(geometry.on.rows).toBe(1);
  expect(geometry.on.laneHeight).toBeGreaterThan(geometry.on.baseHeight);
  expect(geometry.on.baseLane).toBe('lane');
  expect(geometry.on.rowLane).toBe('lane');
  expect(geometry.off.rows).toBe(0);
  expect(Math.abs(geometry.off.laneHeight - geometry.on.baseHeight)).toBeLessThanOrEqual(1);

  const row = timeline.locator('.automation-row');
  const rowBox = await row.boundingBox();
  // a real double-click: the first click must not rebuild the row under the pointer
  await page.mouse.dblclick(rowBox.x + 52, rowBox.y + rowBox.height * .7);
  let events = await timeline.evaluate((element) => element.testEvents);
  const add = events.find((event) => event.type === 'automation-change');
  expect(add.detail.laneId).toBe('lane');
  expect(add.detail.automationId).toBe('volume');
  expect(add.detail.points).toHaveLength(3);
  expect(add.detail.points[1].beat).toBe(2);

  const point = row.locator('compost-envelope-editor').locator('.point').nth(1);
  const pointBox = await point.boundingBox();
  await page.mouse.move(pointBox.x + pointBox.width / 2, pointBox.y + pointBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pointBox.x + 31, rowBox.y + rowBox.height + 40, { steps: 5 });
  await page.mouse.up();
  events = await timeline.evaluate((element) => element.testEvents);
  const moves = events.filter((event) => event.type === 'automation-change');
  expect(moves).toHaveLength(2);
  expect(moves[1].detail.points).toHaveLength(3);
  expect(moves[1].detail.points[1].beat).toBe(3);
  await point.focus();
  await page.keyboard.press('Shift+ArrowRight');
  events = await timeline.evaluate((element) => element.testEvents);
  const fineNudge = events.filter((event) => event.type === 'automation-change');
  expect(fineNudge).toHaveLength(3);
  expect(fineNudge[2].detail.points[1].beat).toBe(3.25);
  expect(events.filter((event) => event.type === 'clip-select')).toHaveLength(0);

  await row.click({ button: 'right' });
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'automation-context' && event.detail.automationId === 'volume')).toBe(true);
});

test('timeline gain curves show the same absolute-value interpolation as playback', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const midpoint = await timeline.evaluate((element) => {
    element.style.setProperty('--compost-timeline-automation-row-height', '100px');
    element.pxPerBeat = 24;
    element.setLanes([{ id: 'lane', name: 'MIDI 1', clips: [], automation: [{
      id: 'volume', label: 'Volume', min: -90, max: 12, stepped: false, scale: 'gain',
      points: [{ beat: 0, value: -90 }, { beat: 4, value: 12 }],
    }] }]);
    const editor = element.shadowRoot.querySelector('compost-envelope-editor');
    const path = editor.shadowRoot.querySelector('.line');
    const targetX = 2 * element.pxPerBeat;
    let low = 0;
    let high = path.getTotalLength();
    for (let index = 0; index < 24; index += 1) {
      const middle = (low + high) / 2;
      if (path.getPointAtLength(middle).x < targetX) low = middle;
      else high = middle;
    }
    return {y: path.getPointAtLength((low + high) / 2).y,
      height: path.ownerSVGElement.getBoundingClientRect().height};
  });
  expect(Math.abs(midpoint.y - midpoint.height * .77)).toBeLessThan(1);
});

test('timeline automation headers and empty rows open context from the keyboard', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('automation-context', (event) => element.testEvents.push(event.detail));
    element.setLanes([{ id: 'lane', name: 'MIDI 1', clips: [], automation: [
      { id: 'empty', label: 'Empty', min: 0, max: 1, stepped: false, points: [] },
    ] }]);
  });
  const header = timeline.locator('.automation-header');
  const row = timeline.locator('.automation-row');
  await expect(header).toHaveAttribute('tabindex', '0');
  await expect(row).toHaveAttribute('tabindex', '0');
  await header.focus();
  await page.keyboard.press('Shift+F10');
  await row.focus();
  await page.keyboard.press('Shift+F10');
  expect(await timeline.evaluate((element) => element.testEvents)).toEqual([
    { laneId: 'lane', automationId: 'empty', clientX: expect.any(Number), clientY: expect.any(Number) },
    { laneId: 'lane', automationId: 'empty', clientX: expect.any(Number), clientY: expect.any(Number) },
  ]);
});

test('timeline automation chooser and draw gestures stay host-owned', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    document.documentElement.style.fontSize = '11px';
    element.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-automation-row-height');
    element.style.removeProperty('--compost-timeline-row-height');
    element.setAttribute('automation', '');
    element.setAttribute('snap', 'grid');
    element.syncAttributes();
    element.testEvents = [];
    for (const type of ['automation-choose', 'automation-add', 'automation-remove', 'automation-change', 'draw-toggle', 'seek', 'time-select']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([{ id: 'lane', name: 'Synth', clips: [], automation: [{
      id: 'cutoff', label: 'Cutoff', min: 0, max: 1, stepped: false, step: .1,
      points: [{ beat: 0, value: .1 }, { beat: 4, value: .9 }],
    }] }]);
  });
  const geometry = await timeline.evaluate((element) => {
    const header = element.shadowRoot.querySelector('.automation-header').getBoundingClientRect();
    const row = element.shadowRoot.querySelector('.automation-row').getBoundingClientRect();
    const lane = element.shadowRoot.querySelector('.lane').getBoundingClientRect();
    return { header: header.height, row: row.height, lane: lane.height, root: getComputedStyle(document.documentElement).fontSize };
  });
  expect(Math.abs(geometry.header - 26)).toBeLessThan(1);
  expect(Math.abs(geometry.row - 26)).toBeLessThan(1);
  expect(Math.abs(geometry.lane - 70)).toBeLessThan(1);
  expect(geometry.root).toBe('11px');

  const chooser = timeline.locator('.automation-chooser');
  await expect(chooser).toHaveAttribute('aria-haspopup', 'menu');
  await expect(chooser).toHaveAttribute('aria-expanded', 'false');
  await chooser.click();
  let events = await timeline.evaluate((element) => element.testEvents);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('automation-choose');
  expect(events[0].detail.automationId).toBe('cutoff');
  await timeline.evaluate((element) => element.setAutomationChooserOpen('lane', 'cutoff', true));
  await expect(chooser).toHaveAttribute('aria-expanded', 'true');
  await timeline.locator('.automation-add').click();
  await timeline.locator('.automation-remove').click();
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.filter((event) => event.type === 'automation-add')).toHaveLength(1);
  expect(events.filter((event) => event.type === 'automation-remove')).toHaveLength(1);
  expect(events.some((event) => event.type === 'seek' || event.type === 'time-select')).toBe(false);

  const row = timeline.locator('.automation-row');
  const hoverPoint = await timeline.locator('compost-envelope-editor').locator('.line').evaluate((path) => {
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const svg = path.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    return { x: rect.left + point.x / box.width * rect.width, y: rect.top + point.y / box.height * rect.height };
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await expect(row.locator('compost-envelope-editor').locator('.readout')).toContainText('·');
  await timeline.evaluate((element) => {
    const editor = element.shadowRoot.querySelector('compost-envelope-editor');
    const line = editor.shadowRoot.querySelector('.line');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    line.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, clientX: ruler.left + 2 * element._pxPerBeat, clientY: line.getBoundingClientRect().top }));
  });
  events = await timeline.evaluate((element) => element.testEvents);
  let changes = events.filter((event) => event.type === 'automation-change');
  expect(changes).toHaveLength(1);
  expect(changes[0].detail.points).toHaveLength(3);
  expect(changes[0].detail.points[1].beat).toBe(2);
  const point = timeline.locator('compost-envelope-editor').locator('.point').nth(1);
  await point.evaluate((node) => node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, clientX: node.getBoundingClientRect().left, clientY: node.getBoundingClientRect().top })));
  events = await timeline.evaluate((element) => element.testEvents);
  changes = events.filter((event) => event.type === 'automation-change');
  expect(changes).toHaveLength(2);
  expect(changes[1].detail.points).toHaveLength(2);

  const segmentGesture = await timeline.evaluate((element) => {
    const editor = element.shadowRoot.querySelector('compost-envelope-editor');
    const line = editor.shadowRoot.querySelector('.line');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = line.getBoundingClientRect();
    const event = (type, y, extra = {}) => line.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 31, pointerType: 'mouse', button: 0,
      clientX: ruler.left + 2 * element._pxPerBeat, clientY: y, shiftKey: true, ...extra,
    }));
    event('pointerdown', box.top + box.height / 2);
    const down = editor.drag?.mode || null;
    event('pointermove', box.top + box.height / 2 + 8);
    const moved = Boolean(editor.drag?.moved);
    event('pointerup', box.top + box.height / 2 + 8);
    return { down, moved, ended: editor.drag === null };
  });
  expect(segmentGesture).toEqual({ down: 'segment', moved: true, ended: true });
  events = await timeline.evaluate((element) => element.testEvents);
  changes = events.filter((event) => event.type === 'automation-change');
  expect(changes).toHaveLength(3);
  expect(changes[2].detail.points).toHaveLength(2);
  expect(changes[2].detail.points[0].value).not.toBe(.1);

  const beforeCancel = changes[2].detail.points;
  await timeline.evaluate((element) => {
    const editor = element.shadowRoot.querySelector('compost-envelope-editor');
    const line = editor.shadowRoot.querySelector('.line');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = line.getBoundingClientRect();
    const event = (type, y) => line.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 32, pointerType: 'mouse', button: 0,
      clientX: ruler.left + element._pxPerBeat, clientY: y,
    }));
    event('pointerdown', box.top + box.height / 2);
    event('pointermove', box.top + box.height / 2 - 12);
    event('pointercancel', box.top + box.height / 2 - 12);
  });
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.filter((event) => event.type === 'automation-change')).toHaveLength(3);
  expect(await timeline.evaluate((element) => element.lanes[0].automation[0].points)).toEqual(beforeCancel);

  await timeline.evaluate((element) => element.setAttribute('draw', ''));
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row');
    const editor = row.querySelector('compost-envelope-editor');
    const surface = editor.shadowRoot.querySelector('.surface');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const event = (type, beat, y) => surface.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 33, pointerType: 'mouse', button: 0,
      clientX: ruler.left + beat * element._pxPerBeat, clientY: y,
    }));
    event('pointerdown', 1, box.top + 6);
    event('pointermove', 3, box.top + box.height - 6);
    event('pointerup', 3, box.top + box.height - 6);
  });
  events = await timeline.evaluate((element) => element.testEvents);
  changes = events.filter((event) => event.type === 'automation-change');
  expect(changes).toHaveLength(4);
  const drawn = changes[3].detail.points;
  expect(drawn.length).toBeGreaterThanOrEqual(4);
  const drawnSpan = drawn.filter((point) => point.beat >= 1 && point.beat <= 4);
  for (let index = 0; index + 1 < drawnSpan.length; index += 2) expect(drawnSpan[index + 1].beat - drawnSpan[index].beat).toBeCloseTo(1 - 1e-9, 8);
  expect(drawnSpan.some((point, index) => index > 0
    && point.beat > drawnSpan[index - 1].beat
    && point.beat - drawnSpan[index - 1].beat < 1e-4)).toBe(true);

  const drawBeforeCancel = drawn;
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row');
    const surface = row.querySelector('compost-envelope-editor').shadowRoot.querySelector('.surface');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 34, pointerType: 'mouse', button: 0, clientX: ruler.left + element._pxPerBeat, clientY: box.top + 10 }));
    surface.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true, pointerId: 34, pointerType: 'mouse', button: 0, clientX: ruler.left + 3 * element._pxPerBeat, clientY: box.top + 20 }));
    surface.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, composed: true, pointerId: 34, pointerType: 'mouse', button: 0, clientX: ruler.left + 3 * element._pxPerBeat, clientY: box.top + 20 }));
  });
  expect(await timeline.evaluate((element) => element.lanes[0].automation[0].points)).toEqual(drawBeforeCancel);
  expect(await timeline.locator('compost-envelope-editor[data-preview]').count()).toBe(0);
  const rowBeforeToggle = timeline.locator('.automation-row');
  await rowBeforeToggle.focus();
  await page.keyboard.press('b');
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.at(-1).type).toBe('draw-toggle');
  expect(events.at(-1).detail.enabled).toBe(false);
});

test('timeline automation edits use display space, lane-scoped ranges and draw arbitration', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    document.documentElement.style.fontSize = '11px';
    element.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-automation-row-height');
    element.style.removeProperty('--compost-timeline-row-height');
    element.setAttribute('automation', '');
    element.setAttribute('snap', 'grid');
    element.syncAttributes();
    element.testEvents = [];
    for (const type of ['automation-change', 'automation-context', 'clip-select', 'time-delete', 'time-select', 'time-select-input']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([
      { id: 'gain', name: 'Gain', clips: [], automation: [{ id: 'env', label: 'Gain', min: -90, max: 12, scale: 'gain', stepped: false,
        points: [{ beat: 0, value: -12 }, { beat: 4, value: 0 }] }] },
      { id: 'linear', name: 'Linear', clips: [], automation: [{ id: 'env', label: 'Linear', min: 0, max: 1, stepped: false,
        points: [{ beat: 0, value: .1 }, { beat: 4, value: .9 }] }] },
    ]);
  });

  const chooserStates = await timeline.evaluate((element) => {
    const choosers = [...element.shadowRoot.querySelectorAll('.automation-chooser')];
    element.setAutomationChooserOpen('gain', 'env', true);
    const first = choosers.map((node) => node.getAttribute('aria-expanded'));
    element.setAutomationChooserOpen('linear', 'env', true);
    const second = choosers.map((node) => node.getAttribute('aria-expanded'));
    element.setAutomationChooserOpen('linear', 'env', false);
    const closed = choosers.map((node) => node.getAttribute('aria-expanded'));
    return { first, second, closed };
  });
  expect(chooserStates).toEqual({ first: ['true', 'false'], second: ['false', 'true'], closed: ['false', 'false'] });

  const gainMove = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const editor = row.querySelector('compost-envelope-editor');
    const point = editor.shadowRoot.querySelector('.point');
    const rowRect = row.getBoundingClientRect();
    const pointRect = point.getBoundingClientRect();
    const startY = pointRect.top + pointRect.height / 2;
    const expected = editor.valueAtPointer({ clientY: startY + 8 });
    const event = (target, type, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 71, pointerType: 'mouse', button: 0,
      clientX: pointRect.left + pointRect.width / 2, clientY: y,
    }));
    event(point, 'pointerdown', startY);
    event(editor.surface, 'pointermove', startY + 8);
    const readout = editor.shadowRoot.querySelector('.readout')?.textContent || '';
    event(editor.surface, 'pointerup', startY + 8);
    return { rowHeight: rowRect.height, expected, readout };
  });
  expect(Math.abs(gainMove.rowHeight - 26)).toBeLessThan(1);
  expect(gainMove.readout).toContain('·');
  const gainChange = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').at(-1));
  expect(gainChange.detail.points[0].value).toBeCloseTo(gainMove.expected, 8);
  expect(gainChange.detail.points[0].value).not.toBeCloseTo(-12 + 8 * (102 / 26), 2);

  await timeline.evaluate((element) => element.setTimeSelection(1, 3, ['linear']));
  const beforeIsolation = await timeline.evaluate((element) => element.lanes[0].automation[0].points);
  await timeline.locator('.lane[data-lane-id="gain"] .automation-row').focus();
  await page.keyboard.press('Delete');
  const afterIsolation = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(afterIsolation.points).toEqual(beforeIsolation);
  expect(afterIsolation.changes).toBe(1);

  await timeline.evaluate((element) => element.setTimeSelection(1, 3, ['gain']));
  await timeline.locator('.lane[data-lane-id="gain"] .automation-row').focus();
  await page.keyboard.press('Delete');
  const cleared = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(cleared.changes).toBe(2);
  const left = cleared.points.find((point) => point.beat === 1);
  const right = cleared.points.find((point) => point.beat === 3);
  expect(left).toBeTruthy();
  expect(right).toBeTruthy();
  expect(left.value).not.toBe(right.value);

  await timeline.evaluate((element) => {
    element.setTimeSelection(1, 3, ['gain']);
    element.setAttribute('draw', '');
    element.setLaneClips('gain', [{ id: 'clip', name: 'clip', start: 0, length: 1 }]);
  });
  const beforeDrawDeletes = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'time-delete').length);
  const beforeDrawClipSelects = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'clip-select').length);
  const beforeDrawKey = await timeline.evaluate((element) => element.lanes[0].automation[0].points);
  await timeline.locator('.lane[data-lane-id="gain"] compost-envelope-editor').locator('.point').first().focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowUp');
  await timeline.locator('.lane[data-lane-id="gain"] .automation-row').focus();
  await page.keyboard.press('ArrowRight');
  const afterDrawKey = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
    deletes: element.testEvents.filter((event) => event.type === 'time-delete').length,
    clipSelects: element.testEvents.filter((event) => event.type === 'clip-select').length,
  }));
  expect(afterDrawKey.points).toEqual(beforeDrawKey);
  expect(afterDrawKey.changes).toBe(2);
  expect(afterDrawKey.deletes).toBe(beforeDrawDeletes + 1);
  expect(afterDrawKey.clipSelects).toBe(beforeDrawClipSelects);

  const drawRow = timeline.locator('.lane[data-lane-id="gain"] .automation-row');
  await drawRow.hover();
  await expect(drawRow.locator('.automation-draw-hint')).toHaveCSS('display', 'block');
  const hintGeometry = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const hint = row.querySelector('.automation-draw-hint');
    const rowRect = row.getBoundingClientRect();
    const hintRect = hint.getBoundingClientRect();
    const style = getComputedStyle(hint);
    return {
      rightGap: rowRect.right - hintRect.right,
      right: Number.parseFloat(style.right),
      centerOffset: Math.abs((hintRect.top + hintRect.height / 2) - (rowRect.top + rowRect.height / 2)),
      pointerEvents: style.pointerEvents,
    };
  });
  expect(Math.abs(hintGeometry.rightGap - hintGeometry.right)).toBeLessThan(1);
  expect(hintGeometry.centerOffset).toBeLessThan(1);
  expect(hintGeometry.pointerEvents).toBe('none');
  await timeline.locator('.lane[data-lane-id="gain"] .lane-base').hover();
  await expect(drawRow.locator('.automation-draw-hint')).toHaveCSS('display', 'none');

  await timeline.evaluate((element) => element.removeAttribute('draw'));
  const unsnappedRange = await timeline.evaluate((element) => {
    element.setTimeSelection(1.1, 1.4, ['gain']);
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const editor = row.querySelector('compost-envelope-editor');
    const line = editor.shadowRoot.querySelector('.line');
    const box = row.getBoundingClientRect();
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const clientX = ruler.left + 1.35 * element._pxPerBeat;
    const event = (type) => line.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 79, pointerType: 'mouse', button: 0,
      clientX, clientY: box.top + box.height / 2,
    }));
    event('pointerdown');
    const type = editor.drag?.mode;
    event('pointercancel');
    return { type, selection: editor.selection, time: editor.timeAtPointer({ clientX }, true) };
  });
  expect(unsnappedRange.selection).toEqual({ start: 1.1, end: 1.4 });
  expect(unsnappedRange.type).toBe('range');
  expect(unsnappedRange.time).toBeGreaterThanOrEqual(unsnappedRange.selection.start);
  expect(unsnappedRange.time).toBeLessThanOrEqual(unsnappedRange.selection.end);
  const line = timeline.locator('.lane[data-lane-id="gain"] compost-envelope-editor').locator('.line');
  const gainHoverPoint = await line.evaluate((path) => {
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const svg = path.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    return { x: rect.left + point.x / box.width * rect.width, y: rect.top + point.y / box.height * rect.height };
  });
  await page.mouse.move(gainHoverPoint.x, gainHoverPoint.y);
  await expect(line).toHaveCSS('stroke-width', '1.75px');
  await expect(timeline.locator('.lane[data-lane-id="gain"] compost-envelope-editor').locator('.readout')).toContainText('·');
  await timeline.locator('.lane[data-lane-id="gain"] .lane-base').hover();
  await expect(line).toHaveCSS('stroke-width', '1.25px');

  await timeline.evaluate((element) => {
    element.setAttribute('draw', '');
    element.setLaneAutomation('gain', [{ id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }]);
  });
  const singleBefore = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').length);
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const surface = row.querySelector('compost-envelope-editor').shadowRoot.querySelector('.surface');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const event = (type, extra = {}) => surface.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 72, pointerType: 'mouse', button: 0,
      clientX: ruler.left + element._pxPerBeat, clientY: box.top + box.height / 2, ...extra,
    }));
    event('pointerdown');
    event('pointerup');
  });
  const single = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(single.changes).toBe(singleBefore + 1);
  expect(single.points).toHaveLength(2);
  expect(single.points[1].beat - single.points[0].beat).toBeCloseTo(1 - 1e-9, 8);

  await timeline.evaluate((element) => element.setLaneAutomation('gain', [{ id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }]));
  const freehandBefore = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').length);
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const surface = row.querySelector('compost-envelope-editor').shadowRoot.querySelector('.surface');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const event = (type, beat, y) => surface.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 73, pointerType: 'mouse', button: 0,
      clientX: ruler.left + beat * element._pxPerBeat, clientY: box.top + y, altKey: true,
    }));
    event('pointerdown', 0, 4);
    event('pointermove', .3, 9);
    event('pointermove', .6, 16);
    event('pointerup', .6, 16);
  });
  const freehand = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(freehand.changes).toBe(freehandBefore + 1);
  expect(freehand.points.length).toBeGreaterThanOrEqual(2);
  expect(freehand.points.length).toBeLessThanOrEqual(3);

  await timeline.evaluate((element) => element.setLaneAutomation('gain', [{ id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }]));
  const cancelBefore = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').length);
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const surface = row.querySelector('compost-envelope-editor').shadowRoot.querySelector('.surface');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const event = (type, beat, y) => surface.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 74, pointerType: 'mouse', button: 0,
      clientX: ruler.left + beat * element._pxPerBeat, clientY: box.top + y,
    }));
    event('pointerdown', 0, 4);
    event('pointermove', 2, 20);
    event('pointercancel', 2, 20);
  });
  expect(await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }))).toEqual({ points: [], changes: cancelBefore });

  const beforeFallback = await timeline.evaluate((element) => ({
    select: element.testEvents.filter((event) => event.type === 'time-select').length,
    input: element.testEvents.filter((event) => event.type === 'time-select-input').length,
  }));
  await timeline.evaluate((element) => {
    const base = element.shadowRoot.querySelector('.lane[data-lane-id="gain"] .lane-base');
    const box = base.getBoundingClientRect();
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const event = (type, beat) => base.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 75, pointerType: 'mouse', button: 0,
      clientX: ruler.left + beat * element._pxPerBeat, clientY: box.top + box.height / 2,
    }));
    event('pointerdown', 0);
    event('pointermove', 2);
    event('pointerup', 2);
  });
  expect(await timeline.evaluate((element) => ({
    select: element.testEvents.filter((event) => event.type === 'time-select').length,
    input: element.testEvents.filter((event) => event.type === 'time-select-input').length,
    drag: element.drag,
  }))).toEqual({ ...beforeFallback, drag: null });

  await timeline.evaluate((element) => element.setLaneAutomation('gain', [{ id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }]));
  const beforeContext = await timeline.evaluate((element) => ({
    contexts: element.testEvents.filter((event) => event.type === 'automation-context').length,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const surface = row.querySelector('compost-envelope-editor').shadowRoot.querySelector('.surface');
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    surface.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, composed: true, pointerId: 76, pointerType: 'mouse', button: 0,
      clientX: ruler.left, clientY: box.top + box.height / 2,
    }));
  });
  await page.waitForTimeout(650);
  expect(await timeline.evaluate((element) => ({
    points: element.lanes[0].automation[0].points,
    contexts: element.testEvents.filter((event) => event.type === 'automation-context').length,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
    drag: element.drag,
  }))).toEqual({ points: [], contexts: beforeContext.contexts + 1, changes: beforeContext.changes, drag: null });

  await timeline.evaluate((element) => {
    element.setTimeSelection(null, null);
    element.removeAttribute('draw');
    element.setLaneAutomation('gain', [{ id: 'env', label: 'Gain', min: 0, max: 1, stepped: false,
      points: [{ beat: 0, value: .2 }, { beat: 4, value: .8 }] }]);
  });
  const firstEdge = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const editor = row.querySelector('compost-envelope-editor');
    const point = editor.shadowRoot.querySelector('.point');
    const pointRect = point.getBoundingClientRect();
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const startY = pointRect.top + pointRect.height / 2;
    const event = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 77, pointerType: 'mouse', button: 0,
      clientX: x, clientY: y,
    }));
    event(point, 'pointerdown', pointRect.left + pointRect.width / 2, startY);
    event(editor.surface, 'pointermove', ruler.left + 2 * element._pxPerBeat, startY);
    const readout = editor.shadowRoot.querySelector('.readout')?.textContent || '';
    event(editor.surface, 'pointerup', ruler.left + 2 * element._pxPerBeat, startY);
    return { readout, points: element.lanes[0].automation[0].points };
  });
  expect(firstEdge.readout).toMatch(/^2\.00 · /u);
  expect(firstEdge.points.map((point) => point.beat)).toEqual([0, 2, 4]);
  expect(firstEdge.points.find((point) => point.beat === 0).value).toBeCloseTo(.2, 8);

  const lastEdge = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const editor = row.querySelector('compost-envelope-editor');
    const point = editor.shadowRoot.querySelectorAll('.point')[2];
    const pointRect = point.getBoundingClientRect();
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const startY = pointRect.top + pointRect.height / 2;
    const event = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 78, pointerType: 'mouse', button: 0,
      clientX: x, clientY: y,
    }));
    event(point, 'pointerdown', pointRect.left + pointRect.width / 2, startY);
    event(editor.surface, 'pointermove', ruler.left + 3 * element._pxPerBeat, startY);
    event(editor.surface, 'pointerup', ruler.left + 3 * element._pxPerBeat, startY);
    return element.lanes[0].automation[0].points;
  });
  expect(lastEdge.map((point) => point.beat)).toEqual([0, 2, 3, 4]);
  expect(lastEdge.find((point) => point.beat === 4).value).toBeCloseTo(.8, 8);

  await timeline.evaluate((element) => element.setLaneAutomation('gain', [{ id: 'env', label: 'Gain', min: 0, max: 1, stepped: false,
    points: [{ beat: 0, value: .2 }, { beat: 2, value: .5 }, { beat: 4, value: .8 }] }]));
  const clampedPoint = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.automation-row[data-lane-id="gain"]');
    const editor = row.querySelector('compost-envelope-editor');
    const point = editor.shadowRoot.querySelectorAll('.point')[1];
    const pointRect = point.getBoundingClientRect();
    const ruler = element.shadowRoot.querySelector('.ruler-wrap').getBoundingClientRect();
    const y = pointRect.top + pointRect.height / 2;
    const event = (target, type, beat) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, pointerId: 80, pointerType: 'mouse', button: 0,
      clientX: ruler.left + beat * element._pxPerBeat, clientY: y,
    }));
    event(point, 'pointerdown', 2);
    event(editor.surface, 'pointermove', 6);
    const readout = editor.shadowRoot.querySelector('.readout')?.textContent || '';
    event(editor.surface, 'pointerup', 6);
    return { readout, points: element.lanes[0].automation[0].points };
  });
  expect(clampedPoint.readout).toMatch(/^4\.00 · /u);
  expect(clampedPoint.points[1].beat).toBe(4);
});

test('timeline loop handles stay generic while the range is dragged', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLoop(1, 9, false);
  });
  const start = timeline.locator('.ruler-handle.start');
  const end = timeline.locator('.ruler-handle.end');
  await expect(start).not.toHaveAttribute('data-punch', '');
  await expect(end).not.toHaveAttribute('data-punch', '');
  const box = await start.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(start).not.toHaveAttribute('data-punch', '');
  await expect(end).not.toHaveAttribute('data-punch', '');
});

test('timeline lane geometry includes the separator at automation boundaries', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const geometry = await timeline.evaluate((element) => {
    element.setLanes([
      { id: 'with-automation', name: 'A', clips: [], automation: [{ id: 'env', label: 'Env', min: 0, max: 1, stepped: false, points: [] }] },
      { id: 'without-automation', name: 'B', clips: [] },
    ]);
    const rows = [...element.shadowRoot.querySelectorAll('.lane')];
    const first = rows[0].getBoundingClientRect();
    const second = rows[1].getBoundingClientRect();
    return {
      firstHeight: first.height,
      firstModelHeight: element.laneHeightFor(element.lanes[0]),
      totalModelHeight: element.totalLaneHeight(),
      totalRectHeight: element.shadowRoot.querySelector('.lanes-world').getBoundingClientRect().height,
      beforeBoundary: element.laneAtPoint(first.bottom - .25),
      afterBoundary: element.laneAtPoint(second.top + .25),
      boundaryGap: second.top - first.bottom,
    };
  });
  expect(Math.abs(geometry.firstHeight - geometry.firstModelHeight)).toBeLessThan(.1);
  expect(Math.abs(geometry.totalRectHeight - geometry.totalModelHeight)).toBeLessThan(.1);
  expect(geometry.beforeBoundary).toBe('with-automation');
  expect(geometry.afterBoundary).toBe('without-automation');
  expect(Math.abs(geometry.boundaryGap)).toBeLessThan(.1);
});

test('timeline reveals an automation row through the vertical lane viewport', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const geometry = await timeline.evaluate((element) => {
    element.style.height = '128px';
    element.setAttribute('automation', '');
    element.setLanes(Array.from({ length: 8 }, (_, index) => ({
      id: `lane-${index}`, name: `Lane ${index}`, clips: [], automation: [
        { id: 'env', label: 'Envelope', min: 0, max: 1, stepped: false, points: [{ beat: 0, value: index / 8 }] },
      ],
    })));
    const viewport = element.shadowRoot.querySelector('.lanes-wrap');
    const target = element.shadowRoot.querySelector('.automation-row[data-lane-id="lane-7"]');
    const before = target.getBoundingClientRect();
    const visible = viewport.getBoundingClientRect();
    const header = element.shadowRoot.querySelector('.lane-header[data-lane-id="lane-7"]');
    const headerBefore = header.getBoundingClientRect().top;
    const revealed = element.revealAutomation('lane-7', 'env');
    const after = target.getBoundingClientRect();
    return {
      revealed,
      missing: element.revealAutomation('lane-7', 'missing'),
      scrolled: viewport.scrollTop,
      beforeTop: before.top,
      afterTop: after.top,
      afterBottom: after.bottom,
      viewportTop: visible.top,
      viewportBottom: visible.bottom,
      headerMove: header.getBoundingClientRect().top - headerBefore,
    };
  });
  expect(geometry.revealed).toBe(true);
  expect(geometry.missing).toBe(false);
  expect(geometry.scrolled).toBeGreaterThan(0);
  expect(geometry.beforeTop).toBeGreaterThan(geometry.viewportBottom);
  expect(geometry.afterTop).toBeGreaterThanOrEqual(geometry.viewportTop - .1);
  expect(geometry.afterBottom).toBeLessThanOrEqual(geometry.viewportBottom + .1);
  expect(Math.abs(geometry.headerMove + geometry.scrolled)).toBeLessThanOrEqual(.1);
});

test('timeline lane resizing is reversible and keyboard accessible', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('lane-resize', (event) => element.testEvents.push(event.detail));
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [] }]);
  });
  const handle = timeline.locator('.lane-resize').first();
  await expect(handle).toHaveAttribute('role', 'separator');
  const initial = Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(initial + 4);
  expect(await timeline.evaluate((element) => element.testEvents.at(-1))).toEqual({ laneId: 'lane', height: initial + 4 });
  await page.keyboard.press('Home');
  expect(await timeline.evaluate((element) => ({
    event: element.testEvents.at(-1), custom: Object.hasOwn(element.lanes[0], 'height'),
  }))).toEqual({ event: { laneId: 'lane', height: null }, custom: false });

  const box = await handle.boundingBox();
  await handle.evaluate((element) => element.addEventListener('pointerdown', (event) => {
    element.dataset.testPointerId = String(event.pointerId);
  }, { once: true }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 3 });
  const pointerId = Number(await handle.getAttribute('data-test-pointer-id'));
  await handle.evaluate((element, id) => element.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, composed: true, pointerId: id, pointerType: 'mouse', button: 0,
  })), pointerId);
  await page.mouse.up();
  expect(await timeline.evaluate((element) => Object.hasOwn(element.lanes[0], 'height'))).toBe(false);
});

test('note editor moves, trims, velocity-drags and edits playback markers through real gestures', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('notes-change', () => element.testEvents.push('notes-change'));
    element.addEventListener('range-change', (event) => element.testEvents.push(['range-change', event.detail.start]));
    element.addEventListener('loop-change', (event) => element.testEvents.push(['loop-change', event.detail.end]));
  });
  expect(await editor.evaluate((element) => {
    try { element.setNotes([{ note: 60, start: 0, duration: 1 }]); }
    catch (error) { return error.message; }
    return '';
  })).toContain('caller-owned ids');
  const pxPerBeat = await editor.evaluate((element) => element.pxPerBeat);
  const firstNote = () => editor.evaluate((element) => element.notes[0]);

  // drag a note one beat to the right, snapped
  let box = await editor.locator('.note').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await firstNote()).start).toBe(1);

  const beforeCancel = await editor.evaluate((element) => ({
    notes: element.notes,
    changes: element.testEvents.filter((entry) => entry === 'notes-change').length,
  }));
  box = await editor.locator('.note').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat,
    box.y + box.height / 2, { steps: 4 });
  const cancelPointerId = await editor.evaluate((element) => element.drag?.pointerId);
  await editor.evaluate((element, id) => element.gridElement.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, composed: true, pointerId: id, pointerType: 'mouse', button: 0,
  })), cancelPointerId);
  await page.mouse.up();
  expect(await editor.evaluate((element) => ({
    notes: element.notes,
    changes: element.testEvents.filter((entry) => entry === 'notes-change').length,
  }))).toEqual(beforeCancel);

  // drag its right edge out by a beat
  box = await editor.locator('.note').first().boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2 + pxPerBeat, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await firstNote()).duration).toBe(1.5);

  // Cmd-drag sets velocity and the tooltip says so
  box = await editor.locator('.note').first().boundingBox();
  await page.keyboard.down('Meta');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 4 });
  await expect(editor.locator('.tip')).toContainText('vel 120');
  await page.mouse.up();
  await page.keyboard.up('Meta');
  expect((await firstNote()).velocity).toBe(120);

  // with two notes selected, one right edge resizes both, and Alt-drag copies both
  await page.keyboard.press('Meta+a');
  const selectedBefore = await editor.evaluate((element) => element.selectedIds.length);
  const lengthsBefore = await editor.evaluate((element) => element.notes.map((note) => note.duration));
  box = await editor.locator('.note').first().boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2 + pxPerBeat * 0.5, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const lengthsAfter = await editor.evaluate((element) => element.notes.map((note) => note.duration));
  expect(lengthsAfter.every((length, index) => Math.abs(length - (lengthsBefore[index] + 0.5)) < 1e-6)).toBe(true);
  const countBefore = lengthsAfter.length;
  box = await editor.locator('.note').first().boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat * 2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(countBefore * 2);
  expect(await editor.evaluate((element) => element.selectedIds.length)).toBe(selectedBefore);
  expect(await editor.evaluate((element) => element.notes.every((note) =>
    note.id.startsWith('demo-editor-note-')))).toBe(true);
  await page.keyboard.press('Backspace');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(countBefore);
  await page.keyboard.press('Meta+a');

  // the loop end drags out by a beat
  const handle = await editor.locator('.loop-handle.end').boundingBox();
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 5 + pxPerBeat, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect(editor).toHaveAttribute('loop-end', '9');

  // playback start moves without deleting notes outside it
  const rangeHandle = await editor.locator('.range-handle.start').boundingBox();
  const notesBeforeRange = await editor.evaluate((element) => element.notes);
  await page.mouse.move(rangeHandle.x + 5, rangeHandle.y + 5);
  await page.mouse.down();
  await page.mouse.move(rangeHandle.x + 5 + pxPerBeat * 0.5, rangeHandle.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect(editor).toHaveAttribute('start', '1.5');
  expect(await editor.evaluate((element) => element.notes)).toEqual(notesBeforeRange);

  // marquee everything, duplicate one span later, delete
  const grid = await editor.locator('.grid').boundingBox();
  await page.mouse.move(grid.x + 2, grid.y + 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + 9 * pxPerBeat, grid.y + grid.height - 2, { steps: 5 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.selectedIds.length)).toBe(5);
  await page.keyboard.press('Meta+d');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(10);
  await page.keyboard.press('Backspace');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(5);
  expect(await editor.evaluate((element) => element.selectionRange)).toBe(null);
  const events = await editor.evaluate((element) => element.testEvents);
  expect(events.filter((entry) => entry === 'notes-change').length).toBe(8);
  expect(events).toContainEqual(['loop-change', 9]);
  expect(events).toContainEqual(['range-change', 1.5]);

  // a height too short for every row shows fewer of them rather than slivers
  const rows = await editor.evaluate((element) => {
    element.style.height = '150px';
    element.style.fontSize = '13px';
    element.setAttribute('note-count', '48');
    element.refresh();
    return { visible: element.visibleKeys.length, rowHeight: element.rowHeight,
      floor: element.minRowHeight, asked: element.noteCount };
  });
  console.log('U-22 rows', JSON.stringify(rows));
  expect(rows.visible).toBeLessThan(rows.asked);
  expect(rows.rowHeight).toBeGreaterThanOrEqual(rows.floor - 0.5);
  await editor.evaluate((element) => {
    element.style.height = '';
    element.style.fontSize = '';
    element.setAttribute('note-count', '25');
  });

  // n adds a note without a pointer, on the middle visible row, and selects it
  await editor.evaluate((element) => { element.clearSelection(); element.testEvents = []; });
  const before = await editor.evaluate((element) => element.notes.length);
  await editor.focus();
  await page.keyboard.press('n');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(before + 1);
  const added = await editor.evaluate((element) => {
    const id = element.selectedIds[0];
    const note = element.notes.find((entry) => entry.id === id);
    return { note: note?.note, start: note?.start, middle: element.visibleKeys[Math.floor(element.visibleKeys.length / 2)], rangeStart: element.rangeStart };
  });
  expect(added.note).toBe(added.middle);
  expect(added.start).toBe(added.rangeStart);
  expect(await editor.evaluate((element) => element.testEvents)).toContain('notes-change');
});

test('window stays in the viewport, resizes in bounds, and asks before closing', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-window/');
  const window_ = page.locator('compost-window[data-option-target="window"]');
  await page.locator('[data-window-open]').click();
  await expect(window_).toHaveAttribute('open', '');
  await expect(window_).toHaveAttribute('role', 'dialog');

  const header = await window_.locator('header').boundingBox();
  await page.mouse.move(header.x + 40, header.y + 8);
  await page.mouse.down();
  await page.mouse.move(5000, 5000, { steps: 6 });
  await page.mouse.up();
  const edges = await window_.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return [rect.right <= innerWidth, rect.bottom <= innerHeight, rect.left >= 0];
  });
  expect(edges).toEqual([true, true, true]);

  await page.locator('[data-option="window-ratio"]').check();
  const grip = await window_.locator('.grip').boundingBox();
  await page.mouse.move(grip.x + 8, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip.x - 300, grip.y - 40, { steps: 6 });
  await page.mouse.up();
  const size = await window_.evaluate((element) => element.contentSize);
  expect(size.width).toBeGreaterThanOrEqual(200);
  expect(Math.abs(size.width / size.height - 4 / 3)).toBeLessThan(0.02);

  // a sheet keeps the bottom edge and hides its grip, for a phone
  await window_.evaluate((element) => {
    element.style.setProperty('--compost-window-control-min', '44px');
    element.setAttribute('sheet', '');
  });
  const sheet = await window_.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const close = element.shadowRoot.querySelector('.close').getBoundingClientRect();
    return { left: Math.round(box.left), right: Math.round(box.right), bottom: Math.round(box.bottom),
      width: Math.round(box.width), viewport: innerWidth, viewportBottom: innerHeight,
      grip: getComputedStyle(element.shadowRoot.querySelector('.grip')).display,
      close: [Math.round(close.width), Math.round(close.height)] };
  });
  expect(sheet.left).toBe(0);
  expect(sheet.width).toBe(sheet.viewport);
  expect(sheet.bottom).toBe(sheet.viewportBottom);
  expect(sheet.grip).toBe('none');
  expect(sheet.close[0]).toBeGreaterThanOrEqual(44);
  expect(sheet.close[1]).toBeGreaterThanOrEqual(44);
  await window_.evaluate((element) => {
    element.removeAttribute('sheet');
    element.style.removeProperty('--compost-window-control-min');
  });

  await window_.evaluate((element) => {
    element.addEventListener('window-close', (event) => event.preventDefault(), { once: true });
  });
  await page.getByRole('button', { name: 'Close Plug-in window' }).click();
  await expect(window_).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Close Plug-in window' }).click();
  await expect(window_).not.toHaveAttribute('open', '');
});

test('popup anchors, keeps on screen, picks by keyboard and closes on an outside press', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-popup/');
  const popup = page.locator('compost-popup[data-option-target="popup"]');
  const menu = page.getByRole('menu', { name: 'Track input' });

  await page.locator('[data-popup-anchor]').click();
  await expect(menu).toBeVisible();
  expect(await menu.getByRole('menuitemradio').first().evaluate((item) =>
    getComputedStyle(item, '::before').backgroundColor)).toBe('rgb(127, 196, 106)');
  const anchor = await page.locator('[data-popup-anchor]').boundingBox();
  const placed = await menu.boundingBox();
  expect(placed.y).toBeGreaterThanOrEqual(anchor.y + anchor.height - 1);
  expect(Math.abs(placed.x - anchor.x)).toBeLessThan(12);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(popup).toHaveAttribute('value', 'midi-1-2');
  await expect(page.locator('[data-option-state]')).toHaveText('Track input: MIDI 1 · 2');

  // a context menu at the corner is pulled back inside the viewport
  await page.setViewportSize({ width: 600, height: 400 });
  const surface = page.locator('[data-popup-surface]');
  await surface.scrollIntoViewIfNeeded();
  const surfaceBox = await surface.boundingBox();
  await surface.click({ button: 'right', position: { x: surfaceBox.width - 4, y: surfaceBox.height / 2 } });
  const context = page.getByRole('menu', { name: 'Clip actions' });
  await expect(context).toBeVisible();
  const box = await context.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(600);
  await page.mouse.click(20, 20);
  await expect(context).toBeHidden();
});

test('timeline automation headers stay level with their rows and a trim preview keeps notes in time', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const levels = await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    element.setLanes([
      { id: 'a', name: 'A', clips: [], automation: [
        { id: 'env', label: 'Env', min: 0, max: 1, stepped: false, points: [{ beat: 0, value: .5 }] },
        { id: 'env2', label: 'Env 2', min: 0, max: 1, stepped: false, points: [] },
      ] },
      { id: 'b', name: 'B', clips: [] },
    ]);
    const root = element.shadowRoot;
    const headerA = root.querySelector('.lane-header[data-lane-id="a"]').getBoundingClientRect();
    const laneA = root.querySelector('.lane[data-lane-id="a"]').getBoundingClientRect();
    const headerB = root.querySelector('.lane-header[data-lane-id="b"]').getBoundingClientRect();
    const laneB = root.querySelector('.lane[data-lane-id="b"]').getBoundingClientRect();
    return { headerA: headerA.height, laneA: laneA.height, drift: (headerB.top - headerA.top) - (laneB.top - laneA.top) };
  });
  expect(Math.abs(levels.headerA - levels.laneA)).toBeLessThan(1);
  expect(Math.abs(levels.drift)).toBeLessThan(1);

  // trim the right edge of a looped clip: the first note keeps its pixel position while dragging
  await timeline.evaluate((element) => {
    element.removeAttribute('automation');
    element.pxPerBeat = 40; element.scrollBeat = 0;
    element.setLanes([{ id: 'a', name: 'A', clips: [
      { id: 'c', name: 'c', start: 2, length: 4, duration: 4, offset: 0, loop: true,
        notes: [{ start: 1, duration: .5, note: 60 }] },
    ] }]);
  });
  const clip = timeline.locator('.clip[data-id="c"]');
  const noteLeft = () => clip.locator('.clip-note').first().evaluate((node) => node.getBoundingClientRect().left);
  const box = await clip.boundingBox();
  const before = await noteLeft();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2, { steps: 6 });
  const during = await noteLeft();
  const width = (await clip.boundingBox()).width;
  const loopLines = await clip.locator('.clip-loop-line').count();
  await page.mouse.up();
  expect(width).toBeGreaterThan(box.width + 100);
  expect(Math.abs(during - before)).toBeLessThan(1);
  expect(loopLines).toBeGreaterThanOrEqual(1);
});

test('timeline loops the selected clips on l and Cmd/Ctrl-L', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('loop-change', (event) => element.testEvents.push(event.detail));
    element.setLanes([{ id: 'a', name: 'A', clips: [
      { id: 'c1', name: 'one', start: 2, length: 2, duration: 2, offset: 0, loop: false, notes: [] },
      { id: 'c2', name: 'two', start: 6, length: 3, duration: 3, offset: 0, loop: false, notes: [] },
    ] }]);
    element.selected = ['c1', 'c2'];
    element.focusClip('c1');
  });
  await timeline.locator('.clip[data-id="c1"]').press('l');
  const events = await timeline.evaluate((element) => element.testEvents);
  expect(events.at(-1)).toEqual({ start: 2, end: 9, enabled: true });
  expect(await timeline.evaluate((element) => [element.loopStart, element.loopEnd])).toEqual([2, 9]);
});
