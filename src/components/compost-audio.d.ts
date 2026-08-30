/** The detail on `audio-*` lifecycle events. */
export interface AudioEventDetail {
	context: AudioContext | null;
	state: AudioContextState | "closed" | "interrupted";
	error?: Error;
	[key: string]: unknown;
}

/**
 * `<compost-audio>`: an audio power button that owns an AudioContext.
 * Emits `audio-started`, `audio-resumed`, `audio-suspended`,
 * `audio-stopped`, `audio-state-change` and `audio-error` CustomEvents.
 *
 * @attribute start-label - power-button label while stopped
 * @attribute stop-label - power-button label while running
 * @attribute start-aria-label - accessible name while stopped
 * @attribute stop-aria-label - accessible name while running
 * @attribute modal - covers the viewport with a start-audio prompt while stopped
 * @attribute centered-while-off - centres the panel while stopped in modal mode
 * @attribute latency-hint - AudioContext latency category or seconds
 */
export class CompostAudio extends HTMLElement {
	/** The owned context; null before the first start and after a close. */
	context: AudioContext | null;
	status: string;

	get startLabel(): string;
	get stopLabel(): string;
	get startAriaLabel(): string;
	get stopAriaLabel(): string;
	/** The `latency-hint` attribute as a category or seconds; defaults to 0. */
	get latencyHint(): AudioContextLatencyCategory | number;
	get isRunning(): boolean;

	/** Starts or resumes the context; resolves with it, or null on failure. */
	start(): Promise<AudioContext | null>;
	/** Suspends the context, or closes and drops it when forced. */
	stop(forceClose?: boolean): Promise<void>;
	toggle(): Promise<AudioContext | null | void>;
	getContext(): AudioContext | null;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-audio": CompostAudio;
	}
}
