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

Double-click or touch double-tap resets the value without triggering iOS page
zoom. Escape, Delete, or Backspace also resets it. While typing, Delete and
Backspace edit text and Escape cancels the edit.

`label` names the box. A host that needs a longer name for assistive tech —
`Send A · Keys` rather than `Send A` — can set `aria-label` on the element and
the inner spinbutton reads that instead, leaving `label` for the visible text.

A drag moves the value whether it runs up/down or left/right (the two are
summed); `--number-box-cursor` (default `ns-resize`) lets a host advertise the
direction that suits its layout, e.g. `ew-resize` for a box in a toolbar.
