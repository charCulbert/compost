# Plan: make the examples consistent

Date: 2026-08-25. Source: a full audit of `examples/`, `docs/`, and
`index.html`. Status: agreed, not started. Words follow `CONTEXT.md`:
an **element** is one Compost component, the **caller** is the
application that uses it.

## The problem

The examples do not have one scope. Every element has one demo, but the
demos span 35 to 278 lines, use four wiring styles, and use four theme
mechanisms. Two demos are full showcases that sit in the minimal folder.
Some scaffolding is dead: no code reads it.

## The three tiers

We name the tiers that already exist, and each example joins exactly one:

- **Minimal** — one element, markup first, near 35–60 lines. It shows
  the smallest correct use. `compost-select` is the model.
- **Playground** — one element with an options panel and an event log.
  It shows every attribute and every intent event. Most current "demos"
  are this tier without a name.
- **Showcase** — several elements and a real backend. It shows a
  capability no single element shows. `signal-generator`,
  `midi-controller`, and `parameter-sync` are this tier.

## The changes

1. **Delete the dead scaffolding.** No code reads the `data-usage-*`
   attributes, the `css`/`controls` fields in
   `examples/component-demos/catalog.js`, or the `components`/
   `utilities`/`runtime` fields in `examples/shared/catalog.js`.
   Delete them. Also delete the empty folders in `src/components/`
   and `examples/component-demos/` for elements that do not exist
   (`compost-all-notes-off`, `compost-midi-map`, `compost-piano-roll`,
   `compost-radio-group`, and the two stubs named after the retired
   input protocol — `ls` shows them; a doc guard test keeps the name
   itself out of these files).

2. **Use one wiring style.** Replace the 722-line
   `examples/component-demos/shared-demo.js` switchboard with one small
   `main.js` file beside each demo page. Each page then stands alone,
   and each page is a correct model for a caller to copy. Remove the
   two inline `<script>` blocks (timeline, envelope editor) the same
   way: move them into sibling `main.js` files.

3. **Use one theme mechanism.** All example pages get the theme control
   from `examples/shared/example-page.js`. Remove the timeline demo's
   private `?theme=` URL scheme.

4. **Re-file the two hidden showcases.** `compost-drawer` (278 lines,
   fabricated browser panel) and `compost-scope` (233 lines plus 110
   wiring lines) are playground/showcase size. Give each element a true
   minimal page, and move the current pages to the playground tier
   without the set-dressing CSS (115 and 83 inline lines).

5. **Re-file `compost-midi-mappings`.** Its demo stages five elements
   through the mapping engine. That is a showcase. Keep a minimal page
   for the element itself.

6. **Give the scope a real Web Audio example.** No example calls
   `scope.connect(context, { source })`. The demo uses built-in fake
   samples, and the signal generator pushes frames with `setSamples()`.
   Add one example that connects a real `AudioNode` through an
   `AnalyserNode`. This is the one true coverage gap.

7. **Link both ways between docs and demos.** Every demo links to its
   doc page, but no doc page links to its demo. Add a demo link to each
   `docs/components/*.md`.

8. **Merge the twin MIDI demos.** The `compost-midi` and
   `compost-midi-monitor` pages differ only in `max-lines` and one
   paragraph. Keep one page for the pair, or make the two pages show
   different things.

9. **Add an arrangement showcase.** The clip half of the library —
   timeline, note editor, clip grid, envelope editor — appears in no
   showcase. Add one showcase that combines them over a simple Web
   Audio backend, in the same spirit as `signal-generator`.

## The order

Steps 1–3 are mechanical and safe: do them first, in one pass. Steps
4–5 and 8 re-file pages: do them second. Steps 6–7 add small content.
Step 9 is new work: do it last, and only when a real need pulls it.
