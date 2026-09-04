/** One minimum/maximum amplitude bucket in a waveform overview. */
export interface WaveformPeak {
	min: number;
	max: number;
}

/** A normalized visible slice of the supplied peak envelope. */
export interface WaveformView {
	start: number;
	end: number;
}

/**
 * `<compost-waveform>`: a responsive renderer for a caller-prepared min/max
 * audio envelope. Audio decoding, peak generation, time units and editing stay
 * outside the component.
 *
 * @attribute label - accessible name used when aria-label is absent
 */
export class CompostWaveform extends HTMLElement {
	/** Copies of the currently displayed peak buckets. */
	get peaks(): WaveformPeak[];
	set peaks(value: WaveformPeak[]);
	get view(): WaveformView;
	/** Displays a normalized slice without changing the peak envelope. */
	setView(start: number, end: number): void;
	/** Repaints the current envelope at the rendered size. */
	paint(): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-waveform": CompostWaveform;
	}
}
