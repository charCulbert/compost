# compost-midi-mappings

`compost-midi-mappings` provides MIDI learn controls and an editor for
`MIDIMappings` state.

```js
import 'compost/components/compost-midi-mappings';
import { createMIDIMappings } from 'compost/midi-mappings';

const mappings = createMIDIMappings({ parameters });
document.querySelector('compost-midi-mappings').mappings = mappings;
```

```html
<compost-midi-mappings heading="MIDI mappings"></compost-midi-mappings>
```

Editing emits `midi-mapping-request`; clearing emits
`midi-unmapping-request`. The application confirms those requests through the
`MIDIMappings` instance. Blank channel means any channel.

Rows support touch-friendly `Del`, Delete, and Backspace. `heading` names the
editor and `disabled` prevents changes.
