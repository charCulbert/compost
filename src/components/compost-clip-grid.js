import { createLongPress, DRAG_SLOP } from "../internal/gestures.js";
import { installTouchDoubleClick } from "../internal/touch-double-click.js";
import { clamp, defineElement, numberAttr } from "../utils.js";

let nextGridID = 1;
const ELLIPSIS_MIN_CHARS = 7;

/** @typedef {'stopped'|'playing'|'recording'} ClipState */
/** @typedef {{id?: string, name: string, color?: string, state?: ClipState, queued?: boolean, loop?: boolean, progress?: number}} ClipSpec */
/** @typedef {{id: string, name?: string, color?: string, armed?: boolean, recordQueuedSlot?: number|null, stopState?: ''|'active'|'queued', clips?: (ClipSpec|null)[]}} ClipGridTrack */
/** @typedef {{trackId: string, slot: number}} ClipGridPosition */

/** @param {string} fill @param {string} [stroke] */
const triangle = (fill, stroke = "none") =>
	`<svg viewBox="0 0 7 8" aria-hidden="true"><path d="M1 .5 6 4 1 7.5Z" fill="${fill}" stroke="${stroke}" stroke-linejoin="round"/></svg>`;
/** @param {string} stroke */
const ring = (stroke) =>
	`<svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" stroke="${stroke}" fill="none"/></svg>`;
/** @param {string} fill */
const dot = (fill) =>
	`<svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" fill="${fill}"/></svg>`;
/** @param {string} stroke */
const square = (stroke) =>
	`<svg viewBox="0 0 7 7" aria-hidden="true"><path d="M.9.9h5.2v5.2h-5.2z" fill="none" stroke="${stroke}" stroke-linejoin="round"/></svg>`;
const PREVIEW =
	'<svg class="preview" viewBox="0 0 25 14" aria-hidden="true"><g fill="currentColor">' +
	'<rect x="0" y="3" width="13" height="2.3"/><rect x="16" y="3" width="8" height="2.3"/>' +
	'<rect x="0" y="10" width="6" height="2.3"/></g></svg>';

/** Which slot a pointer at `y` lands in, given the rows' boxes. */
/** @param {number} y @param {DOMRect[]} rows */
export function slotIndexAt(y, rows) {
	for (let index = 0; index < rows.length; index += 1) {
		if (y >= rows[index].top && y < rows[index].bottom) return index;
	}
	return -1;
}

/** Return every occupied position in the inclusive rectangle. */
/** @param {ClipGridTrack[]} tracks @param {ClipGridPosition} anchor @param {ClipGridPosition} end */
export function rectangularClipSelection(tracks, anchor, end) {
	const firstTrack = tracks.findIndex((track) => track.id === anchor?.trackId);
	const lastTrack = tracks.findIndex((track) => track.id === end?.trackId);
	if (firstTrack < 0 || lastTrack < 0) return [];
	const left = Math.min(firstTrack, lastTrack);
	const right = Math.max(firstTrack, lastTrack);
	const top = Math.min(Number(anchor.slot), Number(end.slot));
	const bottom = Math.max(Number(anchor.slot), Number(end.slot));
	if (!Number.isInteger(top) || !Number.isInteger(bottom) || top < 0) return [];
	return tracks.slice(left, right + 1).flatMap((track) =>
		Array.from({ length: bottom - top + 1 }, (_, offset) => top + offset)
			.filter((slot) => Boolean(track.clips?.[slot]))
			.map((slot) => ({ trackId: track.id, slot })),
	);
}

/** Translate positions so their occupied top-left lands at `to`. */
/** @param {ClipGridTrack[]} tracks @param {ClipGridPosition[]} positions @param {ClipGridPosition} to */
export function translatedClipPositions(tracks, positions, to) {
	const indexes = positions
		.map((position) =>
			tracks.findIndex((track) => track.id === position.trackId),
		)
		.filter((index) => index >= 0);
	const toTrack = tracks.findIndex((track) => track.id === to?.trackId);
	if (!positions.length || !indexes.length || toTrack < 0) return [];
	const firstTrack = Math.min(...indexes);
	const firstSlot = Math.min(...positions.map((position) => position.slot));
	return positions.flatMap((position) => {
		const sourceTrack = tracks.findIndex(
			(track) => track.id === position.trackId,
		);
		const target = tracks[toTrack + sourceTrack - firstTrack];
		return target
			? [
					{
						trackId: target.id,
						slot: to.slot + position.slot - firstSlot,
					},
				]
			: [];
	});
}

/**
 * A complete multi-track clip launcher. The module draws host-owned snapshots,
 * owns rectangular selection, focus and drag geometry, and emits intents. The
 * host owns clip data, clipboard contents, IDs, collision policy and mutation.
 */
export class CompostClipGrid extends HTMLElement {
	static get observedAttributes() {
		return ["slots", "label", "disabled", "show-stop"];
	}

	constructor() {
		super();
		this.gridID = `compost-clip-grid-${nextGridID++}`;
		this.slotCount = 5;
		this.label = "Clips";
		/** @type {ClipGridTrack[]} */ this._tracks = [];
		/** @type {ClipGridPosition[]} */ this._selection = [];
		/** @type {ClipGridPosition|null} */ this._cursor = null;
		/** @type {ClipGridPosition|null} */ this.selectionAnchor = null;
		/** @type {any} */ this.drag = null;
		this.dropPositions = [];
		this.dropCopy = false;
		this.longPress = createLongPress();
		/** @type {ClipGridPosition|null} */ this.renaming = null;
		this.renameTimer = null;
		this.clickPointerType = "";
		this.ignoreClick = false;
		this.handleWindowMove = this.handleWindowMove.bind(this);
		this.handleWindowUp = this.handleWindowUp.bind(this);
		this.handleModifierKey = this.handleModifierKey.bind(this);
		this.fitNames = this.fitNames.bind(this);

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --compost-clip-grid-text: currentColor;
          --compost-clip-grid-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-clip-grid-rail: color-mix(in srgb, currentColor 30%, transparent);
          --compost-clip-grid-line: color-mix(in srgb, currentColor 18%, transparent);
          --compost-clip-grid-highlight: color-mix(in srgb, currentColor 10%, transparent);
          --compost-clip-grid-accent: var(--compost-accent, AccentColor);
          --compost-clip-grid-wash: color-mix(in srgb, var(--compost-clip-grid-accent) 18%, transparent);
          --compost-clip-grid-editor-bg: Canvas;
          --compost-clip-grid-row-height: 2.9em;
          --compost-clip-grid-column-width: 10em;
          --compost-clip-grid-font-size: .91em;
          display: block;
          min-height: 0;
          overflow: auto;
          overscroll-behavior: contain;
          color: var(--compost-clip-grid-text);
          font: inherit;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([disabled]) { opacity: .5; pointer-events: none; }
        .matrix {
          display: grid;
          grid-template-columns: repeat(var(--track-count), minmax(var(--compost-clip-grid-column-width), 1fr));
          grid-template-rows: auto repeat(var(--slot-count), var(--compost-clip-grid-row-height)) minmax(0, 1fr) var(--compost-clip-grid-row-height);
          min-height: 100%;
          min-width: max-content;
          border-left: 1px solid var(--compost-clip-grid-line);
          border-bottom: 1px solid var(--compost-clip-grid-line);
        }
        .track-header, .slot, .stop {
          position: relative;
          box-sizing: border-box;
          min-width: 0;
          border-top: 1px solid var(--compost-clip-grid-line);
          border-right: 1px solid var(--compost-clip-grid-line);
          isolation: isolate;
        }
        .track-header {
          position: sticky;
          top: 0;
          z-index: 8;
          min-height: 2em;
          padding: .35em .55em;
          overflow: hidden;
          background: Canvas;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: var(--compost-clip-grid-font-size);
        }
        .slot, .stop {
          display: flex;
          align-items: center;
          height: var(--compost-clip-grid-row-height);
          padding-right: .55em;
          outline: none;
        }
        .slot[data-highlight]::after, .slot[data-selected]::after,
        .slot[data-cursor]::before, .slot[data-drop]::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .slot[data-highlight]::after { background: var(--compost-clip-grid-highlight); z-index: 0; }
        .slot[data-selected]::after {
          z-index: 0;
          background: color-mix(in srgb, var(--compost-clip-grid-accent) 18%, transparent);
          box-shadow: inset 0 0 0 2px var(--compost-clip-grid-accent);
        }
        .slot[data-cursor]::before { z-index: 3; box-shadow: inset 0 0 0 1px currentColor; }
        .slot:focus-visible::before { z-index: 4; box-shadow: inset 0 0 0 2px currentColor; }
        .slot[data-drop="move"]::before { z-index: 5; box-shadow: inset 0 0 0 2px currentColor; }
        .slot[data-drop="copy"]::before { z-index: 5; box-shadow: inset 0 0 0 2px var(--compost-clip-grid-accent); }
        .slot > * { position: relative; z-index: 1; }
        .slot[data-dragging] { opacity: .35; }
        .progress { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--compost-clip-grid-wash); }
        .tri {
          flex: none;
          align-self: stretch;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.55em;
          border: 0;
          padding: 0;
          background: none;
          color: inherit;
          cursor: pointer;
          font: inherit;
        }
        .tri svg { display: block; width: .64em; height: .73em; }
        .tri.record svg, .tri.rec svg { width: .73em; height: .73em; }
        .tri:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
        .queue { flex: none; display: flex; align-items: center; justify-content: center; width: .8em; margin-left: auto; color: var(--compost-clip-grid-accent); }
        .queue svg { display: block; width: .48em; height: .55em; }
        .name, .empty-target {
          flex: 1 1 auto;
          min-width: 0;
          align-self: stretch;
          display: flex;
          align-items: center;
          border: 0;
          padding: 0 0 0 .45em;
          overflow: hidden;
          background: none;
          color: var(--compost-clip-grid-text);
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
          touch-action: none;
          font: inherit;
          font-size: var(--compost-clip-grid-font-size);
        }
        .empty-target { cursor: default; }
        .name:focus, .empty-target:focus { outline: none; }
        .slot[data-state="playing"] .name, .slot[data-queued] .name,
        .slot[data-state="recording"] .name, .slot[data-color] .name { color: var(--compost-clip-grid-accent); }
        .preview { flex: none; width: 2.27em; height: 1.27em; color: var(--compost-clip-grid-muted); }
        .slot[data-state="playing"] .preview { color: var(--compost-clip-grid-accent); }
        .preview[hidden] { display: none !important; }
        .editor { box-sizing: border-box; width: calc(100% - 2em); margin-left: .45em; border: 1px solid var(--compost-clip-grid-line); outline: 2px solid currentColor; outline-offset: -2px; background: var(--compost-clip-grid-editor-bg); color: var(--compost-clip-grid-text); font: inherit; font-size: var(--compost-clip-grid-font-size); -webkit-user-select: text; user-select: text; }
        .stop {
          position: sticky;
          bottom: 0;
          z-index: 7;
          background: var(--compost-clip-grid-editor-bg);
          color: var(--compost-clip-grid-muted);
        }
        .stop[data-queued] { color: var(--compost-clip-grid-accent); }
        .stop[hidden] { display: none !important; }
      </style>
      <div class="matrix" part="grid" role="grid"></div>`;
		this.matrix = /** @type {HTMLElement} */ (
			this.root.querySelector(".matrix")
		);

		this.addEventListener("click", (event) => this.handleClick(event));
		this.addEventListener("dblclick", (event) => this.handleDoubleClick(event));
		installTouchDoubleClick(this);
		this.addEventListener("contextmenu", (event) =>
			this.handleContextMenu(event),
		);
		this.addEventListener("pointerdown", (event) => this.beginDrag(event));
		this.addEventListener("keydown", (event) => this.handleKey(event));
		this.resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(this.fitNames)
				: null;
	}

	connectedCallback() {
		if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
		this.setAttribute("role", "region");
		this.readAttributes();
		this.render();
		this.resizeObserver?.observe(this);
	}

	disconnectedCallback() {
		this.resizeObserver?.disconnect();
		clearTimeout(this.renameTimer);
		this.endDrag(true);
	}

	attributeChangedCallback() {
		if (!this.isConnected) return;
		this.readAttributes();
		this.render();
	}

	readAttributes() {
		this.slotCount = clamp(
			Math.round(numberAttr(this, "slots", this.slotCount)),
			1,
			512,
		);
		this.label = this.getAttribute("label") || this.label;
		this.setAttribute("aria-label", this.label);
	}

	get tracks() {
		return this._tracks.map((track) => ({
			...track,
			clips: track.clips.map((clip) => (clip ? { ...clip } : null)),
		}));
	}

	/** @param {ClipGridTrack[]} tracks */
	setTracks(tracks) {
		const seen = new Set();
		const list = (Array.isArray(tracks) ? tracks : [])
			.map((track) => ({
				id: String(track?.id || ""),
				name: String(track?.name || track?.id || "Track"),
				color: track?.color ? String(track.color) : undefined,
				armed: Boolean(track?.armed),
				recordQueuedSlot: Number.isInteger(track?.recordQueuedSlot)
					? Number(track.recordQueuedSlot)
					: null,
				stopState:
					track?.stopState === "queued" || track?.stopState === "active"
						? track.stopState
						: "",
				clips: Array.isArray(track?.clips)
					? track.clips.map((clip) =>
							clip && typeof clip.name === "string" ? { ...clip } : null,
						)
					: [],
			}))
			.filter((track) => track.id && !seen.has(track.id) && seen.add(track.id));
		this._tracks = list;
		this.slotCount = Math.max(
			this.slotCount,
			...list.map((track) => track.clips.length),
		);
		for (const track of this._tracks)
			track.clips = Array.from(
				{ length: this.slotCount },
				(_, slot) => track.clips[slot] ?? null,
			);
		if (!this._cursor || !this.positionExists(this._cursor))
			this._cursor = this._tracks[0]
				? { trackId: this._tracks[0].id, slot: 0 }
				: null;
		this._selection = this.normalizePositions(this._selection);
		this.render();
	}

	get selection() {
		return this._selection.map((position) => ({ ...position }));
	}

	get cursor() {
		return this._cursor ? { ...this._cursor } : null;
	}

	/** @param {ClipGridPosition[]} positions @param {ClipGridPosition|null} [cursor] */
	setSelection(positions, cursor = null) {
		this._selection = this.normalizePositions(positions);
		if (cursor && this.positionExists(cursor)) this._cursor = { ...cursor };
		else if (this._selection.length)
			this._cursor = { ...this._selection.at(-1) };
		this.selectionAnchor = this._cursor ? { ...this._cursor } : null;
		this.paintSelection();
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}
	set disabled(value) {
		this.toggleAttribute("disabled", Boolean(value));
	}

	/** @param {ClipGridPosition[]} positions */
	normalizePositions(positions) {
		const seen = new Set();
		return (Array.isArray(positions) ? positions : []).flatMap((position) => {
			const normalized = {
				trackId: String(position?.trackId || ""),
				slot: Number(position?.slot),
			};
			const key = this.positionKey(normalized);
			return this.positionExists(normalized) && !seen.has(key) && seen.add(key)
				? [normalized]
				: [];
		});
	}

	/** @param {ClipGridPosition} position */
	positionExists(position) {
		return (
			this._tracks.some((track) => track.id === position?.trackId) &&
			Number.isInteger(position?.slot) &&
			position.slot >= 0 &&
			position.slot < this.slotCount
		);
	}

	/** @param {ClipGridPosition} position */
	positionKey(position) {
		return `${position.trackId}\u0000${position.slot}`;
	}

	/** @param {ClipGridPosition} position */
	clipAt(position) {
		return (
			this._tracks.find((track) => track.id === position?.trackId)?.clips[
				position?.slot
			] ?? null
		);
	}

	/** Cheap per-frame update of one playing clip's progress, 0..1. */
	/** @param {string} trackId @param {number} slot @param {number} progress */
	setProgress(trackId, slot, progress) {
		const track = this._tracks.find((entry) => entry.id === trackId);
		const clip = track?.clips[slot];
		if (!clip) return;
		clip.progress = clamp(Number(progress) || 0, 0, 1);
		const bar = this.slotElement({ trackId, slot })?.querySelector(".progress");
		if (bar instanceof HTMLElement)
			bar.style.width = `${(clip.progress * 100).toFixed(1)}%`;
	}

	/** @param {number} slot @param {boolean} on */
	highlightRow(slot, on) {
		for (const element of this.slotElements().filter(
			(entry) => Number(entry.dataset.slot) === slot,
		))
			element.toggleAttribute("data-highlight", on);
	}

	/** @param {ClipGridPosition} position */
	beginRename(position) {
		if (!this.clipAt(position) || this.disabled) return;
		clearTimeout(this.renameTimer);
		this.renameTimer = null;
		this.renaming = { ...position };
		this.render();
	}

	// ---- Rendering ------------------------------------------------------------

	slotElements() {
		return /** @type {HTMLElement[]} */ ([
			...this.root.querySelectorAll(".slot"),
		]);
	}

	/** @param {ClipGridPosition} position */
	slotElement(position) {
		return /** @type {HTMLElement|null} */ (
			this.root.querySelector(
				`.slot[data-track-id="${CSS.escape(position.trackId)}"][data-slot="${position.slot}"]`,
			)
		);
	}

	render() {
		if (!this.matrix) return;
		this.matrix.style.setProperty(
			"--track-count",
			String(Math.max(1, this._tracks.length)),
		);
		this.matrix.style.setProperty("--slot-count", String(this.slotCount));
		const fragment = document.createDocumentFragment();
		for (const track of this._tracks) {
			const header = document.createElement("div");
			header.className = "track-header";
			header.part.add("track-header");
			header.dataset.trackId = track.id;
			header.textContent = track.name;
			header.title = track.name;
			fragment.append(header);
		}
		for (let slot = 0; slot < this.slotCount; slot += 1)
			for (const track of this._tracks)
				fragment.append(this.renderSlot(track, slot));
		const spacer = document.createElement("div");
		spacer.style.gridColumn = "1 / -1";
		spacer.setAttribute("aria-hidden", "true");
		fragment.append(spacer);
		for (const track of this._tracks) fragment.append(this.renderStop(track));
		this.matrix.replaceChildren(fragment);
		this.paintSelection();
		this.paintDrop();
		this.fitNames();
	}

	/** @param {ClipGridTrack} track @param {number} slot */
	renderSlot(track, slot) {
		const clip = track.clips[slot] ?? null;
		const position = { trackId: track.id, slot };
		const element = document.createElement("div");
		element.className = "slot";
		element.part.add("slot");
		element.dataset.trackId = track.id;
		element.dataset.slot = String(slot);
		element.setAttribute("role", "gridcell");
		if (clip) {
			if (clip.color || track.color) {
				element.dataset.color = "";
				element.style.setProperty(
					"--compost-clip-grid-accent",
					clip.color || track.color,
				);
			}
			const state = clip.state ?? "stopped";
			element.dataset.state = state;
			element.part.add(state);
			if (clip.queued) {
				element.dataset.queued = "";
				element.part.add("queued");
			}
			if (state === "playing") {
				const progress = document.createElement("span");
				progress.className = "progress";
				progress.part.add("progress");
				progress.style.width = `${(clamp(Number(clip.progress) || 0, 0, 1) * 100).toFixed(1)}%`;
				element.append(progress);
			}
			const launch = document.createElement("button");
			launch.type = "button";
			launch.className = `tri${state === "recording" ? " rec" : ""}`;
			launch.dataset.action = "launch";
			launch.setAttribute(
				"aria-label",
				`${clip.queued ? "Cancel queued launch of" : state === "playing" ? "Stop" : state === "recording" ? "Finish recording and queue" : "Launch"} ${clip.name} on ${track.name}`,
			);
			launch.part.add("launch");
			launch.innerHTML =
				state === "recording"
					? dot("var(--compost-clip-grid-accent)")
					: triangle(
							state === "playing"
								? "var(--compost-clip-grid-accent)"
								: "var(--compost-clip-grid-muted)",
						);
			element.append(launch);
			element.insertAdjacentHTML("beforeend", PREVIEW);
			element.querySelector(".preview")?.part.add("preview");
			if (
				this.renaming &&
				this.positionKey(this.renaming) === this.positionKey(position)
			) {
				const input = document.createElement("input");
				input.className = "editor";
				input.part.add("editor");
				input.value = clip.name;
				input.setAttribute("aria-label", `Rename ${clip.name}`);
				let closed = false;
				const finish = (commit) => {
					if (closed) return;
					closed = true;
					this.renaming = null;
					const name = input.value.trim();
					this.render();
					if (commit && name && name !== clip.name)
						this.emit("clip-rename", { ...position, name });
				};
				input.addEventListener("keydown", (event) => {
					event.stopPropagation();
					if (event.key === "Enter") finish(true);
					if (event.key === "Escape") finish(false);
				});
				input.addEventListener("blur", () => finish(true));
				input.addEventListener("pointerdown", (event) =>
					event.stopPropagation(),
				);
				element.append(input);
				requestAnimationFrame(() => {
					input.focus();
					input.select();
				});
			} else {
				const name = document.createElement("button");
				name.type = "button";
				name.className = "name";
				name.part.add("name");
				name.dataset.action = "clip";
				name.tabIndex =
					this._cursor &&
					this.positionKey(this._cursor) === this.positionKey(position)
						? 0
						: -1;
				name.setAttribute(
					"aria-label",
					`${clip.name} on ${track.name}, slot ${slot + 1}, ${state}${clip.queued ? ", queued to play" : ""}${clip.loop === false ? ", one shot" : ""}`,
				);
				name.textContent = clip.name;
				element.append(name);
			}
			if (clip.queued) {
				const queue = document.createElement("span");
				queue.className = "queue";
				queue.part.add("queue");
				queue.setAttribute("aria-hidden", "true");
				queue.innerHTML = triangle("none", "var(--compost-clip-grid-accent)");
				element.append(queue);
			}
		} else {
			const recordQueued = slot === track.recordQueuedSlot;
			if (recordQueued) {
				element.dataset.recordQueued = "";
				element.part.add("queued-record");
			}
			const record = document.createElement(track.armed ? "button" : "span");
			record.className = `tri${track.armed ? " record" : ""}`;
			if (track.armed) {
				record.type = "button";
				record.dataset.action = "record";
				record.part.add("record");
				record.setAttribute(
					"aria-label",
					recordQueued
						? `Cancel queued recording in ${track.name} slot ${slot + 1}`
						: `Record into ${track.name} slot ${slot + 1}`,
				);
				record.innerHTML = ring(
					recordQueued
						? "var(--compost-clip-grid-accent)"
						: "var(--compost-clip-grid-rail)",
				);
			}
			element.append(record);
			const target = document.createElement("button");
			target.type = "button";
			target.className = "empty-target";
			target.dataset.action = "slot";
			target.tabIndex =
				this._cursor &&
				this.positionKey(this._cursor) === this.positionKey(position)
					? 0
					: -1;
			target.setAttribute("aria-label", `Empty ${track.name} slot ${slot + 1}`);
			element.append(target);
		}
		return element;
	}

	/** @param {ClipGridTrack} track */
	renderStop(track) {
		const stop = document.createElement("div");
		stop.className = "stop";
		stop.part.add("stop");
		stop.dataset.trackId = track.id;
		stop.hidden = !track.clips.some(Boolean) && !this.hasAttribute("show-stop");
		stop.toggleAttribute("data-queued", track.stopState === "queued");
		const control = document.createElement("button");
		control.type = "button";
		control.className = "tri";
		control.part.add("stop-control");
		control.dataset.action = "stop";
		control.dataset.trackId = track.id;
		control.setAttribute("aria-label", `Stop ${track.name}`);
		control.innerHTML = square(
			track.stopState === "queued"
				? "var(--compost-clip-grid-accent)"
				: track.stopState === "active"
					? "var(--compost-clip-grid-text)"
					: "var(--compost-clip-grid-muted)",
		);
		stop.append(control);
		return stop;
	}

	paintSelection() {
		const selected = new Set(
			this._selection.map((position) => this.positionKey(position)),
		);
		for (const element of this.slotElements()) {
			const position = this.positionFromElement(element);
			const on = selected.has(this.positionKey(position));
			element.toggleAttribute(
				"data-selected",
				on && Boolean(this.clipAt(position)),
			);
			if (on && this.clipAt(position)) element.part.add("selected");
			else element.part.remove("selected");
			element.toggleAttribute(
				"data-cursor",
				Boolean(
					this._cursor &&
						this.positionKey(this._cursor) === this.positionKey(position),
				),
			);
		}
	}

	paintDrop() {
		const marked = new Set(
			this.dropPositions.map((position) => this.positionKey(position)),
		);
		const source = new Set(
			this.drag?.moved
				? this.drag.positions.map((position) => this.positionKey(position))
				: [],
		);
		for (const element of this.slotElements()) {
			const key = this.positionKey(this.positionFromElement(element));
			if (marked.has(key))
				element.dataset.drop = this.dropCopy ? "copy" : "move";
			else delete element.dataset.drop;
			element.toggleAttribute("data-dragging", source.has(key));
		}
	}

	fitNames() {
		for (const element of this.slotElements()) {
			const name = element.querySelector(".name");
			const preview = element.querySelector(".preview");
			if (!(name instanceof HTMLElement)) continue;
			if (preview instanceof SVGElement) preview.removeAttribute("hidden");
			if (
				preview instanceof SVGElement &&
				name.scrollWidth > name.clientWidth + 1
			)
				preview.setAttribute("hidden", "");
			const width = name.clientWidth;
			const per = name.scrollWidth / Math.max(1, name.textContent?.length ?? 1);
			name.style.textOverflow =
				per > 0 && width / per < ELLIPSIS_MIN_CHARS ? "clip" : "ellipsis";
		}
	}

	// ---- Selection and events -------------------------------------------------

	/** @param {Element} element */
	positionFromElement(element) {
		return {
			trackId: String(element.dataset.trackId || ""),
			slot: Number(element.dataset.slot),
		};
	}

	/** @param {Event} event */
	actionFrom(event) {
		const path = event.composedPath();
		const control = path.find(
			(node) => node instanceof HTMLElement && node.dataset.action,
		);
		const slot = path.find(
			(node) => node instanceof HTMLElement && node.classList.contains("slot"),
		);
		if (!(control instanceof HTMLElement)) return null;
		const position =
			slot instanceof HTMLElement
				? this.positionFromElement(slot)
				: {
						trackId: String(control.dataset.trackId || ""),
						slot: Number(control.dataset.slot),
					};
		return { action: control.dataset.action || "", position };
	}

	/** @param {string} type @param {object} detail */
	emit(type, detail) {
		this.dispatchEvent(
			new CustomEvent(type, { bubbles: true, composed: true, detail }),
		);
	}

	emitSelection() {
		this.emit("clips-select", {
			selection: this.selection,
			cursor: this.cursor,
		});
	}

	/** @param {ClipGridPosition[]} positions @param {ClipGridPosition} cursor @param {boolean} [focus] */
	commitSelection(positions, cursor, focus = false) {
		this._selection = this.normalizePositions(positions);
		this._cursor = this.positionExists(cursor) ? { ...cursor } : this._cursor;
		this.paintSelection();
		if (focus && this._cursor) this.focusSlot(this._cursor);
		this.emitSelection();
	}

	/** @param {ClipGridPosition} position */
	selectAt(position) {
		this.selectionAnchor = { ...position };
		this.commitSelection(this.clipAt(position) ? [position] : [], position);
	}

	/** @param {ClipGridPosition} position */
	extendSelection(position) {
		const anchor = this.selectionAnchor || this._cursor || position;
		this.commitSelection(
			rectangularClipSelection(this._tracks, anchor, position),
			position,
		);
	}

	/** @param {ClipGridPosition} position */
	toggleSelection(position) {
		const key = this.positionKey(position);
		const selection = this._selection.some(
			(entry) => this.positionKey(entry) === key,
		)
			? this._selection.filter((entry) => this.positionKey(entry) !== key)
			: [...this._selection, position];
		this.selectionAnchor = { ...position };
		this.commitSelection(selection, position);
	}

	/** @param {MouseEvent} event */
	handleClick(event) {
		if (this.disabled) return;
		if (this.ignoreClick) {
			this.ignoreClick = false;
			return;
		}
		const hit = this.actionFrom(event);
		if (!hit) return;
		const { action, position } = hit;
		const pointerType = event.pointerType || this.clickPointerType;
		this.clickPointerType = "";
		if (action === "launch") this.emit("clip-launch", position);
		else if (action === "record") this.emit("clip-record", position);
		else if (action === "stop")
			this.emit("clip-stop", { trackId: position.trackId });
		else if (action === "slot") {
			this._cursor = { ...position };
			if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
				this._selection = [];
				this.selectionAnchor = { ...position };
			}
			this.paintSelection();
			this.focusSlot(position);
			this.emitSelection();
		} else if (action === "clip") {
			if (event.shiftKey) {
				this.extendSelection(position);
				return;
			}
			if (event.metaKey || event.ctrlKey) {
				this.toggleSelection(position);
				return;
			}
			const only =
				this._selection.length === 1 &&
				this.positionKey(this._selection[0]) === this.positionKey(position);
			if (!only) {
				this.selectAt(position);
				return;
			}
			clearTimeout(this.renameTimer);
			if (pointerType && pointerType !== "mouse") return;
			this.renameTimer = setTimeout(() => this.beginRename(position), 350);
		}
	}

	/** @param {MouseEvent} event */
	handleDoubleClick(event) {
		if (this.disabled) return;
		const hit = this.actionFrom(event);
		if (hit?.action !== "clip") return;
		clearTimeout(this.renameTimer);
		this.renameTimer = null;
		event.stopPropagation();
		this.emit("clip-open", {
			...hit.position,
			altKey: event.altKey,
			clientX: event.clientX,
			clientY: event.clientY,
		});
	}

	/** @param {MouseEvent} event */
	handleContextMenu(event) {
		if (this.disabled) return;
		const hit = this.actionFrom(event);
		if (!hit || (hit.action !== "clip" && hit.action !== "launch")) return;
		event.preventDefault();
		event.stopPropagation();
		if (
			!this._selection.some(
				(position) =>
					this.positionKey(position) === this.positionKey(hit.position),
			)
		)
			this.selectAt(hit.position);
		this.emit("clip-context", {
			...hit.position,
			clientX: event.clientX,
			clientY: event.clientY,
		});
	}

	/** @param {KeyboardEvent} event */
	handleKey(event) {
		if (this.disabled) return;
		const hit = this.actionFrom(event);
		const position = hit?.position || this._cursor;
		if (!position || !this.positionExists(position)) return;
		const meta = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		if (event.key === "Escape") {
			event.preventDefault();
			this._selection = [];
			this.selectionAnchor = this._cursor ? { ...this._cursor } : null;
			this.paintSelection();
			this.emitSelection();
			return;
		}
		if (meta && key === "c" && this._selection.length) {
			event.preventDefault();
			this.emit("clips-copy", { positions: this.selection });
			return;
		}
		if (meta && key === "v") {
			event.preventDefault();
			this.emit("clips-paste", { to: { ...position } });
			return;
		}
		if (meta && key === "d" && this._selection.length) {
			event.preventDefault();
			const firstTrack = Math.min(
				...this._selection.map((entry) =>
					this._tracks.findIndex((track) => track.id === entry.trackId),
				),
			);
			const to = {
				trackId: this._tracks[firstTrack].id,
				slot: Math.max(...this._selection.map((entry) => entry.slot)) + 1,
			};
			const source = this.selection;
			this.emit("clips-duplicate", { positions: source, to });
			const translated = translatedClipPositions(this._tracks, source, to);
			if (translated.every((entry) => this.positionExists(entry))) {
				this._selection = translated;
				this._cursor = translated.at(-1) || this._cursor;
				this.selectionAnchor = translated[0] || this.selectionAnchor;
				this.paintSelection();
				if (this._cursor) this.focusSlot(this._cursor);
			}
			return;
		}
		if (
			(event.key === "Delete" || event.key === "Backspace") &&
			this._selection.length
		) {
			event.preventDefault();
			const positions = this.selection;
			this.emit("clips-delete", { positions });
			this._selection = [];
			this.paintSelection();
			return;
		}
		if (
			event.key === "ArrowLeft" ||
			event.key === "ArrowRight" ||
			event.key === "ArrowUp" ||
			event.key === "ArrowDown"
		) {
			const trackIndex = this._tracks.findIndex(
				(track) => track.id === position.trackId,
			);
			const next = {
				trackId:
					this._tracks[
						clamp(
							trackIndex +
								(event.key === "ArrowLeft"
									? -1
									: event.key === "ArrowRight"
										? 1
										: 0),
							0,
							this._tracks.length - 1,
						)
					]?.id || position.trackId,
				slot: clamp(
					position.slot +
						(event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0),
					0,
					this.slotCount - 1,
				),
			};
			if (event.altKey && this._selection.length) {
				event.preventDefault();
				const indexes = this._selection.map((entry) =>
					this._tracks.findIndex((track) => track.id === entry.trackId),
				);
				const origin = {
					trackId: this._tracks[Math.min(...indexes)].id,
					slot: Math.min(...this._selection.map((entry) => entry.slot)),
				};
				const originIndex = this._tracks.findIndex(
					(track) => track.id === origin.trackId,
				);
				const toIndex = clamp(
					originIndex +
						(event.key === "ArrowLeft"
							? -1
							: event.key === "ArrowRight"
								? 1
								: 0),
					0,
					this._tracks.length - 1,
				);
				const to = {
					trackId: this._tracks[toIndex].id,
					slot: Math.max(
						0,
						origin.slot +
							(event.key === "ArrowUp"
								? -1
								: event.key === "ArrowDown"
									? 1
									: 0),
					),
				};
				this.commitMove(to, false);
				return;
			}
			event.preventDefault();
			if (event.shiftKey) this.extendSelection(next);
			else this.selectAt(next);
			this.focusSlot(next);
			return;
		}
		const clip = this.clipAt(position);
		const track = this._tracks.find((entry) => entry.id === position.trackId);
		if (
			clip &&
			((event.shiftKey && event.key === "Enter") ||
				(!meta && !event.altKey && key === "e"))
		) {
			event.preventDefault();
			this.emit("clip-open", { ...position, altKey: event.altKey });
		} else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (clip) this.emit("clip-launch", position);
			else if (track?.armed) this.emit("clip-record", position);
		} else if (event.key === "F2" && clip) {
			event.preventDefault();
			this.beginRename(position);
		} else if (event.shiftKey && event.key === "F10" && clip) {
			event.preventDefault();
			const rect = (this.slotElement(position) || this).getBoundingClientRect();
			this.emit("clip-context", {
				...position,
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2,
			});
		}
	}

	/** @param {ClipGridPosition} position */
	focusSlot(position) {
		const element = this.slotElement(position)?.querySelector(
			".name, .empty-target",
		);
		if (element instanceof HTMLElement) element.focus({ preventScroll: true });
	}

	// ---- Dragging -------------------------------------------------------------

	/** @param {PointerEvent} event */
	beginDrag(event) {
		if (this.disabled || event.button !== 0) return;
		const hit = this.actionFrom(event);
		if (hit?.action !== "clip") return;
		this.clickPointerType = event.pointerType;
		const key = this.positionKey(hit.position);
		const wasSelected = this._selection.some(
			(entry) => this.positionKey(entry) === key,
		);
		const positions = wasSelected ? this.selection : [{ ...hit.position }];
		const trackIndexes = positions.map((position) =>
			this._tracks.findIndex((track) => track.id === position.trackId),
		);
		const firstTrack = Math.min(...trackIndexes);
		const firstSlot = Math.min(...positions.map((position) => position.slot));
		const grabbedTrack = this._tracks.findIndex(
			(track) => track.id === hit.position.trackId,
		);
		this.drag = {
			pointerId: event.pointerId,
			position: hit.position,
			positions,
			x: event.clientX,
			y: event.clientY,
			moved: false,
			wasSelected,
			copy: event.altKey,
			grabbedTrackOffset: grabbedTrack - firstTrack,
			grabbedSlotOffset: hit.position.slot - firstSlot,
			to: null,
		};
		window.addEventListener("pointermove", this.handleWindowMove);
		window.addEventListener("pointerup", this.handleWindowUp);
		window.addEventListener("pointercancel", this.handleWindowUp);
		window.addEventListener("keydown", this.handleModifierKey, true);
		window.addEventListener("keyup", this.handleModifierKey, true);
		this.longPress.start(() => {
			if (!this.drag || this.drag.moved) return;
			const position = { ...this.drag.position };
			const selected = this.drag.wasSelected;
			this.endDrag(true);
			if (!selected) this.selectAt(position);
			this.emit("clip-context", {
				...position,
				clientX: event.clientX,
				clientY: event.clientY,
			});
		});
	}

	/** @param {KeyboardEvent} event */
	handleModifierKey(event) {
		if (!this.drag?.moved) return;
		this.drag.copy = Boolean(event.altKey);
		this.dropCopy = this.drag.copy;
		this.paintDrop();
	}

	/** @param {PointerEvent} event */
	handleWindowMove(event) {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (!drag.moved) {
			if (
				Math.abs(event.clientX - drag.x) < DRAG_SLOP &&
				Math.abs(event.clientY - drag.y) < DRAG_SLOP
			)
				return;
			drag.moved = true;
			if (!drag.wasSelected) this.selectAt(drag.position);
			this.longPress.cancel();
			this.emit("clips-drag-start", { positions: drag.positions });
		}
		drag.copy = event.altKey;
		event.preventDefault();
		const slot = this.slotElements().find((element) => {
			const rect = element.getBoundingClientRect();
			return (
				event.clientX >= rect.left &&
				event.clientX < rect.right &&
				event.clientY >= rect.top &&
				event.clientY < rect.bottom
			);
		});
		if (!(slot instanceof HTMLElement)) {
			drag.to = null;
			this.dropPositions = [];
			this.paintDrop();
			return;
		}
		const target = this.positionFromElement(slot);
		const sourceTrackIndexes = drag.positions.map((position) =>
			this._tracks.findIndex((track) => track.id === position.trackId),
		);
		const width =
			Math.max(...sourceTrackIndexes) - Math.min(...sourceTrackIndexes);
		const targetTrack = this._tracks.findIndex(
			(track) => track.id === target.trackId,
		);
		const originTrack = clamp(
			targetTrack - drag.grabbedTrackOffset,
			0,
			Math.max(0, this._tracks.length - width - 1),
		);
		const height =
			Math.max(...drag.positions.map((position) => position.slot)) -
			Math.min(...drag.positions.map((position) => position.slot));
		const to = {
			trackId: this._tracks[originTrack].id,
			slot: clamp(
				target.slot - drag.grabbedSlotOffset,
				0,
				Math.max(0, this.slotCount - height - 1),
			),
		};
		drag.to = to;
		this.dropPositions = translatedClipPositions(
			this._tracks,
			drag.positions,
			to,
		);
		this.dropCopy = drag.copy;
		this.paintDrop();
	}

	/** @param {PointerEvent} event */
	handleWindowUp(event) {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		const copy = event.altKey || drag.copy;
		const to = drag.to ? { ...drag.to } : null;
		const moved = drag.moved;
		const sourceOrigin = translatedClipPositions(this._tracks, drag.positions, {
			trackId:
				this._tracks[
					Math.min(
						...drag.positions.map((position) =>
							this._tracks.findIndex((track) => track.id === position.trackId),
						),
					)
				].id,
			slot: Math.min(...drag.positions.map((position) => position.slot)),
		});
		const unchanged =
			to &&
			translatedClipPositions(this._tracks, drag.positions, to).every(
				(position, index) =>
					this.positionKey(position) === this.positionKey(sourceOrigin[index]),
			);
		this.endDrag(false);
		this.ignoreClick = moved;
		if (moved) setTimeout(() => (this.ignoreClick = false));
		if (!moved || !to || (unchanged && !copy)) return;
		this.commitMove(to, copy, drag.positions);
	}

	/** @param {ClipGridPosition} to @param {boolean} copy @param {ClipGridPosition[]} [positions] */
	commitMove(to, copy, positions = this.selection) {
		const source = positions.map((position) => ({ ...position }));
		const translated = translatedClipPositions(this._tracks, source, to);
		this.emit("clips-move", { positions: source, to: { ...to }, copy });
		if (translated.every((position) => this.positionExists(position))) {
			this._selection = translated;
			this._cursor = translated.at(-1) || this._cursor;
			this.selectionAnchor = translated[0] || this.selectionAnchor;
			this.paintSelection();
			if (this._cursor) this.focusSlot(this._cursor);
		}
	}

	/** @param {boolean} silent */
	endDrag(silent) {
		this.longPress.cancel();
		const drag = this.drag;
		this.drag = null;
		window.removeEventListener("pointermove", this.handleWindowMove);
		window.removeEventListener("pointerup", this.handleWindowUp);
		window.removeEventListener("pointercancel", this.handleWindowUp);
		window.removeEventListener("keydown", this.handleModifierKey, true);
		window.removeEventListener("keyup", this.handleModifierKey, true);
		this.dropPositions = [];
		this.paintDrop();
		if (drag?.moved && !silent)
			this.emit("clips-drag-end", { positions: drag.positions });
	}
}

defineElement("compost-clip-grid", CompostClipGrid);
