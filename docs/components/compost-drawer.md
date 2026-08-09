# compost-drawer

`compost-drawer` is a collapsible container built on native `<details>`
interaction. Parent CSS sets its docking and available space.

```html
<compost-drawer open resizable edge="bottom" min-size="120" max-size="480">
  <span slot="title">Instrument</span>
  <compost-knob label="Gain"></compost-knob>
</compost-drawer>
```

Use `open` to control it and listen for `toggle`. `edge` accepts `top`, `right`,
`bottom`, or `left`. `size` and `--compost-drawer-size` set its open size;
`min-size` and `max-size` are hard bounds and may clip content.

Resizable drawers emit `drawer-resize` with `{ size }`. Use `label` when the
title is empty. Style the drawer through `--compost-drawer-*`
variables or the `drawer`, `title`, `marker`, `content`, and `resize-handle`
parts.
