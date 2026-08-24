# compost-timeline

`compost-timeline` draws generic timeline lanes supplied by its host. It owns
no musical model or audio state: clips, loop values and the playhead are pushed
in through the API, while pointer and keyboard gestures bubble as intent
events. Its defaults are neutral bounded clips, ordinary selection outlines,
compact lane-name fallbacks and a bar ruler. Products may compose richer lane
headers through slots and style the exposed variables and parts.
Structured note previews are a convenience. Note velocities set dash opacity
(`.3 + .6 × velocity / 127`, or `.55` when absent); a caller may instead attach
any lightweight preview element with `setClipPreview`.
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
const header = document.createElement('div');
header.textContent = 'Drums';
timeline.setLaneHeader('drums', header);
timeline.setLoop(0, 8, false, false);
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
Every double-click action also accepts a single-finger touch double-tap and
consumes the second release so iOS does not zoom the surrounding page.

| Event | Detail | When |
| --- | --- | --- |
| `seek` | `{beat, source}` | Ruler or empty-lane click |
| `locator-jump` / `locator-prev` / `locator-next` | `{id}` | Locator click, Enter/Space, or `,`/`.` |
| `locator-move` | `{id, beat}` | Drag a locator; Alt disables snapping |
| `locator-create` | `{beat}` | Double-click empty row one in the ruler |
| `locator-rename` | `{id, name}` | Double-click a locator name or F2 |
| `locator-context` | `{id, clientX, clientY}` | Locator context menu |
| `fit-request` | `{}` | Double-click row-two ruler; host calls `zoomToFit(songEnd())` |
| `ruler-context` | `{beat, clientX, clientY}` | Ruler context menu |
| `timeline-context` | `{clientX, clientY}` | Context menu anywhere not covered above |
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
| `lane-header-context` | `{laneId, clientX, clientY}` | Lane-header context menu |
| `lane-pick` | `{laneId, shiftKey}` | Click a lane header |
| `lane-move` | `{laneId, toIndex}` | Drag or arrow-key a lane header |
| `lane-resize` | `{laneId, height}` | Lane resize commits; `height` is `null` when reset |
| `lane-rename` | `{laneId, name}` | Double-click or F2 on a lane name |
| `automation-change` | `{laneId, automationId, points}` | Add, move, delete or segment edit commit |
| `automation-input` | `{laneId, automationId, points}` | Reversible point preview during a gesture |
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
| Arrow Up / Down on a lane separator | Resize by 4px; Shift resizes by 16px |
| Home on a lane separator | Reset to the shared lane height |
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

## Readonly and disabled

`disabled` makes the timeline inert. `readonly` keeps navigation live — seek,
scroll, zoom, loop and locator jumps, selection, clip-open, and every
`*-context` intent — but emits no mutating intent: no clip move/trim/create/
delete/rename, no lane create/move/rename, no locator create/move/rename, no
time or automation edits, no draw toggle. Automation rows pass `readonly`
down to their envelope editors.

## API and variables

`setLanes(lanes)`, `setLaneHeaders(headers)`, `setLaneHeader(laneId, element)`, `setClipPreview(clipId, element)`, `setLaneClips(laneId, clips)`, `setLaneDimmed(laneId, dimmed)`, `setLaneAutomation(laneId, automation)`, `setAutomationChooserOpen(laneId, automationId, open)`, `setLocators(locators)`, `setTimeSelection(start, end, laneIds)`, `setPlayhead(beat)`,
`setLoop(start, end, enabled, emit)`, `scrollTo(beat)`, `zoomToFit(endBeat)`,
`beginRename(clipId)`, `focusClip(clipId)`, `revealAutomation(laneId, automationId)`, `beatAtPoint(clientX)` and
`laneAtPoint(clientY)` are the host-facing methods. `locators` and
`timeSelection` are readable host-state snapshots. The `pxPerBeat`,
`scrollBeat`, `playhead`, `loopStart`, `loopEnd` and `selected` properties are
readable; `pxPerBeat`, `scrollBeat` and `selected` are writable.

`revealAutomation` returns `true` when the requested automation row exists and
scrolls the actual vertical lane viewport until that row is visible; it returns
`false` when the lane or automation entry is not present. Header scrolling stays
in sync through the timeline's normal lane-scroll handling.

`setLaneHeaders` accepts a `Map` or plain object of lane IDs to caller-owned
elements. Those elements stay in the timeline's light DOM, so the caller styles
and wires them with ordinary CSS and event listeners. Compost only slots each
element into its aligned lane wrapper and keeps generic lane selection, moving,
context, and automation-row geometry around it. Missing entries use the
built-in header.

`setClipPreview(clipId, element)` attaches caller-owned light-DOM content to a
clip through a native slot. Passing `null` restores the built-in structured-note
preview. Compost retains the clip name, extent, loop and progress geometry; the
preview element owns only its content.

| Variable | Purpose |
| --- | --- |
| `--compost-timeline-bg`, `-text`, `-muted`, `-faint` | Surface and type |
| `--compost-timeline-header-width` | Header column width (`11rem` by default) |
| `--compost-timeline-line`, `-bar-line`, `-lane`, `-lane-alt`, `-header-bg` | Rules and lane surfaces |
| `--compost-timeline-signal-hi`, `-wash`, `-over`, `-highlight` | Playing, wash and recording states |
| `--compost-timeline-clip-font-size`, `-lane-font-size`, `-select`, `-marquee` | Clip typography and selection |
| `--compost-timeline-playhead`, `-loop`, `-loop-off` | Ruler and transport marks |
| `--compost-timeline-lane-height`, `--compost-timeline-thin-lane-height`, `--compost-timeline-row-height`, `-font`, `-numeral-font` | Regular/compact lane geometry and typography |
| `--compost-timeline-automation-row-height`, `-value` | Automation sub-row height and live value |
| `--compost-timeline-clip-bg`, `-clip-border`, `-clip-radius`, `-selected-outline`, `-selection-corners` | Clip surface and selection treatment |
| `--compost-timeline-lane-selected-bg`, `-lane-selected-outline`, `-lane-selection-corners` | Fallback lane-name selection treatment |
| `--compost-timeline-color-scheme` | Native control colour scheme |

Useful parts include `frame`, `corner`, `ruler`, `time-selection`, `loop`,
`loop-start`, `loop-end`, `playhead`, `headers`, `lanes`, `lane`,
`lane-content`, `lane-header-fallback`, `lane-name`, `clip`, `clip-name`,
`clip-preview`, `clip-preview-mark`, `clip-progress`, `clip-extent`,
`clip-loop`, `grid-line`, `bar-line`, `beat-line`, `ruler-label`, `locator`, `lane-resize`
and `marquee`.

The host may pass `progress` from `0` to `1` on a playing clip. The loop brace
is only a generic editable range; punch policy and punch markers are not part
of this component.

A lane carries generic presentation fields: `id`, `name`, optional `color`,
`compact`, `picked`, `dimmed`, `height`, `clips`, `envelope` and `automation`.
`height` is an optional pixel row height; dragging or keyboard-editing the
bottom separator previews it and emits `lane-resize` for the host to accept.
A compact
lane uses `--compost-timeline-thin-lane-height`; `dimmed` lowers clip opacity
without assigning a meaning such as mute, override or disable. Product-specific
track kinds, session state, mixer figures, meters and device chains belong in a
caller-owned slotted header.

Clip notes may include `velocity: 0..127`; the value controls each dash's rest
opacity while the playing state uses the full lit note pass. A lane may also
carry `envelope: {points, min, max, stepped, scale}`. The envelope is a
noninteractive, `.3`-opacity path over the base clip row only when the
`automation` attribute is absent. During a clip move the target `.lane` gets a
1px inset `--compost-timeline-select` highlight; it is cleared when the gesture
ends or is cancelled.

When the `automation` attribute is present, each lane may carry
`automation: [{id, label, color, min, max, stepped, step, scale, points, state, value}]`.
Every entry gets a header sub-row and an editable body sub-row composed from
`compost-envelope-editor`. `points` are
complete `{beat, value}` objects in song beats; values are clamped to `min` and
`max`, and `scale: "gain"` uses the shared named gain curve from
`compost/parameter-scale`.
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
The body adapts beats to the envelope editor's generic time coordinate and
draws a flat continuation before the first and after the last point,
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
