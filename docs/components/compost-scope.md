# compost-scope

`compost-scope` displays signal channels with triggering, sample or period
windows, vertical range and offset, markers, and labels.

```js
import 'compost/components/compost-scope';
```

For Web Audio, connect an analyser tap and route audible output separately:

```js
scope.connectAudio(context, { channels: [0] });
source.connect(scope.input);
source.connect(context.destination);
```

For a separate external trigger, merge it into another channel of the scope tap:

```js
const tap = new ChannelMergerNode(context, { numberOfInputs: 2 });
signal.connect(tap, 0, 0);
trigger.connect(tap, 0, 1);
tap.connect(scope.connectAudio(context, { channels: [0], triggerChannel: 1 }));
scope.trigger = 'external';
```

The trigger stream must be aligned with the signal. Rising edges through `0.5`
start captures; period windows use successive edges.

Native WebView hosts and offline tools can provide complete capture windows:

```js
scope.setSamples([left, right], { triggerSamples });
```

Arrays are retained by default. Use `{ copy: true }` if the producer must reuse
them immediately.

Essential attributes are `samples-shown`, `periods-shown`, `frequency`,
`sample-rate`, `value-range`, `y-offset`, `trigger`, `trigger-level`,
`trigger-channel`, and the `*-markers` / `*-marker-labels` pairs. Trigger modes
are `off`, `up`, `down`, `external`, and `manual`.

Call `captureTrigger()` in manual mode. `scope-frame` fires after each painted
animation frame and includes the browser timestamp in `detail.time`.
