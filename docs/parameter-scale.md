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

Controls accept `curve="linear"` or `curve="log"`. `mid` maps the center
position to a chosen value. `shape` sets the log curve amount, or Compost
derives it from `mid` when omitted.

Linear scaling is a straight line, or two straight segments when `mid` is set.
Log scaling suits positive ranges such as frequency and time. MIDI mappings use
the same `min`, `max`, `mid`, `curve`, and `shape` metadata.
