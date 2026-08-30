/**
 * `<compost-midi-monitor>`: a rolling log of MIDI messages. Point it at a
 * `<compost-midi>` with the `for` attribute, assign an emitter to `midi`,
 * or push messages through `handleMIDIMessage`.
 *
 * @attribute for - id of the compost-midi element to monitor
 * @attribute max-lines - log lines kept
 * @attribute announce - sets the log's aria-live to polite
 */
export class CompostMIDIMonitor extends HTMLElement {
	/** The `midi-message` emitter being monitored, or null. */
	get midi(): EventTarget | null;
	set midi(value: EventTarget | null);
	get maxLines(): number;

	/** Logs one message: a packed integer or a byte array. */
	handleMIDIMessage(message: number | ArrayLike<number>): void;
	clear(): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-midi-monitor": CompostMIDIMonitor;
	}
}
