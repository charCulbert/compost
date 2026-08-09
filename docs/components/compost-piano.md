# compost-piano

`compost-piano` emits notes from mouse, touch, or computer-keyboard input.

```js
import 'compost/components/compost-piano';
```

```html
<compost-piano root-note="36" note-count="49"></compost-piano>
```

Listen for `note-down` and `note-up`; each event includes `detail.note`. Use
`handleExternalMIDI()` to highlight incoming notes and `allNotesOff()` to clear
them.

`root-note`, `note-count`, and `key-map` configure the keys. The piano is docked
by default; add `inline` to keep it in normal layout flow.
