# compost-audio

`compost-audio` starts and suspends a browser `AudioContext`. Build the audio
graph in the app.

```js
import 'compost/components/compost-audio';
```

```html
<compost-audio modal centered-while-off></compost-audio>
```

Centered mode preserves the control's inline footprint and animates the power
button between its modal and inline positions unless reduced motion is enabled.

Build the graph when `audio-started` provides the new context. Later changes
emit `audio-resumed`, `audio-suspended`, `audio-stopped`, and `audio-error`.

```js
const context = await audio.start();
await audio.stop();      // suspend
await audio.stop(true);  // close
```

Use `start-label`, `stop-label`, and their `*-aria-label` equivalents to name
the button. `latency-hint` applies when the next context is created.
