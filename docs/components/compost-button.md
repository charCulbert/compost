# compost-button

`compost-button` is momentary by default. Add `mode="switch"` for a persistent
pressed state.

```html
<compost-button parameter-id="ping" label="Ping"></compost-button>
<compost-button mode="switch" parameter-id="enabled" label="Enabled"></compost-button>
```

Momentary activation emits `button-trigger` and a `0 → 1 → 0` parameter pulse.
Switch mode emits the normal parameter lifecycle. Use `trigger()` to activate a
momentary button or `setValue(value, false)` to update it without emitting events.

Buttons have square corners by default. Use the `--compost-button-*` variables
for local styling.
