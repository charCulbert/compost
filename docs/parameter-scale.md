# Parameter scale

`compost/parameter-scale` exposes the response scaling shared by
`compost-knob`, `compost-slider`, `compost-number-box`, and MIDI mappings.

```js
import {
  normalisedPositionToValue,
  valueToNormalisedPosition,
} from 'compost/parameter-scale';

const scale = { min: 20, max: 20000, mid: 1000, curve: 'log' };
normalisedPositionToValue(0.5, scale); // 1000
```

Controls accept `curve="linear"`, `curve="log"`, or `curve="gain"`. `mid` maps the center
position to a chosen value. `shape` sets the log curve amount, or Compost
derives it from `mid` when omitted.

Linear scaling is a straight line, or two straight segments when `mid` is set.
Log scaling suits positive ranges such as frequency and time. MIDI mappings use
the same `min`, `max`, `mid`, `curve`, and `shape` metadata.

The built-in gain curve maps a finite dB floor through a stable audio-fader
response: `-12 dB` is at 50%, `0 dB` at 70%, and `+12 dB` at 100% for the
canonical `-90..+12 dB` range. Other dB ranges crop and normalize that same
absolute response. The scale remains finite; a control may present its minimum
with `min-label="-inf"` when the application treats that floor as silence.
