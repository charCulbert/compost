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

The same modifiers everywhere: Shift is fine control on a value drag and
extends the selection on an item drag; Alt ignores snapping, or copies on an
item move. Double-click resets a control; a double-tap does the same on touch.
`readonly` still shows live state and navigates but changes nothing;
`disabled` is inert.

Events name what the user asked for, never which input did it. Elements show
the state you give them; saving, undo, menus and what happens next are yours.
Editors take IDs you own for the things they create, and snapping is a view
mode over your full-precision values, never a stored grid.

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

With no CSS you get black on white, system font, OS accent. To change the
look, set `color`, `font`, `color-scheme` and `--compost-accent` on the page;
use `::part()` for anything finer. The older `src/themes.css` /
`data-compost-theme` palettes still work through a bridge rule while the
elements move over, and go away after.

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
`python3 dev/serve.py 8931` serves the repo without caching;
`dev/review.html?el=<element>` shows one element in three page contexts and
`node dev/review-check.mjs <element>` does the same headlessly. The current
plan is in `docs/plans/`.
