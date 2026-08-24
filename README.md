# Compost

Compost is a collection of Web Components and utilities I find useful for making
UIs for audio apps, either ones that run in the browser or in a WebView.

Its elements render caller-supplied state and emit semantic intent. They may
own transient interaction and local view state, but application models,
persistence, routing, undo, and product policy stay with the caller. Compost
is a generic audio-interface toolkit with first-class CLAP-shaped parameter
gestures; it is not a DAW model or audio runtime.
Editors therefore require caller-owned IDs for domain objects they create or
copy. Snapping is a visible interaction mode over full-precision caller values,
not a stored tick or sample grid. `compost-envelope-editor` stays neutral about
whether its time coordinate means beats, seconds, or a normalized stage;
`compost-timeline` adapts that primitive to beat-based automation rows.

[Examples and documentation](https://charculbert.github.io/compost/)

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
