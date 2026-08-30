import { clamp, defineElement, numberAttr } from "../utils.js";

const styles = `
  :host {
    --scope-background: transparent;
    --scope-grid: color-mix(in srgb, currentColor 24%, transparent);
    --scope-zero: color-mix(in srgb, currentColor 30%, transparent);
    --scope-trace: currentColor;
    --scope-marker: color-mix(in srgb, currentColor 30%, transparent);
    --scope-label: color-mix(in srgb, currentColor 65%, transparent);
    --scope-border: color-mix(in srgb, currentColor 30%, transparent);
    display: block;
    height: var(--scope-height, 20em);
    min-height: 0;
    color: inherit;
    font: inherit;
    contain: layout paint;
  }

  .scope {
    position: relative;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: var(--scope-background);
  }

  .scope::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    box-sizing: border-box;
    border: 1px solid var(--scope-border);
    border-radius: inherit;
    pointer-events: none;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .wave {
    z-index: 0;
  }

  .overlay {
    z-index: 1;
  }

  .color-probes {
    position: absolute;
    inline-size: 0;
    block-size: 0;
    overflow: hidden;
    visibility: hidden;
  }

  [data-color="grid"] { color: var(--scope-grid); }
  [data-color="zero"] { color: var(--scope-zero); }
  [data-color="trace-1"] { color: var(--scope-trace); }
  [data-color="marker"] { color: var(--scope-marker); }
  [data-color="label"] {
    color: var(--scope-label);
    font: inherit;
    font-size: 0.875em;
  }
`;

const markup = `
  <div class="scope" part="scope">
    <canvas class="wave" part="wave-canvas" aria-hidden="true"></canvas>
    <canvas class="overlay" part="overlay-canvas" aria-hidden="true"></canvas>
    <span class="color-probes" part="color-probes" aria-hidden="true">
      <i data-color="grid"></i><i data-color="zero"></i>
      <i data-color="trace-1"></i><i data-color="marker"></i>
      <i data-color="label"></i>
    </span>
  </div>
`;

export class CompostScope extends HTMLElement {
	static get observedAttributes() {
		return [
			"value-range",
			"y-offset",
			"x-markers",
			"y-markers",
			"x-marker-labels",
			"y-marker-labels",
		];
	}

	constructor() {
		super();
		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `<style>${styles}</style>${markup}`;
		this.scopeElement = this.root.querySelector(".scope");
		this.waveCanvas = this.root.querySelector(".wave");
		this.overlayCanvas = this.root.querySelector(".overlay");
		this.waveCtx = this.waveCanvas.getContext("2d");
		this.overlayCtx = this.overlayCanvas.getContext("2d");

		this.valueRange = 1;
		this.yOffset = 0;
		this.xMarkers = [];
		this.yMarkers = [];
		this.xMarkerLabels = new Map();
		this.yMarkerLabels = new Map();
		this.samples = new Float32Array(0);
		this._raf = 0;
		this._overlayDirty = true;
		this._overlayState = "";
		this.generatedAriaDescription = "";
	}

	connectedCallback() {
		if (!this.hasAttribute("role")) {
			this.setAttribute("role", "img");
		}

		if (!this.hasAttribute("aria-label")) {
			this.setAttribute("aria-label", "Oscilloscope waveform display");
		}

		this.readAttributes();

		this.resizeObserver = new ResizeObserver(() => this.requestDraw());
		this.resizeObserver.observe(this.scopeElement);
		this.requestDraw();
	}

	disconnectedCallback() {
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		this.resizeObserver?.disconnect();
	}

	attributeChangedCallback(name) {
		if (name === "x-marker-labels") {
			this.xMarkerLabels = this.parseMarkerLabels(
				this.getAttribute("x-marker-labels"),
			);
			this._overlayDirty = true;
			return;
		}

		if (name === "y-marker-labels") {
			this.yMarkerLabels = this.parseMarkerLabels(
				this.getAttribute("y-marker-labels"),
			);
			this._overlayDirty = true;
			return;
		}

		this.readAttributes();
	}

	readAttributes() {
		this.valueRange = clamp(
			numberAttr(this, "value-range", this.valueRange),
			0.05,
			8,
		);
		this.yOffset = clamp(numberAttr(this, "y-offset", this.yOffset), -8, 8);
		this.xMarkers = this.parseMarkers(this.getAttribute("x-markers"));
		this.yMarkers = this.parseMarkers(this.getAttribute("y-markers"));
		this.xMarkerLabels = this.parseMarkerLabels(
			this.getAttribute("x-marker-labels"),
		);
		this.yMarkerLabels = this.parseMarkerLabels(
			this.getAttribute("y-marker-labels"),
		);
		this.refreshAccessibilityDescription();
		this._overlayDirty = true;
		this.requestDraw();
	}

	refreshAccessibilityDescription() {
		if (
			typeof this.getAttribute !== "function" ||
			typeof this.setAttribute !== "function"
		)
			return;

		const current = this.getAttribute("aria-description");
		if (current && current !== this.generatedAriaDescription) return;

		const minimum = this.accessibleNumber(this.yOffset - this.valueRange);
		const maximum = this.accessibleNumber(this.yOffset + this.valueRange);
		const description = `One-channel waveform; vertical range ${minimum} to ${maximum}.`;

		this.generatedAriaDescription = description;
		this.setAttribute("aria-description", description);
	}

	accessibleNumber(value) {
		return String(Number(Number(value).toPrecision(4)));
	}

	parseMarkers(value) {
		if (!value) {
			return [];
		}

		return value
			.split(",")
			.map((marker) => Number(marker.trim()))
			.filter((marker) => Number.isFinite(marker));
	}

	parseMarkerLabels(value) {
		const labels = new Map();

		if (!value) {
			return labels;
		}

		for (const item of value.split(",")) {
			const trimmedItem = item.trim();
			if (!trimmedItem) {
				continue;
			}

			const separator = trimmedItem.includes(":") ? ":" : "=";
			const [rawValue, ...rawLabel] = trimmedItem.split(separator);
			const marker = Number(rawValue.trim());
			const label =
				rawLabel.length > 0 ? rawLabel.join(separator).trim() : rawValue.trim();

			if (Number.isFinite(marker) && label) {
				labels.set(marker, label);
			}
		}

		return labels;
	}

	markerValues(markers, labels) {
		return [...new Set([...markers, ...labels.keys()])].sort((a, b) => a - b);
	}

	color(name) {
		if (typeof getComputedStyle !== "function") return "black";
		const probe = this.root.querySelector(`[data-color="${name}"]`);
		return getComputedStyle(probe || this).color;
	}

	setSamples(samples, { copy = false } = {}) {
		if (this.isTypedSampleArray(samples)) {
			if (samples.length === 0) {
				throw new RangeError("compost-scope.setSamples requires samples");
			}
			this.samples = copy ? samples.slice() : samples;
		} else if (
			Array.isArray(samples) &&
			samples.length > 0 &&
			samples.every((sample) => typeof sample === "number")
		) {
			this.samples = copy ? samples.slice() : samples;
		} else {
			throw new TypeError(
				"compost-scope.setSamples requires one numeric sample array",
			);
		}

		this.requestDraw();
		return this;
	}

	isTypedSampleArray(samples) {
		return (
			ArrayBuffer.isView(samples) &&
			!(samples instanceof DataView) &&
			(samples.length === 0 || typeof samples[0] === "number")
		);
	}

	requestDraw() {
		if (
			this._raf ||
			!this.isConnected ||
			typeof requestAnimationFrame !== "function"
		)
			return;
		this._raf = requestAnimationFrame((time) => {
			this._raf = 0;
			if (this.draw()) {
				this.dispatchEvent(
					new CustomEvent("scope-frame", {
						detail: { time },
						bubbles: true,
						composed: true,
					}),
				);
			}
		});
	}

	resizeCanvas() {
		const rect = this.scopeElement.getBoundingClientRect();
		const ratio = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.floor(rect.width * ratio));
		const height = Math.max(1, Math.floor(rect.height * ratio));
		let resized = false;

		for (const canvas of [this.waveCanvas, this.overlayCanvas]) {
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
				resized = true;
			}
		}

		if (resized) {
			this._overlayDirty = true;
		}

		return resized;
	}

	draw() {
		this.resizeCanvas();

		const { waveCanvas } = this;
		const width = waveCanvas.width;
		const height = waveCanvas.height;
		const midY = height * 0.5;
		const overlayState = this.overlayState(width, height);

		if (this._overlayDirty || this._overlayState !== overlayState) {
			this.drawOverlay(width, height, midY);
			this._overlayDirty = false;
			this._overlayState = overlayState;
		}

		return this.drawWave(width, height, midY);
	}

	overlayState(width, height) {
		return [
			width,
			height,
			this.valueRange,
			this.yOffset,
			this.xMarkers.join(","),
			this.yMarkers.join(","),
			[...this.xMarkerLabels].flat().join(","),
			[...this.yMarkerLabels].flat().join(","),
			this.color("grid"),
			this.color("zero"),
			this.color("marker"),
			this.color("label"),
		].join("|");
	}

	drawOverlay(width, height, midY) {
		const { overlayCtx: ctx } = this;

		ctx.clearRect(0, 0, width, height);
		this.drawGrid(width, height, midY);
		this.drawMarkers(width, height, midY);
		this.drawMarkerLabels(width, height, midY);
	}

	valueToY(value, height, midY) {
		return midY - ((value - this.yOffset) / this.valueRange) * height * 0.46;
	}

	drawGrid(width, height, midY) {
		const ctx = this.overlayCtx;

		ctx.strokeStyle = this.color("grid");
		ctx.lineWidth = 1;
		ctx.beginPath();

		for (let x = 0; x <= width; x += width / 8) {
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
		}

		for (let y = 0; y <= height; y += height / 4) {
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
		}

		ctx.stroke();

		ctx.strokeStyle = this.color("zero");
		ctx.beginPath();
		ctx.moveTo(0, midY);
		ctx.lineTo(width, midY);
		ctx.stroke();
	}

	drawMarkers(width, height, midY) {
		const ctx = this.overlayCtx;
		const xMarkerValues = this.markerValues(this.xMarkers, this.xMarkerLabels);
		const yMarkerValues = this.markerValues(this.yMarkers, this.yMarkerLabels);

		if (xMarkerValues.length === 0 && yMarkerValues.length === 0) {
			return;
		}

		ctx.strokeStyle = this.color("marker");
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 7]);
		ctx.beginPath();

		for (const position of xMarkerValues) {
			if (position < 0 || position > 1) {
				continue;
			}

			const x = position * width;
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
		}

		for (const value of yMarkerValues) {
			const y = this.valueToY(value, height, midY);
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
		}

		ctx.stroke();
		ctx.setLineDash([]);
	}

	drawMarkerLabels(width, height, midY) {
		const ctx = this.overlayCtx;

		if (this.xMarkerLabels.size === 0 && this.yMarkerLabels.size === 0) {
			return;
		}

		const ratio = window.devicePixelRatio || 1;
		const labelStyle = getComputedStyle(
			this.root.querySelector('[data-color="label"]'),
		);
		ctx.fillStyle = labelStyle.color;
		ctx.font = this.canvasFont(labelStyle, ratio);
		ctx.textBaseline = "top";

		for (const [position, label] of this.xMarkerLabels) {
			if (position < 0 || position > 1) {
				continue;
			}

			const x = position * width;
			ctx.textAlign =
				position === 0 ? "left" : position === 1 ? "right" : "center";
			ctx.fillText(label, x, 8 * ratio);
		}

		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";

		for (const [value, label] of this.yMarkerLabels) {
			const y = this.valueToY(value, height, midY);
			if (y < 0 || y > height) {
				continue;
			}

			const textY = clamp(y - 5 * ratio, 16 * ratio, height - 6 * ratio);
			ctx.fillText(label, 8 * ratio, textY);
		}
	}

	canvasFont(style, ratio) {
		const size = Number.parseFloat(style.fontSize);
		return Number.isFinite(size)
			? `${style.fontStyle} ${style.fontWeight} ${size * ratio}px ${style.fontFamily}`
			: style.font;
	}

	drawWave(width, height, midY) {
		const ctx = this.waveCtx;
		ctx.clearRect(0, 0, width, height);
		if (this.samples.length < 2) return false;

		const xStep = width / (this.samples.length - 1);
		ctx.lineWidth = Math.max(2, window.devicePixelRatio || 1);
		ctx.strokeStyle = this.color("trace-1");
		ctx.beginPath();

		for (let index = 0; index < this.samples.length; index += 1) {
			const x = index * xStep;
			const y = this.valueToY(this.samples[index], height, midY);
			if (index === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}

		ctx.stroke();
		return true;
	}
}

defineElement("compost-scope", CompostScope);
