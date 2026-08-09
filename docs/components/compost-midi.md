# compost-midi

`compost-midi` provides browser Web MIDI access and input/output selection. In
a WebView, connect MIDI through the host bridge.

```js
import 'compost/components/compost-midi';
```

```html
<compost-midi></compost-midi>
```

```js
midi.addEventListener('midi-message', ({ detail }) => {
  console.log(detail.data);
});

midi.send([0x90, 60, 100]);
```

Use `input-only`, `output-only`, or `sysex` to set the access mode. Read the
selected ports with `getSelectedInput()` and `getSelectedOutput()`.
