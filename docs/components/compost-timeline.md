# compost-timeline

`compost-timeline` draws timeline lanes supplied by its host. It owns no
musical model or audio state: clips, loop values and the playhead are pushed in
through the API, while pointer and keyboard gestures bubble as intent events.
Lanes use the same sparse, signal-first language as `compost-clip-grid`: a clip
at rest is a lit name and note dashes on the lane, while a playing clip carries
a wash and optional progress. Note velocities set dash opacity (`.3 + .6 ×
velocity / 127`, or `.55` when absent); playing notes use the full lit pass.
A looping clip marks every loop point with a thin line and cap in the clip's
colour, thinning caps when their on-screen spacing would be under 8px. When
automation rows are hidden, a host-supplied envelope is drawn faintly over the
clip row. A trim or cross-lane drag previews geometry without changing host
state; the lane under a clip drag gets an inset selection highlight until
release.
Clip and locator positions are full-precision beat numbers. `snap="grid"`
visibly previews the snapped edge or movement throughout a drag; `snap="off"`
(and the documented temporary free-drag modifier) preserves pointer-derived
beats without imposing a sample, tick, or PPQ grid.
The three-row ruler exposes host-owned locators and supports row-two scrolling,
pointer-anchored Cmd/Ctrl zoom, and a fit request. Empty lane space creates a
cross-lane time selection; clips fully contained by a committed selection are
reported through one `clip-select` intent, while `setTimeSelection` only
restores the time-selection overlay. Ruler and lane scrollbars stay hidden.

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
timeline.setLocators([
  { id: 'intro', beat: 0, name: 'Intro' },
  { id: 'drop', beat: 8, name: 'Drop' },
]);
timeline.setTimeSelection(null, null);
timeline.addEventListener('clip-move', ({ detail }) => host.move(detail));
timeline.setLaneAutomation('drums', [{
  id: 'volume', label: 'Volume', min: -90, max: 12, scale: 'gain', stepped: false,
  points: [{ beat: 0, value: -12 }, { beat: 4, value: 0 }], value: -3,
}]);
timeline.setAutomationChooserOpen('drums', 'volume', false);
timeline.addEventListener('automation-choose', ({ detail }) => host.openAutomationMenu(detail));
timeline.addEventListener('draw-toggle', ({ detail }) => timeline.toggleAttribute('draw', detail.enabled));
```

## Intents

All events bubble and are composed. The host applies the detail to its model
and calls `setLanes` or `setLaneClips` with the authoritative result.

| Event | Detail | When |
| --- | --- | --- |
| `seek` | `{beat, source}` | Ruler or empty-lane click |
| `locator-jump` / `locator-prev` / `locator-next` | `{id}` | Locator click, Enter/Space, or `,`/`.` |
| `locator-move` | `{id, beat}` | Drag a locator; Alt disables snapping |
| `locator-create` | `{beat}` | Double-click empty row one in the ruler |
| `locator-rename` | `{id, name}` | Double-click a locator name or F2 |
| `locator-context` | `{id, clientX, clientY}` | Locator context menu |
| `fit-request` | `{}` | Double-click row-two ruler; host calls `zoomToFit(songEnd())` |
| `time-select-input` / `time-select` | `{start, end, laneIds}` | Cross-lane time-selection drag |
| `time-delete` | `{start, end, laneIds, removeTime}` | Delete/Backspace with a time selection |
| `loop-input` / `loop-change` | `{start, end, enabled}` | Loop brace drag |
| `loop-toggle` | `{enabled}` | Double-click the brace |
| `clip-select` | `{ids}` | Click, marquee or keyboard selection |
| `clip-open` | `{id, altKey, clientX, clientY}` | Double-click, Shift-Enter or `e` |
| `clip-context` | `{id, clientX, clientY}` | Context menu, Shift-F10 or long press |
| `lane-context` | `{laneId, beat, clientX, clientY}` | Empty-lane context menu |
| `lane-create` | `{laneId, beat}` | Double-click empty lane space |
| `lanes-context` / `lanes-create` | `{clientX, clientY}` | Context menu or double-click below the last header |
| `lane-back` | `{laneId}` | Overridden-lane pip |
| `lane-header-context` | `{laneId, clientX, clientY}` | Lane-header context menu |
| `lane-pick` | `{laneId, shiftKey}` | Click a lane header |
| `lane-move` | `{laneId, toIndex}` | Drag or arrow-key a lane header |
| `lane-rename` | `{laneId, name}` | Double-click or F2 on a lane name |
| `lane-toggle` | `{laneId, name: "arm"|"monitor"|"mute"|"solo"}` | Header control press |
| `lane-figure-input` / `lane-figure-change` | `{laneId, kind: "fader"|"pan"|"send", sendId?, value, phase}` | Number-box or wash-edge gesture |
| `device-toggle` | `{laneId, deviceId}` | Device power dot |
| `device-open` | `{laneId, deviceId, altKey, clientX, clientY}` | Device name click/double-click |
| `device-context` | `{laneId, deviceId, clientX, clientY}` | Device context menu |
| `device-overflow` / `device-add` | `{laneId, clientX, clientY}` | `+N`, trailing `+`, or empty-device label |
| `device-move` | `{laneId, deviceId, toLaneId, at, copy}` | Device drag; `at` is the target device id or `null` for the end |
| `automation-change` | `{laneId, automationId, points}` | Add, move, delete or segment edit commit |
| `automation-choose` | `{laneId, automationId, clientX, clientY}` | Open the host-owned automation chooser |
| `automation-add` | `{laneId, clientX, clientY}` | Press `+` in an automation header |
| `automation-remove` | `{laneId, automationId}` | Press `−` in an automation header |
| `draw-toggle` | `{enabled}` | Press `b`; the host owns the `draw` attribute |
| `automation-context` | `{laneId, automationId, clientX, clientY}` | Automation sub-row context menu or Shift-F10 |
| `automation-header-context` | `{laneId, clientX, clientY}` | Reserved for a lane-header automation menu |
| `clip-move` | `{ids, laneId, deltaBeats, copy}` | Clip body drag ends |
| `clip-trim-input` / `clip-trim` | `{id, start, end}` | Clip edge drag |
| `clip-rename` | `{id, name}` | F2 or `beginRename` commit |
| `clip-delete` | `{ids}` | Delete or Backspace |
| `clip-duplicate` | `{ids}` | Cmd/Ctrl-D |
| `clip-split` | `{ids, beat}` or `{ids, beats: [start, end], laneIds}` | Cmd/Ctrl-E with or without a time selection; the time-selection form carries the selected lanes even when `ids` is empty |
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
| Cmd/Ctrl-L, or `l` | Loop brace around the selected clips (`loop-change`, enabled) |
| Alt-Left/Right | Nudge by one grid step |
| `[` / `]` | Zoom out / in around the playhead |
| Shift-F10 | Open a context menu |
| Escape | Clear selection |
| Enter / Space on a locator | Jump to that locator |
| F2 on a locator | Rename the locator |
| `,` / `.` | Jump to the previous / next locator |
| `l` with a time selection | Loop the selected time range |
| Delete / Backspace with a time selection | Emit `time-delete` with `removeTime: false` |
| Shift-Delete with a time selection | Emit `time-delete` with `removeTime: true` |
| Double-click a sub-row | Add an interpolated point on the line, or a pointer-valued point off-line; double-click a point deletes it |
| Drag a point | Move it, snapping its beat and optional discrete value step; Alt disables snapping |
| Drag a segment | Move its two endpoints vertically; Shift makes the move one-quarter speed |
| `b` | Emit `draw-toggle`; the host toggles the `draw` attribute |
| `Delete` with an automation time selection | Flatten the selected range, retaining edge points |
| Delete / Backspace | Delete the focused automation point |
| Arrow keys | Nudge the focused point by one grid step or 1% of its range |
| Shift-Left/Right | Nudge a point by one-quarter of a grid step |
| Shift-Up/Down | Nudge a point by one-quarter of 1% of its range |

Space is left to the host's transport shortcut.

## API and variables

`setLanes(lanes)`, `setLaneClips(laneId, clips)`, `setLaneControls(laneId, controls)`, `setLaneMeters(updates)`, `setLaneFigures(laneId, figures, wash)`, `setLaneSession(laneId, session)`, `setLaneDevices(laneId, devices)`, `setLaneAutomation(laneId, automation)`, `setAutomationChooserOpen(laneId, automationId, open)`, `setLocators(locators)`, `setTimeSelection(start, end, laneIds)`, `setPlayhead(beat)`,
`setLoop(start, end, enabled, emit, {punchIn, punchOut})`, `scrollTo(beat)`, `zoomToFit(endBeat)`,
`beginRename(clipId)`, `focusClip(clipId)`, `revealAutomation(laneId, automationId)`, `beatAtPoint(clientX)` and
`laneAtPoint(clientY)` are the host-facing methods. `locators` and
`timeSelection` are readable host-state snapshots. The `pxPerBeat`,
`scrollBeat`, `playhead`, `loopStart`, `loopEnd` and `selected` properties are
readable; `pxPerBeat`, `scrollBeat` and `selected` are writable.

`revealAutomation` returns `true` when the requested automation row exists and
scrolls the actual vertical lane viewport until that row is visible; it returns
`false` when the lane or automation entry is not present. Header scrolling stays
in sync through the timeline's normal lane-scroll handling.

| Variable | Purpose |
| --- | --- |
| `--compost-timeline-bg`, `-text`, `-muted`, `-faint` | Surface and type |
| `--compost-timeline-header-width` | Fixed header column width (25rem by default) |
| `--compost-timeline-line`, `-bar-line`, `-lane`, `-lane-alt`, `-header-bg` | Rules and lane surfaces |
| `--compost-timeline-signal-hi`, `-wash`, `-over`, `-highlight` | Playing, wash and recording states |
| `--compost-timeline-clip-font-size`, `-lane-font-size`, `-select`, `-marquee` | Clip typography and selection |
| `--compost-timeline-playhead`, `-loop`, `-loop-off` | Ruler and transport marks |
| `--compost-timeline-lane-height`, `--compost-timeline-thin-lane-height`, `--compost-timeline-row-height`, `-font`, `-numeral-font` | Track/return geometry and typography |
| `--compost-timeline-automation-row-height`, `-value` | Automation sub-row height and live value |
| `--compost-timeline-color-scheme` | Native control colour scheme |

The host may pass `progress` from `0` to `1` on a playing clip. The loop
handles accept `punchIn` and `punchOut` in the optional fifth argument; the
corresponding caps use `--compost-timeline-over`. Omitting that fifth argument
preserves the current punch flags, including while a loop handle is dragged.

A lane may carry `kind: "track"|"return"|"master"`, `picked`, `colorRGB`,
`session`, `figures`, `wash`, `meter`, `gainReduction`, `devices` and
`emptyDeviceLabel`. Track headers have two measured rows; return and master
headers have one thin row. `wash` is a 0..1 fader position, `meter` is an
optional stereo dB pair and `gainReduction` is a negative dB value. Meter and
gain-reduction paints are partial updates, so `setLaneMeters` does not rebuild
clips or automation. A muted or overridden lane dims its clips to `.4` without
adding a brightness filter; overridden headers dim the lane name as well.

Clip notes may include `velocity: 0..127`; the value controls each dash's rest
opacity while the playing state uses the full lit note pass. A lane may also
carry `envelope: {points, min, max, stepped, scale}`. The envelope is a
noninteractive, `.3`-opacity path over the base clip row only when the
`automation` attribute is absent. During a clip move the target `.lane` gets a
1px inset `--compost-timeline-select` highlight; it is cleared when the gesture
ends or is cancelled.

A lane may carry `controls: {armed, monitor: "off"|"auto"|"in", muted, soloed}`.
The header renders the `●`, monitor glyph, `M` and `S` controls with
`aria-pressed`, short titles and keyboard focus;
the host applies each `lane-toggle` intent and may repaint only that header
with `setLaneControls`. Lanes without `controls` continue to use the older
`armed` field without adding controls.

`figures.faderDb`, `figures.pan` and each send `db` are compact number boxes.
Fader and send drags use 0.1 dB per pixel; pan uses 0.01 per pixel. Shift/Alt
uses the shared fine gesture scale, double-click resets and typed editing is
handled by `compost-number-box`. The wash edge is the same fader gesture and
resets to 0 dB on double-click. `devices` are signal-ordered; when the chain
does not fit it collapses to `+N`, and the trailing plus/empty label emits
`device-add`.

When the `automation` attribute is present, each lane may carry
`automation: [{id, label, color, min, max, stepped, step, scale, points, state, value}]`.
Every entry gets a header sub-row and an editable body sub-row. `points` are
complete `{beat, value}` objects in song beats; values are clamped to `min` and
`max`, and `scale: "gain"` uses the same taper as `compost-channel-strip`.
`stepped` changes interpolation to a previous-value hold; when no `step` is
supplied it uses an integer value step of 1, otherwise an optional positive
`step` snaps values during point and range edits. Continuous point, segment and
range gestures move in the rendered display/Y space, including gain-scaled
lanes, so the same pixel travel has the same visible meaning. Moving an outer
breakpoint inward retains a synthetic original edge breakpoint so the flat
pre/post run remains visible, and its drag readout follows the moved point.
The chooser is a real button with `aria-haspopup="menu"` and host-synchronised
`aria-expanded`; opening one clears the other chooser states. Compost emits the
chooser/add/remove intents but never renders the menu.
`value`, when supplied, is printed as a two-decimal live readout in the header.
The body draws a flat continuation before the first and after the last point,
steps when `stepped` is true, and uses the lane colour except for recording or
overridden states. `setLaneAutomation` accepts an authoritative replacement;
the host commits the one `automation-change` event emitted after an edit. Add
the `draw` attribute when the host receives `draw-toggle`; draw mode writes
flat grid-cell pairs (the last sample chronologically wins in each cell, cell
ends use a small epsilon before the next cell boundary, and points at the
preceding epsilon or following boundary are retained) or sampled
Alt/snap-off points, previews in `--compost-timeline-over`, thins freehand once
on release at `.004 × range`, and emits one complete `automation-change`.
Pointer cancellation restores the original points without an intent. The draw
hint appears only while its row is hovered; drag readouts show `beat · value`,
is vertically centered at the sub-row's right edge, and the envelope line is
emphasized only when the line itself is hovered. Draw-mode long-press context
restores the preview without committing it; lane-background drags do not start
time selections while drawing.
