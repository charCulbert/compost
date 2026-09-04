import { DRAG_SLOP } from "../internal/gestures.js";
import { rulerLabels } from "../internal/time-ruler.js";
import { normalizeTimeRange } from "../selection-region.js";
import {
	gridStepForView,
	gridTextForStep,
	snapModeWith,
	timeGridLines,
	timeSignatureOf,
} from "../time-grid.js";
import { clamp, defineElement, numberAttr } from "../utils.js";
import { CompostWaveform } from "./compost-waveform.js";

const MIN_TIME = 1e-9;
const MAX_PX_PER_BEAT = 600;
const MIN_PINCH_SPAN = 24;

/**
 * An audio-clip editor that composes the generic waveform display with clip
 * gain, playback-range and loop controls. It edits metadata and emits intent;
 * the host owns the audio and supplies peaks and playhead position.
 */
export class CompostAudioClipEditor extends HTMLElement {
	static get observedAttributes() {
		return [
			"label",
			"beats",
			"start",
			"end",
			"loop-start",
			"loop-end",
			"loop",
			"gain",
			"playhead",
			"grid",
			"adaptive-grid",
			"snap",
			"time-signature",
			"grid-lines",
			"readonly",
			"disabled",
		];
	}

	constructor() {
		super();
		this.label = "Audio clip";
		this.beats = 16;
		this.rangeStart = 0;
		this.rangeEnd = 8;
		this.loopStart = 0;
		this.loopEnd = 8;
		this.loopEnabled = false;
		this._gainDb = 0;
		/** @type {number|null} */ this.playhead = null;
		this.timeSignature = "4/4";
		this.beatsPerBar = 4;
		this.beatLength = 1;
		/** @type {number|null} */ this.pulseLength = null;
		/** @type {string|number} */ this.grid = "1/16";
		this.adaptiveGrid = false;
		this.gridLines = true;
		/** @type {'grid'|'off'} */ this.snapMode = "grid";
		this.offset = 0;
		this.zoomPxPerBeat = 0;
		/** @type {{min: number, max: number}[]} */ this._peaks = [];
		/** @type {{start: number, end: number}|null} */ this._timeSelection = null;
		/** @type {{pointerId: number, kind: string, startX: number, pxPerBeat: number, rangeStart: number, rangeEnd: number, loopStart: number, loopEnd: number}|null} */
		this.drag = null;
		/** @type {{pointerId: number, startX: number, startBeat: number, moved: boolean, target: HTMLElement, origin: {start: number, end: number}|null, preview?: {start: number, end: number}}|null} */
		this.selectionDrag = null;
		/** @type {Map<number, {x: number, y: number}>} */ this.pointers =
			new Map();
		/** @type {{xDistance: number, pxPerBeat: number, beat: number}|null} */
		this.pinch = null;

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --compost-audio-clip-editor-bg: Canvas;
          --compost-audio-clip-editor-text: currentColor;
          --compost-audio-clip-editor-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-audio-clip-editor-line: color-mix(in srgb, currentColor 8%, transparent);
          --compost-audio-clip-editor-bar-line: color-mix(in srgb, currentColor 30%, transparent);
          --compost-audio-clip-editor-signal: var(--compost-accent, AccentColor);
          --compost-audio-clip-editor-range: var(--compost-audio-clip-editor-text);
          --compost-audio-clip-editor-loop: var(--compost-audio-clip-editor-signal);
          --compost-audio-clip-editor-select: var(--compost-audio-clip-editor-signal);
          --compost-audio-clip-editor-time-selection: color-mix(in srgb, var(--compost-audio-clip-editor-select) 10%, transparent);
          --compost-audio-clip-editor-past: color-mix(in srgb, currentColor 13%, transparent);
          --compost-audio-clip-editor-playhead: var(--compost-audio-clip-editor-text);
          --compost-audio-clip-editor-control-width: 5em;
          --compost-audio-clip-editor-ruler-height: 3em;
          display: block;
          box-sizing: border-box;
          min-height: 0;
          background: var(--compost-audio-clip-editor-bg);
          color: var(--compost-audio-clip-editor-text);
          font: inherit;
          outline: none;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([disabled]) { opacity: 0.55; pointer-events: none; }
        :host(:focus-visible) { outline: 2px solid currentColor; outline-offset: -2px; }
        .frame {
          position: relative;
          display: grid;
          grid-template-columns: var(--compost-audio-clip-editor-control-width) minmax(0, 1fr);
          grid-template-rows: var(--compost-audio-clip-editor-ruler-height) minmax(0, 1fr);
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          border: 1px solid currentColor;
          overflow: hidden;
        }
        .corner {
          grid-column: 1;
          grid-row: 1;
          box-sizing: border-box;
          display: grid;
          align-content: center;
          gap: 0.15em;
          border-right: 1px solid var(--compost-audio-clip-editor-line);
          padding: 0.35em 0.5em;
          min-width: 0;
        }
        .corner-label,
        .gain-value {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .corner-label { font-size: 0.73em; }
        .gain-value {
          color: var(--compost-audio-clip-editor-muted);
          font-size: 0.73em;
          font-variant-numeric: lining-nums tabular-nums;
        }
        .rulerwrap { grid-column: 2; grid-row: 1; position: relative; overflow: hidden; }
        .ruler { position: absolute; top: 0; bottom: 0; left: 0; touch-action: none; }
        .ruler::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.15em;
          background: Canvas;
          border-bottom: 1px solid var(--compost-audio-clip-editor-line);
          pointer-events: none;
        }
        .ruler .bn {
          position: absolute;
          top: 0.15em;
          z-index: 2;
          height: 0.73em;
          padding: 0.05em 0.25em 0.05em 0.2em;
          background: Canvas;
          color: var(--compost-audio-clip-editor-text);
          font-size: 0.73em;
          line-height: 1;
          white-space: nowrap;
          pointer-events: none;
        }
        .ruler .rt {
          position: absolute;
          top: 1.15em;
          bottom: 0;
          width: 1px;
          background: var(--compost-audio-clip-editor-line);
          pointer-events: none;
        }
        .ruler .rt.beat { top: 0.9em; background: color-mix(in srgb, currentColor 18%, transparent); }
        .ruler .rt.pulse { top: 0.82em; background: color-mix(in srgb, currentColor 24%, transparent); }
        .ruler .rt.bar { top: 0.75em; background: var(--compost-audio-clip-editor-bar-line); }
        .ruler-time-selection {
          position: absolute;
          bottom: 0.15em;
          z-index: 3;
          display: none;
          box-sizing: border-box;
          height: 0.45em;
          border: solid var(--compost-audio-clip-editor-select);
          border-width: 0 1px 1px;
          pointer-events: none;
        }
        .ruler-time-selection[data-cursor] {
          width: 2px !important;
          border: 0;
          background: var(--compost-audio-clip-editor-select);
        }
        .region {
          position: absolute;
          top: 1.35em;
          height: 0.7em;
          box-sizing: border-box;
          border: 0;
          padding: 0;
          background: var(--compost-audio-clip-editor-loop);
          box-shadow: inset 0 0 0 1px currentColor;
          color: inherit;
          font: inherit;
          cursor: grab;
          touch-action: none;
        }
        .handle {
          position: absolute;
          top: 1.05em;
          z-index: 3;
          width: 1.5em;
          height: 1.2em;
          cursor: col-resize;
          touch-action: none;
        }
        .range-handle { top: 1.7em; z-index: 4; width: 2em; height: 1.3em; }
        .range-handle::after {
          content: "";
          position: absolute;
          top: 0.46em;
          width: 0;
          height: 0;
          border-top: 0.28em solid transparent;
          border-bottom: 0.28em solid transparent;
        }
        .range-handle.start::after { left: 1px; border-left: 0.45em solid var(--compost-audio-clip-editor-range); }
        .range-handle.end::after { right: 1px; border-right: 0.45em solid var(--compost-audio-clip-editor-range); }
        .handle:focus-visible, .region:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
        :host([data-marker-drag]) .region,
        :host([data-marker-drag]) .handle { cursor: grabbing; }
        :host(:not([loop])) .region,
        :host(:not([loop])) .loop-handle,
        :host(:not([loop])) .timeline-line.loop { display: none; }
        .gain {
          grid-column: 1;
          grid-row: 2;
          display: grid;
          align-content: center;
          gap: 0.6em;
          box-sizing: border-box;
          min-height: 0;
          border-right: 1px solid var(--compost-audio-clip-editor-line);
          padding: 0.5em;
        }
        .gain label {
          color: var(--compost-audio-clip-editor-muted);
          font-size: 0.73em;
          text-align: center;
        }
        .gain input {
          box-sizing: border-box;
          width: 100%;
          min-height: 1.5em;
          margin: 0;
          accent-color: var(--compost-audio-clip-editor-signal);
          cursor: ew-resize;
          touch-action: none;
        }
        .gridwrap {
          grid-column: 2;
          grid-row: 2;
          position: relative;
          min-height: 0;
          overflow: hidden;
          background: var(--compost-audio-clip-editor-bg);
          touch-action: none;
        }
        compost-waveform {
          position: absolute;
          inset: 0;
          height: 100%;
          min-height: 0;
          --compost-waveform-bg: transparent;
          --compost-waveform-line: transparent;
          --compost-waveform-signal: var(--compost-audio-clip-editor-signal);
          pointer-events: none;
        }
        .grid { position: absolute; top: 0; bottom: 0; left: 0; pointer-events: none; }
        .gl { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--compost-audio-clip-editor-line); }
        .gl.beat { background: color-mix(in srgb, currentColor 18%, transparent); }
        .gl.pulse { background: color-mix(in srgb, currentColor 24%, transparent); }
        .gl.bar { background: var(--compost-audio-clip-editor-bar-line); }
        .outside {
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 1;
          background: var(--compost-audio-clip-editor-past);
          pointer-events: none;
        }
        .time-selection {
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 2;
          display: none;
          box-sizing: border-box;
          border: solid var(--compost-audio-clip-editor-select);
          border-width: 0 1px;
          background: var(--compost-audio-clip-editor-time-selection);
          pointer-events: none;
        }
        .time-selection[data-cursor] {
          width: 2px !important;
          border: 0;
          background: var(--compost-audio-clip-editor-select);
        }
        .timeline-line {
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 3;
          width: 1px;
          background: var(--compost-audio-clip-editor-range);
          pointer-events: none;
        }
        .timeline-line.loop { width: 2px; background: var(--compost-audio-clip-editor-loop); }
        .playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 4;
          display: none;
          width: 1px;
          background: var(--compost-audio-clip-editor-playhead);
          box-shadow: -1px 0 Canvas, 1px 0 Canvas;
          pointer-events: none;
        }
        .division {
          position: absolute;
          right: 0.55em;
          bottom: 0.36em;
          z-index: 5;
          padding: 0 0.2em;
          background: var(--compost-audio-clip-editor-bg);
          color: var(--compost-audio-clip-editor-muted);
          font-size: 0.82em;
          pointer-events: none;
        }
        .drop {
          position: absolute;
          inset: 0;
          z-index: 7;
          display: none;
          place-items: center;
          border: 2px solid var(--compost-audio-clip-editor-signal);
          background: color-mix(in srgb, Canvas 84%, transparent);
          color: currentColor;
          font-size: 0.82em;
          pointer-events: none;
        }
        :host([data-file-drag]) .drop { display: grid; }
      </style>
      <div class="frame" part="frame">
        <div class="corner" part="corner">
          <span class="corner-label">Gain</span>
          <output class="gain-value">0.0 dB</output>
        </div>
        <div class="rulerwrap" part="ruler">
          <div class="ruler">
            <div class="handle start range-handle" part="range-start" role="slider" tabindex="0"></div>
            <div class="handle end range-handle" part="range-end" role="slider" tabindex="0"></div>
            <button class="region" part="loop" type="button" aria-label="Move loop region"></button>
            <div class="handle start loop-handle" part="loop-start" role="slider" tabindex="0"></div>
            <div class="handle end loop-handle" part="loop-end" role="slider" tabindex="0"></div>
            <div class="ruler-time-selection" part="time-selection-ruler"></div>
          </div>
        </div>
        <div class="gain" part="gain">
          <input type="range" min="-90" max="24" step="0.1" value="0" aria-label="Clip gain">
          <label>Drag to set</label>
        </div>
        <div class="gridwrap" part="waveform">
          <compost-waveform></compost-waveform>
          <div class="grid"></div>
          <div class="outside before" part="before"></div>
          <div class="outside past" part="past"></div>
          <div class="time-selection" part="time-selection"></div>
          <div class="timeline-line range-start-line" part="range-start-line"></div>
          <div class="timeline-line range-end-line" part="range-end-line"></div>
          <div class="timeline-line loop loop-start-line" part="loop-start-line"></div>
          <div class="timeline-line loop loop-end-line" part="loop-end-line"></div>
          <div class="playhead" part="playhead"></div>
          <div class="division" part="division"></div>
          <div class="drop" part="drop">Drop audio file</div>
        </div>
      </div>`;

		/** @param {string} selector @returns {HTMLElement} */
		const part = (selector) =>
			/** @type {HTMLElement} */ (this.root.querySelector(selector));
		this.ruler = part(".ruler");
		this.gridWrap = part(".gridwrap");
		this.gridElement = part(".grid");
		const waveform = this.root.querySelector("compost-waveform");
		if (!(waveform instanceof CompostWaveform))
			throw new Error("compost-audio-clip-editor needs its waveform");
		this.waveform = waveform;
		this.rangeStartHandle = part(".range-handle.start");
		this.rangeEndHandle = part(".range-handle.end");
		this.loopRegion = part(".region");
		this.loopStartHandle = part(".loop-handle.start");
		this.loopEndHandle = part(".loop-handle.end");
		this.rulerTimeSelection = part(".ruler-time-selection");
		this.before = part(".outside.before");
		this.past = part(".outside.past");
		this.timeSelectionElement = part(".time-selection");
		this.rangeStartLine = part(".range-start-line");
		this.rangeEndLine = part(".range-end-line");
		this.loopStartLine = part(".loop-start-line");
		this.loopEndLine = part(".loop-end-line");
		this.playheadElement = part(".playhead");
		this.division = part(".division");
		this.gainInput = /** @type {HTMLInputElement} */ (
			this.root.querySelector('.gain input[type="range"]')
		);
		this.gainValue = /** @type {HTMLOutputElement} */ (
			this.root.querySelector(".gain-value")
		);

		for (const [element, kind] of [
			[this.rangeStartHandle, "range-start"],
			[this.rangeEndHandle, "range-end"],
			[this.loopStartHandle, "loop-start"],
			[this.loopEndHandle, "loop-end"],
			[this.loopRegion, "loop-move"],
		]) {
			element.addEventListener("pointerdown", (event) =>
				this.startMarkerDrag(/** @type {PointerEvent} */ (event), kind),
			);
			element.addEventListener("keydown", (event) =>
				this.handleMarkerKey(/** @type {KeyboardEvent} */ (event), kind),
			);
		}
		this.ruler.addEventListener("pointermove", (event) =>
			this.moveMarkerDrag(/** @type {PointerEvent} */ (event)),
		);
		this.ruler.addEventListener("pointerup", (event) =>
			this.endMarkerDrag(/** @type {PointerEvent} */ (event), true),
		);
		this.ruler.addEventListener("pointercancel", (event) =>
			this.endMarkerDrag(/** @type {PointerEvent} */ (event), false),
		);
		for (const target of [this.ruler, this.gridWrap]) {
			target.addEventListener("pointerdown", (event) => {
				const pointer = /** @type {PointerEvent} */ (event);
				if (!this.startNavigation(pointer)) this.startTimeSelection(pointer);
			});
			target.addEventListener("pointermove", (event) => {
				const pointer = /** @type {PointerEvent} */ (event);
				if (!this.moveNavigation(pointer))
					this.handleTimeSelectionPointer(pointer);
			});
			target.addEventListener("pointerup", (event) => {
				const pointer = /** @type {PointerEvent} */ (event);
				if (!this.endNavigation(pointer))
					this.handleTimeSelectionPointer(pointer);
			});
			target.addEventListener("pointercancel", (event) => {
				const pointer = /** @type {PointerEvent} */ (event);
				if (!this.endNavigation(pointer))
					this.handleTimeSelectionPointer(pointer);
			});
			target.addEventListener("wheel", (event) => this.handleWheel(event), {
				passive: false,
			});
		}
		this.gainInput.addEventListener("input", () => {
			this.setAttribute("gain", this.gainInput.value);
			this.emitGain("gain-input");
		});
		this.gainInput.addEventListener("change", () =>
			this.emitGain("gain-change"),
		);
		this.gridWrap.addEventListener("dragenter", (event) =>
			this.handleFileDrag(event),
		);
		this.gridWrap.addEventListener("dragover", (event) =>
			this.handleFileDrag(event),
		);
		this.gridWrap.addEventListener("dragleave", (event) => {
			if (
				!this.gridWrap.contains(/** @type {DragEvent} */ (event).relatedTarget)
			)
				this.removeAttribute("data-file-drag");
		});
		this.gridWrap.addEventListener("drop", (event) =>
			this.handleFileDrop(event),
		);

		this.refresh = this.refresh.bind(this);
		this.handleWindowKey = this.handleWindowKey.bind(this);
		this.resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(this.refresh)
				: null;
	}

	connectedCallback() {
		this.setAttribute("role", "group");
		if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
		this.readAttributes();
		this.resizeObserver?.observe(this);
		window.addEventListener("keydown", this.handleWindowKey, true);
		this.refresh();
	}

	disconnectedCallback() {
		this.resizeObserver?.disconnect();
		window.removeEventListener("keydown", this.handleWindowKey, true);
	}

	/** @param {string} name */
	attributeChangedCallback(name) {
		if (name === "playhead") {
			this.playhead = this.hasAttribute("playhead")
				? clamp(numberAttr(this, "playhead", 0), 0, this.beats)
				: null;
			this.renderPlayhead();
			return;
		}
		if (name === "gain") {
			this._gainDb = clamp(numberAttr(this, "gain", this._gainDb), -90, 24);
			if (this.gainInput && Number(this.gainInput.value) !== this._gainDb)
				this.gainInput.value = String(this._gainDb);
			if (this.gainValue) this.gainValue.textContent = this.gainText;
			return;
		}
		if (["start", "end", "loop-start", "loop-end"].includes(name)) {
			Object.assign(this, this.markersFromAttributes());
			this.renderRanges();
			return;
		}
		this.readAttributes();
		this.refresh();
	}

	readAttributes() {
		this.label = this.getAttribute("label")?.trim() || "Audio clip";
		this.setAttribute("aria-label", this.label);
		this.beats = Math.max(MIN_TIME, numberAttr(this, "beats", this.beats));
		if (this._timeSelection)
			this._timeSelection = normalizeTimeRange(
				this._timeSelection.start,
				this._timeSelection.end,
				this.beats,
			);
		Object.assign(this, this.markersFromAttributes());
		this.loopEnabled = this.hasAttribute("loop");
		this._gainDb = clamp(numberAttr(this, "gain", this._gainDb), -90, 24);
		this.playhead = this.hasAttribute("playhead")
			? clamp(numberAttr(this, "playhead", 0), 0, this.beats)
			: null;
		const meter = timeSignatureOf(this.getAttribute("time-signature"));
		this.timeSignature = meter.text;
		this.beatsPerBar = meter.barLength;
		this.beatLength = meter.beatLength;
		this.pulseLength = meter.pulseLength;
		this.grid = this.getAttribute("grid")?.trim() || "1/16";
		this.adaptiveGrid = this.hasAttribute("adaptive-grid");
		this.gridLines = this.getAttribute("grid-lines") !== "off";
		this.snapMode = this.getAttribute("snap") === "off" ? "off" : "grid";
		if (this.gainInput && Number(this.gainInput.value) !== this._gainDb)
			this.gainInput.value = String(this._gainDb);
		if (this.gainInput)
			this.gainInput.disabled = this.disabled || this.readonly;
		if (this.gainValue) this.gainValue.textContent = this.gainText;
	}

	get gain() {
		return this._gainDb;
	}

	set gain(value) {
		this.setAttribute("gain", String(clamp(Number(value) || 0, -90, 24)));
	}

	get readonly() {
		return this.hasAttribute("readonly") || this.hasAttribute("disabled");
	}

	set readonly(value) {
		this.toggleAttribute("readonly", Boolean(value));
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set disabled(value) {
		this.toggleAttribute("disabled", Boolean(value));
	}

	get peaks() {
		return this._peaks.map((peak) => ({ ...peak }));
	}

	set peaks(value) {
		this.waveform.peaks = value;
		this._peaks = this.waveform.peaks;
	}

	get timeSelection() {
		return this._timeSelection ? { ...this._timeSelection } : null;
	}

	/** Restore or clear the host-owned time selection or collapsed edit cursor. */
	/** @param {number|null} start @param {number|null} end */
	setTimeSelection(start, end) {
		this._timeSelection = normalizeTimeRange(start, end, this.beats);
		this.renderTimeSelection();
	}

	get pxPerBeat() {
		const width = this.gridWrap?.clientWidth || 400;
		return Math.max(width / this.beats, this.zoomPxPerBeat);
	}

	get maxOffset() {
		return Math.max(0, this.beats * this.pxPerBeat - this.gridWrap.clientWidth);
	}

	get step() {
		return gridStepForView(
			this.beatsPerBar,
			this.grid,
			this.pxPerBeat,
			this.adaptiveGrid,
		);
	}

	get markerEpsilon() {
		return Math.min(0.001, this.beats / 1000);
	}

	get gainText() {
		return `${this._gainDb.toFixed(1)} dB`;
	}

	zoomReset() {
		this.zoomPxPerBeat = 0;
		this.offset = 0;
		this.refresh();
	}

	markersFromAttributes() {
		return this.normaliseMarkers(
			{
				rangeStart: numberAttr(this, "start", 0),
				rangeEnd: numberAttr(this, "end", this.beats),
				loopStart: numberAttr(this, "loop-start", 0),
				loopEnd: numberAttr(this, "loop-end", this.beats),
			},
			"refresh",
		);
	}

	/** @param {number} start @param {number} end @param {boolean} [shouldEmit] */
	setRange(start, end, shouldEmit = false) {
		const markers = this.normaliseMarkers(
			{
				rangeStart: Number(start),
				rangeEnd: Number(end),
				loopStart: this.loopStart,
				loopEnd: this.loopEnd,
			},
			"refresh",
		);
		this.writeMarkers(markers);
		if (shouldEmit) this.emitRange("range-change");
	}

	/** @param {number} start @param {number} end @param {boolean} [shouldEmit] */
	setLoop(start, end, shouldEmit = false) {
		const markers = this.normaliseMarkers(
			{
				rangeStart: this.rangeStart,
				rangeEnd: this.rangeEnd,
				loopStart: Number(start),
				loopEnd: Number(end),
			},
			"refresh",
		);
		this.writeMarkers(markers);
		if (shouldEmit) this.emitLoop("loop-change");
	}

	/** @param {number} gain @param {boolean} [shouldEmit] */
	setGain(gain, shouldEmit = false) {
		const value = clamp(Number(gain) || 0, -90, 24);
		this.setAttribute("gain", String(value));
		if (shouldEmit) this.emitGain("gain-change");
	}

	/**
	 * @param {{rangeStart: number, rangeEnd: number, loopStart: number, loopEnd: number}} input
	 * @param {'range-start'|'range-end'|'loop-start'|'loop-end'|'refresh'} changed
	 */
	normaliseMarkers(input, changed) {
		const values = { ...input };
		const epsilon = this.markerEpsilon;
		for (const name of ["rangeStart", "rangeEnd", "loopStart", "loopEnd"])
			if (!Number.isFinite(values[name]))
				values[name] = name.endsWith("End") ? this.beats : 0;
		values.rangeStart = clamp(
			values.rangeStart,
			0,
			Math.max(0, this.beats - epsilon),
		);
		values.rangeEnd = clamp(
			values.rangeEnd,
			values.rangeStart + epsilon,
			this.beats,
		);
		if (changed === "range-start")
			values.rangeStart = Math.min(
				values.rangeStart,
				values.rangeEnd - epsilon,
			);
		if (changed === "range-end")
			values.rangeEnd = Math.max(values.rangeEnd, values.rangeStart + epsilon);
		values.loopStart = clamp(
			values.loopStart,
			values.rangeStart,
			values.rangeEnd - epsilon,
		);
		values.loopEnd = clamp(
			values.loopEnd,
			values.loopStart + epsilon,
			values.rangeEnd,
		);
		if (changed === "loop-start")
			values.loopStart = Math.min(values.loopStart, values.loopEnd - epsilon);
		if (changed === "loop-end")
			values.loopEnd = Math.max(values.loopEnd, values.loopStart + epsilon);
		return values;
	}

	/** @param {{rangeStart: number, rangeEnd: number, loopStart: number, loopEnd: number}} markers */
	writeMarkers(markers) {
		for (const [name, value] of [
			["start", markers.rangeStart],
			["end", markers.rangeEnd],
			["loop-start", markers.loopStart],
			["loop-end", markers.loopEnd],
		])
			if (this.getAttribute(name) !== String(value))
				this.setAttribute(name, String(value));
	}

	/** @param {number} clientX @param {boolean} [invert] */
	beatAtPoint(clientX, invert = false) {
		const bounds = this.gridWrap.getBoundingClientRect();
		const beat = (this.offset + clientX - bounds.left) / this.pxPerBeat;
		return this.snapBeat(beat, invert);
	}

	/** @param {PointerEvent} event */
	startNavigation(event) {
		if (event.pointerType !== "touch") return false;
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (this.pointers.size < 2) return false;
		if (this.drag) this.cancelMarkerDrag();
		if (this.selectionDrag) this.cancelTimeSelectionDrag();
		this.startPinch();
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	/** @param {PointerEvent} event */
	moveNavigation(event) {
		if (event.pointerType !== "touch" || !this.pointers.has(event.pointerId))
			return false;
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (!this.pinch) return false;
		this.movePinch();
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	/** @param {PointerEvent} event */
	endNavigation(event) {
		if (event.pointerType !== "touch" || !this.pointers.has(event.pointerId))
			return false;
		const navigating = Boolean(this.pinch);
		this.pointers.delete(event.pointerId);
		if (this.pointers.size === 0) this.pinch = null;
		if (navigating) {
			event.preventDefault();
			event.stopPropagation();
		}
		return navigating;
	}

	startPinch() {
		const [first, second] = [...this.pointers.values()];
		if (!second) return;
		const centerX = (first.x + second.x) / 2;
		const rect = this.gridWrap.getBoundingClientRect();
		this.pinch = {
			xDistance: Math.max(MIN_PINCH_SPAN, Math.abs(second.x - first.x)),
			pxPerBeat: this.pxPerBeat,
			beat: (this.offset + centerX - rect.left) / this.pxPerBeat,
		};
	}

	movePinch() {
		if (!this.pinch || this.pointers.size < 2) return;
		const [first, second] = [...this.pointers.values()];
		const centerX = (first.x + second.x) / 2;
		const xDistance = Math.max(MIN_PINCH_SPAN, Math.abs(second.x - first.x));
		const width = this.gridWrap.clientWidth;
		const fit = width / this.beats;
		this.zoomPxPerBeat = clamp(
			(this.pinch.pxPerBeat * xDistance) / this.pinch.xDistance,
			fit,
			MAX_PX_PER_BEAT,
		);
		const rect = this.gridWrap.getBoundingClientRect();
		this.offset = clamp(
			this.pinch.beat * this.pxPerBeat - (centerX - rect.left),
			0,
			this.maxOffset,
		);
		this.refresh();
	}

	/** @param {PointerEvent} event */
	startTimeSelection(event) {
		if (
			event.button !== 0 ||
			this.readonly ||
			this.drag ||
			this.selectionDrag ||
			event
				.composedPath()
				.some(
					(node) =>
						node instanceof HTMLElement &&
						(node.classList.contains("handle") ||
							node.classList.contains("region")),
				)
		)
			return;
		const target = /** @type {HTMLElement} */ (event.currentTarget);
		event.preventDefault();
		this.focus({ preventScroll: true });
		this.selectionDrag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startBeat: this.beatAtPoint(
				event.clientX,
				event.metaKey || event.ctrlKey,
			),
			moved: false,
			target,
			origin: this.timeSelection,
		};
		if (event.isTrusted) target.setPointerCapture(event.pointerId);
	}

	/** @param {PointerEvent} event */
	handleTimeSelectionPointer(event) {
		const drag = this.selectionDrag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (event.type === "pointermove") {
			if (!drag.moved && Math.abs(event.clientX - drag.startX) <= DRAG_SLOP)
				return;
			drag.moved = true;
			const end = this.beatAtPoint(
				event.clientX,
				event.metaKey || event.ctrlKey,
			);
			drag.preview = normalizeTimeRange(drag.startBeat, end, this.beats) ?? {
				start: drag.startBeat,
				end,
			};
			this.renderTimeSelection(drag.preview);
			this.emit("time-select-input", drag.preview);
			return;
		}
		this.selectionDrag = null;
		if (event.type === "pointercancel") {
			this.renderTimeSelection();
			return;
		}
		const beat = this.beatAtPoint(
			event.clientX,
			event.metaKey || event.ctrlKey,
		);
		const extend = event.shiftKey || event.metaKey || event.ctrlKey;
		const next =
			drag.moved && drag.preview
				? drag.preview
				: extend && drag.origin
					? normalizeTimeRange(
							Math.min(drag.origin.start, beat),
							Math.max(drag.origin.end, beat),
							this.beats,
						)
					: normalizeTimeRange(beat, beat, this.beats);
		this._timeSelection = next;
		this.renderTimeSelection();
		if (next) this.emit("time-select", next);
	}

	cancelTimeSelectionDrag() {
		const drag = this.selectionDrag;
		if (!drag) return;
		this.selectionDrag = null;
		this.renderTimeSelection();
		if (drag.target.hasPointerCapture?.(drag.pointerId))
			drag.target.releasePointerCapture(drag.pointerId);
	}

	/** @param {PointerEvent} event @param {string} kind */
	startMarkerDrag(event, kind) {
		if (
			event.button !== 0 ||
			this.readonly ||
			this.disabled ||
			this.drag ||
			this.selectionDrag
		)
			return;
		event.preventDefault();
		this.drag = {
			pointerId: event.pointerId,
			kind,
			startX: event.clientX,
			pxPerBeat: this.pxPerBeat,
			rangeStart: this.rangeStart,
			rangeEnd: this.rangeEnd,
			loopStart: this.loopStart,
			loopEnd: this.loopEnd,
		};
		this.ruler.setPointerCapture(event.pointerId);
		this.setAttribute("data-marker-drag", kind);
	}

	/** @param {PointerEvent} event */
	moveMarkerDrag(event) {
		if (!this.drag || event.pointerId !== this.drag.pointerId) return;
		const factor = event.shiftKey ? 0.1 : 1;
		const delta =
			((event.clientX - this.drag.startX) / this.drag.pxPerBeat) * factor;
		const start =
			this.drag.kind === "range-start"
				? this.drag.rangeStart
				: this.drag.kind === "range-end"
					? this.drag.rangeEnd
					: this.drag.kind === "loop-end"
						? this.drag.loopEnd
						: this.drag.loopStart;
		const beat = this.snapBeat(start + delta, event.metaKey || event.ctrlKey);
		this.applyMarker(this.drag.kind, beat, "input");
	}

	/** @param {PointerEvent} event @param {boolean} commit */
	endMarkerDrag(event, commit) {
		if (!this.drag || event.pointerId !== this.drag.pointerId) return;
		const previous = this.drag;
		const { kind } = previous;
		this.drag = null;
		this.removeAttribute("data-marker-drag");
		if (!commit) {
			this.writeMarkers(previous);
			return;
		}
		const changed =
			Math.abs(previous.rangeStart - this.rangeStart) > MIN_TIME ||
			Math.abs(previous.rangeEnd - this.rangeEnd) > MIN_TIME ||
			Math.abs(previous.loopStart - this.loopStart) > MIN_TIME ||
			Math.abs(previous.loopEnd - this.loopEnd) > MIN_TIME;
		if (!changed) return;
		if (kind.startsWith("range")) this.emitRange("range-change");
		else this.emitLoop("loop-change");
	}

	cancelMarkerDrag() {
		if (!this.drag) return;
		const previous = this.drag;
		this.drag = null;
		this.removeAttribute("data-marker-drag");
		this.writeMarkers(previous);
		if (this.ruler.hasPointerCapture?.(previous.pointerId))
			this.ruler.releasePointerCapture(previous.pointerId);
	}

	/** @param {KeyboardEvent} event */
	handleWindowKey(event) {
		if (event.key !== "Escape") return;
		if (
			!this.drag &&
			!this.selectionDrag &&
			(!this._timeSelection || !event.composedPath().includes(this))
		)
			return;
		event.preventDefault();
		event.stopPropagation();
		if (this.drag) this.cancelMarkerDrag();
		else if (this.selectionDrag) this.cancelTimeSelectionDrag();
		else {
			this.setTimeSelection(null, null);
			this.emit("time-select", { start: null });
		}
	}

	/** @param {KeyboardEvent} event @param {string} kind */
	handleMarkerKey(event, kind) {
		if (this.readonly || this.disabled) return;
		const direction =
			event.key === "ArrowLeft" || event.key === "ArrowDown"
				? -1
				: event.key === "ArrowRight" || event.key === "ArrowUp"
					? 1
					: 0;
		if (!direction && event.key !== "Home" && event.key !== "End") return;
		event.preventDefault();
		event.stopPropagation();
		let increment =
			snapModeWith(this.snapMode, event.metaKey || event.ctrlKey) === "grid"
				? this.step
				: this.markerEpsilon;
		if (event.shiftKey) increment *= 10;
		if (event.altKey) increment /= 10;
		if (kind === "loop-move") {
			const length = this.loopEnd - this.loopStart;
			const start = clamp(
				this.loopStart + increment * direction,
				this.rangeStart,
				this.rangeEnd - length,
			);
			if (start === this.loopStart) return;
			this.setLoop(start, start + length);
			this.emitLoop("loop-input");
			this.emitLoop("loop-change");
			return;
		}
		const current =
			kind === "range-start"
				? this.rangeStart
				: kind === "range-end"
					? this.rangeEnd
					: kind === "loop-start"
						? this.loopStart
						: this.loopEnd;
		const beat =
			event.key === "Home"
				? kind.startsWith("loop")
					? this.rangeStart
					: 0
				: event.key === "End"
					? kind.startsWith("loop")
						? this.rangeEnd
						: this.beats
					: current + increment * direction;
		this.applyMarker(kind, clamp(beat, 0, this.beats), "input");
		if (kind.startsWith("range")) this.emitRange("range-change");
		else this.emitLoop("loop-change");
	}

	/** @param {string} kind @param {number} beat @param {'input'|'change'} phase */
	applyMarker(kind, beat, phase) {
		let markers = {
			rangeStart: this.rangeStart,
			rangeEnd: this.rangeEnd,
			loopStart: this.loopStart,
			loopEnd: this.loopEnd,
		};
		if (kind === "range-start") markers.rangeStart = beat;
		else if (kind === "range-end") markers.rangeEnd = beat;
		else if (kind === "loop-start") markers.loopStart = beat;
		else if (kind === "loop-end") markers.loopEnd = beat;
		else if (kind === "loop-move" && this.drag) {
			const length = this.drag.loopEnd - this.drag.loopStart;
			const start = clamp(
				beat,
				this.drag.rangeStart,
				this.drag.rangeEnd - length,
			);
			markers.loopStart = start;
			markers.loopEnd = start + length;
		}
		markers = this.normaliseMarkers(
			markers,
			kind === "loop-move" ? "refresh" : kind,
		);
		this.writeMarkers(markers);
		if (kind.startsWith("range"))
			this.emitRange(phase === "input" ? "range-input" : "range-change");
		else this.emitLoop(phase === "input" ? "loop-input" : "loop-change");
	}

	/** @param {number} beat @param {boolean} invert */
	snapBeat(beat, invert) {
		if (snapModeWith(this.snapMode, invert) === "off")
			return clamp(beat, 0, this.beats);
		return clamp(Math.round(beat / this.step) * this.step, 0, this.beats);
	}

	/** Command/Ctrl zooms time; Shift or a horizontal wheel pans time. */
	/** @param {WheelEvent} event */
	handleWheel(event) {
		const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
		if (event.metaKey || event.ctrlKey) {
			const delta = horizontal ? event.deltaX : event.deltaY;
			if (!delta) return;
			event.preventDefault();
			const width = this.gridWrap.clientWidth;
			const rect = this.gridWrap.getBoundingClientRect();
			const x = clamp(event.clientX - rect.left, 0, width);
			const old = this.pxPerBeat;
			const at = (this.offset + x) / old;
			this.zoomPxPerBeat = clamp(
				old * (delta > 0 ? 0.86 : 1.16),
				width / this.beats,
				MAX_PX_PER_BEAT,
			);
			this.offset = clamp(at * this.pxPerBeat - x, 0, this.maxOffset);
			this.refresh();
			return;
		}
		if (!event.shiftKey && !horizontal) return;
		const delta = event.deltaX || event.deltaY;
		if (!delta) return;
		event.preventDefault();
		this.offset = clamp(this.offset + delta, 0, this.maxOffset);
		this.refresh();
	}

	/** @param {Event} event */
	handleFileDrag(event) {
		if (this.readonly) return;
		const transfer = /** @type {DragEvent} */ (event).dataTransfer;
		if (!transfer?.types.includes("Files")) return;
		event.preventDefault();
		transfer.dropEffect = "copy";
		this.setAttribute("data-file-drag", "");
	}

	/** @param {Event} event */
	handleFileDrop(event) {
		if (this.readonly) return;
		event.preventDefault();
		this.removeAttribute("data-file-drag");
		const file = /** @type {DragEvent} */ (event).dataTransfer?.files?.[0];
		if (file?.type.startsWith("audio/")) this.emit("audio-file-drop", { file });
	}

	/** @param {string} name @param {object} detail */
	emit(name, detail) {
		this.dispatchEvent(
			new CustomEvent(name, { detail, bubbles: true, composed: true }),
		);
	}

	/** @param {'range-input'|'range-change'} name */
	emitRange(name) {
		this.emit(name, { start: this.rangeStart, end: this.rangeEnd });
	}

	/** @param {'loop-input'|'loop-change'} name */
	emitLoop(name) {
		this.emit(name, { start: this.loopStart, end: this.loopEnd });
	}

	/** @param {'gain-input'|'gain-change'} name */
	emitGain(name) {
		this.emit(name, { gain: this._gainDb });
	}

	refresh() {
		if (!this.isConnected || !this.gridWrap) return;
		const worldWidth = this.beats * this.pxPerBeat;
		this.offset = clamp(
			this.offset,
			0,
			Math.max(0, worldWidth - this.gridWrap.clientWidth),
		);
		this.gridElement.style.width = `${worldWidth}px`;
		this.gridElement.style.transform = `translateX(${-this.offset}px)`;
		this.waveform.setView(
			this.offset / worldWidth,
			Math.min(1, (this.offset + this.gridWrap.clientWidth) / worldWidth),
		);
		this.renderRuler();
		this.renderGrid();
		this.renderRanges();
		this.renderTimeSelection();
		this.renderPlayhead();
	}

	renderRuler() {
		const px = this.pxPerBeat;
		this.ruler.style.width = `${this.beats * px}px`;
		this.ruler.style.transform = `translateX(${-this.offset}px)`;
		for (const label of this.ruler.querySelectorAll(".bn,.rt")) label.remove();
		const fragment = document.createDocumentFragment();
		for (const { time, kind } of timeGridLines(this.beats, {
			gridStep: this.step,
			beatLength: this.beatLength,
			pulseLength: this.pulseLength,
			barLength: this.beatsPerBar,
		})) {
			const tick = document.createElement("div");
			tick.className = `rt ${kind}`;
			tick.part.add("ruler-tick");
			tick.style.left = `${time * px}px`;
			fragment.append(tick);
		}
		for (const { beat, text } of rulerLabels(
			this.beats,
			{ barLength: this.beatsPerBar, beatLength: this.beatLength },
			this.pxPerBeat,
			this.step,
		)) {
			const label = document.createElement("div");
			label.className = "bn";
			label.part.add("ruler-label");
			label.textContent = text;
			label.style.left = `${beat * px}px`;
			fragment.append(label);
		}
		this.ruler.append(fragment);
	}

	renderGrid() {
		this.gridElement.replaceChildren();
		const px = this.pxPerBeat;
		if (this.gridLines) {
			const fragment = document.createDocumentFragment();
			for (const { time, kind } of timeGridLines(this.beats, {
				gridStep: this.step,
				beatLength: this.beatLength,
				pulseLength: this.pulseLength,
				barLength: this.beatsPerBar,
			})) {
				const line = document.createElement("div");
				line.className = `gl ${kind}`;
				line.part.add("grid-line");
				line.style.left = `${time * px}px`;
				fragment.append(line);
			}
			this.gridElement.append(fragment);
		}
		this.division.textContent = this.gridLines
			? gridTextForStep(this.step, this.beatsPerBar)
			: "off";
	}

	renderRanges() {
		if (!this.rangeStartHandle) return;
		const px = this.pxPerBeat;
		const viewWidth = this.gridWrap.clientWidth;
		const rangeHandle = this.rangeStartHandle.offsetWidth || 32;
		const loopHandle = this.loopStartHandle.offsetWidth || 24;
		this.rangeStartHandle.style.left = `${this.rangeStart * px - 1}px`;
		this.rangeEndHandle.style.left = `${this.rangeEnd * px - rangeHandle + 1}px`;
		this.loopRegion.style.left = `${this.loopStart * px}px`;
		this.loopRegion.style.width = `${(this.loopEnd - this.loopStart) * px}px`;
		this.loopStartHandle.style.left = `${this.loopStart * px - 1}px`;
		this.loopEndHandle.style.left = `${this.loopEnd * px - loopHandle + 1}px`;
		this.before.style.left = "0";
		this.before.style.width = `${clamp(this.rangeStart * px - this.offset, 0, viewWidth)}px`;
		this.past.style.left = `${clamp(this.rangeEnd * px - this.offset, 0, viewWidth)}px`;
		this.past.style.right = "0";
		for (const [line, beat] of [
			[this.rangeStartLine, this.rangeStart],
			[this.rangeEndLine, this.rangeEnd],
			[this.loopStartLine, this.loopStart],
			[this.loopEndLine, this.loopEnd],
		]) {
			const x = beat * px - this.offset;
			line.hidden = x < 0 || x > viewWidth;
			line.style.left = `${x}px`;
		}
		for (const [handle, label, value, minimum, maximum] of [
			[
				this.rangeStartHandle,
				"Playback start",
				this.rangeStart,
				0,
				this.rangeEnd - this.markerEpsilon,
			],
			[
				this.rangeEndHandle,
				"Playback end",
				this.rangeEnd,
				this.rangeStart + this.markerEpsilon,
				this.beats,
			],
			[
				this.loopStartHandle,
				"Loop start",
				this.loopStart,
				this.rangeStart,
				this.loopEnd - this.markerEpsilon,
			],
			[
				this.loopEndHandle,
				"Loop end",
				this.loopEnd,
				this.loopStart + this.markerEpsilon,
				this.rangeEnd,
			],
		]) {
			handle.setAttribute("aria-label", label);
			handle.setAttribute("aria-orientation", "horizontal");
			handle.setAttribute("aria-valuemin", String(minimum));
			handle.setAttribute("aria-valuemax", String(maximum));
			handle.setAttribute("aria-valuenow", String(value));
			handle.setAttribute("aria-valuetext", `${value} beats`);
		}
	}

	/** Paint a gesture preview, or the committed host-restorable selection. */
	/** @param {{start: number, end: number}|null} [selection] */
	renderTimeSelection(selection = this._timeSelection) {
		if (!this.timeSelectionElement || !this.rulerTimeSelection) return;
		if (!selection) {
			this.timeSelectionElement.style.display = "none";
			this.rulerTimeSelection.style.display = "none";
			return;
		}
		const cursor = selection.start === selection.end;
		const left = selection.start * this.pxPerBeat;
		const width = cursor
			? 2
			: (selection.end - selection.start) * this.pxPerBeat;
		for (const [element, offset] of [
			[this.timeSelectionElement, this.offset],
			[this.rulerTimeSelection, 0],
		]) {
			element.style.display = "block";
			element.style.left = `${left - offset}px`;
			element.style.width = `${width}px`;
			element.toggleAttribute("data-cursor", cursor);
		}
	}

	renderPlayhead() {
		if (!this.playheadElement) return;
		if (this.playhead === null) {
			this.playheadElement.style.display = "none";
			return;
		}
		const x = this.playhead * this.pxPerBeat - this.offset;
		this.playheadElement.style.display =
			x < 0 || x > this.gridWrap.clientWidth ? "none" : "block";
		this.playheadElement.style.left = `${x}px`;
	}
}

defineElement("compost-audio-clip-editor", CompostAudioClipEditor);
