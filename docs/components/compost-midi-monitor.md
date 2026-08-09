# compost-midi-monitor

`compost-midi-monitor` displays a short MIDI event log.

```html
<compost-midi id="midi"></compost-midi>
<compost-midi-monitor for="midi" max-lines="16"></compost-midi-monitor>
```

`for` points to an element that emits `midi-message`. Set the `midi` property
instead when connecting directly. `handleMIDIMessage()` accepts MIDI bytes or a
packed message; `clear()` empties the log.

The default live region is off. Add `announce` for a low-rate stream.
