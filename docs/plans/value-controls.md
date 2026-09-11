# Numeric controls with custom visuals

## Outcome

Compost supplies simple default controls that emit intent and can be synchronized
with externally supplied values. A consumer can supply its own numeric control
graphics while retaining Compost's value handling, parameter events, keyboard
operation, accessible metadata, and pointer gestures.

`<compost-knob>` and `<compost-slider>` keep their default appearance and existing
element interfaces. Custom visuals use a small JavaScript registration interface.
Usefulness and the work saved for a caller determine scope; multiple consumers
are not a prerequisite for accepting a feature.

## Scope

- Continuous and stepped numeric values, including linear, log, and gain scales.
- Independent logical controls that can dispatch events on one shared canvas.
- Explicit controller registration that survives DOM refresh, with cleanup.
- Shared value dragging, keyboard adjustment, reset, cancellation, and accessible
  value reporting used by the built-in knob and slider as well as custom visuals.
- Documentation, a working custom-canvas example, updated knob/slider examples,
  focused unit tests, and browser verification.

Buttons, switches, choice widgets, candidate snapping, tick generation, and canvas
sizing utilities remain separate proposals. Slide's drawing, hit testing, linked
parameter rules, and choice of parameter after an axis decision stay in Slide.
This change only edits Compost; the sibling Slide repository is a reference.

## Module and interface

Add a public `compost/value-control` module with `createValueControl(element,
options)`. The element is the logical control's focusable semantic representation.
Each logical numeric control has its own representation, even when several share
one drawing canvas. The module supplies slider semantics and keyboard behavior.

The options describe the control: parameter ID, label, range, value, reset value,
step, scale, unit/value formatting, and disabled state. Working defaults apply
when these are omitted. A drawing callback receives current presentation state,
including the value, normalized position, focus, and active-drag state.

The returned control supports silent value application, user edits and gesture
begin/end, reset, configuration updates, starting a pointer drag, and disposal.
It satisfies `ParameterController.registerControl()` through a typed numeric
control interface, without pretending to be an HTMLElement.

The default event target and pointer target are the supplied element. A consumer
may select a shared event target such as a canvas, and may start dragging manually
after its own hit testing. A fixed horizontal or vertical axis, relative or
positional movement, travel distance, fine sensitivity, and optional pointer lock
are the supported drag choices. No general-purpose gesture mapping framework is
needed for the initial numeric control path.

The ordinary usage should remain small: create a value control with its metadata
and drawing callback, optionally register it with a ParameterController, and
dispose/unregister it when its view is removed. The final declarations and README
example must agree exactly with the implemented interface.

## Behavior contract

1. User interaction emits the existing `parameter-begin`, `parameter-edit`, and
   `parameter-end` payload. Each begun interaction ends exactly once.
2. Values are in real units. The scale converts movement and visual position;
   numeric edits respect the range and step. Incoming host values do not emit new
   user edits. Existing controller validation remains authoritative for acceptance.
3. Controller updates reach custom controls and built-in siblings immediately and
   silently, including during interaction. Continued relative motion must not jump
   merely because Shift changed or a host value arrived.
4. Escape during a drag, pointer cancellation, unexpected capture loss, window
   blur, disposal, and disabling an active control cancel it, clean up listeners
   and pointer lock, and restore its starting value. Idle reset shortcuts and
   double-click/double-tap reset retain their established purpose.
5. Pointer capture tracks the initiating pointer. Secondary buttons and unrelated
   pointers do not start or terminate a gesture. Pointer-lock refusal or late
   completion cannot strand the gesture or leave the pointer locked after cleanup.
6. Keyboard behavior includes arrows, Home/End, and coarse adjustment, using the
   same value/scale logic as pointer edits. Typing into an inline editor must not
   also operate its containing control.
7. Accessible name, minimum, maximum, current value, meaningful value text,
   orientation, disabled state, and focusability follow the control configuration.
   The custom renderer supplies a visible focus treatment using the supplied
   focus state; it does not reproduce ARIA bookkeeping.
8. Configuration/definition updates and teardown must settle any active gesture
   coherently. Disposed controls cannot continue emitting edits or receiving
   registered updates. Multiple handles on one event target do not duplicate the
   controller's forwarded events.

## Controller changes

Keep one `registerControl()` entry point for built-in elements and custom value
controls. Distinguish explicit registration from automatic DOM discovery inside
the implementation. `refresh()` reconciles discovered elements while retaining
explicit registrations. Add `unregisterControl()` and ensure `disconnect()` drops
listeners and registrations. Honor custom control definitions and silent setters
without importing DOM-only requirements into their type.

## Built-in adoption

Use the shared numeric behavior in the knob and slider; retain their markup,
styling parts, attributes, typed entry, and public setters. Preserve slider
orientation and absolute versus relative interaction. Extract the shared behavior
behind an internal seam if needed; do not expose internal adapter machinery as
additional public configuration.

The existing parameter emitters remain useful for the other controls. Reuse their
event contract rather than introducing a second event vocabulary. No number-box,
button, select, or editor redesign is included.

## Examples and documentation

- Add `examples/custom-controls/` with one canvas, two independently focusable
  numeric rails, distinct parameter identities, and custom focus drawing.
- Synchronize one rail with an ordinary knob. Include a host-value action and a
  controller refresh action so silent updates and durable registration are easy
  to exercise. Show the existing parameter event sequence.
- Add the example to the catalog and link it from the knob/slider examples.
- Update interaction guidance for fine adjustment, reset, and Escape cancellation.
- Update the README with the general intent-first ethos, the custom-visuals
  interface, ownership of semantic elements/drawing, and registration cleanup.

## Work assignments

1. **Control behavior:** implement the value-control module, shared gesture and
   accessibility behavior, declarations, and focused module tests. Publish the
   concrete interface to the other workers before they integrate it.
2. **Controller integration:** implement durable explicit registrations, metadata
   application, event routing, cleanup, declaration changes, and controller tests.
3. **Built-in adoption:** adapt knob and slider to the shared behavior and update
   their focused behavior tests, coordinating the internal seam with worker 1.
4. **Examples and browser checks:** build the custom-control example, update the
   catalog and existing examples, and add browser tests against the real example.
5. **Lead integration and independent review:** finalize exports and documentation,
   inspect the combined changes, resolve issues, and verify the complete flow.

Workers own separate files and communicate interface changes before integration.
The lead retains final responsibility. The user authorized Sol at medium reasoning
for complicated work and Luna at maximum reasoning for simpler work. The agent
tool exposes those settings but does not expose a separate service-tier switch.

## Verification

- Test observable behavior through the public control/controller interfaces:
  independent gestures on one target, sibling sync, silent host values, refresh,
  teardown, definition changes, and cancellation.
- Exercise pointer, keyboard, focus, and accessible-value behavior in a headless
  browser; include the built-in knob/slider paths after adoption.
- Inspect the rendered custom example at desktop and narrow widths, including a
  focused control. Keep automated accessibility evidence separate from unperformed
  VoiceOver or physical touch-device acceptance.
- Run every changed test file directly and run `npm run check` with full output.
  The current package has no `check` script; establish it using the installed
  checker and report any pre-existing repository diagnostics separately.
- No `npm test`, build, commit, push, or publication is part of this request.

## Implementation verification

- Shared numeric behavior, explicit registration, built-in adoption, declarations,
  README guidance, and the custom-canvas example are implemented.
- 143 focused unit/regression tests and 19 headless browser tests pass. The
  browser checks include property-driven initialization, reconnects, silent host
  updates, cancellation after detachment, keyboard semantics, typed entry, and
  touch double-tap.
- Strict TypeScript consumer checks and checks of all 18 changed code/example
  files pass. Desktop, 390px-wide focused, and dark-mode demo screenshots were
  inspected.
- Full `npm run check` reports 19 errors, 10 warnings, and 1 info, all matched to
  the pre-change baseline (25 errors, 10 warnings, 1 info). Unrelated files were
  left untouched.
- The broader component-conformance test has an existing `compost-audio`
  `restart-interrupted` declaration/observed-attribute mismatch. Its other seven
  checks pass; the audio files and conformance test are unchanged.
- VoiceOver, physical touch devices, and consumer integration inside Slide have
  not been tested. No changes were made to Slide, and nothing was committed or
  published.
