import { clamp, defineElement, numberAttr } from "../utils.js";

const maximumHistoryValues = 4_000_000;
const maximumHistoryColumns = 65_536;

const styles = `
  :host {
    --compost-spectrogram-background: Canvas;
    --compost-spectrogram-ramp-0: Canvas;
    --compost-spectrogram-ramp-1: color-mix(in srgb, currentColor 14%, Canvas);
    --compost-spectrogram-ramp-2: color-mix(in srgb, currentColor 34%, Canvas);
    --compost-spectrogram-ramp-3: color-mix(in srgb, currentColor 66%, Canvas);
    --compost-spectrogram-ramp-4: currentColor;
    --compost-spectrogram-border: color-mix(in srgb, currentColor 30%, transparent);
    display: block;
    box-sizing: border-box;
    min-width: 0;
    min-height: 2.5em;
    height: var(--compost-spectrogram-height, 20em);
    contain: layout paint;
    color: inherit;
    font: inherit;
  }

  :host([palette="magma"]) {
    --compost-spectrogram-background: #000004;
    --compost-spectrogram-ramp-0: #000004;
    --compost-spectrogram-ramp-1: #51127c;
    --compost-spectrogram-ramp-2: #b73779;
    --compost-spectrogram-ramp-3: #fc8961;
    --compost-spectrogram-ramp-4: #fcfdbf;
  }

  :host([palette="gray-r"]) {
    --compost-spectrogram-background: #fff;
    --compost-spectrogram-ramp-0: #fff;
    --compost-spectrogram-ramp-1: #bfbfbf;
    --compost-spectrogram-ramp-2: #808080;
    --compost-spectrogram-ramp-3: #404040;
    --compost-spectrogram-ramp-4: #000;
  }

  :host([palette="coolwarm"]) {
    --compost-spectrogram-background: #3b4cc0;
    --compost-spectrogram-ramp-0: #3b4cc0;
    --compost-spectrogram-ramp-1: #8db0fe;
    --compost-spectrogram-ramp-2: #dddcdc;
    --compost-spectrogram-ramp-3: #f4987a;
    --compost-spectrogram-ramp-4: #b40426;
  }

  .frame {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: inherit;
    overflow: hidden;
    border: 1px solid var(--compost-spectrogram-border);
    border-radius: 0;
    background: var(--compost-spectrogram-background);
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .color-probes {
    position: absolute;
    inline-size: 0;
    block-size: 0;
    overflow: hidden;
    visibility: hidden;
  }

  [data-color="background"] { color: var(--compost-spectrogram-background); }
  [data-color="ramp-0"] { color: var(--compost-spectrogram-ramp-0); }
  [data-color="ramp-1"] { color: var(--compost-spectrogram-ramp-1); }
  [data-color="ramp-2"] { color: var(--compost-spectrogram-ramp-2); }
  [data-color="ramp-3"] { color: var(--compost-spectrogram-ramp-3); }
  [data-color="ramp-4"] { color: var(--compost-spectrogram-ramp-4); }
`;

const markup = `
  <div class="frame" part="frame">
    <canvas part="canvas" aria-hidden="true"></canvas>
    <span class="color-probes" aria-hidden="true">
      <i data-color="background"></i>
      <i data-color="ramp-0"></i><i data-color="ramp-1"></i>
      <i data-color="ramp-2"></i><i data-color="ramp-3"></i>
      <i data-color="ramp-4"></i>
    </span>
  </div>
`;

export class CompostSpectrogram extends HTMLElement {
	static get observedAttributes() {
		return [
			"time-span",
			"min-frequency",
			"max-frequency",
			"frequency-scale",
			"min-value",
			"max-value",
			"palette",
		];
	}

	constructor() {
		super();
		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `<style>${styles}</style>${markup}`;
		this.frame = this.root.querySelector(".frame");
		this.canvas = this.root.querySelector("canvas");
		this.context = this.canvas.getContext("2d", { alpha: false });
		this._frequencies = new Float64Array();
		this._values = new Float32Array();
		this._times = new Float64Array();
		this._steps = new Float64Array();
		this._continuous = new Uint8Array();
		this._firstColumn = 0;
		this._columnCount = 0;
		this._columnCapacity = 0;
		this._lastTime = Number.NEGATIVE_INFINITY;
		this._viewEndTime = null;
		this._dirtyStartTime = Number.POSITIVE_INFINITY;
		this._dirtyEndTime = Number.NEGATIVE_INFINITY;
		this._raf = 0;
		this._paintState = null;
		this.generatedAriaDescription = "";
		this.resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(() => this.requestDraw())
				: null;
		this.themeObserver =
			typeof MutationObserver === "function"
				? new MutationObserver(() => this.requestDraw())
				: null;
		this.colorSchemeMedia =
			typeof matchMedia === "function"
				? matchMedia("(prefers-color-scheme: dark)")
				: null;
		this.handleColorSchemeChange = () => this.requestDraw();
	}

	connectedCallback() {
		if (!this.hasAttribute("role")) this.setAttribute("role", "img");
		if (!this.hasAttribute("aria-label"))
			this.setAttribute("aria-label", "Frequency spectrogram");
		this.refreshAccessibility();
		this.resizeObserver?.observe(this.frame);
		const documentRoot = this.ownerDocument?.documentElement;
		if (documentRoot)
			this.themeObserver?.observe(documentRoot, {
				attributes: true,
				attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
			});
		this.colorSchemeMedia?.addEventListener(
			"change",
			this.handleColorSchemeChange,
		);
		this.requestDraw();
	}

	disconnectedCallback() {
		cancelAnimationFrame(this._raf);
		this._raf = 0;
		this.resizeObserver?.disconnect();
		this.themeObserver?.disconnect();
		this.colorSchemeMedia?.removeEventListener(
			"change",
			this.handleColorSchemeChange,
		);
	}

	attributeChangedCallback() {
		this._paintState = null;
		this.refreshAccessibility();
		this.requestDraw();
	}

	get frequencies() {
		return this._frequencies.slice();
	}

	set frequencies(value) {
		if (!value || typeof value.length !== "number" || value.length === 0)
			throw new TypeError(
				"compost-spectrogram.frequencies requires a numeric array",
			);
		if (value.length > maximumHistoryValues)
			throw new RangeError("compost-spectrogram has too many frequencies");

		const frequencies = Float64Array.from(value);
		for (let index = 0; index < frequencies.length; index += 1) {
			if (
				!Number.isFinite(frequencies[index]) ||
				frequencies[index] < 0 ||
				(index > 0 && frequencies[index] <= frequencies[index - 1])
			)
				throw new RangeError(
					"compost-spectrogram.frequencies must be finite, non-negative and ascending",
				);
		}

		this._frequencies = frequencies;
		this._columnCapacity = Math.max(
			1,
			Math.min(
				maximumHistoryColumns,
				Math.floor(maximumHistoryValues / frequencies.length),
			),
		);
		this._values = new Float32Array(this._columnCapacity * frequencies.length);
		this._times = new Float64Array(this._columnCapacity);
		this._steps = new Float64Array(this._columnCapacity);
		this._continuous = new Uint8Array(this._columnCapacity);
		this.clear();
	}

	get viewEndTime() {
		return this._viewEndTime;
	}

	set viewEndTime(value) {
		const next = value == null ? null : Number(value);
		if (next !== null && !Number.isFinite(next))
			throw new RangeError(
				"compost-spectrogram.viewEndTime must be finite or null",
			);
		if (Object.is(next, this._viewEndTime)) return;
		this._viewEndTime = next;
		this.requestDraw();
	}

	get retainedTimeRange() {
		if (!this._columnCount) return null;
		const first = this.columnAt(0);
		const last = this.columnAt(this._columnCount - 1);
		return {
			startTime: this._times[first] - this._steps[first] * 0.5,
			endTime: this._times[last] + this._steps[last] * 0.5,
		};
	}

	appendColumns(values, { startTime, timeStep } = {}) {
		const binCount = this._frequencies.length;
		if (!binCount)
			throw new Error(
				"compost-spectrogram.frequencies must be set before appending columns",
			);
		if (!values || typeof values.length !== "number" || values.length === 0)
			throw new TypeError(
				"compost-spectrogram.appendColumns requires numeric values",
			);
		if (values.length % binCount !== 0)
			throw new RangeError(
				"compost-spectrogram values must contain one value per frequency per column",
			);
		if (
			!Number.isFinite(startTime) ||
			!Number.isFinite(timeStep) ||
			timeStep <= 0
		)
			throw new RangeError(
				"compost-spectrogram columns require a finite startTime and positive timeStep",
			);
		if (startTime <= this._lastTime)
			throw new RangeError(
				"compost-spectrogram column times must increase; call clear() for a new stream",
			);

		const copied = Float32Array.from(values);
		for (const value of copied) {
			if (!(Number.isFinite(value) || value === Number.NEGATIVE_INFINITY))
				throw new TypeError(
					"compost-spectrogram values must be finite or negative infinity",
				);
		}

		const suppliedColumns = copied.length / binCount;
		const skipped = Math.max(0, suppliedColumns - this._columnCapacity);
		for (
			let sourceColumn = skipped;
			sourceColumn < suppliedColumns;
			sourceColumn += 1
		) {
			const ringColumn = this.nextColumn();
			const time = startTime + sourceColumn * timeStep;
			const expectedTime = this._lastTime + timeStep;
			const tolerance = Math.max(
				Number.EPSILON * Math.max(1, Math.abs(time)),
				timeStep * 1e-6,
			);
			this._continuous[ringColumn] =
				Number.isFinite(expectedTime) &&
				Math.abs(time - expectedTime) <= tolerance
					? 1
					: 0;
			this._times[ringColumn] = time;
			this._steps[ringColumn] = timeStep;
			this._dirtyStartTime = Math.min(
				this._dirtyStartTime,
				time - timeStep * 0.5,
			);
			this._dirtyEndTime = Math.max(this._dirtyEndTime, time + timeStep * 0.5);
			this._values.set(
				copied.subarray(sourceColumn * binCount, (sourceColumn + 1) * binCount),
				ringColumn * binCount,
			);
			this._lastTime = time;
		}

		this.refreshAccessibility();
		this.requestDraw();
		return this;
	}

	nextColumn() {
		if (this._columnCount < this._columnCapacity) {
			const column =
				(this._firstColumn + this._columnCount) % this._columnCapacity;
			this._columnCount += 1;
			return column;
		}

		const column = this._firstColumn;
		this._firstColumn = (this._firstColumn + 1) % this._columnCapacity;
		return column;
	}

	clear() {
		this._firstColumn = 0;
		this._columnCount = 0;
		this._lastTime = Number.NEGATIVE_INFINITY;
		this._dirtyStartTime = Number.POSITIVE_INFINITY;
		this._dirtyEndTime = Number.NEGATIVE_INFINITY;
		this._paintState = null;
		this.refreshAccessibility();
		this.requestDraw();
		return this;
	}

	requestDraw() {
		if (
			this._raf ||
			!this.isConnected ||
			typeof requestAnimationFrame !== "function"
		)
			return;
		this._raf = requestAnimationFrame(() => {
			this._raf = 0;
			this.paint();
		});
	}

	paint() {
		const context = this.context;
		if (!context) return false;
		const rect = this.frame.getBoundingClientRect();
		const ratio = globalThis.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * ratio));
		const height = Math.max(1, Math.round(rect.height * ratio));
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
			this.canvas.style.transform = "";
			this._paintState = null;
		}

		const background = this.color("background");
		if (!this._columnCount || !this._frequencies.length) {
			context.fillStyle = background.css;
			context.fillRect(0, 0, width, height);
			this.canvas.style.transform = "";
			this._paintState = null;
			return false;
		}

		const rows = this.frequencyRows(height);
		const ramp = [0, 1, 2, 3, 4].map(
			(index) => this.color(`ramp-${index}`).rgb,
		);
		const minimum = numberAttr(this, "min-value", 0);
		const requestedMaximum = numberAttr(this, "max-value", 1);
		const maximum = requestedMaximum > minimum ? requestedMaximum : minimum + 1;
		const timeSpan = Math.max(Number.EPSILON, numberAttr(this, "time-span", 5));
		const lastColumn = this.columnAt(this._columnCount - 1);
		const viewEnd =
			this._viewEndTime ??
			this._times[lastColumn] + this._steps[lastColumn] * 0.5;
		const paintKey = [
			width,
			height,
			timeSpan,
			this.getAttribute("min-frequency"),
			this.getAttribute("max-frequency"),
			this.getAttribute("frequency-scale"),
			minimum,
			maximum,
			background.css,
			...ramp.flat(),
		].join("|");

		if (
			this._paintState?.key === paintKey &&
			viewEnd >= this._paintState.viewEnd
		) {
			const exactShift =
				((viewEnd - this._paintState.viewEnd) / timeSpan) * width;
			const shift = Math.floor(exactShift);
			if (shift === 0) {
				const dirtyStartX = this.visibleDirtyStartX(
					width,
					this._paintState.viewEnd,
					timeSpan,
				);
				if (dirtyStartX !== null) {
					const strip = this.rasterColumns({
						width,
						height,
						startX: dirtyStartX,
						viewEnd: this._paintState.viewEnd,
						background,
						ramp,
						minimum,
						maximum,
						rows,
					});
					context.putImageData(strip, dirtyStartX, 0);
					this.consumeDirtyTimes(this._paintState.viewEnd);
				}
				this.setFractionalScroll(exactShift, ratio);
				return true;
			}
			if (shift < width) {
				context.drawImage(
					this.canvas,
					shift,
					0,
					width - shift,
					height,
					0,
					0,
					width - shift,
					height,
				);
				const renderedEnd =
					this._paintState.viewEnd + (shift / width) * timeSpan;
				const dirtyStartX = this.visibleDirtyStartX(
					width,
					renderedEnd,
					timeSpan,
				);
				const startX =
					dirtyStartX === null
						? width - shift
						: Math.min(width - shift, dirtyStartX);
				const strip = this.rasterColumns({
					width,
					height,
					startX,
					viewEnd: renderedEnd,
					background,
					ramp,
					minimum,
					maximum,
					rows,
				});
				context.putImageData(strip, startX, 0);
				this._paintState.viewEnd = renderedEnd;
				this.consumeDirtyTimes(renderedEnd);
				this.setFractionalScroll(exactShift - shift, ratio);
				return true;
			}
		}

		const image = this.rasterColumns({
			width,
			height,
			startX: 0,
			viewEnd,
			background,
			ramp,
			minimum,
			maximum,
			rows,
		});
		context.putImageData(image, 0, 0);
		this.canvas.style.transform = "";
		this._paintState = { key: paintKey, viewEnd };
		this.consumeDirtyTimes(viewEnd);
		return true;
	}

	rasterColumns({
		width,
		height,
		startX,
		viewEnd,
		background,
		ramp,
		minimum,
		maximum,
		rows,
	}) {
		const imageWidth = width - startX;
		const image = this.context.createImageData(imageWidth, height);
		for (let offset = 0; offset < image.data.length; offset += 4) {
			image.data[offset] = background.rgb[0];
			image.data[offset + 1] = background.rgb[1];
			image.data[offset + 2] = background.rgb[2];
			image.data[offset + 3] = 255;
		}

		const columns = this.columnsForPixels(width, viewEnd);
		const binCount = this._frequencies.length;
		for (let x = startX; x < width; x += 1) {
			const column = columns[x];
			if (column < 0) continue;
			const sourceOffset = column * binCount;
			for (let y = 0; y < height; y += 1) {
				const { lower, upper, fraction } = rows[y];
				const lowerValue = Math.max(
					minimum,
					this._values[sourceOffset + lower],
				);
				const upperValue = Math.max(
					minimum,
					this._values[sourceOffset + upper],
				);
				const value = lowerValue + (upperValue - lowerValue) * fraction;
				const pixel = (y * imageWidth + x - startX) * 4;
				this.writeRampColour(
					image.data,
					pixel,
					clamp((value - minimum) / (maximum - minimum), 0, 1),
					ramp,
				);
				image.data[pixel + 3] = 255;
			}
		}
		return image;
	}

	setFractionalScroll(devicePixels, ratio) {
		const cssPixels = Math.round((devicePixels / ratio) * 1000) / 1000;
		this.canvas.style.transform = cssPixels
			? `translateX(${-cssPixels}px)`
			: "";
	}

	visibleDirtyStartX(width, viewEnd, timeSpan) {
		if (
			this._dirtyStartTime > viewEnd ||
			this._dirtyEndTime < viewEnd - timeSpan
		)
			return null;
		return clamp(
			Math.floor(
				((this._dirtyStartTime - (viewEnd - timeSpan)) / timeSpan) * width,
			) - 1,
			0,
			width - 1,
		);
	}

	consumeDirtyTimes(viewEnd) {
		if (this._dirtyEndTime <= viewEnd) {
			this._dirtyStartTime = Number.POSITIVE_INFINITY;
			this._dirtyEndTime = Number.NEGATIVE_INFINITY;
		} else {
			this._dirtyStartTime = Math.max(this._dirtyStartTime, viewEnd);
		}
	}

	columnsForPixels(width, requestedViewEnd) {
		const result = new Int32Array(width).fill(-1);
		const lastColumn = this.columnAt(this._columnCount - 1);
		const viewEnd =
			requestedViewEnd ??
			this._times[lastColumn] + this._steps[lastColumn] * 0.5;
		const timeSpan = Math.max(Number.EPSILON, numberAttr(this, "time-span", 5));
		const viewStart = viewEnd - timeSpan;
		let offset = 0;

		for (let x = 0; x < width; x += 1) {
			const time = viewStart + ((x + 0.5) / width) * timeSpan;
			while (
				offset + 1 < this._columnCount &&
				this._times[this.columnAt(offset + 1)] <= time
			)
				offset += 1;

			let column = this.columnAt(offset);
			if (offset + 1 < this._columnCount) {
				const next = this.columnAt(offset + 1);
				const continuous = this._continuous[next] === 1;
				if (
					Math.abs(this._times[next] - time) <
					Math.abs(this._times[column] - time)
				)
					column = next;
				if (continuous) {
					result[x] = column;
					continue;
				}
			}
			if (Math.abs(this._times[column] - time) <= this._steps[column] * 0.5)
				result[x] = column;
		}

		return result;
	}

	columnAt(offset) {
		return (this._firstColumn + offset) % this._columnCapacity;
	}

	frequencyRows(height) {
		const frequencies = this._frequencies;
		const scale = ["linear", "log", "mel"].includes(
			this.getAttribute("frequency-scale"),
		)
			? this.getAttribute("frequency-scale")
			: "linear";
		const firstPositive = frequencies.find((frequency) => frequency > 0) ?? 1;
		const minimum = clamp(
			numberAttr(
				this,
				"min-frequency",
				scale === "log" ? firstPositive : frequencies[0],
			),
			scale === "log" ? firstPositive : frequencies[0],
			frequencies.at(-1),
		);
		const maximum = clamp(
			numberAttr(this, "max-frequency", frequencies.at(-1)),
			minimum,
			frequencies.at(-1),
		);

		return Array.from({ length: height }, (_, y) => {
			const fraction = 1 - (y + 0.5) / height;
			const frequency = this.frequencyAt(fraction, minimum, maximum, scale);
			let start = 0;
			let end = frequencies.length;
			while (start < end) {
				const middle = Math.floor((start + end) * 0.5);
				if (frequencies[middle] < frequency) start = middle + 1;
				else end = middle;
			}
			const upper = Math.min(frequencies.length - 1, start);
			const lower = Math.max(0, upper - 1);
			const distance = frequencies[upper] - frequencies[lower];
			return {
				lower,
				upper,
				fraction:
					distance > 0 ? (frequency - frequencies[lower]) / distance : 0,
			};
		});
	}

	frequencyAt(fraction, minimum, maximum, scale) {
		if (scale === "log") return minimum * (maximum / minimum) ** fraction;
		if (scale === "mel") {
			const low = 2595 * Math.log10(1 + minimum / 700);
			const high = 2595 * Math.log10(1 + maximum / 700);
			return 700 * (10 ** ((low + (high - low) * fraction) / 2595) - 1);
		}
		return minimum + (maximum - minimum) * fraction;
	}

	writeRampColour(data, pixel, level, ramp) {
		const position = level * (ramp.length - 1);
		const lower = Math.min(ramp.length - 1, Math.floor(position));
		const upper = Math.min(ramp.length - 1, lower + 1);
		const fraction = position - lower;
		for (let channel = 0; channel < 3; channel += 1) {
			const value = ramp[lower][channel];
			data[pixel + channel] = Math.round(
				value + (ramp[upper][channel] - value) * fraction,
			);
		}
	}

	color(name) {
		const fallback =
			name === "background" || name === "ramp-0"
				? "rgb(0, 0, 0)"
				: "rgb(255, 255, 255)";
		const probe = this.root.querySelector(`[data-color="${name}"]`);
		const css =
			typeof getComputedStyle === "function"
				? getComputedStyle(probe || this).color
				: fallback;
		const srgb = css.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/u);
		const channels = srgb
			? srgb
					.slice(1, 4)
					.map((value) => Math.round(clamp(Number(value), 0, 1) * 255))
			: css
					.match(/[\d.]+/gu)
					?.slice(0, 3)
					.map(Number);
		return { css, rgb: channels?.length === 3 ? channels : [0, 0, 0] };
	}

	refreshAccessibility() {
		if (
			typeof this.getAttribute !== "function" ||
			typeof this.setAttribute !== "function"
		)
			return;
		const current = this.getAttribute("aria-description");
		if (current && current !== this.generatedAriaDescription) return;
		const description = this._columnCount
			? `Scrolling spectrogram with ${this._frequencies.length} frequency bins over ${numberAttr(this, "time-span", 5)} seconds.`
			: "Empty frequency spectrogram.";
		this.generatedAriaDescription = description;
		this.setAttribute("aria-description", description);
	}
}

defineElement("compost-spectrogram", CompostSpectrogram);
