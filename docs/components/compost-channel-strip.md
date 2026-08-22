# compost-channel-strip

`compost-channel-strip` is a track column that *is* the channel. A translucent
wash rising from the floor to the gain level is the fader — its top edge is the
handle, and a drag anywhere in the column moves it. Meters ride over the wash
on the same dB axis, with 0 dB cut through the rail as a notch, so a meter
level that meets the wash edge means signal at unity. Whatever the column holds
— a header, clips, devices, a `compost-channel-card` — is slotted on top.

```html
<compost-channel-strip parameter-id="track-1-gain" pan-parameter-id="track-1-pan"
  label="Drums" value="-6" pan="0" channels="2" style="width:132px; height:420px">
  <div data-strip-ignore>01 DRUMS</div>
  …
</compost-channel-strip>
```

```js
const strip = document.querySelector('compost-channel-strip');
strip.setLevels([-12.4, -13.1]);   // peak per channel, dBFS
strip.addEventListener('parameter-edit', ({ detail }) => {
  if (detail.parameterID === 'track-1-gain') engine.setGain(detail.value);
  if (detail.parameterID === 'track-1-pan') engine.setPan(detail.value);
});
```

## Gestures

| Gesture | Does |
| --- | --- |
| Drag up or down | Sets gain, 0.22 dB per pixel |
| Drag sideways | Sets pan; the axis is picked from the first movement |
| Alt, Shift, or a second press | Drags fine |
| Double-click | Resets gain; with Alt, resets pan |
| Type a number, or Enter | Opens an editor at the wash edge and sets the gain |
| Arrows | ±1 dB, ±5% pan; Alt for ±6 dB, ±25% |
| Home / End | Gain to its floor or ceiling |

Slotted content receives its own pointer events. Form controls, links, other
custom elements and anything marked `data-strip-ignore` keep their press; a
press on anything else in the column starts the gain/pan drag.

## Parameters

Gain reports through `parameter-begin`, `parameter-edit` and `parameter-end`
with `parameter-id`; pan reports through the same events with
`pan-parameter-id`. `setValue(value, false, source)` and
`setPan(value, false, source)` update silently, the same signature the parameter
controller uses.

| Attribute | Default | Meaning |
| --- | --- | --- |
| `value` | `0` | Gain, dB. |
| `min`, `max`, `step` | `-90`, `12`, `0.1` | Gain range; `min` reads as `-inf`. |
| `reset-value` | `0` | Where double-click puts the gain. |
| `pan` | `0` | Pan, −1 (left) to 1 (right). |
| `pan-reset-value` | `0` | Where Alt-double-click puts the pan. |
| `channels` | `2` | Meter bars, 1–16. |
| `meter-position` | `centre` | `centre` or `right`. |
| `scale` | `drag` | Scale marks shown `drag`-only, `always`, or `none`. |
| `scale-marks` | `0 -12 -24 -48` | Which dB values get a mark. |
| `taper` | built in | The dB → height table, as `db:fraction` pairs. |
| `muted` | — | Dims the wash. |
| `disabled` | — | Inert. |

## One axis

The wash, the notch, the scale and every meter bar read off one taper table
(`washPosition`, exported): 0 dB sits at 70% of the column, with the quiet end
compressed. The rail is inset from the header and the floor, but the bars span
the whole column and are clipped to the rail, so their percentages are the
wash's percentages. Levels are drawn as given; any ballistics are the host's.

The strip publishes where its meter sits as
`--compost-channel-strip-meter-left` and `-meter-measured-width` (px) on
itself, which slotted content — `compost-channel-card` in particular — uses to
lay out around the gutter.

## Accessibility

The host is a vertical `role="slider"` for gain; `aria-valuetext` reads the
gain and the pan. Keyboard covers both.

## Styling

`--compost-channel-strip-*` custom properties cover the signal colour, the wash
and meter opacities, the rail, the over colour, the notch, the scale text and
the editor; sizes are in `em` against the host (`-meter-width`, `-meter-top`,
`-meter-bottom`, `-meter-right`). Parts: `surface`, `wash`, `meter`, `bar`,
`fill`, `over`, `zero`, `scale`, `content`.

## UI only

`compost-channel-strip` touches no audio. It draws the gain, pan and levels it
is handed and reports intent.
