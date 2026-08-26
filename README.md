# Compost

Compost is a library of Web Components and helpers for audio user interfaces:
apps that run in the browser, and web UIs for native plugins and hosts running
in a WebView. It brings functionality, not a palette; the elements behave like
built-in form controls and take the page's colour, font and colour scheme.

[Examples and documentation](https://charculbert.github.io/compost/)

## Elements

Parameter controls, all speaking the same parameter protocol:

- `compost-knob`, `compost-slider`, `compost-number-box`: continuous values
  with linear, log and custom curves, fine drag, typed entry, keyboard steps.
- `compost-button`: a trigger or a switch as a parameter.
- `compost-select`: a discrete parameter over named values.

Displays: `compost-meter` (level and peak), `compost-scope` (waveform).

Editors: `compost-envelope-editor` (breakpoint curves), `compost-note-editor`
(a piano roll), `compost-clip-grid` (clip launching), `compost-timeline`
(automation rows over beats). `compost-piano` is a playable keyboard.

Panels: `compost-drawer`, `compost-window`, `compost-popup`.

Devices: `compost-audio` (AudioContext lifecycle), `compost-midi` (Web MIDI
access), `compost-device-selector` (input and output choice),
`compost-midi-monitor` (incoming messages), `compost-midi-mappings` (MIDI
learn and the mapping table).

## Helpers

Audio and MIDI:

- `midi`: note names, frequencies, and message packing and parsing.
- `midi-mapping`, `midi-mappings`, `midi-learn-ui`: CC-to-parameter
  mappings, a store for them, and the learn interaction over any page.
- `device-settings`: normalises the audio and MIDI device snapshot a host
  exchanges with `compost-device-selector`.

Parameters and models:

- `parameter-controller`: groups controls by `parameter-id`, forwards their
  gestures, and applies values from the backend to every matching control.
- `parameter-scale`: value ↔ normalised position for every curve, shared by
  the controls, automation and hosts.
- `piano-roll-model`: pure functions over note lists (move, resize, quantize,
  select, duplicate) with the editor's snapping rules.
- `utils`: the gesture emitters and number formatting the elements use.
- `themes.css`: optional page palettes.

## The parameter interface

Controls emit intent, not state changes: `parameter-begin`, `parameter-edit`
and `parameter-end` carry a parameter ID and a value in real units. That is
the gesture model CLAP, VST3 and JUCE expect (begin gesture, set value, end
gesture), so a WebView plugin UI forwards the events as they are. The backend
stays the source of truth: it applies values back through
`ParameterController` without re-emitting, so host automation and MIDI never
loop. MIDI learn, automation and keyboard control all go through the same
three events. [docs/backend-integration.md](docs/backend-integration.md) shows
the wiring; [docs/interaction.md](docs/interaction.md) is the interaction
contract every element follows: event grammar, modifier table, context
intents, touch parity, and the `readonly`/`disabled` semantics.

## Style

Ink is `currentColor`, surfaces follow `color-scheme`, and one
`--compost-accent` property sets the accent; unstyled, an element is black on
white in the system font with the OS accent. Restyle from outside with
inherited properties first, then `::part()`. [docs/style.md](docs/style.md)
has the nine rules.

## What Compost owns

Elements render caller-supplied state and emit semantic intent. They may own
transient interaction and local view state, but application models,
persistence, routing, undo, and product policy stay with the caller. Compost
is a generic audio-interface toolkit with first-class CLAP-shaped parameter
gestures; it is not a DAW model or audio runtime. Editors therefore require
caller-owned IDs for domain objects they create or copy. Snapping is a visible
interaction mode over full-precision caller values, not a stored tick or
sample grid. `compost-envelope-editor` stays neutral about whether its time
coordinate means beats, seconds, or a normalized stage; `compost-timeline`
adapts that primitive to beat-based automation rows. `compost-note-editor`
keeps editable content independent from its playback and nested-loop markers
and emits range intent without assigning a DAW playback policy. Envelope
points retain compact marks with separate touch-sized hit targets; multi-touch
envelope gestures are future work rather than part of the current contract.
Where a component assigns meaning to double-click, a single-finger double-tap
invokes the same action and consumes the second touch release so iOS does not
zoom the surrounding page. Single taps, drags, and multi-touch remain separate
gestures.

`CONTEXT.md` defines the vocabulary these rules use.

## Use from source

Clone Compost beside an app for active development, or pin it as a Git
submodule when the app needs a reproducible version:

```sh
git submodule add https://github.com/charCulbert/compost.git external/compost
```

Import only the components and utilities the app uses:

```js
import './external/compost/src/components/compost-knob.js';
import { createParameterController } from './external/compost/src/parameter-controller.js';
```

## Use through npm

Install directly from Git while the package is under development:

```sh
npm install github:charCulbert/compost
```

```js
import 'compost/components/compost-knob';
import { createParameterController } from 'compost/parameter-controller';
```
