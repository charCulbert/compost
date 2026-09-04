import { clamp, defineElement } from "../utils.js";

/** @typedef {{min: number, max: number}} WaveformPeak */

/**
 * A responsive waveform overview. The caller supplies a precomputed min/max
 * envelope; acquisition, decoding, time units and editing stay outside it.
 */
export class CompostWaveform extends HTMLElement {
	static get observedAttributes() {
		return ["label"];
	}

	constructor() {
		super();
		/** @type {WaveformPeak[]} */
		this._peaks = [];
		this._viewStart = 0;
		this._viewEnd = 1;
		this.generatedAriaLabel = "";
		this.generatedAriaDescription = "";
		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --compost-waveform-bg: Canvas;
          --compost-waveform-signal: var(--compost-accent, AccentColor);
          --compost-waveform-line: color-mix(in srgb, currentColor 30%, transparent);
          display: block;
          box-sizing: border-box;
          min-width: 0;
          min-height: 2.5em;
          height: var(--compost-waveform-height, 12em);
          contain: layout paint;
          color: inherit;
          font: inherit;
        }
        .frame {
          position: relative;
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          min-height: inherit;
          overflow: hidden;
          border: 1px solid var(--compost-waveform-line);
          border-radius: 0;
          background: var(--compost-waveform-bg);
        }
        canvas { width: 100%; height: 100%; display: block; }
        .color-probe {
          position: absolute;
          inline-size: 0;
          block-size: 0;
          overflow: hidden;
          visibility: hidden;
          color: var(--compost-waveform-signal);
        }
      </style>
      <div class="frame" part="frame">
        <canvas part="canvas" aria-hidden="true"></canvas>
        <i class="color-probe" aria-hidden="true"></i>
      </div>`;
		/** @type {HTMLElement} */
		this.frame = this.root.querySelector(".frame");
		/** @type {HTMLCanvasElement} */
		this.canvas = this.root.querySelector("canvas");
		/** @type {CanvasRenderingContext2D|null} */
		this.context = this.canvas.getContext("2d");
		this.resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(() => this.paint())
				: null;
	}

	connectedCallback() {
		if (!this.hasAttribute("role")) this.setAttribute("role", "img");
		this.refreshAccessibility();
		this.resizeObserver?.observe(this.frame);
		this.paint();
	}

	disconnectedCallback() {
		this.resizeObserver?.disconnect();
	}

	attributeChangedCallback() {
		this.refreshAccessibility();
	}

	/** Copies the peak envelope so caller mutation cannot change the display. */
	get peaks() {
		return this._peaks.map((peak) => ({ ...peak }));
	}

	set peaks(value) {
		this._peaks = Array.isArray(value)
			? value
					.filter(
						(peak) =>
							peak &&
							typeof peak === "object" &&
							Number.isFinite(Number(peak.min)) &&
							Number.isFinite(Number(peak.max)),
					)
					.map((peak) => {
						const minimum = clamp(Number(peak.min), -1, 1);
						const maximum = clamp(Number(peak.max), -1, 1);
						return {
							min: Math.min(minimum, maximum),
							max: Math.max(minimum, maximum),
						};
					})
			: [];
		this.refreshAccessibility();
		this.paint();
	}

	/** The displayed fraction of the supplied peak envelope. */
	get view() {
		return { start: this._viewStart, end: this._viewEnd };
	}

	/** Display a normalized slice without changing or copying the peak envelope. */
	/** @param {number} start @param {number} end */
	setView(start, end) {
		const nextStart = clamp(Number(start) || 0, 0, 1);
		const nextEnd = clamp(Number(end) || 0, 0, 1);
		if (!(nextEnd > nextStart)) return;
		if (nextStart === this._viewStart && nextEnd === this._viewEnd) return;
		this._viewStart = nextStart;
		this._viewEnd = nextEnd;
		this.paint();
	}

	refreshAccessibility() {
		if (
			typeof this.getAttribute !== "function" ||
			typeof this.setAttribute !== "function"
		)
			return;
		const currentLabel = this.getAttribute("aria-label");
		if (!currentLabel || currentLabel === this.generatedAriaLabel) {
			const label = this.getAttribute("label") || "Waveform";
			this.generatedAriaLabel = label;
			this.setAttribute("aria-label", label);
		}
		const current = this.getAttribute("aria-description");
		if (current && current !== this.generatedAriaDescription) return;
		const description = this._peaks.length
			? `Audio waveform overview from ${this._peaks.length} peak buckets.`
			: "Empty audio waveform overview.";
		this.generatedAriaDescription = description;
		this.setAttribute("aria-description", description);
	}

	color() {
		if (typeof getComputedStyle !== "function") return "black";
		return getComputedStyle(this.root.querySelector(".color-probe") || this)
			.color;
	}

	paint() {
		const context = this.context;
		if (!context) return;
		const rect = this.frame.getBoundingClientRect();
		const ratio = globalThis.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * ratio));
		const height = Math.max(1, Math.round(rect.height * ratio));
		if (this.canvas.width !== width) this.canvas.width = width;
		if (this.canvas.height !== height) this.canvas.height = height;
		context.clearRect(0, 0, width, height);
		if (!this._peaks.length) return;
		context.fillStyle = this.color();
		const middle = height / 2;
		const scaleY = Math.max(0, middle - 3 * ratio);
		const viewStart = this._viewStart * this._peaks.length;
		const viewLength = (this._viewEnd - this._viewStart) * this._peaks.length;
		for (let x = 0; x < width; x += 1) {
			const start = Math.min(
				this._peaks.length - 1,
				Math.floor(viewStart + (x * viewLength) / width),
			);
			const end = Math.max(
				start + 1,
				Math.ceil(viewStart + ((x + 1) * viewLength) / width),
			);
			let minimum = Infinity;
			let maximum = -Infinity;
			for (
				let index = start;
				index < end && index < this._peaks.length;
				index += 1
			) {
				minimum = Math.min(minimum, this._peaks[index].min);
				maximum = Math.max(maximum, this._peaks[index].max);
			}
			if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) continue;
			const top = middle - maximum * scaleY;
			const bottom = middle - minimum * scaleY;
			context.fillRect(x, top, 1, Math.max(1, bottom - top));
		}
	}
}

defineElement("compost-waveform", CompostWaveform);
