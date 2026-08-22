# compost-popup

`compost-popup` is a small menu anchored to a control or opened at a point: a
list of `<option>` children (and `<hr>` separators) that reports a pick and
closes. Placement is measured, and the list is kept on screen whichever way it
has to go.

```html
<compost-popup heading="input" label="Track input">
  <option value="none">no input</option>
  <option value="midi-1-1" selected>MIDI 1 · 1</option>
  <hr>
  <option value="midi-1" data-detail="16">MIDI 1 all</option>
</compost-popup>
```

```js
button.addEventListener('click', () => popup.open({ anchor: button }));
surface.addEventListener('contextmenu', (event) => {
  event.preventDefault(); popup.openAt(event.clientX, event.clientY);
});
popup.addEventListener('popup-select', ({ detail }) => apply(detail.value));
```

`open({anchor})` hangs the list from an element or a `DOMRect`, using the
same `popupPlacement` as `compost-select`; `openAt(x, y)` puts it beside a
point. `setItems([{value, label, detail, disabled, selected}, '-', …])`
replaces the options from data. `value` (or an option's `selected`) marks the
current entry with a dot; `data-detail` on an option shows trailing text.

Arrows, Home, End, Enter and Escape work; an outside press closes it; the
menu renders in the top layer, above any window. `sheet` lays it along the
bottom of a small screen.

## Events

`popup-select` with `{value, index, label}`, `popup-open`, `popup-close` with
`{reason}`.

## Styling

`--compost-popup-*` custom properties cover the ground, text, hover, marked
entry and heading colours, item padding and the minimum width. Parts: `menu`,
`heading`, `item`.
