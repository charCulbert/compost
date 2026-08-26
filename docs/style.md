# Style

The test for every visual decision: **if the browser shipped `<compost-knob>`,
what would it look like, and how would you style it?** Compost elements behave
like built-in form controls. They bring functionality, not a palette.

## Rules

1. **Ink is `currentColor`.** Elements inherit `color` and `font` from the page
   and never set their own.
2. **Accent is one property.** Fills, signal and selection use
   `var(--compost-accent, AccentColor)`: the OS accent by default, overridden
   once on the page. (CSS cannot read `accent-color` as a value, so this is its
   stand-in.)
3. **Surfaces follow `color-scheme`.** Opaque surfaces are `Canvas` / `Field`.
   Elements never pin a scheme; a dark page gets dark controls.
4. **Muted tones derive from ink.** `currentColor` mixed to 65% for secondary
   text, 30% for tracks and rails, 18% for hairlines, 10% for hover, 6% for tints.
5. **Focus is a square ring.** `outline: 2px solid currentColor`, offset 2px,
   on `:focus-visible`. (The browser's own ring is rounded and differs per
   browser.) The MIDI-learn state is the same ring in accent.
6. **Form.** 1px hairlines, no rounded corners, no motion. Sizes are in `em`, so
   `font-size` scales a control the way it scales a native one.
7. **Styling from outside.** Inherit first (`color`, `font`, `color-scheme`,
   `--compost-accent`); then `::part()` for structure; custom properties only
   for what CSS cannot reach (canvas colours, geometry).
8. **Unstyled is unstyled HTML.** Black on white, system font, OS accent.

Themes are pages that set `color`, `color-scheme` and `--compost-accent`.
