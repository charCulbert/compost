/** The detail on `note-down` and `note-up`. */
export interface PianoNoteDetail {
	note: number;
}

/**
 * `<compost-piano>`: an on-screen keyboard played by pointer, touch or the
 * computer keys. Emits `note-down` and `note-up` CustomEvents; incoming
 * MIDI can light keys through `handleMIDIMessage`.
 *
 * @attribute root-note - MIDI note of the bottom key
 * @attribute note-count - number of keys
 * @attribute key-map - computer-key layout for the keys
 * @attribute dock - compact docked layout
 * @attribute inline - full-width inline layout
 */
export class CompostPiano extends HTMLElement {
	constructor(options?: {
		naturalNoteWidth?: number;
		accidentalWidth?: number;
		accidentalPercentageHeight?: number;
	});

	/** The rendered keyboard's width in 16px reference units, set after each render. */
	keyboardWidth: number;

	get config(): { noteCount: number; rootNote: number; keyMap: string };

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
		"compost-piano": CompostPiano;
	}
}
