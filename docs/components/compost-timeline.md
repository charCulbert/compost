# compost-timeline

`compost-timeline` draws timeline lanes supplied by its host. It owns no
musical model or audio state: clips, loop values and the playhead are pushed in
through the API, while pointer and keyboard gestures bubble as intent events.
Lanes use the same sparse, signal-first language as `compost-clip-grid`: a clip
at rest is a lit name and note dashes on the lane, while a playing clip carries
a wash and optional progress. A looping clip marks every loop point with a thin
line and a cap in the clip's colour. A trim drag previews the geometry without
moving the content in time: notes and loop points keep their place while the
edge moves.

```html
<compost-timeline id="timeline" label="Timeline" beats-per-bar="4"
  grid="16" snap="grid" follow automation></compost-timeline>
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
timeline.setLaneAutomation('drums', [{
  id: 'volume', label: 'Volume', min: -90, max: 12, scale: 'gain', stepped: false,
  points: [{ beat: 0, value: -12 }, { beat: 4, value: 0 }], value: -3,
}]);
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
| `lane-toggle` | `{laneId, name: "arm"|"mute"|"solo"}` | Header control press |
| `automation-change` | `{laneId, automationId, points}` | Add, move, delete or segment edit commit |
| `automation-context` | `{laneId, automationId, clientX, clientY}` | Automation sub-row context menu or Shift-F10 |
| `automation-header-context` | `{laneId, clientX, clientY}` | Reserved for a lane-header automation menu |
| `clip-move` | `{ids, laneId, deltaBeats, copy}` | Clip body drag ends |
| `clip-trim-input` / `clip-trim` | `{id, start, end}` | Clip edge drag |
| `clip-rename` | `{id, name}` | F2 or `beginRename` commit |
| `clip-delete` | `{ids}` | Delete or Backspace |
| `clip-duplicate` | `{ids}` | Cmd/Ctrl-D |
| `clip-split` | `{ids, beat}` | Cmd/Ctrl-E |
| `clip-nudge` | `{ids, deltaBeats}` | Alt-Left/Right |
| `view-change` | `{pxPerBeat, scrollBeat}` | Settled zoom or scroll |

## Keyboard

The timeline host is a tab stop for clip navigation. Lane names and controls,
automation headers and sub-rows, and automation breakpoints also participate
in the tab order; focused clips use a roving tab index.

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
| Double-click a sub-row | Add a point; double-click a point deletes it |
| Drag a point | Move it, snapping its beat; Alt disables snapping |
| Drag a segment | Move its two endpoints vertically; Shift makes the move fine |
| Delete / Backspace | Delete the focused automation point |
| Arrow keys | Nudge the focused point by one grid step or 1% of its range |
| Shift-Left/Right | Nudge a point by one tenth of a grid step |
| Shift-Up/Down | Nudge a point by one tenth of 1% of its range |

Space is left to the host's transport shortcut.

## API and variables

`setLanes(lanes)`, `setLaneClips(laneId, clips)`, `setLaneControls(laneId, controls)`, `setLaneAutomation(laneId, automation)`, `setPlayhead(beat)`,
`setLoop(start, end, enabled, emit, {punchIn, punchOut})`, `scrollTo(beat)`, `zoomToFit(endBeat)`,
`beginRename(clipId)`, `focusClip(clipId)`, `revealAutomation(laneId, automationId)`, `beatAtPoint(clientX)` and
`laneAtPoint(clientY)` are the host-facing methods. The `pxPerBeat`,
`scrollBeat`, `playhead`, `loopStart`, `loopEnd` and `selected` properties are
readable; `pxPerBeat`, `scrollBeat` and `selected` are writable.

`revealAutomation` returns `true` when the requested automation row exists and
scrolls the actual vertical lane viewport until that row is visible; it returns
`false` when the lane or automation entry is not present. Header scrolling stays
in sync through the timeline's normal lane-scroll handling.

| Variable | Purpose |
| --- | --- |
| `--compost-timeline-bg`, `-text`, `-muted`, `-faint` | Surface and type |
| `--compost-timeline-line`, `-bar-line`, `-lane`, `-lane-alt`, `-header-bg` | Rules and lane surfaces |
| `--compost-timeline-signal-hi`, `-wash`, `-over`, `-highlight` | Playing, wash and recording states |
| `--compost-timeline-clip-font-size`, `-lane-font-size`, `-select`, `-marquee` | Clip typography and selection |
| `--compost-timeline-playhead`, `-loop`, `-loop-off` | Ruler and transport marks |
| `--compost-timeline-row-height`, `-font`, `-numeral-font` | Geometry and typography |
| `--compost-timeline-automation-row-height`, `-value` | Automation sub-row height and live value |
| `--compost-timeline-color-scheme` | Native control colour scheme |

The host may pass `progress` from `0` to `1` on a playing clip. The loop
handles accept `punchIn` and `punchOut` in the optional fifth argument; the
corresponding caps use `--compost-timeline-over`. Omitting that fifth argument
preserves the current punch flags, including while a loop handle is dragged.

A lane may carry `controls: {armed, muted, soloed}`. The header renders the
`●`, `M` and `S` controls with `aria-pressed`, short titles and keyboard focus;
the host applies each `lane-toggle` intent and may repaint only that header
with `setLaneControls`. Lanes without `controls` continue to use the older
`armed` field without adding controls.

When the `automation` attribute is present, each lane may carry
`automation: [{id, label, color, min, max, stepped, scale, points, state, value}]`.
Every entry gets a header sub-row and an editable body sub-row. `points` are
complete `{beat, value}` objects in song beats; values are clamped to `min` and
`max`, and `scale: "gain"` uses the same taper as `compost-channel-strip`.
`value`, when supplied, is printed as a two-decimal live readout in the header.
The body draws a flat continuation before the first and after the last point,
steps when `stepped` is true, and uses the lane colour except for recording or
overridden states. `setLaneAutomation` accepts an authoritative replacement;
the host commits the one `automation-change` event emitted after an edit.
