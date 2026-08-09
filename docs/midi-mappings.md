# MIDI mappings

`createMIDIMappings()` stores MIDI CC mappings for a `ParameterController`.
Assign it to `compost-midi-mappings` to show the editor.

```js
const mappings = createMIDIMappings({ parameters });
document.querySelector('compost-midi-mappings').mappings = mappings;

mappings.addEventListener('midi-mapping-request', ({ detail }) => {
  mappings.applyMapping(detail);
});
```

`requestSet()` and `requestClear()` emit edit requests. `applyMapping()` and
`applyClear()` update the stored mappings. `handleMIDIMessage()` emits a
`midi-parameter` event for each matching CC message.

Each parameter has one mapping at most. A blank channel matches every channel.
Mapping ranges use the parameter's range and curve metadata.
