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
