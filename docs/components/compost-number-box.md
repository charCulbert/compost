# compost-number-box

`compost-number-box` supports typed values, dragging, keyboard changes, and the
shared parameter lifecycle.

```html
<compost-number-box parameter-id="amount" label="Amount" min="0" max="1"
  step="0.01" value="0.5"></compost-number-box>
```

`min`, `max`, and `step` define the range. `curve` and `mid` control movement;
`reset-value` is independent. Add `allow-empty` when blank is meaningful.

Normal drag uses full travel. Option-drag or a second drag uses fine movement.
`split-drag` gives the left, middle, and right thirds separate rates through
`drag-step-left`, `drag-step-middle`, and `drag-step-right`.

Double-click, Escape, Delete, or Backspace resets the value. While typing,
Delete and Backspace edit text and Escape cancels the edit.
