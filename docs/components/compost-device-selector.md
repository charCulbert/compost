# compost-device-selector

`compost-device-selector` presents audio and MIDI settings supplied by a
WebView host.

```js
import 'compost/components/compost-device-selector';
```

```html
<compost-device-selector></compost-device-selector>
```

Connect it to the host bridge:

```js
await selector.connectHost({
  getSnapshot: () => nativeHost.getDeviceSettings(),
  applySettings: (request) => nativeHost.applyDeviceSettings(request),
});
```

Snapshots contain audio APIs, devices, sample rates, buffer sizes, and MIDI
ports. The component shows busy and error states and ignores older responses.

Use `snapshot`, `busy`, and `error` for manual integration. `open()`, `close()`,
`disconnectHost()`, and `applySnapshot()` provide direct control.
