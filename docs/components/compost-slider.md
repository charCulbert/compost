# compost-slider

`compost-slider` is a linear numeric control with the same parameter, range,
curve, formatting, reset, and editing options as `compost-knob`.

```html
<compost-slider parameter-id="mix" label="Mix" min="0" max="1"
  step="0.01" value="0.5" editable></compost-slider>
```

Click or drag for normal movement. Option-drag, Shift-drag, or a second drag for
fine movement. Double-click, Escape, Delete, or Backspace resets the value.
Arrow, Page, Home, and End keys adjust it from the keyboard.

User gestures emit `parameter-begin`, `parameter-edit`, and `parameter-end`.
Use `setValue(value, false, source)` to update it without emitting events.
