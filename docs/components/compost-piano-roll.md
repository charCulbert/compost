# compost-piano-roll

A MIDI note editor on a pitch-and-time grid: draw, move, resize, select, and
quantize notes. It is a UI component only — it holds a note list, and the host
decides what that means musically.

```html
<script type="module" src="/src/components/compost-piano-roll.js"></script>

<compost-piano-roll label="Clip notes" beats="8" grid="16"
  root-note="48" note-count="25"></compost-piano-roll>
```

```js
const roll = document.querySelector('compost-piano-roll');
roll.setNotes([{ note: 60, start: 0, duration: 1, velocity: 100, channel: 0 }]);
roll.addEventListener('notes-change', (event) => save(event.detail.notes));
```

## Notes

A note is `{id, note, start, duration, velocity, channel}`. `start` and
`duration` are in **beats**, not seconds, so the roll does not need to know the
tempo. `note` is a MIDI note number, `velocity` is 1–127, `channel` is 0–15.
Ids are generated when missing.

`notes` gets a copy of the list and sets it silently; `setNotes(notes, true)`
sets it and emits. Anything out of range is clamped into the clip rather than
rejected.

## Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `beats` | `4` | Clip length in beats. |
| `beats-per-bar` | `4` | Bar length, for the ruler and the grid divisions. |
| `grid` | `16` | Grid division: `4` is a beat, `16` a sixteenth. |
| `snap` | `grid` | `off` frees drawing and dragging from the grid. |
| `root-note` | `48` | Lowest visible MIDI note. |
| `note-count` | `25` | Number of visible rows. |
| `row-height` | `14` | Row height in px. |
| `beat-width` | `64` | Width of one beat in px — this is the zoom. |
| `velocity` | `100` | Velocity given to newly drawn notes. |
| `channel` | `0` | Channel given to newly drawn notes. |
| `readonly` | — | Renders and selects, but does not edit. |
| `disabled` | — | Dimmed and inert. |

## Editing

| Gesture | Does |
| --- | --- |
| Drag on empty grid | Draws a note; the drag sets its length |
| Drag a note | Moves it, with the rest of the selection |
| Drag a note's right edge | Resizes it |
| Click | Selects; Shift or Cmd/Ctrl adds to the selection |
| Shift-drag on empty grid | Marquee-selects everything it touches |
| Double-click or right-click a note | Removes it |
| `Delete` / `Backspace` | Removes the selection |
| Arrows | Nudges the selection by a grid cell, Alt for half |
| `Cmd/Ctrl-A` | Selects all |
| `Cmd/Ctrl-Q` | Quantizes, add Shift to quantize lengths too |

## Methods

- `setNotes(notes, shouldEmit = false)`
- `quantize({lengths = false, division = grid})` — snaps the selection, or
  everything when nothing is selected. Lengths are left alone unless asked for,
  because rounding a length is a musical decision and rounding a start is not.
- `selectAll()`, `clearSelection()`, `deleteSelection()`

## Events

- `notes-change` — `detail.notes` after any edit.
- `note-preview` — `detail: {note, velocity, channel}` when a note is drawn,
  grabbed, or a key is clicked, so the host can audition it.

## Styling

`--piano-roll-*` custom properties cover the surface, grid lines, key column,
note fill, selection, marquee, and playhead. `::part()` is available for
`frame`, `corner`, `ruler`, `keys`, `scroll`, `canvas`, `note`, and `playhead`.
The Compost theme maps these to the shared `--compost-theme-*` palette.

## UI only

`compost-piano-roll` does not schedule, play, or record anything. It edits a
list of notes and tells the host when that list changed.
