# Compost vocabulary

The words below have one meaning each across this repository, its docs, and
its consumers. Code, docs, and events use these words and no synonyms.

- **Element** — one Compost custom element (`compost-*`). Elements render
  caller-supplied state and emit semantic intent.
- **Caller** — the application that supplies state to an element and decides
  the consequence of its intent: menus, commands, undo, persistence, routing,
  scheduling, and accepted state.
- **Intent event** — a bubbling, composed `CustomEvent` naming what the user
  asked for, never which input produced it. `envelope-change` is intent;
  "pointerup" is not.
- **Preview / commit** — the two phases of a continuous gesture. Preview
  events fire during the gesture and carry the same payload shape as the
  commit; the caller may render them without accepting them. The commit ends
  the gesture with the value the caller may accept. There are two ratified
  spellings of this lifecycle (see `docs/interaction.md`); new events pick the
  one their element family already uses.
- **Cancel** — ending a gesture without a commit. The element restores its
  pre-gesture rendering; parameter controls restore the begin value.
- **Gesture** — a pointer, touch, or keyboard sequence that a recognizer
  turns into intent: drag, long-press, double-click/double-tap, arrow nudge.
- **Recognizer** — a shared helper in `src/internal/` that detects one
  gesture the same way for every element (timing, distance, capture).
- **Value drag** — dragging to change a number: knob, slider, number box,
  envelope points and segments. Modifiers: Shift is fine, Alt ignores snap.
- **Item drag** — dragging domain objects the caller owns: clips, notes,
  locators, lanes. Modifiers: Alt copies on move, Alt ignores snap while
  trimming or creating, Shift extends the selection.
- **Context intent** — a `*-context` intent event asking the caller for
  context actions at a point, carrying `clientX`/`clientY` so the caller can
  place a menu. The caller decides what the menu contains.
- **Snap mode** — a visible interaction mode (`snap`, `grid` attributes) over
  full-precision caller values; never a stored grid.
- **Draw mode** — the `draw` attribute: pointer gestures paint values instead
  of dragging existing ones.
- **Readonly / disabled** — `readonly` renders and navigates but emits no
  mutating intent; `disabled` is inert and dimmed. See `docs/interaction.md`.
