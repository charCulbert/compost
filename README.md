# Compost

Compost is a collection of Web Components and utilities I find useful for making
UIs for audio apps, either ones that run in the browser or as the web UI of a
native plugin. Elements manage presentation and interaction, and emit UI intent
through DOM events. Application data and policy remain outside the elements.

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
learn), `device-settings`, `envelope-model`, `piano-roll-model`,
`selection-region`, `time-grid` and `utils`.

Each element's supported attributes are declared with `@attribute` tags on the
class in its type declaration next to the source
(`src/components/<element>.d.ts`), which also lists its properties and events;
a conformance test keeps the tags and the element's observed attributes in
lockstep. Every element is shown in its example page.

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
payload, so you can preview the drag or ignore it until it commits.
`notes-change` stands alone: the note editor commits each change as it
happens, so there is no `-input`/`-change` pair for notes. Escape
cancels a gesture: the element goes back to where it started and a control
sends `parameter-end` with `cancelled: true`.

Right-click, long-press or Shift+F10 on anything fires a `<thing>-context`
event with `clientX` / `clientY`; you decide what the menu contains.
On touch, context means one-finger long-press; two fingers remain available
for editor pan and zoom gestures.
`compost-piano` sends `note-down` and `note-up`.

Across the time editors, Command/Ctrl inverts time snapping, Shift provides
fine control on value drags and extends selection on an item drag, and Alt
copies item moves. The clip grid uses Shift for rectangular selection,
Command/Ctrl for sparse selection and clipboard commands, and Alt for drag-copy.
`compost-note-editor` also uses Command/Ctrl on a note body to edit velocity.
Double-click resets a control. On touch, double-tap resets knobs and sliders;
a number-box tap opens its numeric editor while a drag still adjusts it.
The timeline uses a two-finger pinch to zoom time and pan time or lanes. The
note editor pinches horizontally for time and vertically for pitch; moving the
pinch pans both axes. One-finger gestures remain edits or selections.
`readonly` still shows live state and navigates but changes nothing;
`disabled` is inert.

The controls are not form-associated. They represent backend parameters and
editor state rather than named form fields, so the application owns
serialization and submission.

Events name what the user asked for, never which input did it. Elements show
the state you give them; saving, undo, menus and what happens next are yours.
Editors take IDs you own for the things they create, and snapping is a view
mode over your full-precision values, never a stored grid.
The note editor and timeline take a single `time-signature="N/D"` meter, with
`D` equal to 1, 2, 4, 8 or 16. Model time remains quarter-note beats; the
denominator only changes ruler counting and line placement. Grid values are
meter-independent note values such as `1/8`, `1/16T`
or `bar`; bare numbers remain supported as legacy cells per bar. Compound x/8
meters show a pulse every three eighths. Meter changes within a song are host
data and are not represented by either element. Grid resolution stays fixed by
default; `adaptive-grid` lets zoom choose the effective step in both editors.
`compost-note-editor` emits `note-quantize` with the selected IDs, grid step
and whether lengths were requested; the host applies its own strength and swing.
`compost-clip-grid` renders a complete multi-track session launcher from
`setTracks()`. It owns the discrete track/slot cursor, rectangular and sparse
selection, keyboard clipboard recognition, and multi-clip drag geometry.
`clips-copy`, `clips-paste`, `clips-delete`, `clips-duplicate`, and `clips-move`
carry stable track IDs and slot coordinates. The host owns clipboard contents,
new IDs, collision policy, mutation, undo, and conversion into timeline clips.
`compost-timeline` never moves automation with arrangement material; a host
that wants that shifts the lane's points when it applies `time-move`.
With the timeline's `automation` attribute present, each lane shows its one
automation curve over dimmed clips when the host has chosen a parameter; lanes
without one remain ordinary clip lanes. In an automated lane the curve owns
the whole row and dimmed clips are display-only context. Otherwise a clip's
name strip moves the selected arrangement material, opens and renames it while
its body selects time; right-click asks for its menu anywhere in its box. The
host chooses that curve through
`lane.automation` or `setLaneAutomation()`, usually from a menu in the lane
header it slots in.
The timeline has one arrangement selection: a beat interval across contiguous
lanes. Equal edges are a lane-scoped edit cursor. Clicking a clip selects its
exact bounds; dragging a clip title moves every intersecting material slice and
emits `time-move-input` followed by `time-move`. The host owns splitting,
mutation, collision policy and whether automation follows the move.
`time-duplicate` asks the host to copy the exact selected span, including partial
clips, immediately after itself. Command/Ctrl+D advances the selection to that
new rectangle, and Alt-drag shows translucent destination slices while copying.
Clip overlap and audio-source trim limits are also host policy; the timeline
draws the clip state handed back to it. Follow mode re-anchors the view only
while the `playing` attribute is present. Pinch and Command/Ctrl-wheel zoom
time; Alt-wheel scales lane height. Lane scaling stops at a font-relative
minimum that keeps clip titles usable.
Arrow keys move a timeline time selection by one grid step or lane;
Shift+Arrow grows its time or lane extent instead. Command/Ctrl+A selects the
finite occupied arrangement bounds, including empty lanes between them.

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
`npm run dev` serves the repo without caching; every element has its own
example page under `examples/<element>/` with a live readout of the events it
emits. Every example shares the same
light/dark color-scheme toggle and an "All examples" link back to the
catalog. The scope omits its `scope-frame` readout because that event fires
for every drawn frame. The Mono Synth, MIDI Controller, and Parameter Sync pages
show current multi-element integration.
`node examples/check-example.mjs <element>` checks an element headlessly.
