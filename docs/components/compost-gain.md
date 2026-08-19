# compost-gain

`compost-gain` is a channel-strip control that combines a draggable gain fader
with a live peak meter on one shared vertical rail, in the spirit of Max/MSP
`live.gain~` or an Ableton mixer strip. The fader behaves exactly like
`compost-slider`; the meter is driven separately by the host.

```html
<compost-gain
  label="Volume"
  parameter-id="track-1-gain"
  orientation="vertical"
  min="-90" max="12" step="0.1" value="0" mid="-12" unit=" dB"
  channels="2" meter-min="-60" meter-max="6" clip-level="0" peak-hold="1500">
</compost-gain>
```

## Independent gain and meter state

The gain value and the meter levels are completely independent:

- **`value`** controls the fader position and is the parameter the host reads and
  writes. Dragging or keying the fader emits `parameter-begin`, `parameter-edit`,
  and `parameter-end`.
- **Meter levels** control only the meter fill. The host supplies them:

```js
const gain = document.querySelector('compost-gain');
gain.setLevels([-12.4, -13.1]);   // left/right peak in dBFS
```

`setLevels()` never changes `value` and never emits a parameter event. Setting
the gain value never moves the meter. A single number sets a mono fill; an array
sets one fill per channel.

```js
gain.clearClip();      // clear a latched clip indicator
gain.levels;           // read-only copy of the last levels
gain.clipping;         // true while any channel is latched clipping
```

## Fader

The fader is a `compost-slider` in disguise: click or drag for normal movement;
Option-drag, Shift-drag, or a second drag for fine movement; double-click,
Escape, Delete, or Backspace resets; Arrow, Page, Home, and End keys adjust it.
`min`, `max`, `step`, `value`, `mid`, `curve`, `shape`, `unit`, `reset-value`,
`init`, `editable`, and `disabled` work exactly as on `compost-slider`.

The default `mid="-12"` gives an Ableton-style taper — finer resolution near 0 dB
and a compressed quiet tail. Set `mid` (or `curve`/`shape`) to change the taper,
or match a plain linear-in-dB fader by removing `mid`.

Use `setValue(value, false, source)` to update the fader without emitting events
— the same signature the parameter controller and MIDI mapping use, so
`compost-gain` is a drop-in mappable parameter.

## Meter

| Attribute | Default | Meaning |
| --- | --- | --- |
| `channels` | `2` | Number of meter fills, 1–16. |
| `meter-min` | `-60` | Quietest scale mark to label, dBFS. |
| `meter-max` | `6` | Loudest scale mark to label, dBFS. |
| `clip-level` | `0` | Clip threshold, dBFS. |
| `peak-hold` | `1500` | Peak-hold and clip-hold duration, ms. |

The fader and the meter share one rail, so they share one dB axis: the fader's
own scale (`min`, `max`, `mid`/`curve`/`shape`). A given dB value lands on the
same pixel row whether it is the fader position, a scale mark, or a meter level —
setting the fader to 0 dB puts the handle exactly on the `0` mark. Levels below
`min` or above `max` clamp to the ends of the rail.

Because the axis follows the fader's taper, the marks are not evenly spaced: with
the default `mid="-12"` the quiet marks bunch toward the bottom, the same way an
Ableton or live.gain~ strip looks. `meter-min` and `meter-max` only choose which
of the marks (`0, -12, -24, -36, -48, -60`) get labelled; widen `min`/`max` or
change `mid` to change the spacing itself.

The meter colours from low through a warning band to red near the top. Each
channel holds a peak tick at its recent maximum for `peak-hold` ms. A level at or above `clip-level` turns the
channel red, shows the `CLIP` state, and holds it for `peak-hold` ms; it clears
automatically, or immediately via `clearClip()`.

## Accessibility

The host element is an accessible slider (`role="slider"`) with `aria-valuenow`
and `aria-valuetext` describing the gain value. `aria-valuetext` also includes the
current per-channel peak levels and clip state, refreshed by `setLevels()` without
emitting events. Meter channels are purely visual and add no extra keyboard stops;
keyboard behaviour matches `compost-slider`.

## UI only

`compost-gain` is a UI component. It does not create an AudioContext or
AnalyserNode, connect to an audio graph, or process audio. The host application
computes peak levels and calls `setLevels()`.

## Styling

Colours and geometry are exposed as `--gain-*` custom properties (for example
`--gain-rail-length`, `--gain-rail-width`, `--gain-thumb-line`, `--gain-meter-low`,
`--gain-meter-mid`, `--gain-meter-high`, `--gain-meter-peak`, `--gain-clip-on`),
and the shadow parts `panel`, `row`, `label`, `value`, `clip`, `rail`, `meter`,
`thumb`, and `scale` are available for `::part()` styling. The Compost theme maps
these to the shared `--compost-theme-*` palette.

`--gain-meter-unlit` fills the part of each meter channel above the current level.
It must be opaque: each channel paints the full-scale green/yellow/red gradient and
this layer masks the unreached part of it, so a translucent value lets the gradient
show through at silence.

User gestures emit `parameter-begin`, `parameter-edit`, and `parameter-end`.
