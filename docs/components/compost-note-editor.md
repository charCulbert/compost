# compost-note-editor

`compost-note-editor` is a MIDI note editor: pitch down the side on real piano
keys, time across the top under a loop region with draggable ends, notes on a
grid that snaps unless told not to. It edits a note list and draws the playhead
position it is given; it neither plays nor schedules anything.

```html
<compost-note-editor label="Clip notes" loop-start="0" loop-end="8" grid="16"
  root-note="48" note-count="25" style="height:340px"></compost-note-editor>
```

```js
editor.setNotes([{ note: 60, start: 0, duration: 0.5, velocity: 100, channel: 0 }]);
editor.addEventListener('notes-change', ({ detail }) => save(detail.notes));
editor.addEventListener('loop-change', ({ detail }) => setClipLoop(detail.start, detail.end));
editor.setAttribute('playhead', String(beat));   // from the host's clock
```

Notes are `{id, note, start, duration, velocity, channel}` in **beats**, as
for `compost-piano-roll`; the two share `piano-roll-model.js`.

## Editing

| Gesture | Does |
| --- | --- |
| Drag a note | Moves it, with the rest of the selection; Alt frees it from the grid |
| Drag its right edge | Sets its length |
| Drag its left edge | Trims the start and keeps the end put |
| Alt-drag (or press and hold) | Sets velocity, Shift for fine |
| Drag on empty grid | Marquee-selects; Shift adds to the selection |
| Double-click empty grid | Adds a note |
| `draw` | A press adds a note and the drag sets its length |
| Drag the loop bar's ends, or its middle | Sets the loop region |
| Right-click a note | `note-context` for the host's menu |
| `n` | Adds a note at the loop start — or just after the selection — on the middle visible row |
| `Delete` / `Backspace` | Removes the selection |
| Arrows | Pitch by a semitone (Alt an octave), time by a cell (Alt a quarter cell) |
| `Cmd/Ctrl-A`, `-D`, `-L`, `-Q` | Select all, duplicate one span later, loop to selection, quantize |
| Wheel / Shift-wheel / Cmd-wheel | Scroll pitch, scroll time, zoom time (with Shift, rows) |
| Wheel on the keys | Show more or fewer rows |

The cursor says what a drag will do: grab, trim, or ns-resize for velocity.
Velocity reads twice, as the note's weight and a line across it.

## Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `loop-start`, `loop-end` | `0`, `8` | Loop region, beats. |
| `beats` | loop end + 8 | Editable range; the tail past the loop reads as outside. |
| `beats-per-bar` | `4` | For the ruler and bar lines. |
| `grid` | `16` | Division per bar: `16` is a sixteenth. |
| `snap` | `grid` | `off` frees every gesture. |
| `root-note`, `note-count` | `48`, `25` | Visible rows; rows fill the height. |
| `beat-width` | fit | Pixels per beat; omit to fit the loop. |
| `fold` | — | Show only the pitches in use. |
| `draw` | — | Draw mode. |
| `playhead` | — | A beat to draw the playhead at; omit to hide it. |
| `velocity`, `channel` | `100`, `0` | Given to new notes. |
| `lock-loop-start` | — | Only the loop's end moves, for clips that always start at zero. |
| `readonly`, `disabled` | — | As named. |

## Methods and events

`setNotes(notes, shouldEmit)`, `setLoop(start, end, shouldEmit)`,
`quantize({lengths})`, `selectAll()`, `clearSelection()`, `deleteSelection()`,
`duplicateSelection()`, `addNote()`, `loopToSelection()`, `zoomReset()`.

`notes-change` after any edit, `loop-change` after a loop drag (`loop-input`
during), `selection-change`, `note-preview` when a note is grabbed, drawn or a
key is pressed, `note-context` on a right-click.

## Styling

Rows never go under `--compost-note-editor-min-row` (`1.1em`): where the
height cannot hold `note-count` rows at that size — a phone in landscape — the
editor shows as many as fit, centred on the range asked for, and the wheel on
the keys scrolls through the rest instead of every row shrinking to a sliver.

`--compost-note-editor-*` custom properties cover the ground, lines, keys,
signal, selection, marquee, past-loop shading, playhead, tooltip and the row
floor; sizes are in `em`. Parts: `frame`, `ruler`, `loop`, `loop-start`, `loop-end`, `keys`,
`grid`, `note`, `playhead`, `division`.
