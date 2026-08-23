# compost-timeline

`compost-timeline` draws timeline lanes supplied by its host. It owns no
musical model or audio state: clips, loop values and the playhead are pushed in
through the API, while pointer and keyboard gestures bubble as intent events.
Lanes use the same sparse, signal-first language as `compost-clip-grid`: a clip
at rest is a lit name and note dashes on the lane, while a playing clip carries
a wash and optional progress.

```html
<compost-timeline id="timeline" label="Timeline" beats-per-bar="4"
  grid="16" snap="grid" follow></compost-timeline>
```

```js
timeline.setLanes([
  { id: 'drums', name: '01 Drums', color: '#c45a2c', clips: [
    { id: 'beat', name: 'beat', start: 0, length: 8, duration: 2, loop: true,
      state: 'playing', progress: 0.3 },
  ] },
]);
timeline.setLoop(0, 8, false, false, { punchIn: false, punchOut: false });
timeline.setPlayhead(2.5);
timeline.addEventListener('clip-move', ({ detail }) => host.move(detail));
```

## Intents

All events bubble and are composed. The host applies the detail to its model
and calls `setLanes` or `setLaneClips` with the authoritative result.

| Event | Detail | When |
| --- | --- | --- |
| `seek` | `{beat, source}` | Ruler or empty-lane click |
| `loop-input` / `loop-change` | `{start, end, enabled}` | Loop brace drag |
| `loop-toggle` | `{enabled}` | Double-click the brace |
| `clip-select` | `{ids}` | Click, marquee or keyboard selection |
| `clip-open` | `{id, altKey, clientX, clientY}` | Double-click, Shift-Enter or `e` |
| `clip-context` | `{id, clientX, clientY}` | Context menu, Shift-F10 or long press |
| `lane-context` | `{laneId, beat, clientX, clientY}` | Empty-lane context menu |
| `lane-create` | `{laneId, beat}` | Double-click empty lane space |
| `lane-back` | `{laneId}` | Overridden-lane pip |
| `lane-header-context` | `{laneId, clientX, clientY}` | Lane-header context menu |
| `clip-move` | `{ids, laneId, deltaBeats, copy}` | Clip body drag ends |
| `clip-trim-input` / `clip-trim` | `{id, start, end}` | Clip edge drag |
| `clip-rename` | `{id, name}` | F2 or `beginRename` commit |
| `clip-delete` | `{ids}` | Delete or Backspace |
| `clip-duplicate` | `{ids}` | Cmd/Ctrl-D |
| `clip-split` | `{ids, beat}` | Cmd/Ctrl-E |
| `clip-nudge` | `{ids, deltaBeats}` | Alt-Left/Right |
| `view-change` | `{pxPerBeat, scrollBeat}` | Settled zoom or scroll |

## Keyboard

The element is one tab stop. Focused clips use a roving tab index.

| Key | Action |
| --- | --- |
| Arrow keys | Move focus between clips; Shift extends selection |
| Home / End | First or last clip in the lane |
| Enter / `e` | Open the focused clip |
| F2 | Rename |
| Delete / Backspace | Delete selected clips |
| Cmd/Ctrl-D | Duplicate |
| Cmd/Ctrl-E | Split at the supplied playhead |
| Alt-Left/Right | Nudge by one grid step |
| `[` / `]` | Zoom out / in around the playhead |
| Shift-F10 | Open a context menu |
| Escape | Clear selection |

Space is left to the host's transport shortcut.

## API and variables

`setLanes(lanes)`, `setLaneClips(laneId, clips)`, `setPlayhead(beat)`,
`setLoop(start, end, enabled, emit, {punchIn, punchOut})`, `scrollTo(beat)`, `zoomToFit(endBeat)`,
`beginRename(clipId)`, `focusClip(clipId)`, `beatAtPoint(clientX)` and
`laneAtPoint(clientY)` are the host-facing methods. The `pxPerBeat`,
`scrollBeat`, `playhead`, `loopStart`, `loopEnd` and `selected` properties are
readable; `pxPerBeat`, `scrollBeat` and `selected` are writable.

| Variable | Purpose |
| --- | --- |
| `--compost-timeline-bg`, `-text`, `-muted`, `-faint` | Surface and type |
| `--compost-timeline-line`, `-bar-line`, `-lane`, `-lane-alt`, `-header-bg` | Rules and lane surfaces |
| `--compost-timeline-signal-hi`, `-wash`, `-over`, `-highlight` | Playing, wash and recording states |
| `--compost-timeline-clip-font-size`, `-lane-font-size`, `-select`, `-marquee` | Clip typography and selection |
| `--compost-timeline-playhead`, `-loop`, `-loop-off` | Ruler and transport marks |
| `--compost-timeline-row-height`, `-font`, `-numeral-font` | Geometry and typography |
| `--compost-timeline-color-scheme` | Native control colour scheme |

The host may pass `progress` from `0` to `1` on a playing clip. The loop
handles accept `punchIn` and `punchOut` in the optional fifth argument; the
corresponding caps use `--compost-timeline-over`.
