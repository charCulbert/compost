# Finish the plain-HTML pass

The visual pass is complete for every element. The README is the product
documentation; this file tracks only the work still needed to finish the pass.

## Interface conformance

- [ ] Audit attribute/property reflection, `disabled` and `readonly` behavior,
  intent-event names, and event `detail` types across every element.
- [ ] Decide where native form participation is useful and use
  `ElementInternals` only for those controls.
- [ ] Add one conformance table and one shared test for the common contract.
- [ ] Complete public declarations for exported utilities and timeline events.

If the view fully determines a result it may produce it (duplicate, delete).
Operations with parameters the view cannot see emit intent instead (quantize,
legato, fit).

## Examples

`examples/review/review.html` is the current source of truth for element
scenarios. Do not maintain a second version of those scenarios.

- [ ] Replace each legacy `examples/component-demos/<element>/` page with its
  review scenario: one purpose, defaults, and visible markup.
- [ ] Update the examples index when the standalone pages are current.
- [ ] Update the signal generator, MIDI controller, and parameter-sync
  showcases to the current APIs. These remain larger examples where several
  elements meet a real or faux backend.

## Verification

Run `npm test`, `npm run test:e2e`, and the review check for any element whose
public contract or example changes.

## Parked

- `data-midi-map-*` attributes plus an inline custom property express the
  learn state; should become one reflected attribute or a custom state.
- Units are glued to numbers (`800Hz`); decide whether the element spaces
  alphabetic units.
- `refreshEditableValue(valueText)` in knob and slider ignores its argument.
- `compost-button`'s `momentary` mode is a click-triggered pulse, not a
  held-high state; the interface pass should call it `trigger`.
