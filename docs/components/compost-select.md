# compost-select

`compost-select` is a styled popup for small fixed option lists.

```html
<compost-select value="saw" label="Wave shape">
  <option value="sine">Sine</option>
  <option value="saw">Saw</option>
</compost-select>
```

Read or set `.value` like a native select. User selection emits a bubbling,
composed `change` event. Name it with `label`, ARIA, or an associated `<label>`.

Arrow, Home, End, Enter, Space, Escape, Tab, and typeahead work like a native
select. Disabled options, outside-click dismissal, `disabled`, and `placeholder`
are supported.

Use `--compost-select-*` variables or the `button`, `label`, `marker`, and
`listbox` parts for styling.
