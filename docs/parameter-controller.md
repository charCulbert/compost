# Parameter controller

`createParameterController()` groups controls by `parameter-id`, forwards their
parameter events, and applies values to every matching control.

```js
const parameters = createParameterController({ root: document, definitions });
parameters.addEventListener('parameter-edit', ({ detail }) => {
  backend.setValue(detail.parameterID, detail.value);
});
parameters.applyValue('frequency', 440, { source: 'backend' });
```

Pass `definitions` to supply parameter metadata. Without them, the first
matching control supplies the range, default, step, values, and unit.
Definitions may also supply `mid`, `curve`, and `shape`. Controls inherit those
fields when supplied; a definition that omits them leaves the control's local
presentation unchanged. MIDI mappings snapshot the effective fields when a
mapping is accepted.

`applyValue()` and `applyValues()` update controls without emitting user events.
