# compost-channel-card

`compost-channel-card` is the channel card at the foot of a track column:
input, pan, level figure, sends and the state switches, laid out around the
meter gutter the column runs through it. The level figure sits left of the
gutter, the sends stack to its right, and the switches straddle it along the
bottom; when the column is too narrow for a lane beside the gutter the rows
stack, and a figure the lane still cannot hold sits in a notch cut through the
rail, the same move as the 0 dB mark.

```html
<compost-channel-strip parameter-id="keys-gain" pan-parameter-id="keys-pan" …>
  <compost-channel-card label="Keys" input="MIDI 1 · 1" input-live
    value="-3.2" gain-parameter-id="keys-gain" pan="0" pan-parameter-id="keys-pan"
    switches="arm monitor mute solo" monitor
    arm-parameter-id="keys-arm" monitor-parameter-id="keys-monitor"
    mute-parameter-id="keys-mute" solo-parameter-id="keys-solo"
    solo-safe-parameter-id="keys-solo-safe"></compost-channel-card>
</compost-channel-strip>
```

```js
card.sends = [{ label: 'A', value: -12, parameterID: 'keys-send-a', min: -90, max: 6 }];
card.addEventListener('input-click', ({ detail }) => popup.open({ anchor: detail.anchor }));
```

Inside a `compost-channel-strip` the gutter is found automatically; elsewhere
set `--compost-channel-card-gutter-left` and `-gutter-width` (px) yourself.

## Controls and their parameters

Every control reports through `parameter-begin`, `parameter-edit` and
`parameter-end` with its own parameter id, and `detail.name` says which one:

| Control | Parameter id | Value |
| --- | --- | --- |
| Level figure (click, Enter or a digit to type) | `gain-parameter-id` | dB |
| Pan rail and figure (drag; double-click centres) | `pan-parameter-id` | −1…1 |
| Arm, monitor, mute, solo | `arm-parameter-id` … `solo-parameter-id` | `discrete` 0/1 |
| Solo defeat (Option/Alt-click solo) | `solo-safe-parameter-id` | `discrete` 0/1 |
| Each send (a `compost-number-box`) | the send's `parameterID` | dB |

The switches are stateless: `arm`, `monitor`, `mute` and `solo` are boolean
attributes the host sets after it has acted on the request. `switches` chooses
which of the four appear, in order; a return track might show `mute solo`.
`solo-safe` draws a thin ring around the solo switch without changing its
pressed state. Option/Alt-clicking solo reports `solo-safe` instead of `solo`.

The pan rail is a `slider`: it takes focus, reads its value as `C`, `40L` or
`40R`, and Arrow Left/Right (Alt for a quarter of the field, Home/End for the
edges, Escape to centre) move it through the same gesture a drag does.

Each send's `compost-number-box` is named `Send A · <label>`, so a screen
reader hears whose send it is rather than four boxes called `Send A`.

The input is a button in the numeral face. It shows `input` and lights up with
`input-live`; a click raises `input-click` with the button as `detail.anchor`
so the host can hang its own chooser off it.

`setValue`, `setPan`, `setSends` and `setSendValue` update silently. A press on
a send's letter raises `send-click` with `{index, label}`, so a host can bring
the return it names into view.

## Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `label` | `Channel` | Names the controls for assistive tech. |
| `input`, `input-live` | — | Input button text; live colours it. Omit `input` to hide it. |
| `value`, `min`, `max`, `step`, `reset-value` | `0`, `-90`, `12`, `0.1`, `0` | Level figure. |
| `pan`, `pan-reset-value` | — | Pan; omit `pan` to hide the row. |
| `switches` | — | Which of `arm monitor mute solo` to show. |
| `solo-safe` | — | Rings the solo switch to show solo defeat. |
| `muted` | — | Dims the level figure. |
| `disabled` | — | Inert. |

## Styling

`--compost-channel-card-*` custom properties cover text, signal, over and
select colours, the hover background and the notch background; sizes are in
`em` against the host, so the whole card scales with its font size. A host on
a small screen can grow the targets without changing the desk layout with
`--compost-channel-card-switch-min`, `-send-label-min` and `-send-height`. Parts:
`input`, `pan`, `pan-rail`, `pan-figure`, `level`, `sends`, `send`, `switches`,
`switch`.
