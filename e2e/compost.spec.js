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

test('channel strip drags gain and pan as complete parameter gestures on one dB axis', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-channel-strip/');
  const strip = page.locator('compost-channel-strip[data-option-target="strip"]');
  await expect(strip).toHaveAttribute('role', 'slider');
  await page.locator('[data-option="strip-running"]').uncheck();

  await strip.evaluate((element) => {
    element.testEvents = [];
    for (const type of ['parameter-begin', 'parameter-edit', 'parameter-end']) {
      element.addEventListener(type, (event) => element.testEvents.push([type, event.detail.parameterID]));
    }
  });

  // a drag straight up raises the gain; nothing fires until the axis is known
  const bounds = await strip.boundingBox();
  const before = Number(await strip.getAttribute('aria-valuenow'));
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.6 - 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await strip.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  let events = await strip.evaluate((element) => element.testEvents);
  expect(events[0]).toEqual(['parameter-begin', 'drums-gain']);
  expect(events.at(-1)).toEqual(['parameter-end', 'drums-gain']);
  expect(events.filter(([type]) => type === 'parameter-edit').length).toBeGreaterThan(0);

  // a drag sideways sets pan under its own id
  await strip.evaluate((element) => { element.testEvents = []; });
  await page.mouse.move(bounds.x + 20, bounds.y + bounds.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 80, bounds.y + bounds.height * 0.6 + 1, { steps: 6 });
  await page.mouse.up();
  events = await strip.evaluate((element) => element.testEvents);
  expect(events[0]).toEqual(['parameter-begin', 'drums-pan']);
  expect(events.at(-1)).toEqual(['parameter-end', 'drums-pan']);
  expect(await strip.evaluate((element) => element.pan)).toBeGreaterThan(0);

  // double-click resets, typing sets, and the wash, notch and meter 0 dB share one row
  await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.6);
  await expect(strip).toHaveAttribute('aria-valuenow', '0');
  await strip.focus();
  await page.keyboard.type('-7.5');
  await page.keyboard.press('Enter');
  await expect(strip).toHaveAttribute('aria-valuenow', '-7.5');
  await strip.evaluate((element) => element.setLevels([0, 0]));
  const rows = await strip.evaluate((element) => {
    const root = element.shadowRoot;
    element.setValue(0, false);
    const wash = root.querySelector('.wash').getBoundingClientRect();
    const zero = root.querySelector('.zero').getBoundingClientRect();
    const fill = root.querySelector('.fill').getBoundingClientRect();
    return [wash.top, zero.top + zero.height / 2, fill.top];
  });
  expect(Math.abs(rows[0] - rows[1])).toBeLessThan(1);
  expect(Math.abs(rows[0] - rows[2])).toBeLessThan(1);
});

test('channel card lays out around the gutter and reports every control by id', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-channel-card/');
  const card = page.locator('compost-channel-card[data-option-target="card"]');
  const strip = page.locator('compost-channel-strip[data-option-target="card-strip"]');
  await card.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('parameter-edit', (event) => element.testEvents.push([event.detail.parameterID, event.detail.value]));
  });

  // the level figure sits left of the meter and the sends right of it, none of them across it
  await expect(card).not.toHaveAttribute('data-tight', '');
  const lanes = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const strip = element.closest('compost-channel-strip');
    const meter = strip.shadowRoot.querySelector('.meter').getBoundingClientRect();
    return {
      level: root.querySelector('.level').getBoundingClientRect().right,
      send: root.querySelector('.send compost-number-box').getBoundingClientRect().left,
      meter: [meter.left, meter.right],
    };
  });
  expect(lanes.level).toBeLessThan(lanes.meter[0]);
  expect(lanes.send).toBeGreaterThanOrEqual(lanes.meter[1]);

  await page.getByRole('button', { name: 'Mute Keys' }).click();
  await expect(card).toHaveAttribute('mute', '');
  await expect(strip).toHaveAttribute('muted', '');
  await page.getByRole('button', { name: 'Solo Keys' }).click({ modifiers: ['Alt'] });
  await expect(card).toHaveAttribute('solo-safe', '');
  await page.getByRole('spinbutton', { name: 'Keys level' }).click();
  await page.getByRole('textbox', { name: 'Set Keys level' }).fill('-12');
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('value', '-12');
  expect(await card.evaluate((element) => element.testEvents)).toEqual([
    ['keys-mute', 1], ['keys-solo-safe', 1], ['keys-gain', -12],
  ]);

  // the input button asks the host, which opens its popup on the button
  await page.getByRole('button', { name: /Keys input/ }).click();
  const menu = page.getByRole('menu', { name: 'input' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('input', 'MIDI 1 · 2');

  // every send says whose it is, through the number box's forwarded aria-label
  await expect(page.getByRole('spinbutton', { name: 'Send A · Keys' })).toHaveCount(1);

  // the pan rail is a slider a keyboard can walk, reporting a whole gesture
  const rail = card.locator('.pan');
  await expect(rail).toHaveAttribute('role', 'slider');
  await expect(rail).toHaveAttribute('aria-valuetext', 'C');
  await card.evaluate((element) => {
    element.panEvents = [];
    for (const type of ['parameter-begin', 'parameter-edit', 'parameter-end']) {
      element.addEventListener(type, (event) => {
        if (event.detail.name === 'pan') element.panEvents.push(type);
      });
    }
  });
  await rail.focus();
  await page.keyboard.press('ArrowRight');
  await expect(rail).toHaveAttribute('aria-valuenow', '0.05');
  await expect(rail).toHaveAttribute('aria-valuetext', '5R');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(rail).toHaveAttribute('aria-valuenow', '-0.2');
  await expect(rail).toHaveAttribute('aria-valuetext', '20L');
  expect(await card.evaluate((element) => element.panEvents)).toEqual([
    'parameter-begin', 'parameter-edit', 'parameter-end',
    'parameter-begin', 'parameter-edit', 'parameter-end',
  ]);

  // the input reads in the numeral face, like the prototype's
  const inputFont = await card.evaluate((element) =>
    getComputedStyle(element.shadowRoot.querySelector('.input')).fontFamily);
  expect(inputFont).toContain(await card.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--compost-channel-card-numeral-font').split(',')[0].trim()));

  // narrowing the column stacks the rows; narrower still notches the figure
  await page.locator('[data-option="card-width"]').fill('90');
  await expect(card).toHaveAttribute('data-tight', '');
  await expect(card).toHaveAttribute('data-narrow', '');
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

test('timeline reports move, trim, delete and ruler seek intents', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const clip = timeline.locator('.clip[data-id="beat"]');
  const ruler = timeline.locator('.ruler-wrap');
  await timeline.evaluate((element) => {
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

  box = await clip.boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'clip-trim')).toBe(true);

  await clip.press('Delete');
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'clip-delete')).toBe(true);

  const rulerBox = await ruler.boundingBox();
  await page.mouse.click(rulerBox.x + 100, rulerBox.y + rulerBox.height / 2);
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'seek' && event.detail.source === 'ruler')).toBe(true);
});

test('timeline enters from the keyboard and nudges before arrow navigation', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
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

test('timeline visual states match the clip grid without a second lane number', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.style.setProperty('--compost-timeline-bg', 'rgb(0, 0, 0)');
    element.style.setProperty('--compost-timeline-lane', 'rgb(0, 0, 0)');
    element.style.setProperty('--compost-timeline-lane-alt', 'rgb(0, 0, 0)');
    element.style.setProperty('--compost-timeline-wash', 'rgb(4, 5, 6)');
    element.style.setProperty('--compost-timeline-signal-hi', 'rgb(7, 8, 9)');
    element.style.setProperty('--compost-timeline-clip-font-size', '13px');
    element.style.setProperty('--compost-timeline-lane-font-size', '14px');
    element.setLanes([{ id: 'lane', name: '01 MIDI 1', color: 'rgb(10, 11, 12)', clips: [
      { id: 'playing', name: 'playing', start: 0, length: 4, duration: 4, state: 'playing', progress: .5 },
    ] }]);
    element.selected = ['playing'];
  });
  const measured = await timeline.evaluate((element) => {
    const lane = element.shadowRoot.querySelector('.lane');
    const header = element.shadowRoot.querySelector('.lane-header');
    const clip = element.shadowRoot.querySelector('.clip');
    const hostBackground = getComputedStyle(element).backgroundColor;
    const clipProgress = clip.querySelector('.clip-progress');
    return {
      hostBackground,
      laneBackground: getComputedStyle(lane).backgroundColor,
      clipBackground: getComputedStyle(clip).backgroundColor,
      selectedOutline: getComputedStyle(clip).outlineStyle,
      cornerBorder: getComputedStyle(clip, '::before').borderTopWidth,
      headerFontSize: getComputedStyle(header).fontSize,
      clipFontSize: getComputedStyle(clip.querySelector('.clip-name')).fontSize,
      progressWidth: clipProgress?.getBoundingClientRect().width ?? 0,
      hasNumber: Boolean(header.querySelector('.number')),
    };
  });
  expect(measured.laneBackground).toBe(measured.hostBackground);
  expect(measured.clipBackground).toBe('rgb(4, 5, 6)');
  expect(measured.selectedOutline).toBe('none');
  expect(measured.cornerBorder).toBe('1px');
  expect(measured.headerFontSize).toBe('14px');
  expect(measured.clipFontSize).toBe('13px');
  expect(measured.progressWidth).toBeGreaterThan(0);
  expect(measured.hasNumber).toBe(false);
});

test('timeline lane headers expose arm, mute and solo controls', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('lane-toggle', (event) => element.testEvents.push(event.detail));
    element.setLanes([{ id: 'lane', name: '01 MIDI 1', controls: { armed: true, muted: false, soloed: true }, clips: [] }]);
  });
  const controls = timeline.locator('.lane-control');
  await expect(controls).toHaveCount(3);
  await expect(controls.nth(0)).toHaveAttribute('title', 'arm');
  await expect(controls.nth(1)).toHaveAttribute('title', 'mute');
  await expect(controls.nth(2)).toHaveAttribute('title', 'solo');
  await expect(controls.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(controls.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await expect(controls.nth(2)).toHaveAttribute('aria-pressed', 'true');
  const tabOrder = await timeline.evaluate((element) => [...element.shadowRoot.querySelectorAll('.lane-name, .lane-control')]
    .map((node) => ({ className: node.className, tabIndex: node.tabIndex })));
  expect(tabOrder.map(({ className }) => className)).toEqual(['lane-name', 'lane-control', 'lane-control', 'lane-control']);
  expect(tabOrder.every(({ tabIndex }) => tabIndex === 0)).toBe(true);

  await controls.nth(1).click();
  expect(await timeline.evaluate((element) => element.testEvents)).toEqual([{ laneId: 'lane', name: 'mute' }]);
  await timeline.evaluate((element) => element.setLaneControls('lane', { armed: false, muted: true, soloed: false }));
  await expect(controls.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(controls.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(controls.nth(2)).toHaveAttribute('aria-pressed', 'false');
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
  await row.dispatchEvent('dblclick', {
    bubbles: true,
    composed: true,
    clientX: rowBox.x + 52,
    clientY: rowBox.y + rowBox.height * .7,
  });
  let events = await timeline.evaluate((element) => element.testEvents);
  const add = events.find((event) => event.type === 'automation-change');
  expect(add.detail.laneId).toBe('lane');
  expect(add.detail.automationId).toBe('volume');
  expect(add.detail.points).toHaveLength(3);
  expect(add.detail.points[1].beat).toBe(2);

  const point = row.locator('.automation-point').nth(1);
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
  expect(fineNudge[2].detail.points[1].beat).toBe(3.1);
  expect(events.filter((event) => event.type === 'clip-select')).toHaveLength(0);

  await row.click({ button: 'right' });
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.some((event) => event.type === 'automation-context' && event.detail.automationId === 'volume')).toBe(true);
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

test('timeline loop punch caps survive omitted updates and handle drags', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLoop(0, 8, false, false, { punchIn: true, punchOut: true });
    element.setLoop(1, 9, false);
  });
  const start = timeline.locator('.ruler-handle.start');
  const end = timeline.locator('.ruler-handle.end');
  await expect(start).toHaveAttribute('data-punch', '');
  await expect(end).toHaveAttribute('data-punch', '');
  const box = await start.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(start).toHaveAttribute('data-punch', '');
  await expect(end).toHaveAttribute('data-punch', '');
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

test('note editor moves, trims, velocity-drags and loops through real gestures', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => {
    element.testEvents = [];
    element.addEventListener('notes-change', () => element.testEvents.push('notes-change'));
    element.addEventListener('loop-change', (event) => element.testEvents.push(['loop-change', event.detail.end]));
  });
  const pxPerBeat = await editor.evaluate((element) => element.pxPerBeat);
  const firstNote = () => editor.evaluate((element) => element.notes[0]);

  // drag a note one beat to the right, snapped
  let box = await editor.locator('.note').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await firstNote()).start).toBe(1);

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
  await page.keyboard.press('Backspace');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(countBefore);
  await page.keyboard.press('Meta+a');

  // the loop end drags out by a beat
  const handle = await editor.locator('.handle.end').boundingBox();
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 5 + pxPerBeat, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect(editor).toHaveAttribute('loop-end', '9');

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
  const events = await editor.evaluate((element) => element.testEvents);
  expect(events.filter((entry) => entry === 'notes-change').length).toBe(8);
  expect(events).toContainEqual(['loop-change', 9]);

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
    return { note: note?.note, start: note?.start, middle: element.visibleKeys[Math.floor(element.visibleKeys.length / 2)], loopStart: element.loopStart };
  });
  expect(added.note).toBe(added.middle);
  expect(added.start).toBe(added.loopStart);
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
