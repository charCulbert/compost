export interface SpectrogramAppendOptions {
	/** Centre time of the first column in caller-defined seconds. */
	startTime: number;
	/** Time between column centres in seconds. */
	timeStep: number;
}

/**
 * `<compost-spectrogram>`: a scrolling renderer for caller-prepared scalar
 * values over time and frequency. The caller owns analysis, units,
 * normalisation, channel selection and smoothing.
 *
 * @attribute time-span - visible seconds ending at viewEndTime, or the newest column when it is null
 * @attribute min-frequency - lowest visible frequency in Hz
 * @attribute max-frequency - highest visible frequency in Hz
 * @attribute frequency-scale - linear, log or mel positioning. Mel maps the
 * supplied Hz centres; the caller still chooses and computes any Mel filterbank.
 * @attribute min-value - value mapped to the bottom of the colour ramp
 * @attribute max-value - value mapped to the top of the colour ramp
 * @attribute palette - optional magma, gray-r or coolwarm built-in. Without
 * this attribute the Canvas/CanvasText palette follows the document theme.
 * Custom properties may override the background and five ramp colours.
 */
export class CompostSpectrogram extends HTMLElement {
	/** Copied, finite, non-negative, strictly ascending bin-centre frequencies. Setting clears history. */
	get frequencies(): Float64Array;
	set frequencies(value: ArrayLike<number>);

	/**
	 * Time at the right edge of the visible window. Set on each display frame to
	 * follow a caller-owned clock; set null to follow the newest column.
	 */
	get viewEndTime(): number | null;
	set viewEndTime(value: number | null);

	/** Time range currently retained by the bounded history ring. */
	get retainedTimeRange(): {
		startTime: number;
		endTime: number;
	} | null;

	/**
	 * Copies packed column-major values. Each column contains one value per
	 * frequency. Times must increase across calls; gaps remain visible. History
	 * evicts its oldest columns after four million retained values or 65,536
	 * columns, whichever comes first.
	 */
	appendColumns(
		values: ArrayLike<number>,
		options: SpectrogramAppendOptions,
	): this;

	/** Clears retained columns without changing the frequencies or view. */
	clear(): this;
	/** Repaints retained columns at the rendered size. */
	paint(): boolean;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-spectrogram": CompostSpectrogram;
	}
}
