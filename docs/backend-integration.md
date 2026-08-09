# Backend integration

Controls emit UI intent through `parameter-begin`, `parameter-edit`, and
`parameter-end`. The app forwards these events to Web Audio or a WebView host,
then applies returned values with `ParameterController`.

```js
parameters.addEventListener('parameter-edit', ({ detail }) => {
  backend.setValue(detail.parameterID, detail.value);
});

backend.onValue = (parameterID, value) => {
  parameters.applyValue(parameterID, value, { source: 'backend' });
};
```

`backend.setValue()` can update an `AudioParam`, send an AudioWorklet message,
or call a WebView bridge. `applyValue()` and `applyValues()` update controls
without emitting new user events.
