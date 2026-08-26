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
`parameter-scale` (linear/log/custom curves), `midi` and `midi-mapping*`
(message parsing, CC mapping, MIDI learn), `device-settings`,
`piano-roll-model`.

## Events

Controls fire `parameter-begin`, `parameter-edit`, `parameter-end`. Each
carries the parameter ID and the value in real units. That's the begin /
change / end shape CLAP, VST3 and JUCE use, so a plugin UI can pass them
straight through.

Editors fire `<thing>-input` while you drag and `<thing>-change` when you let
go: `envelope-input` / `envelope-change`, `loop-input` / `loop-change`,
`automation-input` / `automation-change`, `notes-change`. Both carry the same
payload, so you can preview the drag or ignore it until it commits.

Right-click, long-press or Shift+F10 on anything fires a `<thing>-context`
event with the pointer position; you decide what the menu contains.
`compost-piano` sends `note-down` and `note-up`.

Your backend owns the values. When it changes one, push it back with
`applyValue()`; the control updates without firing again, so automation and
MIDI don't loop.

```js
const parameters = createParameterController({ root: document });
parameters.addEventListener('parameter-edit', ({ detail }) => {
  host.setValue(detail.parameterID, detail.value);
});
host.onValue = (id, value) => parameters.applyValue(id, value, { source: 'backend' });
```

## Styling

Nothing is hard-coded. Text is `currentColor`, surfaces follow
`color-scheme`, `--compost-accent` sets the accent. With no CSS you get black
on white, system font, OS accent. Set those on the page to change the look;
use `::part()` for anything finer.

## Install

```sh
npm install github:charCulbert/compost
```

```js
import 'compost/components/compost-knob';
import { createParameterController } from 'compost/parameter-controller';
```

[Examples](https://charculbert.github.io/compost/) · [Interaction contract](docs/interaction.md) · [Style rules](docs/style.md)
