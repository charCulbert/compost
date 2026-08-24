# compost-knob

`compost-knob` is a rotary numeric control using the shared parameter lifecycle.

```html
<compost-knob parameter-id="gain" label="Gain" min="0" max="1"
  step="0.01" value="0.5" editable></compost-knob>
```

User gestures emit `parameter-begin`, `parameter-edit`, and `parameter-end`.
Use `setValue(value, false, source)` to update it without emitting events.

`min`, `max`, and `step` define the range. `curve`, `mid`, and `shape` control
response. `reset-value` is independent from `mid`. `unit`, `text`/`options`, and
`display-fraction-digits` control presentation.

Drag to adjust, Shift-drag for fine movement, double-click or touch double-tap
to reset, or use Arrow, Page, Home, End, Escape, Delete, and Backspace. The
touch reset consumes iOS's page-zoom default. `editable` enables typed values.
