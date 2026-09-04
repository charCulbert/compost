import type { WaveformPeak } from "./compost-waveform.js";

/** The detail on playback-range and loop input/change events. */
export interface AudioClipRangeDetail {
	start: number;
	end: number;
}

/** The detail on gain input/change events. */
export interface AudioClipGainDetail {
	gain: number;
}

export interface AudioFileDropDetail {
	file: File;
}

/**
 * `<compost-audio-clip-editor>` composes `<compost-waveform>` with audio-clip
 * gain, playback-range and loop controls. The host owns audio and playback.
 * Emits `range-input`/`range-change`, `loop-input`/`loop-change`,
 * `gain-input`/`gain-change` and `audio-file-drop` CustomEvents.
 *
 * @attribute label
 * @attribute beats - total clip length in quarter-note beats
 * @attribute start - non-destructive playback range start in beats
 * @attribute end - non-destructive playback range end in beats
 * @attribute loop-start
 * @attribute loop-end
 * @attribute loop - shows loop controls
 * @attribute gain - clip gain in dB from -90 to +24
 * @attribute playhead - host-supplied playhead in beats; absent hides it
 * @attribute time-signature - meter as N/D
 * @attribute grid - a note value or legacy cells per bar
 * @attribute adaptive-grid - lets width choose the effective grid step
 * @attribute grid-lines - 'off' hides grid lines
 * @attribute snap - 'off' frees edits from the grid
 * @attribute readonly
 * @attribute disabled
 */
export class CompostAudioClipEditor extends HTMLElement {
	label: string;
	beats: number;
	rangeStart: number;
	rangeEnd: number;
	loopStart: number;
	loopEnd: number;
	loopEnabled: boolean;
	timeSignature: string;
	beatsPerBar: number;
	beatLength: number;
	pulseLength: number | null;
	grid: string | number;
	adaptiveGrid: boolean;
	gridLines: boolean;
	snapMode: "grid" | "off";
	playhead: number | null;

	get gain(): number;
	set gain(value: number);
	/** Copied peak buckets. Setting updates the composed waveform. */
	get peaks(): WaveformPeak[];
	set peaks(value: WaveformPeak[]);
	get pxPerBeat(): number;
	get step(): number;
	get readonly(): boolean;
	set readonly(value: boolean);
	get disabled(): boolean;
	set disabled(value: boolean);

	/** Recomputes geometry and repaints the ruler and grid. */
	refresh(): void;
	setRange(start: number, end: number, shouldEmit?: boolean): void;
	setLoop(start: number, end: number, shouldEmit?: boolean): void;
	setGain(gainDb: number, shouldEmit?: boolean): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-audio-clip-editor": CompostAudioClipEditor;
	}
}
