# compost-slider

`compost-slider` is a linear numeric control with the same parameter, range,
curve, formatting, reset, and editing options as `compost-knob`.

```html
<compost-slider parameter-id="mix" label="Mix" min="0" max="1"
  step="0.01" value="0.5" editable></compost-slider>
```

Sliders are horizontal by default. Set `orientation="vertical"` for a vertical
track whose value increases from bottom to top:

```html
<compost-slider orientation="vertical" parameter-id="level" label="Level"
  min="0" max="1" value="0.75"></compost-slider>
```

Use `--slider-vertical-length` and `--slider-vertical-width` to size a vertical
slider. The defaults are `144px` and `72px`.
The `panel`, `row`, `label`, `value`, `input`, `track`, `fill`, and `thumb`
parts allow an application to restyle the same interaction without replacing
its geometry or parameter gestures.

Click or drag for normal movement. The default interaction positions the value
at the pointer. Set `interaction="relative"` when a surface should preserve its
current value on pointer-down and move by the same fraction of the rail as the
pointer travels.

Option-drag, Shift-drag, or a second drag enables fine movement. Double-click,
Escape, Delete, or Backspace resets the value.
Arrow, Page, Home, and End keys adjust it from the keyboard.

User gestures emit `parameter-begin`, `parameter-edit`, and `parameter-end`.
Use `setValue(value, false, source)` to update it without emitting events.
