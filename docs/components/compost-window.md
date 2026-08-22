# compost-window

`compost-window` is a floating window: a header with a title and a close
control, dragged by the header, resized from a corner grip, and never allowed
past the viewport's edges. The content is whatever is slotted in — a plug-in's
own interface, a keyboard, a panel.

```html
<compost-window heading="Drive · Drums" open x="120" y="80" width="320" height="220"
  min-width="200" min-height="120">
  <span slot="controls">wclap</span>
  <div>…the plug-in's own UI…</div>
</compost-window>
```

`width` and `height` name the **content** box — what a plug-in negotiates —
and the frame adds its own chrome. `setContentSize(width, height)` and
`moveTo(x, y)` apply the same bounds a drag does; `contentSize` reads back.

## Bounds

The whole frame stays inside the viewport whether it is dragged, resized, or
the viewport shrinks around it. Resizing stays inside `min-width`,
`min-height`, `max-width`, `max-height` and the screen; with `aspect-ratio`
(`4/3` or a number) it follows whichever edge the pointer moved further along
so the frame tracks the drag instead of fighting it. `resizable` can be
`both`, `horizontal`, `vertical` or `none`. `fullscreen` takes the screen, for
a phone; `static` disables dragging.

`constrainedSize` and `boundedPosition` are exported for hosts that want the
same maths against a plug-in's resize hints.

## Events

`window-open`, `window-close` (cancelable — a host that needs to tear down
asynchronously can `preventDefault()` and remove the element itself),
`window-move` with `{x, y}` after a drag, `window-resize` with `{width,
height, resizing}` during and after a resize, `window-focus` when the window
is raised.

## Styling

`--compost-window-*` custom properties cover the ground, border, header,
close and grip colours and the header height (`em`). Parts: `header`,
`title`, `close`, `content`, `grip`. Slots: `title`, `controls`, and the
default for content.
