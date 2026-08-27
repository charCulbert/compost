# Compost

Compost is a collection of Web Components and utilities I find useful for making
UIs for audio apps, either ones that run in the browser or as the web UI of a
native plugin. The elements do the interaction; your app owns the data.

## What's in it

Controls: `compost-knob`, `compost-slider`, `compost-number-box`,
`compost-button`, `compost-select`.

Displays: `compost-meter`, `compost-scope`.

Editors: `compost-envelope-editor`, `compost-note-editor`, `compost-clip-grid`,
`compost-timeline`. `compost-piano` is a keyboard you can play.

Panels: `compost-drawer`, `compost-window`, `compost-popup`.

Devices: `compost-audio`, `compost-midi`, `compost-device-selector`,
`compost-midi-monitor`, `compost-midi-mappings`.

Utilities: `parameter-controller` (wires controls to your backend),
`parameter-scale` (linear/log/gain curves), `midi`, `midi-mapping`,
`midi-mappings` and `midi-learn-ui` (message parsing, CC mapping, MIDI
learn), `device-settings`, `piano-roll-model`.

Each element's attributes, properties and events are listed in its type
declaration next to the source (`src/components/<element>.d.ts`) and shown
in its example page.

## Events

Controls fire `parameter-begin`, `parameter-edit`, `parameter-end`. Each
carries the parameter ID and the value in real units. That's the begin /
change / end shape CLAP, VST3 and JUCE use, so a plugin UI can pass them
straight through.

```js
{ parameterID, value, kind: 'continuous' | 'discrete' | 'trigger', source, cancelled }
```

Editors fire `<thing>-input` while you drag and `<thing>-change` when you let
go: `envelope-input` / `envelope-change`, `loop-input` / `loop-change`,
`automation-input` / `automation-change`, `notes-change`. Both carry the same
payload, so you can preview the drag or ignore it until it commits. Escape
cancels a gesture: the element goes back to where it started and a control
sends `parameter-end` with `cancelled: true`.

Right-click, long-press or Shift+F10 on anything fires a `<thing>-context`
event with `clientX` / `clientY`; you decide what the menu contains.
`compost-piano` sends `note-down` and `note-up`.

The same modifiers work across editors: Command/Ctrl inverts time snapping,
Shift provides fine control on value drags and extends selection on an item
drag, and Alt copies item moves. `compost-note-editor` also uses Command/Ctrl
on a note body to edit velocity.
Double-click resets a control; a double-tap does the same on touch.
`readonly` still shows live state and navigates but changes nothing;
`disabled` is inert.

Events name what the user asked for, never which input did it. Elements show
the state you give them; saving, undo, menus and what happens next are yours.
Editors take IDs you own for the things they create, and snapping is a view
mode over your full-precision values, never a stored grid.
The note editor and timeline take a single `time-signature="N/D"` meter, with
`D` equal to 1, 2, 4, 8 or 16. Model time remains quarter-note beats; the
denominator only changes ruler counting and line placement. The legacy
`beats-per-bar` attribute means N/4 and is ignored when `time-signature` is
present. Grid values are meter-independent note values such as `1/8`, `1/16T`
or `bar`; bare numbers remain supported as legacy cells per bar. Compound x/8
meters show a pulse every three eighths. Meter changes within a song are host
data and are not represented by either element.
`compost-note-editor` emits `note-quantize` with the selected IDs, grid step
and whether lengths were requested; the host applies its own strength and swing.
`compost-timeline` never moves automation with a clip; a host that wants that
shifts the lane's points when it applies `clip-move`.

## Talking to a backend

`createParameterController()` collects every control with a `parameter-id`,
forwards their events, and pushes values back without firing them again, so
automation and MIDI never loop.

```js
import { createParameterController } from 'compost/parameter-controller';

const parameters = createParameterController({ root: document });
parameters.addEventListener('parameter-edit', ({ detail }) => {
  backend.setValue(detail.parameterID, detail.value);
});
backend.onValue = (id, value) => parameters.applyValue(id, value, { source: 'backend' });
```

`backend.setValue()` can set a Web Audio `AudioParam`, post to an
AudioWorklet, or call a WebView bridge. Pass `definitions` for parameter
metadata; without it, the first matching control supplies the range,
default, step, values and unit.

`parameter-scale` maps values to positions the way the controls do: `curve`
is `linear`, `log` or `gain`; `mid` puts a chosen value at the centre. The
`gain` curve is a fader response over dB (`-12 dB` at 50%, `0 dB` at 70%).

`createMIDIMappings({ parameterProvider: parameters })` stores one CC per
parameter, handles incoming messages, and drives `compost-midi-mappings` and
MIDI learn; ranges follow the parameter's curve.

## Style

If the browser shipped `<compost-knob>`, what would it look like? That's the
test for every visual decision. The elements bring behaviour, not a palette:

- Text is `currentColor`; elements inherit `color` and `font` from the page.
- Fills and selection use `--compost-accent`, which defaults to the OS accent.
- Surfaces follow `color-scheme`: a dark page gets dark controls.
- Muted tones are `currentColor` mixed down (65% secondary text, 30% tracks,
  18% hairlines).
- Focus is a square 2px ring in `currentColor`; MIDI learn is the same ring
  in the accent.
- 1px lines, no rounded corners, no motion, sizes in `em` so `font-size`
  scales a control the way it scales a native one.
- Labels sit above a horizontal control and below a knob or vertical fader.

Piano keys are the physical exception: their key bed uses light `Canvas` and
`CanvasText` so natural and accidental keys remain white and black on any page.
Active notes still use `--compost-accent`.

Timeline clips use their own colour, then their lane's colour, and otherwise
the accent supplied by the page.

With no CSS you get black on white, system font, OS accent. To change the
look, set `color`, `font`, `color-scheme` and `--compost-accent` on the page;
use `::part()` for anything finer.

## Install

```sh
npm install github:charCulbert/compost
```

```js
import 'compost/components/compost-knob';
import { createParameterController } from 'compost/parameter-controller';
```

[Examples](https://charculbert.github.io/compost/)

## Working on it

`npm test` runs the unit tests, `npm run test:e2e` the Playwright suite.
`npm run dev` serves the repo without caching;
`examples/review/review.html?el=<element>` shows one element in three page
contexts and `node examples/review/review-check.mjs <element>` does the same
headlessly. The current plan is in `docs/plans/`.
