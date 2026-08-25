/** The detail on `note-down` and `note-up`. */
export interface PianoNoteDetail {
  note: number;
}

/**
 * `<compost-piano>`: an on-screen keyboard played by pointer, touch or the
 * computer keys. Emits `note-down` and `note-up` CustomEvents; incoming
 * MIDI can light keys through `handleMIDIMessage`.
 */
export class PianoKeyboard extends HTMLElement {
  constructor(options?: {
    naturalNoteWidth?: number;
    accidentalWidth?: number;
    accidentalPercentageHeight?: number;
    pressedNoteColour?: string;
  });

  /** The rendered keyboard's width in pixels, set after each render. */
  keyboardWidth: number;

  get config(): {noteCount: number, rootNote: number, keyMap: string};

  /** Lights or clears a key from an incoming note message. */
  handleMIDIMessage(message: unknown): void;
  handleExternalMIDI(message: unknown): void;
  /** Releases every held note, sending `note-up` where needed. */
  allNotesOff(): void;
  isNoteActive(note: number): boolean;
  isPlayableNote(note: number): boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-piano': PianoKeyboard;
  }
}
