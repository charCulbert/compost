# compost-clip-grid

`compost-clip-grid` is one track's column of clip slots. Each slot renders a
clip's name and state — stopped, playing with its progress washed behind the
name, queued for the next launch point, or recording — and an empty slot
shows a record ring when the track is armed. A stop slot underneath takes the
whole track out at the next launch point the way a clip is brought in.

```html
<compost-clip-grid label="Drums" slots="5" armed></compost-clip-grid>
```

```js
grid.setClips([
  { name: 'break.a', state: 'playing', progress: 0.3 },
  { name: 'fill.b' },
  { name: 'ride.c', state: 'queued' },
  null, null,
]);
grid.setAttribute('stop', 'active');
grid.addEventListener('clip-launch', ({ detail }) => host.launch(track, detail.index));
```

## Intents

The grid draws states and reports intent; the host decides what happens and
sets the states back. Every event bubbles and carries `detail.index` where it
applies.

| Event | When |
| --- | --- |
| `clip-launch` | The triangle (or Enter / Space on the name) |
| `clip-stop` | The stop slot |
| `clip-record` | The record ring in an empty slot of an armed track |
| `clip-select` | A click on the name |
| `clip-open` | A double-click on the name, or Shift-Enter / `e` on a focused name (`detail.altKey` and `detail.clientX/Y` too) |
| `clip-context` | A right-click; `detail.clientX/Y` for a menu |
| `clip-rename` | After `beginRename(index)` or F2; `detail.name` |
| `clip-delete`, `clip-duplicate`, `clip-move` | Delete, Cmd/Ctrl-D, Alt-arrows on a focused name |
| `clip-drop` | A name dragged into a slot, of this grid or another; `detail: {source, fromIndex, toIndex, copy}` on the grid dropped into |
| `clip-drag-start`, `clip-drag-end` | Around a drag |

Dragging marks the exact slot the clip would land in, on whichever
`compost-clip-grid` is under the pointer; Alt marks it as a copy.

## Attributes and API

| Attribute | Default | Meaning |
| --- | --- | --- |
| `slots` | `5` | Slot count; `setClips` extends it. |
| `label` | `Clips` | The track's name, for labels. |
| `armed` | — | Empty slots offer a record ring. |
| `selected` | — | Index of the slot carrying the selection mark. |
| `stop` | `` | Stop slot state: `active` or `queued`. |
| `show-stop` | — | Show the stop slot even with no clips. |
| `disabled` | — | Inert. |

Every button carries the track: `label` turns `Launch take 1` into
`Launch take 1 on MIDI 1`, and the name button and stop slot read the same way,
so a screen reader walking a row of columns can tell them apart.

`setClips(list)`, `setProgress(index, fraction)` for cheap per-frame updates,
`highlightRow(index, on)` for a scene launcher's hover, `beginRename(index)`,
`focusSlot(index)`, `slotIndexAtPoint(clientY)`.

## Styling

`--compost-clip-grid-*` custom properties cover text, signal, select and over
colours, the progress wash, the row height (`em`) and font size. Parts: `row`,
`stopped`/`playing`/`queued`/`recording`, `progress`, `name`, `stop`.
