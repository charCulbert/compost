# Plain-HTML style pass

Move every element onto the rules in the README's Style section, one element
per round, each signed off by eye before the next. The README is the only
document; this file is the working plan.

## Order

Parameter controls first so the derivation rules settle on the simplest
shapes; everything after applies them.

- [x] compost-knob
- [x] compost-slider
- [ ] compost-button
- [ ] compost-number-box
- [ ] compost-select
- [ ] compost-meter
- [ ] compost-scope (canvas: resolve colours through a probe)
- [ ] compost-envelope-editor
- [ ] compost-drawer
- [ ] compost-window
- [ ] compost-popup
- [ ] compost-device-selector
- [ ] compost-midi
- [ ] compost-midi-monitor
- [ ] compost-midi-mappings
- [ ] compost-audio
- [ ] compost-clip-grid
- [ ] compost-piano
- [ ] compost-note-editor
- [ ] compost-timeline

## Each round

What gets done, in this order:

1. Restyle the element to the nine rules: colour tokens and `color-scheme`
   pins out, `currentColor` / `--compost-accent` / `Canvas` in, square focus
   and learn rings, sizes in `em`, every structural piece named with `part`.
   Geometry tokens stay.
2. Delete the element's block from `src/themes.css`.
3. Any bug met on the way is its own commit with its own test.
4. Update `src/components/<element>.d.ts` for any attribute or property that
   changed; parts are named in the element's template.
5. Add the element's scenario to the review page, run the unit tests and a
   headless render check in all three contexts.
6. Commit: `style: <element> follows the plain-HTML ethos`.

## Verifying a round

Serve the branch without caching and open the review page:

```sh
python3 dev/serve.py 8931
open http://127.0.0.1:8931/dev/review.html?el=<element>
```

`dev/review.html` renders the real element from this branch in three page
contexts: unstyled, `color-scheme: dark`, and a branded page (serif, 18px,
`--compost-accent`). Each element has one `<template>` on that page showing
its default states; `node dev/review-check.mjs <element>` is the headless
version (console errors, computed ink per context, Tab focus, screenshot).
Check:

- **Reads**: ink, accent and muted tones come from the page; no leftover fixed
  colour in any context; nothing invisible on dark.
- **Works**: every gesture the element has (drag, click, keyboard, typed edit,
  reset, open/close); the `last event` line shows the intent events.
- **Focus**: Tab gives the square ring; the learn state gives it in accent.
- **Scales**: the branded row is proportionally larger, not just bigger text.
- **Looks right** to you.

Reply "ok" to move on, or say what to change; changes land as a follow-up
commit in the same round.

## After the elements

1. Interface pass: attribute↔property reflection, intent-event names and
   `detail` shapes, `disabled`, form association via `ElementInternals`; one
   conformance table and one shared test that runs against every element.
2. Collapse `src/themes.css` to palettes that set `color`, `color-scheme` and
   `--compost-accent`; rewrite `docs/themes.md`; retire the bridge rule.
3. Examples: one minimal page per element showing one scenario, with the
   markup on the page, defaults only. The bigger showcases (signal generator,
   parameter sync) stay as the place several elements and a real backend meet.

## Parked

- `data-midi-map-*` attributes plus an inline custom property express the
  learn state; should become one reflected attribute or a custom state.
- Units are glued to numbers (`800Hz`); decide whether the element spaces
  alphabetic units.
- `refreshEditableValue(valueText)` in knob and slider ignores its argument.
- `compost-button`'s `momentary` mode is a click-triggered pulse, not a
  held-high state; the interface pass should call it `trigger`.
