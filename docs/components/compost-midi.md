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

midi.addEventListener('midi-input-selected', ({ detail }) => {
  midi.selectInput(detail.id);
});

midi.addEventListener('midi-output-selected', ({ detail }) => {
  midi.selectOutput(detail.id);
});

midi.send([0x90, 60, 100]);
```

Use `input-only`, `output-only`, or `sysex` to set the access mode. Input and
output selection are controlled: picker changes emit selection intent and the
caller applies the accepted ID with `selectInput()`, `selectOutput()`, or the
corresponding attribute. With no `input-id`, no input is selected;
`input-id="*"` explicitly listens to every connected input. A selected device
ID remains selected while disconnected and is
reattached if it returns. `midi-ready` fires after the initial selected inputs
have been opened or found unavailable. Read connected selected ports with
`getSelectedInput()` and `getSelectedOutput()`.
