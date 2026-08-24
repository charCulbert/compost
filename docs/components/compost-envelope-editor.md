# compost-envelope-editor

`compost-envelope-editor` edits generic `{time, value}` points. It does not
decide whether time means beats, seconds or a normalized stage, and it does not
assign the envelope a meaning such as automation, modulation or ADSR. The
caller owns those meanings, the authoritative point array and any scheduling.

```html
<compost-envelope-editor label="Envelope" duration="8" min="0" max="1"
  grid="0.5" style="height:180px"></compost-envelope-editor>
```

```js
editor.points = [
  { time: 0, value: 0.2 },
  { time: 3, value: 0.8 },
  { time: 8, value: 0.45 },
];
editor.addEventListener('envelope-change', ({ detail }) => {
  model.points = detail.points;
  editor.points = model.points;
});
```

The editor previews a pointer gesture locally and emits a complete replacement
array. It does not mutate the caller's array. `envelope-input` reports preview
points during a drag; `envelope-change` reports the committed points;
`envelope-context` reports `{pointIndex, time, value, clientX, clientY}`.

Double-click or touch double-tap adds a point in empty space and removes an
existing point. Movement cancels a double-tap. Points and line segments can be
dragged; a range set with `setSelection(start, end)` moves as one display-space
selection. Focused points support Delete, Escape and arrow-key editing. Shift
makes movement four times finer. Alt temporarily disables time snapping. The
visible point remains compact while its 22px pointer target makes single-touch
editing practical.

Future work: explore explicitly designed multi-touch envelope gestures (for
example, two-finger range shaping). Keep that separate from the current
single-pointer contract until the gesture and accessibility behavior are
specified and tested on physical devices.

## Attributes and API

| Attribute | Default | Meaning |
| --- | --- | --- |
| `duration` | `1` | Visible time extent in caller-defined units. |
| `min`, `max` | `0`, `1` | Legal value range. |
| `scale` | `linear` | Display response; `gain` uses Compost's shared dB fader response. |
| `stepped` | — | Hold the previous value between points. |
| `step` | continuous, or `1` when stepped | Optional value increment. |
| `grid` | `0.125` | Time snap interval in caller-defined units. |
| `snap` | `grid` | `off` preserves pointer-derived time. |
| `draw` | — | Paint grid cells, or freehand with Alt / `snap="off"`. |
| `readonly`, `disabled` | — | Prevent editing. |

`points`, `setPoints(points)` and `setSelection(start, end)` are state-in APIs.
`points` returns a defensive snapshot. Time remains a JavaScript number; the
grid changes visible snapping, not stored precision.

## Styling

The defaults are a compact, neutral graph surface. Custom properties cover
background, text, grid line, signal, point fill/border, selection, preview,
radius and grid size through the `--compost-envelope-*` family. Parts are
`surface`, `grid`, `selection`, `graph`, `line`, `point`, `point-hit` and
`readout`. `point` is the visible mark; `point-hit` is its invisible pointer
target.

`compost-timeline` composes this editor for its automation rows and adapts
`time` to song beats. An ADSR editor can use the same component with seconds or
normalized stage time and caller-owned stage constraints.
