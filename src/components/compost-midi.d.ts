/** The detail on `midi-ready` and `midi-devices-changed`. */
export interface MIDIDeviceState {
  inputs: MIDIInput[];
  outputs: MIDIOutput[];
  /** '' when no single input is selected (none, or all). */
  inputID: string;
  outputID: string;
  input: MIDIInput | null;
  output: MIDIOutput | null;
  inputConnected: boolean;
  outputConnected: boolean;
}

/** The detail on `midi-input-selected` and `midi-output-selected`. */
export interface MIDISelectionDetail {
  id: string;
  device: MIDIInput | MIDIOutput | null;
}

/** The detail on `midi-message`. */
export interface MIDIMessageDetail {
  data: number[];
  /** The bytes packed into one integer. */
  message: number;
  timestamp: number | null;
  receivedAt: number;
  input: MIDIInput | null;
}

/**
 * `<compost-midi>`: Web MIDI device pickers. Emits `midi-ready`,
 * `midi-devices-changed`, `midi-input-selected`, `midi-output-selected`
 * and `midi-message` CustomEvents. Selection is attribute-driven:
 * `input-id`/`output-id` are the applied state, and the picker only
 * requests changes.
 */
export class WebMIDI extends HTMLElement {
  midiAccess: MIDIAccess | null;
  inputs: MIDIInput[];
  outputs: MIDIOutput[];
  /** The applied input id, '*' for all devices, or the none sentinel. */
  selectedInputID: string;
  selectedOutputID: string;
  status: string;

  deviceState(): MIDIDeviceState;
  /** Reapplies a saved selection by id, then by name. */
  restoreSelection(options?: {inputID?: string, outputID?: string, inputName?: string, outputName?: string}):
    {input: MIDIInput | null, output: MIDIOutput | null};
  /** Applies an input selection by setting the `input-id` attribute. */
  selectInput(id: string): void;
  /** Applies an output selection by setting the `output-id` attribute. */
  selectOutput(id: string): void;
  getSelectedInput(): MIDIInput | null;
  getSelectedOutput(): MIDIOutput | null;
  /** Sends bytes to the selected output, when there is one. */
  send(data: number[] | Uint8Array): void;
  sendPackedMessage(message: number): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-midi': WebMIDI;
  }
}
