# Interaction contract

This document is the one interaction contract for every Compost element. The
vocabulary is defined in [`CONTEXT.md`](../CONTEXT.md). Per-element docs list
each element's gestures; this page states the rules those gestures follow.
Divergence from this page is a bug, in either the code or this page.

## Ownership

The caller supplies authoritative state. Elements own everything that happens
inside a gesture — pointer, touch, keyboard, capture, previews, accessibility —
and emit semantic intent. The caller decides the consequence. An element never
persists, routes, or schedules; a caller never reads raw pointer events off an
element's surface, because the intent events carry everything a consequence
needs.

## Event grammar

One lifecycle, two ratified spellings; both are stable API.

- **Parameter controls** (knob, slider, number box, button) use the
  CLAP-shaped trio `parameter-begin` / `parameter-edit` / `parameter-end`,
  emitted by the shared helpers in `src/utils.js`. `parameter-end` closes the
  gesture rather than committing a second value, and carries `cancelled` when
  the gesture restored the begin value.
- **Rich editors** (envelope editor, timeline, note editor, clip grid) pair a
  `-input` preview with a bare-name commit: `envelope-input` then
  `envelope-change`, `loop-input` then `loop-change`, `time-select-input` then
  `time-select`. Preview and commit carry the same payload shape.

Every `parameter-*` event carries the same detail shape:

```js
{
  parameterID: string,   // the control's parameter-id attribute (note the casing)
  value: number,
  kind: 'continuous' | 'discrete' | 'trigger',
  source: string,        // 'control' unless the emitter names another origin
  cancelled: boolean,    // true only on a parameter-end that restored the begin value
}
```

New events extend the spelling their element family already uses. Do not
invent a third form, and do not rename existing events between forms.

Payload rules: payloads are plain cloneable data; arrays of caller objects are
fresh copies, never live references to element state; events that position a
caller menu carry `clientX` and `clientY`.

## Context intents

Every point of an element's interactive surface resolves to exactly one
`*-context` intent, from most specific to least: a point, clip, locator, or
header first, then the containing lane or row, then the element's own generic
context. An element `preventDefault()`s the native `contextmenu` event
everywhere on its surface and emits the intent instead, so callers never need
a raw `contextmenu` fallback listener.

Every context intent is reachable three ways:

- `contextmenu` (right-click, two-finger click, the ContextMenu key);
- long-press (550 ms press without crossing the drag slop);
- Shift+F10 on the focused target, using the target's rect for the point.

## Modifier table

| Context | Shift | Alt |
| --- | --- | --- |
| Value drag | fine (×0.25) | ignore snap where a snap mode exists |
| Item drag: move | extend selection (at press) | copy (read at drop) |
| Item drag: trim / create / position | extend selection (at press) | ignore snap |
| Arrow-key nudge | fine step | element-documented accelerator |

Alt never means "fine". Ctrl/Cmd stay free for caller shortcuts and for the
platform's own meanings. Element-specific keyboard accelerators (the note
editor's Alt+Up octave, the parameter controls' Alt+Arrow coarse step) are
documented in that element's page and must not contradict a drag row above.

## Gesture constants

The shared recognizers and constants live in `src/internal/`; elements import
them and do not restate the numbers:

- drag slop: 3 px before a press becomes a drag;
- long-press: 550 ms within the slop;
- double-tap: 350 ms and 24 px between taps, 12 px movement within a tap;
- clip trim edge: 12 px for touch, 6 px for mouse.

## Touch parity

Wherever an element assigns meaning to double-click, a single-finger
double-tap invokes the same action (`src/internal/touch-double-click.js`, or a
bespoke pointer path where the second tap must continue into a drag, as in the
envelope editor). Wherever an element emits a context intent, long-press emits
the same intent. Gesture surfaces use Pointer Events with `touch-action: none`;
single taps, scrolls, and multi-touch stay native.

## Readonly and disabled

- `disabled`: the element is inert — dimmed, unfocusable, no gestures, no
  intent events.
- `readonly`: the element renders live state and still navigates — focus,
  scroll, zoom, seek, selection, hover readouts — but emits no mutating
  intent. Context intents still fire; the caller decides which actions a
  readonly menu offers.

Every element whose gestures can mutate caller state supports both
attributes, and checks them in one place rather than per call site.

## The escape hatch

A caller that needs genuinely different interaction does not remap element
gestures. It sets the element `readonly` and overlays its own surface, or
composes its own element from the same models (`envelope-model.js`,
`piano-roll-model.js`, `time-ruler.js`) and recognizers. Modes an element
already offers (`snap`, `draw`, `readonly`, `disabled`) are the whole
configuration surface; raw gesture remapping is deliberately not offered.
