import { test, expect } from '@playwright/test';
import { examples } from '../examples/shared/catalog.js';

async function dispatchTouchDoubleTap(locator) {
  return locator.evaluate(async (target) => {
    const rect = target.getBoundingClientRect();
    const touch = {
      identifier: 1,
      target,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    const dispatch = (type, touches, changedTouches) => {
      const event = new Event(type, { bubbles: true, composed: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        changedTouches: { value: changedTouches },
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    dispatch('touchstart', [touch], [touch]);
    const firstPrevented = dispatch('touchend', [], [touch]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    dispatch('touchstart', [touch], [touch]);
    const secondPrevented = dispatch('touchend', [], [touch]);
    return { firstPrevented, secondPrevented };
  });
}

async function performTouchDoubleTap(page, locator) {
  const box = await locator.boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  for (let id = 201; id <= 202; id += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(60);
  }
}

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
    await expect(page.locator('select')).toHaveCount(example.id === 'compost-timeline' ? 3 : 0);
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

test('envelope points can be moved by a touch pointer', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-envelope-editor/');
  const editor = page.locator('compost-envelope-editor');
  const before = await editor.evaluate((element) => element.points[1]);
  const box = await editor.locator('.point').nth(1).boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(20);
  expect(box.height).toBeGreaterThanOrEqual(20);
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 71 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove',
    touchPoints: [{ x: x + 40, y: y - 24, radiusX: 8, radiusY: 8, force: 1, id: 71 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = await editor.evaluate((element) => element.points[1]);
  expect(moved.time).toBeGreaterThan(before.time);
  expect(moved.value).toBeGreaterThan(before.value);
});

test('a touch double-tap creates on the second press and continues as a drag', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-envelope-editor/');
  const editor = page.locator('compost-envelope-editor');
  const gesture = await editor.evaluate(async (element) => {
    const changes = [];
    element.addEventListener('envelope-change', ({ detail }) => changes.push(detail.points));
    const surface = element.shadowRoot.querySelector('.surface');
    const box = element.getBoundingClientRect();
    const options = { bubbles: true, composed: true, pointerType: 'touch',
      isPrimary: true, button: 0, clientX: box.left + box.width * .72,
      clientY: box.top + box.height * .28 };
    surface.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 81 }));
    surface.dispatchEvent(new PointerEvent('pointerup', { ...options, pointerId: 81 }));
    surface.dispatchEvent(new MouseEvent('click', options));
    await new Promise((resolve) => setTimeout(resolve, 80));
    surface.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 82 }));
    const createdOnDown = element.shadowRoot.querySelectorAll('.point').length === 4;
    const createdTime = element.drag.origin[element.drag.pointIndex].time;
    const moved = { ...options, pointerId: 82, clientX: options.clientX + 120,
      clientY: options.clientY + 24 };
    surface.dispatchEvent(new PointerEvent('pointermove', moved));
    surface.dispatchEvent(new PointerEvent('pointerup', moved));
    return { createdOnDown, createdTime,
      finalTime: element.points.find((point) => point.time > 5)?.time ?? 0,
      changeCount: changes.length };
  });
  expect(gesture.createdOnDown).toBe(true);
  expect(gesture.finalTime).toBeGreaterThan(gesture.createdTime);
  expect(gesture.changeCount).toBe(1);
  await expect(editor.locator('.point')).toHaveCount(4);
});

test('a browser-synthesized touch dblclick does not apply the edit twice', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-envelope-editor/');
  const editor = page.locator('compost-envelope-editor');
  const box = await editor.boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = box.x + box.width * .72; const y = box.y + box.height * .28;
  for (let id = 91; id <= 92; ++id) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
  }
  await expect(editor.locator('.point')).toHaveCount(4);
});

test('the envelope surface cancels the touch default that zooms iOS pages', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-envelope-editor/');
  const prevented = await page.locator('compost-envelope-editor').evaluate((element) => {
    const event = new Event('touchend', { bubbles: true, composed: true, cancelable: true });
    element.shadowRoot.querySelector('.surface').dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('double-tap component actions cancel the iOS zoom default', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  let activationCount = 0;
  const noteGrid = page.locator('compost-note-editor').locator('.grid');
  await noteGrid.evaluate((element) => element.addEventListener('dblclick', () => {
    window.__touchDoubleActivations = (window.__touchDoubleActivations || 0) + 1;
  }));
  let result = await dispatchTouchDoubleTap(noteGrid);
  activationCount = await page.evaluate(() => window.__touchDoubleActivations || 0);
  expect(result).toEqual({ firstPrevented: false, secondPrevented: true });
  expect(activationCount).toBe(1);

  await page.goto('/examples/component-demos/compost-timeline/');
  const timelineLane = page.locator('compost-timeline').locator('.lane').first();
  await timelineLane.evaluate((element) => element.addEventListener('dblclick', () => {
    window.__touchDoubleActivations = (window.__touchDoubleActivations || 0) + 1;
  }));
  result = await dispatchTouchDoubleTap(timelineLane);
  activationCount = await page.evaluate(() => window.__touchDoubleActivations || 0);
  expect(result).toEqual({ firstPrevented: false, secondPrevented: true });
  expect(activationCount).toBe(1);

  await page.goto('/examples/component-demos/compost-clip-grid/');
  const clipName = page.locator('compost-clip-grid').first().locator('.name').first();
  await clipName.evaluate((element) => element.addEventListener('dblclick', () => {
    window.__touchDoubleActivations = (window.__touchDoubleActivations || 0) + 1;
  }));
  result = await dispatchTouchDoubleTap(clipName);
  activationCount = await page.evaluate(() => window.__touchDoubleActivations || 0);
  expect(result).toEqual({ firstPrevented: false, secondPrevented: true });
  expect(activationCount).toBe(1);

  for (const [demo, component, surface] of [
    ['compost-slider', 'compost-slider', '.range-input'],
    ['compost-knob', 'compost-knob', '.dial'],
    ['compost-number-box', 'compost-number-box', '.box'],
  ]) {
    await page.goto(`/examples/component-demos/${demo}/`);
    result = await dispatchTouchDoubleTap(page.locator(component).first().locator(surface));
    expect(result).toEqual({ firstPrevented: false, secondPrevented: true });
  }
});

test('touch double-tap resets parameter controls', async ({ page }) => {
  for (const [demo, component, surface] of [
    ['compost-slider', 'compost-slider', '.range-input'],
    ['compost-knob', 'compost-knob', '.dial'],
    ['compost-number-box', 'compost-number-box', '.box'],
  ]) {
    await test.step(demo, async () => {
      await page.goto(`/examples/component-demos/${demo}/`);
      const control = page.locator(component).first();
      const resetValue = await control.evaluate((element) => {
        element.setValue(element.min + (element.max - element.min) * 0.25, false);
        const reset = element.value;
        element.setAttribute('reset-value', String(reset));
        element.setValue(element.max, false);
        return reset;
      });
      await performTouchDoubleTap(page, control.locator(surface));
      await expect.poll(() => control.evaluate((element) => element.value)).toBe(resetValue);
    });
  }
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

test('dragging the slider track does not open the value editor', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-slider/');
  const slider = page.getByRole('slider', { name: 'Feedback' });
  const track = slider.locator('[part="input"]');
  const box = await track.boundingBox();

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect(slider.locator('.value-editor')).toHaveCount(0);
});

test('select listbox keeps the same width across reopens', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-select/');
  const select = page.locator('compost-select[aria-label="Wave shape"]');
  const combobox = page.getByRole('combobox', { name: 'Wave shape' });
  const listbox = select.locator('[role="listbox"]');
  // A trigger narrower than its options is the case that used to grow on every open.
  await select.evaluate((element) => { element.style.width = '120px'; });

  const widths = [];
  for (let i = 0; i < 3; i += 1) {
    await combobox.click();
    await expect(listbox).toBeVisible();
    widths.push((await listbox.boundingBox()).width);
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
  }

  expect(widths[1]).toBe(widths[0]);
  expect(widths[2]).toBe(widths[0]);
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

test('drawer keeps its declared initial size during upgrade', async ({ page }) => {
  await page.goto('/e2e/fixtures/drawer-initial-size.html');
  const drawer = page.locator('compost-drawer');

  await expect(drawer).toHaveCSS('--compost-drawer-size', '240px');
  await expect(drawer).toHaveCSS('width', '240px');
});

test('centered audio keeps its toolbar footprint without animating', async ({ page }) => {
  await page.goto('/examples/signal-generator/');
  const audio = page.locator('compost-audio');
  const slider = page.locator('.audio-output > compost-slider');
  const offHostWidth = await audio.evaluate((element) => element.getBoundingClientRect().width);
  const sliderLeft = await slider.evaluate((element) => element.getBoundingClientRect().left);

  const animations = await audio.evaluate((element) => {
    element.context = { state: 'running', close: async () => {} };
    element.refresh();
    return element.panel.getAnimations().length;
  });

  expect(await audio.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(offHostWidth);
  expect(await slider.evaluate((element) => element.getBoundingClientRect().left))
    .toBeCloseTo(sliderLeft);
  expect(animations).toBe(0);
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
  const dockedCenterOffset = await defaultPiano.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left + box.width / 2 - innerWidth / 2;
  });
  expect(Math.abs(dockedCenterOffset)).toBeLessThan(1);
});

test('piano exposes wide key beds without clipping keys', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-piano/');
  const piano = page.locator('compost-piano[data-option-target="piano"]');
  await piano.evaluate((element) => {
    element.setAttribute('inline', '');
    element.removeAttribute('dock');
    element.setAttribute('root-note', '0');
    element.setAttribute('note-count', '128');
    element.style.width = '20em';
  });

  const geometry = await piano.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
    lastKeyRight: element.shadowRoot.getElementById('note127').getBoundingClientRect().right,
    scrollRight: element.getBoundingClientRect().left + element.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.overflowX).toBe('auto');
  expect(geometry.lastKeyRight).toBeLessThanOrEqual(geometry.scrollRight);
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

test('MIDI mapping panel does not clip its map-mode focus ring', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-midi-mappings/');
  const editor = page.locator('compost-midi-mappings');
  await editor.getByRole('button', { name: 'Map MIDI' }).focus();

  const overflow = await editor.evaluate((element) => ({
    panel: getComputedStyle(element.shadowRoot.querySelector('.panel')).overflowX,
    table: getComputedStyle(element.shadowRoot.querySelector('.table-scroll')).overflowX,
  }));
  expect(overflow).toEqual({ panel: 'visible', table: 'auto' });
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
  await expect(drums.locator('.row[data-state="stopped"][data-queued] .queue')).toHaveCount(1);
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
  await drums.evaluate((grid) => { grid.recordQueued = 4; });
  await expect(drums.getByRole('button', { name: 'Cancel queued recording in Drums slot 5' })).toHaveCount(1);
  await expect(drums.locator('.row[data-record-queued] .queue')).toHaveCount(1);
  await drums.evaluate((grid) => { grid.recordQueued = -1; });
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

  await drums.evaluate((grid) => grid.setClips([
    { name: 'take.a', state: 'recording', queued: true }, null, null, null, null,
  ]));
  await expect(drums.locator('.row[data-state="recording"][data-queued] .tri svg circle[fill]')).toHaveCount(1);
  await expect(drums.locator('.row[data-state="recording"][data-queued] .queue')).toHaveCount(1);
});

test('clip grid slow mouse click renames without hijacking open or touch', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-clip-grid/');
  const grid = page.locator('compost-clip-grid[data-grid="0"]');
  const name = grid.getByRole('button', { name: /^break\.a/ });
  const editor = grid.locator('.editor');

  await name.click();
  await name.click();
  await expect(editor).toBeVisible();
  await editor.press('Escape');

  await name.dblclick();
  await page.waitForTimeout(400);
  await expect(editor).toHaveCount(0);
  await expect(page.locator('[data-log]')).toContainText('clip-open break.a');

  await name.evaluate((element) => element.dispatchEvent(new PointerEvent('click', {
    bubbles: true, composed: true, pointerType: 'touch', pointerId: 1,
  })));
  await page.waitForTimeout(400);
  await expect(editor).toHaveCount(0);
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

test('timeline is a region holding a list of lanes and names unnamed lanes by id', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => element.setLanes([{ id: 'bus-7', clips: [] }]));
  await expect(timeline).toHaveAttribute('role', 'region');
  await expect(timeline.locator('.ruler-wrap')).toHaveAttribute('role', 'group');
  await expect(timeline.locator('.lanes-world')).toHaveAttribute('role', 'list');
  await expect(timeline.getByRole('separator', { name: 'Resize bus-7' })).toHaveCount(1);
});

test('timeline regions extend on Shift-click, span every lane from the ruler and clear on Escape', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('snap', 'grid');
    element.setLanes([
      { id: 'a', name: 'A', clips: [{ id: 'one', name: 'one', start: 2, length: 2, duration: 2, loop: false }] },
      { id: 'b', name: 'B', clips: [{ id: 'two', name: 'two', start: 5, length: 1, duration: 1, loop: false }] },
    ]);
    element.setTimeSelection(null, null);
    element.selected = ['one'];
    element.testEvents = [];
    for (const type of ['time-select', 'clip-select']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
  });
  const pxPerBeat = await timeline.evaluate((element) => element.pxPerBeat);
  const laneB = timeline.locator('.lane[data-lane-id="b"] .lane-base');
  const laneBox = await laneB.boundingBox();
  const ruler = await timeline.locator('.ruler-wrap').boundingBox();

  // Shift-click on lane B at beat 8 stretches from the selected clip's start to the click
  await page.keyboard.down('Shift');
  await page.mouse.click(ruler.x + 8 * pxPerBeat, laneBox.y + laneBox.height / 2);
  await page.keyboard.up('Shift');
  let selection = await timeline.evaluate((element) => element.timeSelection);
  expect(selection).toEqual({ start: 2, end: 8, laneIds: ['a', 'b'] });
  expect(await timeline.evaluate((element) => element.selected)).toEqual(['one', 'two']);
  await expect(timeline.locator('.ruler-time-selection-readout')).toHaveText('6 beats');

  // Cmd-click a clip adds it to (here: removes it from) the selection
  await timeline.locator('.clip[data-id="two"]').click({ modifiers: ['Meta'] });
  expect(await timeline.evaluate((element) => element.selected)).toEqual(['one']);

  // a drag along the ruler's loop row makes a region on every lane
  await page.mouse.move(ruler.x + 1 * pxPerBeat, ruler.y + ruler.height - 4);
  await page.mouse.down();
  await page.mouse.move(ruler.x + 5 * pxPerBeat, ruler.y + ruler.height - 4, { steps: 4 });
  await page.mouse.up();
  selection = await timeline.evaluate((element) => element.timeSelection);
  expect(selection).toEqual({ start: 1, end: 5, laneIds: ['a', 'b'] });
  await expect(timeline.locator('.ruler-time-selection-readout')).toHaveText('1 bar');

  await timeline.focus();
  await page.keyboard.press('Meta+a');
  expect(await timeline.evaluate((element) => element.selected)).toEqual(['one', 'two']);
  await page.keyboard.press('Escape');
  expect(await timeline.evaluate((element) => ({ selection: element.timeSelection, selected: element.selected })))
    .toEqual({ selection: null, selected: [] });
  const events = await timeline.evaluate((element) => element.testEvents);
  expect(events.at(-1)).toEqual({ type: 'time-select', detail: { start: null } });
});

test('timeline clips snap to their neighbours and locators', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('snap', 'grid');
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [
      { id: 'a', name: 'a', start: 0, length: 2, duration: 2, loop: false },
      { id: 'b', name: 'b', start: 4.1, length: 2, duration: 2, loop: false },
    ] }]);
    element.setLocators([{ id: 'drop', beat: 6.3, name: 'drop' }]);
    element.testEvents = [];
    for (const type of ['clip-move', 'clip-trim']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
  });
  const pxPerBeat = await timeline.evaluate((element) => element.pxPerBeat);

  // a's end lands next to b's off-grid start and butts up to it
  let box = await timeline.locator('.clip[data-id="a"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat * 2.08, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const move = await timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'clip-move'));
  expect(move.detail.deltaBeats).toBeCloseTo(2.1, 6);

  // b's right edge, dragged near the locator, lands on it
  box = await timeline.locator('.clip[data-id="b"]').boundingBox();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1 + pxPerBeat * .15, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const trim = await timeline.evaluate((element) => element.testEvents.find((event) => event.type === 'clip-trim'));
  expect(trim.detail.end).toBeCloseTo(6.3, 6);
});

test('timeline Alt toggles copy while a clip is in flight', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const clip = timeline.locator('.clip[data-id="beat"]');
  await timeline.evaluate((element) => {
    element.setAttribute('snap', 'off');
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [{ id: 'beat', name: 'beat', start: 0, length: 8, duration: 2, loop: true }] }]);
    element.testEvents = [];
    element.addEventListener('clip-move', (event) => element.testEvents.push(event.detail));
  });

  // start plain, press Alt on the way: a copy, and the original stops fading
  let box = await clip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 3 });
  await expect(clip).toHaveAttribute('data-dragging', '');
  await page.keyboard.down('Alt');
  await expect(clip).not.toHaveAttribute('data-dragging', '');
  await expect(timeline).toHaveAttribute('data-drag-copy', '');
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 2 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect((await timeline.evaluate((element) => element.testEvents.at(-1))).copy).toBe(true);

  // start with Alt, release it on the way: a plain move
  box = await clip.boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 3 });
  await page.keyboard.up('Alt');
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 2 });
  await page.mouse.up();
  expect((await timeline.evaluate((element) => element.testEvents.at(-1))).copy).toBe(false);
  await expect(timeline).not.toHaveAttribute('data-drag-copy', '');
});

test('timeline trims every selected clip together and grabs edges in em', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('snap', 'grid');
    element.style.fontSize = '32px';
    element.setLanes([
      { id: 'a', name: 'A', clips: [{ id: 'one', name: 'one', start: 0, length: 2, duration: 2, loop: false }] },
      { id: 'b', name: 'B', clips: [{ id: 'two', name: 'two', start: 4, length: 4, duration: 4, loop: false }] },
    ]);
    element.selected = ['one', 'two'];
    element.testEvents = [];
    element.addEventListener('clip-trim', (event) => element.testEvents.push(event.detail));
  });
  const pxPerBeat = await timeline.evaluate((element) => element.pxPerBeat);
  const one = timeline.locator('.clip[data-id="one"]');
  const box = await one.boundingBox();

  // at 32px the grab zone is .4em = 12.8px: 10px in from the edge is still a trim
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await expect(one).toHaveCSS('cursor', 'ew-resize');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10 + pxPerBeat, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const trims = await timeline.evaluate((element) => element.testEvents);
  expect(trims).toEqual([
    { id: 'one', start: 0, end: 3 },
    { id: 'two', start: 4, end: 9 },
  ]);
});

test('timeline asks to join clips and insert time', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([
      { id: 'a', name: 'A', clips: [
        { id: 'late', name: 'late', start: 4, length: 2, duration: 2, loop: false },
        { id: 'early', name: 'early', start: 0, length: 2, duration: 2, loop: false },
      ] },
    ]);
    element.setPlayhead(3);
    element.setTimeSelection(null, null);
    element.testEvents = [];
    for (const type of ['clip-join', 'time-insert']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.selected = ['late', 'early'];
  });
  await timeline.focus();
  await page.keyboard.press('Meta+j');
  await page.keyboard.press('Meta+i');
  await timeline.evaluate((element) => element.setTimeSelection(1, 3, ['a']));
  await page.keyboard.press('Meta+i');
  expect(await timeline.evaluate((element) => element.testEvents)).toEqual([
    { type: 'clip-join', detail: { ids: ['early', 'late'] } },
    { type: 'time-insert', detail: { beat: 3, beats: 4, laneIds: ['a'] } },
    { type: 'time-insert', detail: { beat: 1, beats: 2, laneIds: ['a'] } },
  ]);
});

test('timeline keyboard reaches fine nudges, other lanes, loop handles and locators', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('grid', '4');
    element.setLanes([
      { id: 'a', name: 'A', clips: [{ id: 'one', name: 'one', start: 0, length: 2, duration: 2, loop: false }] },
      { id: 'b', name: 'B', clips: [] },
    ]);
    element.setLocators([{ id: 'drop', beat: 6, name: 'drop' }]);
    element.setLoop(2, 6, true);
    element.testEvents = [];
    for (const type of ['clip-nudge', 'clip-move', 'loop-change', 'locator-move', 'locator-delete']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.selected = ['one'];
    element.focusClip('one');
  });
  await page.keyboard.press('Shift+Alt+ArrowRight');
  await page.keyboard.press('Alt+ArrowDown');
  await timeline.locator('.ruler-handle.start').focus();
  await page.keyboard.press('ArrowRight');
  await timeline.locator('.ruler-handle.end').focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await timeline.locator('.ruler-locator').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Delete');
  expect(await timeline.evaluate((element) => element.testEvents)).toEqual([
    { type: 'clip-nudge', detail: { ids: ['one'], deltaBeats: 1 / 16 } },
    { type: 'clip-move', detail: { ids: ['one'], laneId: 'b', deltaBeats: 0, copy: false } },
    { type: 'loop-change', detail: { start: 3, end: 6, enabled: true } },
    // the demo page applied the first loop-change, as a host would, so the second starts from 3
    { type: 'loop-change', detail: { start: 3, end: 6 - 1 / 16, enabled: true } },
    { type: 'locator-move', detail: { id: 'drop', beat: 5 } },
    { type: 'locator-delete', detail: { id: 'drop' } },
  ]);
  await expect(timeline.locator('.ruler-handle.start')).toHaveAttribute('aria-valuenow', '3');
});

test('timeline sizes every lane with Alt and zooms to the region on z', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setLanes([
      { id: 'a', name: 'A', clips: [{ id: 'one', name: 'one', start: 0, length: 2, duration: 2, loop: false }] },
      { id: 'b', name: 'B', clips: [] },
    ]);
    element.setTimeSelection(null, null);
    element.testEvents = [];
    for (const type of ['lane-resize', 'lanes-resize']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
  });
  const handle = timeline.locator('.lane-header[data-lane-id="a"] .lane-resize');
  const box = await handle.boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2 + 30, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  let events = await timeline.evaluate((element) => element.testEvents);
  expect(events.map((event) => event.type)).toEqual(['lane-resize', 'lane-resize']);
  expect(events[0].detail.height).toBe(events[1].detail.height);
  expect(await timeline.evaluate((element) => element.lanes.map((lane) => lane.height))).toEqual([events[0].detail.height, events[0].detail.height]);

  const lanes = await timeline.locator('.lanes-wrap').boundingBox();
  await page.mouse.move(lanes.x + lanes.width / 2, lanes.y + 10);
  await page.keyboard.down('Alt');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Alt');
  events = await timeline.evaluate((element) => element.testEvents);
  expect(events.at(-1).type).toBe('lanes-resize');
  expect(events.at(-1).detail.height).toBeGreaterThan(events[0].detail.height);

  await timeline.evaluate((element) => element.setTimeSelection(2, 6, ['a']));
  await timeline.focus();
  const before = await timeline.evaluate((element) => ({ px: element.pxPerBeat, scroll: element.scrollBeat }));
  await page.keyboard.press('z');
  const zoomed = await timeline.evaluate((element) => ({ px: element.pxPerBeat, scroll: element.scrollBeat, width: element.lanesWrap.clientWidth }));
  expect(zoomed.scroll).toBe(2);
  expect(zoomed.px).toBeCloseTo(zoomed.width / 4, 3);
  await page.keyboard.press('x');
  expect(await timeline.evaluate((element) => ({ px: element.pxPerBeat, scroll: element.scrollBeat }))).toEqual(before);
});

test('timeline copies stay on the grid and Cmd inverts snapping', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const clip = timeline.locator('.clip[data-id="beat"]');
  const other = timeline.locator('.clip[data-id="other"]');
  await timeline.evaluate((element) => {
    element.setAttribute('snap', 'grid');
    element.setLanes([{ id: 'lane', name: 'Lane', clips: [
      { id: 'beat', name: 'beat', start: 0, length: 2, duration: 2, loop: true },
      { id: 'other', name: 'other', start: 4, length: 2, duration: 2 },
    ] }]);
    element.testEvents = [];
    element.addEventListener('clip-move', (event) => element.testEvents.push(event.detail));
  });
  const pxPerBeat = await timeline.evaluate((element) => element.pxPerBeat);

  let box = await clip.boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat * .63, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  let move = await timeline.evaluate((element) => element.testEvents.at(-1));
  expect(move).toEqual({ ids: ['beat'], laneId: 'lane', deltaBeats: 1, copy: true });

  await timeline.evaluate((element) => element.selectOne('beat'));
  box = await other.boundingBox();
  await page.keyboard.down('Meta');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await timeline.evaluate((element) => element.selected)).toEqual(['other']);
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat * .63, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Meta');
  move = await timeline.evaluate((element) => element.testEvents.at(-1));
  expect(move.ids).toEqual(['other']);
  expect(move.copy).toBe(false);
  expect(move.deltaBeats).toBeCloseTo(.63, 5);

  await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    element.setLaneAutomation('lane', {
      id: 'gain', label: 'Gain', min: 0, max: 1, stepped: false, points: [],
    });
    element.selectOne('beat');
  });
  const name = await other.locator('.clip-name').boundingBox();
  await page.keyboard.down('Meta');
  await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
  await page.keyboard.up('Meta');
  expect(await timeline.evaluate((element) => element.selected)).toEqual(['other']);
});

test('timeline rulers expose locators, time selections and measured row geometry', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    document.documentElement.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-row-height');
    element.setAttribute('snap', 'grid');
    element.testEvents = [];
    for (const type of ['locator-jump', 'locator-move', 'locator-create', 'locator-rename', 'locator-context', 'locator-prev', 'locator-next', 'time-select-input', 'time-select', 'time-delete', 'clip-select', 'clip-split', 'seek', 'fit-request', 'loop-change']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([
      { id: 'a', name: 'A', clips: [], automation: { id: 'volume', label: 'Volume', min: 0, max: 1, stepped: false, points: [] } },
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
      automationView: root.querySelector('.lane[data-lane-id="a"] .lane-automation').getBoundingClientRect().height,
      thinHeader: thinHeader.height,
      thinBody: thinBody.height,
      locators: [...root.querySelectorAll('.ruler-locator')].map((node) => ({ id: node.dataset.locatorId, left: node.getBoundingClientRect().left })),
      rulerScrollbar: getComputedStyle(root.querySelector('.ruler-wrap')).scrollbarWidth,
      lanesScrollbar: getComputedStyle(root.querySelector('.lanes-wrap')).scrollbarWidth,
    };
  });
  expect(Math.abs(geometry.columns - 121)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.ruler - 36.3)).toBeLessThan(1);
  expect(Math.abs(geometry.header - 44)).toBeLessThan(1);
  expect(Math.abs(geometry.body - 44)).toBeLessThan(1);
  expect(Math.abs(geometry.base - 44)).toBeLessThan(1);
  expect(Math.abs(geometry.automationView - geometry.base)).toBeLessThan(1);
  expect(Math.abs(geometry.thinHeader - 27.5)).toBeLessThan(1);
  expect(Math.abs(geometry.thinBody - 27.5)).toBeLessThan(1);
  expect(geometry.locators.map(({ id }) => id)).toEqual(['intro', 'drop']);
  expect(geometry.rulerScrollbar).toBe('none');
  expect(geometry.lanesScrollbar).toBe('none');
  await timeline.evaluate((element) => element.removeAttribute('automation'));
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
    element.setLaneAutomation('a', null);
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
    element.setLaneAutomation('a', { id: 'volume', label: 'Volume', min: 0, max: 1, stepped: false, points: [] });
  });
  const afterAutomationHeight = await timeline.evaluate((element) => {
    const overlay = element.shadowRoot.querySelector('.time-selection[data-lane-id="b"]').getBoundingClientRect();
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="b"]').getBoundingClientRect();
    return { overlayTop: overlay.top, overlayHeight: overlay.height, laneTop: lane.top, laneHeight: lane.height };
  });
  expect(Math.abs(afterAutomationHeight.overlayTop - afterAutomationHeight.laneTop)).toBeLessThan(1);
  expect(Math.abs(afterAutomationHeight.overlayHeight - afterAutomationHeight.laneHeight)).toBeLessThan(1);
  expect(Math.abs(afterAutomationHeight.laneTop - beforeAutomationHeight.laneTop)).toBeLessThan(1);

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
      clipBorder: getComputedStyle(clip).borderStyle,
      clipRadius: getComputedStyle(clip).borderRadius,
      selectedBorder: getComputedStyle(clip).borderWidth,
      headerWidth: header.getBoundingClientRect().width,
      progressWidth: clipProgress?.getBoundingClientRect().width ?? 0,
      hasNumber: Boolean(header.querySelector('.number')),
    };
  });
  expect(measured.clipBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(measured.clipBorder).not.toBe('none');
  expect(measured.clipRadius).toBe('0px');
  expect(measured.selectedBorder).toBe('2px');
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

test('timeline paints velocity dashes and clip drop targets', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.removeAttribute('automation');
    element.setLanes([
      { id: 'source', name: 'Source', color: 'rgb(40, 120, 180)', clips: [{ id: 'velocity', name: 'velocity', start: 0, length: 4, duration: 4, loop: false, notes: [
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
    const playingNotes = root.querySelector('.clip[data-id="lit"] .clip-notes');
    const dimmedLane = root.querySelector('.lane[data-lane-id="dimmed"]');
    const dimmedClip = root.querySelector('.clip[data-id="dimmed-clip"]');
    const sourceBase = root.querySelector('.lane[data-lane-id="source"] .lane-base');
    const lanesWorld = root.querySelector('.lanes-world');
    return {
      opacities: notes.map((node) => Number(getComputedStyle(node).opacity)),
      playingNotesOpacity: Number(getComputedStyle(playingNotes).opacity),
      dimmed: dimmedLane.hasAttribute('data-dimmed'),
      dimmedClipOpacity: Number(getComputedStyle(dimmedClip).opacity),
      dimmedFilter: getComputedStyle(dimmedLane).filter,
      baseHeight: sourceBase.getBoundingClientRect().height,
      worldWidth: lanesWorld.getBoundingClientRect().width,
    };
  });
  expect(painted.opacities[0]).toBeCloseTo(.4417, 3);
  expect(painted.opacities[1]).toBeCloseTo(.678, 3);
  expect(painted.opacities[2]).toBeCloseTo(.867, 3);
  expect(painted.opacities[3]).toBeCloseTo(.55, 3);
  expect(painted.playingNotesOpacity).toBeCloseTo(1, 3);
  expect(painted.dimmed).toBe(true);
  expect(painted.dimmedClipOpacity).toBeCloseTo(.4, 3);
  expect(painted.dimmedFilter).toBe('none');

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

test('timeline aligns regular and compact lanes with automation view', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    document.documentElement.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-row-height');
    element.syncAttributes();
    element.setLanes([
      { id: 'regular', name: 'Regular', picked: true, clips: [], automation:
        { id: 'env', label: 'Env', min: 0, max: 1, stepped: false, points: [] } },
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
      automationView: bounds('.lane[data-lane-id="regular"] .lane-automation').height,
      pickedOutline: getComputedStyle(root.querySelector('.lane-name[data-picked]')).outlineStyle,
    };
  });
  expect(Math.abs(measured.regularHeader - measured.regularLane)).toBeLessThan(1);
  expect(Math.abs(measured.compactHeader - measured.compactLane)).toBeLessThan(1);
  expect(Math.abs(measured.regularHeader - 44)).toBeLessThan(1);
  expect(Math.abs(measured.regularBase - 44)).toBeLessThan(1);
  expect(Math.abs(measured.compactHeader - 27.5)).toBeLessThan(1);
  expect(Math.abs(measured.compactBase - 27.5)).toBeLessThan(1);
  expect(Math.abs(measured.automationView - measured.regularBase)).toBeLessThan(1);
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

test('timeline automation view draw and commit sorted edits without clip selection', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    element.setAttribute('snap', 'grid');
    element.testEvents = [];
    for (const type of ['automation-change', 'automation-context', 'clip-select']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([{ id: 'lane', name: 'MIDI 1', color: 'rgb(40, 120, 180)', clips: [
      { id: 'clip', name: 'clip', start: 0, length: 4, duration: 4, notes: [] },
    ], automation: {
      id: 'volume', label: 'Volume', min: -90, max: 12, stepped: false, scale: 'gain', value: -3,
      points: [{ beat: 0, value: -12 }, { beat: 4, value: 0 }],
    } }]);
  });
  const geometry = await timeline.evaluate((element) => {
    const lane = element.shadowRoot.querySelector('.lane');
    const base = element.shadowRoot.querySelector('.lane-base');
    const row = element.shadowRoot.querySelector('.lane-automation');
    const clip = element.shadowRoot.querySelector('.clip');
    const clipStyle = getComputedStyle(clip);
    const automationStyle = getComputedStyle(row);
    const on = { laneHeight: lane.getBoundingClientRect().height, baseHeight: base.getBoundingClientRect().height,
      rows: element.shadowRoot.querySelectorAll('.lane-automation').length,
      label: element.shadowRoot.querySelector('.lane-automation-label').textContent,
      automationColor: automationStyle.color,
      clipOpacity: Number(clipStyle.opacity), clipPointerEvents: clipStyle.pointerEvents,
      baseLane: element.laneAtPoint(base.getBoundingClientRect().top + 4),
      rowLane: element.laneAtPoint(row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2) };
    element.removeAttribute('automation');
    const offLane = element.shadowRoot.querySelector('.lane');
    const off = { laneHeight: offLane.getBoundingClientRect().height,
      rows: element.shadowRoot.querySelectorAll('.lane-automation').length };
    element.setAttribute('automation', '');
    return { on, off };
  });
  expect(geometry.on.rows).toBe(1);
  expect(geometry.on.label).toBe('Volume');
  expect(geometry.on.automationColor).toBe('rgb(40, 120, 180)');
  expect(geometry.on.clipOpacity).toBeCloseTo(.65, 3);
  expect(geometry.on.clipPointerEvents).toBe('none');
  expect(Math.abs(geometry.on.laneHeight - geometry.on.baseHeight)).toBeLessThanOrEqual(1);
  expect(geometry.on.baseLane).toBe('lane');
  expect(geometry.on.rowLane).toBe('lane');
  expect(geometry.off.rows).toBe(0);
  expect(Math.abs(geometry.off.laneHeight - geometry.on.baseHeight)).toBeLessThanOrEqual(1);

  await timeline.evaluate((element) => {
    const editor = element.shadowRoot.querySelector('compost-envelope-editor');
    editor.dispatchEvent(new CustomEvent('envelope-change', { bubbles: true, composed: true, detail: {
      points: [{ time: 0, value: .2 }, { time: 4, value: .8 }],
    } }));
    editor.dispatchEvent(new CustomEvent('envelope-context', { bubbles: true, composed: true, detail: {
      pointIndex: 1, time: 4, value: .8, clientX: 12, clientY: 24,
    } }));
  });
  const events = await timeline.evaluate((element) => element.testEvents);
  expect(events.find((event) => event.type === 'automation-change')).toEqual({
    type: 'automation-change', detail: { laneId: 'lane', automationId: 'volume', points: [
      { beat: 0, value: .2 }, { beat: 4, value: .8 },
    ] },
  });
  expect(events.find((event) => event.type === 'automation-context')).toMatchObject({
    type: 'automation-context', detail: { laneId: 'lane', automationId: 'volume', pointIndex: 1 },
  });

  const update = await timeline.evaluate((element) => {
    const lane = element.shadowRoot.querySelector('.lane[data-lane-id="lane"]');
    const clip = lane.querySelector('.clip');
    element.setLaneAutomation('lane', {
      id: 'pan', label: 'Pan', min: -1, max: 1, stepped: false,
      points: [{ beat: 0, value: 0 }],
    });
    const updatedLane = element.shadowRoot.querySelector('.lane[data-lane-id="lane"]');
    return {
      sameLane: lane === updatedLane,
      sameClip: clip === updatedLane.querySelector('.clip'),
      label: element.shadowRoot.querySelector('.lane-automation-label').textContent,
      automationId: updatedLane.querySelector('.lane-automation').dataset.automationId,
    };
  });
  expect(update).toEqual({ sameLane: true, sameClip: true, label: 'Pan', automationId: 'pan' });
});

test('timeline automation view keeps a clip reachable through its name strip', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    element.testEvents = [];
    for (const type of ['clip-select', 'clip-open', 'clip-context', 'automation-change']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([{ id: 'lane', name: 'MIDI 1', clips: [
      { id: 'clip', name: 'clip', start: 0, length: 4, duration: 4, notes: [] },
    ], automation: { id: 'gain', label: 'Gain', min: 0, max: 1, stepped: false, points: [{ beat: 0, value: .5 }] } }]);
  });
  const boxes = await timeline.evaluate((element) => {
    const clip = element.shadowRoot.querySelector('.clip').getBoundingClientRect();
    const strip = element.shadowRoot.querySelector('.clip-name').getBoundingClientRect();
    return { clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height }, strip: strip.height };
  });
  const stripPoint = [boxes.clip.x + boxes.clip.width / 2, boxes.clip.y + boxes.strip / 2];
  const bodyPoint = [boxes.clip.x + boxes.clip.width / 2, boxes.clip.y + boxes.clip.height * .75];
  await page.mouse.click(stripPoint[0], stripPoint[1]);
  await expect(timeline.locator('.clip[data-selected]')).toHaveCount(1);
  await page.mouse.dblclick(stripPoint[0], stripPoint[1]);
  await page.mouse.click(stripPoint[0], stripPoint[1], { button: 'right' });
  const beforeBody = await timeline.evaluate((element) => element.testEvents.map((event) => event.type));
  expect(beforeBody).toContain('clip-select');
  expect(beforeBody).toContain('clip-open');
  expect(beforeBody).toContain('clip-context');
  await timeline.evaluate((element) => { element.testEvents = []; });
  await page.mouse.click(bodyPoint[0], bodyPoint[1]);
  const afterBody = await timeline.evaluate((element) => element.testEvents.map((event) => event.type));
  expect(afterBody).not.toContain('clip-select');
  expect(afterBody).not.toContain('clip-open');
  await expect(timeline.locator('.clip[data-selected]')).toHaveCount(1);
});

test('timeline automation edits use display space, lane-scoped ranges and draw arbitration', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  await timeline.evaluate((element) => {
    document.documentElement.style.fontSize = '11px';
    element.style.fontSize = '11px';
    element.style.removeProperty('--compost-timeline-row-height');
    element.setAttribute('automation', '');
    element.setAttribute('snap', 'grid');
    element.syncAttributes();
    element.testEvents = [];
    for (const type of ['automation-change', 'automation-context', 'clip-select', 'time-delete', 'time-select', 'time-select-input']) {
      element.addEventListener(type, (event) => element.testEvents.push({ type, detail: event.detail }));
    }
    element.setLanes([
      { id: 'gain', name: 'Gain', clips: [], automation: { id: 'env', label: 'Gain', min: -90, max: 12, scale: 'gain', stepped: false,
        points: [{ beat: 0, value: -12 }, { beat: 4, value: 0 }] } },
      { id: 'linear', name: 'Linear', clips: [], automation: { id: 'env', label: 'Linear', min: 0, max: 1, stepped: false,
        points: [{ beat: 0, value: .1 }, { beat: 4, value: .9 }] } },
    ]);
  });

  const gainMove = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
  expect(Math.abs(gainMove.rowHeight - 44)).toBeLessThan(1);
  expect(gainMove.readout).toMatch(/^-?\d/);
  const gainChange = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').at(-1));
  expect(gainChange.detail.points[0].value).toBeCloseTo(gainMove.expected, 8);
  expect(gainChange.detail.points[0].value).not.toBeCloseTo(-12 + 8 * (102 / 26), 2);

  await timeline.evaluate((element) => element.setTimeSelection(1, 3, ['linear']));
  const beforeIsolation = await timeline.evaluate((element) => element.lanes[0].automation.points);
  await timeline.locator('.lane[data-lane-id="gain"] .lane-automation').focus();
  await page.keyboard.press('Delete');
  const afterIsolation = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation.points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(afterIsolation.points).toEqual(beforeIsolation);
  expect(afterIsolation.changes).toBe(1);

  await timeline.evaluate((element) => element.setTimeSelection(1, 3, ['gain']));
  await timeline.locator('.lane[data-lane-id="gain"] .lane-automation').focus();
  await page.keyboard.press('Delete');
  const cleared = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation.points,
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
  const beforeDrawKey = await timeline.evaluate((element) => element.lanes[0].automation.points);
  await timeline.locator('.lane[data-lane-id="gain"] compost-envelope-editor').locator('.point').first().focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowUp');
  await timeline.locator('.lane[data-lane-id="gain"] .lane-automation').focus();
  await page.keyboard.press('ArrowRight');
  const afterDrawKey = await timeline.evaluate((element) => ({
    points: element.lanes[0].automation.points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
    deletes: element.testEvents.filter((event) => event.type === 'time-delete').length,
    clipSelects: element.testEvents.filter((event) => event.type === 'clip-select').length,
  }));
  expect(afterDrawKey.points).toEqual(beforeDrawKey);
  expect(afterDrawKey.changes).toBe(2);
  expect(afterDrawKey.deletes).toBe(beforeDrawDeletes + 1);
  expect(afterDrawKey.clipSelects).toBe(beforeDrawClipSelects);

  const drawRow = timeline.locator('.lane[data-lane-id="gain"] .lane-automation');
  await drawRow.hover();
  await expect(drawRow.locator('.automation-draw-hint')).toHaveCSS('display', 'block');
  const hintGeometry = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
  await timeline.evaluate((element) => element.removeAttribute('draw'));
  const unsnappedRange = await timeline.evaluate((element) => {
    element.setTimeSelection(1.1, 1.4, ['gain']);
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
    const editor = row.querySelector('compost-envelope-editor');
    return editor.selection;
  });
  expect(unsnappedRange).toEqual({ start: 1.1, end: 1.4 });
  await timeline.evaluate((element) => {
    element.setAttribute('draw', '');
    element.setLaneAutomation('gain', { id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] });
  });
  const singleBefore = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').length);
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    points: element.lanes[0].automation.points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(single.changes).toBe(singleBefore + 1);
  expect(single.points).toHaveLength(2);
  expect(single.points[1].beat - single.points[0].beat).toBeCloseTo(1 - 1e-9, 8);

  await timeline.evaluate((element) => element.setLaneAutomation('gain', { id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }));
  const freehandBefore = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').length);
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    points: element.lanes[0].automation.points,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  expect(freehand.changes).toBe(freehandBefore + 1);
  expect(freehand.points.length).toBeGreaterThanOrEqual(2);
  expect(freehand.points.length).toBeLessThanOrEqual(4);

  await timeline.evaluate((element) => element.setLaneAutomation('gain', { id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }));
  const cancelBefore = await timeline.evaluate((element) => element.testEvents.filter((event) => event.type === 'automation-change').length);
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    points: element.lanes[0].automation.points,
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

  await timeline.evaluate((element) => element.setLaneAutomation('gain', { id: 'env', label: 'Gain', min: 0, max: 1, stepped: false, points: [] }));
  const beforeContext = await timeline.evaluate((element) => ({
    contexts: element.testEvents.filter((event) => event.type === 'automation-context').length,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
  }));
  await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    points: element.lanes[0].automation.points,
    contexts: element.testEvents.filter((event) => event.type === 'automation-context').length,
    changes: element.testEvents.filter((event) => event.type === 'automation-change').length,
    drag: element.drag,
  }))).toEqual({ points: [], contexts: beforeContext.contexts + 1, changes: beforeContext.changes, drag: null });

  await timeline.evaluate((element) => {
    element.setTimeSelection(null, null);
    element.removeAttribute('draw');
    element.setLaneAutomation('gain', { id: 'env', label: 'Gain', min: 0, max: 1, stepped: false,
      points: [{ beat: 0, value: .2 }, { beat: 4, value: .8 }] });
  });
  const firstEdge = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    return { readout, points: element.lanes[0].automation.points };
  });
  expect(firstEdge.readout).not.toContain('·');
  expect(firstEdge.points.map((point) => point.beat)).toEqual([0, 2, 4]);
  expect(firstEdge.points.find((point) => point.beat === 0).value).toBeCloseTo(.2, 8);

  const lastEdge = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    return element.lanes[0].automation.points;
  });
  expect(lastEdge.map((point) => point.beat)).toEqual([0, 2, 3, 4]);
  expect(lastEdge.find((point) => point.beat === 4).value).toBeCloseTo(.8, 8);

  await timeline.evaluate((element) => element.setLaneAutomation('gain', { id: 'env', label: 'Gain', min: 0, max: 1, stepped: false,
    points: [{ beat: 0, value: .2 }, { beat: 2, value: .5 }, { beat: 4, value: .8 }] }));
  const clampedPoint = await timeline.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.lane-automation[data-lane-id="gain"]');
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
    return { readout, points: element.lanes[0].automation.points };
  });
  expect(clampedPoint.readout).not.toContain('·');
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
      { id: 'with-automation', name: 'A', clips: [], automation: { id: 'env', label: 'Env', min: 0, max: 1, stepped: false, points: [] } },
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
  expect(await editor.evaluate((element) => element.drag?.mode)).toBe('len');
  await page.mouse.move(box.x + box.width - 2 + pxPerBeat, box.y + box.height / 2, { steps: 6 });
  await expect(editor.locator('.tip')).toBeHidden();
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
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat * 2.13, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const countAfterCopy = await editor.evaluate((element) => element.notes.length);
  expect(countAfterCopy).toBeGreaterThan(countBefore);
  expect(await editor.evaluate((element) => element.selectedIds.length)).toBe(selectedBefore);
  expect(await editor.evaluate((element) => element.notes
    .filter((note) => element.selectedIds.includes(note.id))
    .every((note) => Math.abs(note.start / element.step - Math.round(note.start / element.step)) < 1e-9))).toBe(true);
  expect(await editor.evaluate((element) => element.notes.every((note) =>
    note.id.startsWith('demo-editor-note-')))).toBe(true);
  expect(await editor.evaluate((element) => element.notes.every((note, index, notes) =>
    notes.slice(index + 1).every((other) => note.note !== other.note
      || note.start >= other.start + other.duration
      || other.start >= note.start + note.duration)))).toBe(true);
  await page.keyboard.press('Backspace');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(countAfterCopy - selectedBefore);

  // Shift extends selection but does not slow a note move
  const shifted = await editor.evaluate((element) => {
    element.clearSelection();
    return { id: element.notes[0].id, start: element.notes[0].start };
  });
  box = await editor.locator(`.note[data-id="${shifted.id}"]`).boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerBeat, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).start, shifted.id))
    .toBe(shifted.start + 1);
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
  await expect(editor.locator('.marker-guide')).toHaveAttribute('data-on', '');
  const guide = await editor.locator('.marker-guide').boundingBox();
  const editorGrid = await editor.locator('.grid').boundingBox();
  expect(Math.abs(guide.x - (editorGrid.x + pxPerBeat * 1.5))).toBeLessThan(1);
  await page.mouse.up();
  await expect(editor.locator('.marker-guide')).not.toHaveAttribute('data-on', '');
  await expect(editor).toHaveAttribute('start', '1.5');
  expect(await editor.evaluate((element) => element.notes)).toEqual(notesBeforeRange);

  // marquee everything, duplicate one span later, delete
  const notesBeforeMarquee = await editor.evaluate((element) => element.notes.length);
  const grid = await editor.locator('.grid').boundingBox();
  await page.mouse.move(grid.x + 2, grid.y + 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + 9 * pxPerBeat, grid.y + grid.height - 2, { steps: 5 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.selectedIds.length)).toBe(notesBeforeMarquee);
  await page.keyboard.press('Meta+d');
  expect(await editor.evaluate((element) => element.notes.length)).toBeGreaterThan(notesBeforeMarquee);
  await page.keyboard.press('Backspace');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(notesBeforeMarquee);
  expect(await editor.evaluate((element) => element.selectionRegion)).not.toBe(null);
  await page.keyboard.press('Escape');
  expect(await editor.evaluate((element) => element.selectionRegion)).toBe(null);
  const events = await editor.evaluate((element) => element.testEvents);
  expect(events.filter((entry) => entry === 'notes-change').length).toBe(9);
  expect(events).toContainEqual(['loop-change', 9]);
  expect(events).toContainEqual(['range-change', 1.5]);

  // explicit vertical zoom always shows every requested pitch row
  const rows = await editor.evaluate((element) => {
    element.style.height = '150px';
    element.style.fontSize = '13px';
    element.setAttribute('note-count', '48');
    element.refresh();
    return { visible: element.visibleKeys.length, rowHeight: element.rowHeight, asked: element.noteCount };
  });
  console.log('U-22 rows', JSON.stringify(rows));
  expect(rows.visible).toBe(rows.asked);
  expect(rows.rowHeight).toBeLessThan(4);
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

test('note editor and timeline count a 6/8 meter on a note-value grid', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  const editorMeter = await editor.evaluate((element) => {
    element.setAttribute('beats-per-bar', '9');
    element.setAttribute('time-signature', '6/8');
    element.setAttribute('grid', '1/16');
    element.zoomPxPerBeat = 80;
    element.refresh();
    return {
      signature: element.timeSignature,
      barLength: element.beatsPerBar,
      beatLength: element.beatLength,
      step: element.step,
      labels: [...element.shadowRoot.querySelectorAll('.bn')].map((label) => label.textContent),
    };
  });
  expect(editorMeter).toMatchObject({ signature: '6/8', barLength: 3, beatLength: .5, step: .25 });
  expect(editorMeter.labels).toContain('1.6');
  await expect(editor.locator('.gl.pulse')).toHaveCount(4);

  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const timelineMeter = await timeline.evaluate((element) => {
    element.setAttribute('beats-per-bar', '9');
    element.setAttribute('time-signature', '6/8');
    element.setAttribute('grid', '1/16');
    element.pxPerBeat = 80;
    return {
      signature: element.timeSignature,
      barLength: element.beatsPerBar,
      beatLength: element.beatLength,
      labels: [...element.shadowRoot.querySelectorAll('.ruler-label')].map((label) => label.textContent),
    };
  });
  expect(timelineMeter).toMatchObject({ signature: '6/8', barLength: 3, beatLength: .5 });
  expect(timelineMeter.labels).toContain('1.6');
  expect(await timeline.locator('.lanes-world .grid-line.pulse').count()).toBeGreaterThan(0);
});

test('note editor review host plays a one-beat pickup into a two-bar 6/8 loop', async ({ page }) => {
  await page.goto('/examples/review/review.html?el=compost-note-editor');
  const scenario = page.locator('section.plain');
  const editor = scenario.locator('compost-note-editor');
  expect(await editor.evaluate((element) => ({
    rangeStart: element.rangeStart,
    loopStart: element.loopStart,
    loopEnd: element.loopEnd,
    beatLength: element.beatLength,
    pickup: element.notes[0].start,
  }))).toEqual({ rangeStart: 2.5, loopStart: 3, loopEnd: 9, beatLength: .5, pickup: 2.5 });
  const play = scenario.locator('[data-note-playhead]');
  await play.click();
  await expect(play).toHaveText('Stop');
  await expect.poll(async () => Number(await editor.getAttribute('playhead'))).toBeGreaterThan(2.5);
  await play.click();
  await expect(editor).not.toHaveAttribute('playhead');
});

test('note editor playback and loop ranges are independent', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  expect(await editor.evaluate((element) => {
    element.setRange(6, 10);
    element.setLoop(2, 4);
    return [element.rangeStart, element.rangeEnd, element.loopStart, element.loopEnd];
  })).toEqual([6, 10, 2, 4]);
  expect(await editor.evaluate((element) => {
    element.setRange(1, 5);
    element.setLoop(7, 11);
    return [element.rangeStart, element.rangeEnd, element.loopStart, element.loopEnd];
  })).toEqual([1, 5, 7, 11]);
});

test('note editor resets note velocity on Command-double-click', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => {
    element.defaultVelocity = 91;
    element.setNotes(element.notes.map((note, index) => index === 0
      ? { ...note, velocity: 23 } : note));
  });
  await editor.locator('.note').first().dblclick({ modifiers: ['Meta'] });
  expect(await editor.evaluate((element) => element.notes[0].velocity)).toBe(91);
});

test('note editor stops copying immediately when Alt is released during a drag', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  const before = await editor.evaluate((element) => ({
    count: element.notes.length, id: element.notes[0].id, start: element.notes[0].start,
    pxPerBeat: element.pxPerBeat,
  }));
  const box = await editor.locator(`.note[data-id="${before.id}"]`).boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + before.pxPerBeat * 1.13,
    box.y + box.height / 2, { steps: 5 });
  await expect(editor.locator('.note')).toHaveCount(before.count + 1);
  expect(await editor.evaluate((element) => element.notes.length)).toBe(before.count,
    'drag previews do not mutate caller-owned notes');
  await page.keyboard.up('Alt');
  expect(await editor.evaluate((element) => element.notes.length)).toBe(before.count);
  await page.mouse.up();
  expect(await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).start, before.id))
    .toBe(before.start + 1.25);
});

test('note editor reports context intent for notes and empty grid', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => {
    element.testContexts = [];
    element.addEventListener('note-context', (event) => element.testContexts.push(event.detail));
  });
  await editor.locator('.note').first().click({ button: 'right' });
  const grid = await editor.locator('.grid').boundingBox();
  await page.mouse.click(grid.x + grid.width - 4, grid.y + grid.height - 4, { button: 'right' });
  expect(await editor.evaluate((element) => element.testContexts.map(({ id }) => id ?? null)))
    .toEqual(['demo-editor-note-1', null]);
});

test('note editor pitch keys select a pitch and time-grid lines can be hidden', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.locator('.key[data-note="60"]').click();
  expect(await editor.evaluate((element) => element.notes
    .filter((note) => element.selectedIds.includes(note.id)).map((note) => note.note)))
    .toEqual([60, 60]);
  await editor.locator('.key[data-note="64"]').click({ modifiers: ['Shift'] });
  expect(await editor.evaluate((element) => element.notes
    .filter((note) => element.selectedIds.includes(note.id)).map((note) => note.note)))
    .toEqual([60, 64, 60, 64]);

  await editor.evaluate((element) => element.setAttribute('grid-lines', 'off'));
  await expect(editor.locator('.gl')).toHaveCount(0);
  await expect(editor.locator('.rl').first()).toBeVisible();
  await expect(editor.locator('.division')).toHaveText('off');
});

test('note editor keeps a snapped time span separate from its selected pitches', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => element.setNotes([
    { id: 'chosen', note: 60, start: 2, duration: 0.5, velocity: 100, channel: 0 },
    { id: 'same-time-other-pitch', note: 64, start: 2, duration: 0.5, velocity: 100, channel: 0 },
  ]));
  const geometry = await editor.evaluate((element) => ({
    px: element.pxPerBeat, y: element.noteToY(60), row: element.rowHeight,
  }));
  const grid = await editor.locator('.grid').boundingBox();
  await page.mouse.move(grid.x + geometry.px * 1.12, grid.y + geometry.y + 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + geometry.px * 5.08,
    grid.y + geometry.y + geometry.row - 2, { steps: 5 });
  await page.mouse.up();

  expect(await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }))).toEqual({ ids: ['chosen'], range: { start: 1, end: 5, pitches: [60] } });
  const band = await editor.locator('.time-selection').boundingBox();
  expect(Math.abs(band.height - geometry.row)).toBeLessThan(1);
  await expect(editor.locator('.time-selection')).toHaveAttribute('data-box', '');
  await expect(editor.locator('.time-selection-ruler')).toBeVisible();
  await expect(editor.locator('.division')).toHaveText('1 bar');

  await page.keyboard.press('Meta+l');
  await expect(editor).toHaveAttribute('loop-start', '1');
  await expect(editor).toHaveAttribute('loop-end', '5');
  await page.keyboard.press('Meta+d');
  const duplicated = await editor.evaluate((element) => ({
    notes: element.notes.map(({ id, start }) => ({ id, start })),
    ids: element.selectedIds,
    range: element.selectionRegion,
  }));
  expect(duplicated.notes.slice(0, 2)).toEqual([
    { id: 'chosen', start: 2 },
    { id: 'same-time-other-pitch', start: 2 },
  ]);
  expect(duplicated.notes[2].start).toBe(6);
  expect(duplicated.notes[2].id).toMatch(/^demo-editor-note-/);
  expect(duplicated.ids).toEqual([duplicated.notes[2].id]);
  expect(duplicated.range).toEqual({ start: 5, end: 9, pitches: [60] });
  await page.keyboard.press('Escape');
  expect(await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }))).toEqual({ ids: [], range: null });
  await expect(editor.locator('.time-selection')).toBeHidden();

  const rulerGeometry = await editor.evaluate((element) => ({ px: element.pxPerBeat }));
  const ruler = await editor.locator('.ruler').boundingBox();
  await page.mouse.move(ruler.x + rulerGeometry.px * 1.12, ruler.y + 4);
  await page.mouse.down();
  await page.mouse.move(ruler.x + rulerGeometry.px * 5.08, ruler.y + 4, { steps: 5 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }))).toEqual({ ids: ['chosen', 'same-time-other-pitch'], range: { start: 1, end: 5 } });
  const timeBand = await editor.locator('.time-selection').boundingBox();
  const currentGrid = await editor.locator('.grid').boundingBox();
  expect(Math.abs(timeBand.height - currentGrid.height)).toBeLessThan(1);
  await expect(editor.locator('.time-selection')).not.toHaveAttribute('data-box', '');
});

test('note editor defers empty-click semantics and Shift-click extends the prior box', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => element.setNotes([
    { id: 'low', note: 60, start: 2, duration: 0.5, velocity: 100, channel: 0 },
    { id: 'high', note: 64, start: 4, duration: 0.5, velocity: 100, channel: 0 },
  ]));
  const geometry = await editor.evaluate((element) => ({
    px: element.pxPerBeat, lowY: element.noteToY(60), highY: element.noteToY(64),
    emptyY: element.noteToY(67), row: element.rowHeight,
  }));
  const grid = await editor.locator('.grid').boundingBox();
  await page.mouse.move(grid.x + geometry.px, grid.y + geometry.lowY + 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + geometry.px * 3,
    grid.y + geometry.lowY + geometry.row - 2, { steps: 4 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.selectionRegion))
    .toEqual({ start: 1, end: 3, pitches: [60] });

  await page.keyboard.down('Shift');
  await page.mouse.move(grid.x + geometry.px * 5, grid.y + geometry.highY + geometry.row / 2);
  await page.mouse.down();
  await expect(editor.locator('.marquee')).toBeHidden();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }))).toEqual({ ids: ['low', 'high'], range: { start: 1, end: 5, pitches: [60, 64] } });

  const beforePress = await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }));
  const empty = { x: grid.x + geometry.px * 8, y: grid.y + geometry.emptyY + geometry.row / 2 };
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await expect(editor.locator('.marquee')).toBeHidden();
  expect(await editor.evaluate((element) => ({ ids: element.selectedIds, range: element.selectionRegion })))
    .toEqual(beforePress);
  await page.mouse.up();
  expect(await editor.evaluate((element) => ({ ids: element.selectedIds, range: element.selectionRegion })))
    .toEqual({ ids: [], range: null });

  const beforeCreate = await editor.evaluate((element) => element.notes.length);
  await page.mouse.dblclick(empty.x, empty.y, { delay: 60 });
  expect(await editor.evaluate((element) => element.notes.length)).toBe(beforeCreate + 1);
});

test('note editor double-click creates in the clicked grid cell every time', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => element.setNotes([]));
  const geometry = await editor.evaluate((element) => ({
    px: element.pxPerBeat, step: element.step, row: element.rowHeight,
  }));
  const grid = await editor.locator('.grid').boundingBox();
  const cells = [5, 9, 13];
  await page.mouse.click(
    grid.x + 1.25 * geometry.step * geometry.px,
    grid.y + 1.5 * geometry.row,
  );
  for (let index = 0; index < cells.length; index += 1) {
    await page.mouse.dblclick(
      grid.x + (cells[index] + .75) * geometry.step * geometry.px,
      grid.y + (index + 3.5) * geometry.row,
      { delay: 60 },
    );
  }
  expect(await editor.evaluate((element) => element.notes.map((note) => note.start)))
    .toEqual(cells.map((cell) => cell * geometry.step));
});

test('note editor tolerates hand movement without relying on native double-click', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => element.setNotes([]));
  const grid = editor.locator('.grid');
  await grid.evaluate((element) => {
    element.addEventListener('dblclick', (event) => event.stopImmediatePropagation(), { capture: true });
  });
  const box = await grid.boundingBox();
  const point = { x: box.x + box.width / 3, y: box.y + box.height / 3 };
  for (let click = 0; click < 2; click += 1) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 5, point.y + 2);
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  expect(await editor.evaluate((element) => element.notes.length)).toBe(1);
  await expect(editor.locator('.marquee')).toBeHidden();
});

test('note editor duplication time contains the full span of every selected note', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => element.setNotes([
    { id: 'e', note: 64, start: 2, duration: 1, velocity: 100, channel: 0 },
    { id: 'g', note: 67, start: 4, duration: 1, velocity: 100, channel: 0 },
  ]));
  const geometry = await editor.evaluate((element) => ({
    px: element.pxPerBeat, y: element.noteToY(64), row: element.rowHeight,
  }));
  const grid = await editor.locator('.grid').boundingBox();
  await page.mouse.move(grid.x + geometry.px * 1.25, grid.y + geometry.y + 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + geometry.px * 2.25,
    grid.y + geometry.y + geometry.row - 2, { steps: 4 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.selectionRegion))
    .toEqual({ start: 1.25, end: 3, pitches: [64] });

  await editor.locator('.note[data-id="g"] .ve').click({ modifiers: ['Shift'] });
  expect(await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }))).toEqual({ ids: ['e', 'g'], range: { start: 1.25, end: 5, pitches: [64] } });

  await page.keyboard.press('Meta+d');
  const copies = await editor.evaluate((element) => element.notes
    .filter((note) => element.selectedIds.includes(note.id))
    .map(({ start }) => start));
  expect(copies).toEqual([5.75, 7.75]);
});

test('note editor Shift-click grows a selected note into a visible row range', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => element.setNotes([
    { id: 'e', note: 64, start: 2, duration: 1, velocity: 100, channel: 0 },
  ]));
  await editor.locator('.note[data-id="e"] .ve').click();
  const geometry = await editor.evaluate((element) => ({
    px: element.pxPerBeat, y: element.noteToY(64), row: element.rowHeight,
  }));
  const grid = await editor.locator('.grid').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.click(grid.x + geometry.px * 5, grid.y + geometry.y + geometry.row / 2);
  await page.keyboard.up('Shift');
  expect(await editor.evaluate((element) => ({
    ids: element.selectedIds, range: element.selectionRegion,
  }))).toEqual({ ids: ['e'], range: { start: 2, end: 5, pitches: [64] } });
  const box = await editor.locator('.time-selection').boundingBox();
  expect(Math.abs(box.height - geometry.row)).toBeLessThan(1);
  await page.keyboard.press('Meta+d');
  expect(await editor.evaluate((element) => element.notes
    .find((note) => element.selectedIds.includes(note.id)).start)).toBe(5);
});

test('note editor keeps the selection anchor fixed when Cmd changes mid-drag', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  const geometry = await editor.evaluate((element) => ({
    px: element.pxPerBeat, y: element.noteToY(72), row: element.rowHeight,
  }));
  const grid = await editor.locator('.grid').boundingBox();
  const y = grid.y + geometry.y + geometry.row / 2;
  await page.mouse.move(grid.x + geometry.px * 1.12, y);
  await page.mouse.down();
  await page.mouse.move(grid.x + geometry.px * 1.5, y, { steps: 3 });
  await page.keyboard.down('Meta');
  await page.mouse.move(grid.x + geometry.px * 2.13, y, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Meta');
  const range = await editor.evaluate((element) => element.selectionRegion);
  expect(range.start).toBe(1);
  expect(range.end).toBeCloseTo(2.13, 5);
});

test('note editor geometry edits trim earlier tails and replace covered starts by channel', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => {
    element.setNotes([
      { id: 'earlier', note: 60, start: 0.5, duration: 1, velocity: 100, channel: 0 },
      { id: 'moving', note: 60, start: 1, duration: 0.25, velocity: 100, channel: 0 },
      { id: 'covered', note: 60, start: 1.25, duration: 0.25, velocity: 100, channel: 0 },
      { id: 'other-channel', note: 60, start: 1.25, duration: 0.25, velocity: 100, channel: 1 },
    ]);
    element.selection = new Set(['moving']);
    element.focus();
  });
  await page.keyboard.press('ArrowRight');
  expect(await editor.evaluate((element) => element.notes.map(({ id, start, duration, channel }) =>
    ({ id, start, duration, channel })))).toEqual([
    { id: 'earlier', start: 0.5, duration: 0.75, channel: 0 },
    { id: 'moving', start: 1.25, duration: 0.25, channel: 0 },
    { id: 'other-channel', start: 1.25, duration: 0.25, channel: 1 },
  ]);
});

test('note editor vertical arrows stay on displayed pitches in Fold', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  const id = await editor.evaluate((element) => {
    const note = element.notes.find((entry) => entry.note === 60);
    element.selection = new Set([note.id]);
    element.setAttribute('fold', '');
    element.focus();
    return note.id;
  });
  await page.keyboard.press('ArrowUp');
  expect(await editor.evaluate((element, noteId) =>
    element.notes.find((note) => note.id === noteId).note, id)).toBe(64);
  await page.keyboard.press('ArrowDown');
  expect(await editor.evaluate((element, noteId) =>
    element.notes.find((note) => note.id === noteId).note, id)).toBe(60);
});

test('note editor creates velocity-shaped notes and applies keyboard edit modifiers', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');

  const first = await editor.evaluate((element) => element.notes[0]);
  let box = await editor.locator(`.note[data-id="${first.id}"]`).boundingBox();
  await page.keyboard.down('Meta');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Meta');
  expect(await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).velocity, first.id))
    .toBe(first.velocity + 12);

  const beforeIds = await editor.evaluate((element) => element.notes.map((note) => note.id));
  const geometry = await editor.evaluate((element) => ({ step: element.step, px: element.pxPerBeat }));
  const grid = await editor.locator('.grid').boundingBox();
  await editor.evaluate((element) => element.setAttribute('draw', ''));
  await page.mouse.move(grid.x + geometry.px * 9, grid.y + grid.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(grid.x + geometry.px * 9.75, grid.y + grid.height * 0.3 - 18, { steps: 5 });
  await page.mouse.up();
  const created = await editor.evaluate((element, ids) => element.notes.find((note) => !ids.includes(note.id)), beforeIds);
  expect(created.duration).toBeGreaterThan(geometry.step);
  expect(created.velocity).toBeGreaterThan(100);

  await editor.evaluate((element) => {
    element.removeAttribute('draw');
    element.selection = new Set([element.notes[0].id]);
    element.renderSelection();
    element.focus();
  });
  const selected = await editor.evaluate((element) => element.notes.find((note) => element.selectedIds.includes(note.id)));
  await page.keyboard.press('Shift+ArrowUp');
  expect(await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).note, selected.id))
    .toBe(selected.note + 12);
  await page.keyboard.press('Shift+ArrowRight');
  expect(await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).start, selected.id))
    .toBeCloseTo(selected.start + geometry.step / 16, 8);
  const duration = await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).duration, selected.id);
  await page.keyboard.press('Alt+ArrowRight');
  expect(await editor.evaluate((element, id) => element.notes.find((note) => note.id === id).duration, selected.id))
    .toBeCloseTo(duration + geometry.step, 8);
  await page.keyboard.press('Escape');
  expect(await editor.evaluate((element) => element.selectedIds)).toEqual([]);
});

test('note editor loop visibility and keybed panning follow host state', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await expect(editor.locator('.region')).toBeVisible();
  await editor.evaluate((element) => element.removeAttribute('loop'));
  await expect(editor.locator('.region')).toBeHidden();
  await expect(editor.locator('.timeline-line.loop').first()).toBeHidden();

  const before = await editor.evaluate((element) => {
    element.previewEvents = [];
    element.addEventListener('note-preview', ({ detail }) => element.previewEvents.push(['start', detail.note]));
    element.addEventListener('note-preview-end', ({ detail }) => element.previewEvents.push(['end', detail.note]));
    return { root: element.rootNote, row: element.rowHeight, rows: element.noteCount };
  });
  const key = editor.locator('.key').nth(8);
  const box = await key.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + before.row * 2, { steps: 4 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.rootNote)).toBe(before.root + 2);
  expect(await editor.evaluate((element) => element.previewEvents.map(([type]) => type)))
    .toEqual(['start', 'end']);

  const zoomKey = editor.locator('.key').nth(8);
  const zoomBox = await zoomKey.boundingBox();
  await page.mouse.move(zoomBox.x + zoomBox.width / 2, zoomBox.y + zoomBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(zoomBox.x + zoomBox.width / 2 + 48, zoomBox.y + zoomBox.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(await editor.evaluate((element) => element.noteCount)).toBeLessThan(before.rows);

  const hover = await editor.evaluate((element) => ({ y: element.noteToY(63), row: element.rowHeight }));
  const hoverGrid = await editor.locator('.grid').boundingBox();
  await page.mouse.move(hoverGrid.x + hoverGrid.width / 2, hoverGrid.y + hover.y + hover.row / 2);
  await expect(editor.locator('.key[data-note="63"]')).toHaveAttribute('data-hover', '');
  expect(await editor.locator('.key[data-note="63"]').evaluate((element) =>
    getComputedStyle(element, '::before').content)).toContain('D#');
  await page.mouse.down();
  await page.mouse.up();
  await expect(editor.locator('.key[data-note="63"]')).toHaveAttribute('data-hover', '');
});

test('note editor keeps its visual hierarchy neutral and marks a supplied scale', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  expect(await editor.locator('.key[data-scale]').count()).toBeGreaterThan(0);
  expect(await editor.locator('.key[data-root]').count()).toBeGreaterThan(0);
  expect(await editor.locator('.rl.octave').count()).toBeGreaterThan(0);

  const keyWidth = await editor.locator('.key').first().evaluate((element) => {
    const host = element.getRootNode().host;
    return element.getBoundingClientRect().width / parseFloat(getComputedStyle(host).fontSize);
  });
  expect(keyWidth).toBeCloseTo(3, 1);
  const blackEdge = await editor.evaluate((element) => {
    const keys = element.keys.getBoundingClientRect();
    const black = element.keys.querySelector('.key.black').getBoundingClientRect();
    return Math.abs(keys.right - black.right);
  });
  expect(blackEdge).toBeLessThan(0.1);

  const noteId = await editor.locator('.note:not([data-out])').first().getAttribute('data-id');
  const note = editor.locator(`.note[data-id="${noteId}"]`);
  const inRange = await note.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderColor, opacity: style.opacity };
  });
  await editor.evaluate((element) => element.setRange(3, element.rangeEnd));
  const outside = await note.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderColor, opacity: style.opacity };
  });
  expect(outside.background).not.toBe(inRange.background);
  expect(outside.border).toBe(inRange.border);
  expect(outside.opacity).toBe('1');
});

test('note editor horizontal zoom-out stops when the full range fits', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  const geometry = await editor.evaluate((element) => {
    element.zoomPxPerBeat = 0.01;
    element.refresh();
    return {
      grid: element.gridElement.getBoundingClientRect().width,
      viewport: element.gridWrap.getBoundingClientRect().width,
      pxPerBeat: element.pxPerBeat,
    };
  });
  expect(Math.abs(geometry.grid - geometry.viewport)).toBeLessThan(1);
  expect(geometry.pxPerBeat).toBeGreaterThan(0.01);
});

test('note editor emits quantize intent and leaves strength and swing to its host', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  await editor.evaluate((element) => {
    element.setNotes([
      { id: 'a', note: 60, start: 0.31, duration: 0.61, velocity: 100, channel: 0 },
    ]);
    element.selection = new Set(['a']);
    element.quantizeEvents = [];
    element.addEventListener('note-quantize', (event) => element.quantizeEvents.push(event.detail));
    element.focus();
  });
  await page.keyboard.press('q');
  expect(await editor.evaluate((element) => ({ notes: element.notes, events: element.quantizeEvents })))
    .toEqual({
      notes: [{ id: 'a', note: 60, start: 0.25, duration: 0.61, velocity: 100, channel: 0 }],
      events: [{ ids: ['a'], step: 0.25, lengths: false }],
    });
  await editor.evaluate((element) => element.setNotes([
    { id: 'a', note: 60, start: 0.31, duration: 0.61, velocity: 100, channel: 0 },
  ]));
  await page.keyboard.press('Shift+q');
  expect(await editor.evaluate((element) => ({ note: element.notes[0], event: element.quantizeEvents.at(-1) })))
    .toEqual({
      note: { id: 'a', note: 60, start: 0.25, duration: 0.5, velocity: 100, channel: 0 },
      event: { ids: ['a'], step: 0.25, lengths: true },
    });
  const count = await editor.evaluate((element) => element.quantizeEvents.length);
  await editor.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'q', metaKey: true, bubbles: true, composed: true,
  })));
  expect(await editor.evaluate((element) => element.quantizeEvents.length)).toBe(count);
});

test('note editor previews edits without taking ownership of caller notes', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-note-editor/');
  const editor = page.locator('compost-note-editor[data-option-target="editor"]');
  const isolated = await page.evaluate(() => {
    const source = document.querySelector('compost-note-editor');
    const element = document.createElement('compost-note-editor');
    for (const name of ['beats', 'grid', 'root-note', 'note-count']) {
      if (source.hasAttribute(name)) element.setAttribute(name, source.getAttribute(name));
    }
    element.style.cssText = 'display:block;width:720px;height:360px';
    element.noteIdFactory = () => 'new';
    element.notes = [{ id: 'owned', note: 60, start: 1, duration: 1, velocity: 100, channel: 0 }];
    element.changes = [];
    element.addEventListener('notes-change', (event) => element.changes.push(event.detail.notes));
    document.body.append(element);
    element.refresh();
    return { px: element.pxPerBeat };
  });
  const standalone = page.locator('body > compost-note-editor').last();
  await standalone.scrollIntoViewIfNeeded();
  const note = await standalone.locator('.note[data-id="owned"]').boundingBox();
  await page.mouse.move(note.x + note.width / 2, note.y + note.height / 2);
  await page.mouse.down();
  await page.mouse.move(note.x + note.width / 2 + isolated.px, note.y + note.height / 2, { steps: 4 });
  expect(await standalone.evaluate((element) => element.notes[0].start)).toBe(1);
  expect(await standalone.locator('.note[data-id="owned"]').evaluate((element) => parseFloat(element.style.left)))
    .toBeCloseTo(isolated.px * 2, 1);
  await page.mouse.up();
  expect(await standalone.evaluate((element) => ({ start: element.notes[0].start,
    emitted: element.changes[0][0].start }))).toEqual({ start: 1, emitted: 2 });
  expect(await standalone.locator('.note[data-id="owned"]').evaluate((element) => parseFloat(element.style.left)))
    .toBeCloseTo(isolated.px, 1);
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
  await expect(context.getByRole('menuitem')).toHaveCount(5);
  await expect(context.getByRole('menuitemradio')).toHaveCount(0);
  const box = await context.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(600);
  await page.mouse.click(20, 20);
  await expect(context).toBeHidden();
});

test('popup grows to fit an unconstrained option label', async ({ page }) => {
  await page.goto('/e2e/fixtures/popup-long-option.html');

  await expect(page.getByRole('menu', { name: 'Track input' })).toBeVisible();
  const label = page.getByRole('menuitemradio', { name: 'MIDI 1 · all channels' }).locator('.label');
  const size = await label.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(size.client).toBeGreaterThan(0);
  expect(size.scroll).toBeLessThanOrEqual(size.client);
});

test('timeline automation view stays level with its lane and a trim preview keeps notes in time', async ({ page }) => {
  await page.goto('/examples/component-demos/compost-timeline/');
  const timeline = page.locator('compost-timeline');
  const levels = await timeline.evaluate((element) => {
    element.setAttribute('automation', '');
    element.setLanes([
      { id: 'a', name: 'A', clips: [], automation:
        { id: 'env', label: 'Env', min: 0, max: 1, stepped: false, points: [{ beat: 0, value: .5 }] } },
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
  // the element asks and the demo page, as host, applies: setLoop runs exactly once, from the page
  await timeline.evaluate((element) => {
    const original = element.setLoop.bind(element);
    element.testSetLoopCalls = 0;
    element.setLoop = (...args) => { element.testSetLoopCalls += 1; return original(...args); };
  });
  await timeline.locator('.clip[data-id="c1"]').press('l');
  const events = await timeline.evaluate((element) => element.testEvents);
  expect(events.at(-1)).toEqual({ start: 2, end: 9, enabled: true });
  expect(await timeline.evaluate((element) => [element.loopStart, element.loopEnd, element.testSetLoopCalls])).toEqual([2, 9, 1]);
});
