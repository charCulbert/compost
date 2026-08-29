import './example-page.js';

// One readout per element example reports every intent the elements emit.
const EVENT_TYPES = ['button-trigger', 'parameter-begin', 'parameter-edit', 'parameter-end', 'input', 'change', 'toggle', 'drawer-resize', 'window-open', 'window-close', 'window-move', 'window-resize', 'window-focus', 'popup-open', 'popup-close', 'popup-select', 'device-settings-refresh', 'device-settings-input', 'midi-ready', 'midi-devices-changed', 'midi-input-selected', 'midi-output-selected', 'midi-message', 'midi-map-mode-change', 'audio-started', 'audio-resumed', 'audio-suspended', 'audio-stopped', 'audio-state-change', 'audio-error', 'note-down', 'note-up', 'scope-frame', 'clip-launch', 'clip-stop', 'clip-record', 'clip-select', 'clip-open', 'clip-context', 'clip-rename', 'clip-delete', 'clip-duplicate', 'clip-move', 'clip-trim-input', 'clip-trim', 'clip-split', 'clip-nudge', 'clip-join', 'clip-drag-start', 'clip-drag-end', 'clip-drop', 'envelope-input', 'envelope-change', 'envelope-context', 'envelope-selection', 'notes-change', 'note-quantize', 'loop-input', 'loop-change', 'loop-toggle', 'range-input', 'range-change', 'selection-change', 'note-preview', 'note-preview-end', 'note-context', 'seek', 'time-select-input', 'time-select', 'time-delete', 'time-insert', 'time-duplicate', 'locator-jump', 'locator-move', 'locator-create', 'locator-rename', 'locator-delete', 'locator-context', 'locator-prev', 'locator-next', 'lane-pick', 'lane-move', 'lane-resize', 'lanes-resize', 'lane-rename', 'lane-context', 'lane-header-context', 'lane-create', 'lanes-context', 'lanes-create', 'ruler-context', 'timeline-context', 'automation-input', 'automation-change', 'automation-context', 'draw-toggle', 'fit-request', 'view-change'];

/** Attaches the event readout and returns the section for page-owned wiring. */
export async function elementDemo(id, { output = true } = {}) {
  await import(`../../src/components/${id}.js`);
  await customElements.whenDefined(id);
  const s = document.querySelector('section.plain');
  const elements = s.querySelectorAll(id);
  const out = s.querySelector('output');
  if (output && out && elements.length) {
    for (const element of elements) {
      for (const type of EVENT_TYPES) {
        element.addEventListener(type, (event) => {
          out.textContent = `last event: ${type} ${JSON.stringify(event.detail ?? event.target.value)}`;
        });
      }
    }
  } else if (out) out.remove();
  return { s };
}
