import {
	chroma,
	isNaturalNote,
	isNoteOffMessage,
	isNoteOnMessage,
	noteFromMessage,
	noteName,
} from "../midi.js";
import { clamp, defineElement, numberAttr } from "../utils.js";

const DEFAULT_ROOT_NOTE = 36;
const DEFAULT_NOTE_COUNT = 61;
const DEFAULT_KEY_MAP =
	"KeyA KeyW KeyS KeyE KeyD KeyF KeyT KeyG KeyY KeyH KeyU KeyJ KeyK KeyO KeyL KeyP Semicolon";

// Geometry is worked out in reference units: 1 unit is 1px at a 16px host
// font size, so a length of n units is written to CSS as n / 16 em.
const UNITS_PER_EM = 16;
const EDGE_MARGIN = 1;

// Where each pitch class sits within its group of white keys. C, D and E form
// one group; F, G, A and B the other.
const C_GROUP = { start: 0, naturals: 3 };
const F_GROUP = { start: 5, naturals: 4 };
const NATURAL_INDEX = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

const em = (units) => `${units / UNITS_PER_EM}em`;

export class CompostPiano extends HTMLElement {
	static get observedAttributes() {
		return ["root-note", "note-count", "key-map", "dock", "inline"];
	}

	constructor() {
		super();
		// A white key is 20 reference units (px at 16px font size); a black
		// key 0.58 of that wide and 63% as tall, as on a real piano.
		this.naturalWidth = 20;
		this.accidentalWidth = this.naturalWidth * 0.58;
		this.accidentalHeight = 63;
		this.keyboardWidth = 0;

		// Each way of playing keeps its own record of what it holds. A key is
		// lit while any of them holds it; note-down and note-up follow the
		// user-driven sources together, so two sources on one key still make a
		// single down/up pair.
		this.pointer = { dragging: false, note: null };
		this.keyNotes = new Map();
		this.touchNotes = new Map();
		this.midiNotes = new Set();
		this.keyElements = new Map();

		this.root = this.attachShadow({ mode: "open" });
		this.root.innerHTML = `
      <style>
        :host {
          --_accent: var(--compost-piano-accent, var(--compost-accent, AccentColor));
          --_line: var(--compost-piano-line, color-mix(in srgb, CanvasText 45%, transparent));
          --_muted: var(--compost-piano-muted, color-mix(in srgb, CanvasText 55%, transparent));
          display: block;
          box-sizing: border-box;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        :host([hidden]) {
          display: none;
        }
        :host(:focus-visible) {
          outline: none;
        }
        :host([data-docked]) {
          position: fixed;
          bottom: 0;
          left: 50%;
          z-index: 10;
          width: var(--_keyboard-width);
          max-width: calc(100vw - 2em);
          transform: translateX(calc(-50% + var(--compost-piano-dock-offset, 0px)));
        }
        :host(:not([data-docked])) {
          width: 100%;
          max-width: var(--_keyboard-width);
        }
        .keys {
          position: relative;
          box-sizing: border-box;
          height: var(--compost-piano-height, 7.875em);
          color-scheme: light;
          background: #fff;
          outline-offset: -2px;
        }
        :host(:focus-visible) .keys {
          outline: 2px solid Highlight;
        }
        .key {
          position: absolute;
          top: 0;
          box-sizing: border-box;
          border: 1px solid var(--_line);
          touch-action: none;
        }
        .natural {
          bottom: 0;
          z-index: 0;
          border-right-width: 0;
          background: #fff;
        }
        .natural.last {
          border-right-width: 1px;
        }
        .accidental {
          z-index: 1;
          border-color: #111;
          border-radius: 0 0 2px 2px;
          background: #222;
        }
        .key.active {
          border-color: var(--_accent);
          background: var(--_accent);
        }
        .label {
          position: absolute;
          right: 0;
          bottom: 0.35em;
          left: 0;
          color: var(--_muted);
          font-size: 0.7em;
          line-height: 1;
          text-align: center;
          pointer-events: none;
        }
        .active .label {
          color: #fff;
        }
        @supports (color: contrast-color(red)) {
          .active .label {
            color: contrast-color(var(--_accent));
          }
        }
        .help {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          white-space: nowrap;
        }
      </style>
      <style data-size></style>
      <div class="keys" part="keys" role="group" aria-label="Piano keyboard" aria-describedby="help"></div>
      <span class="help" id="help">Use the mapped computer keyboard keys to play notes.</span>`;
		this.sizeStyle = this.root.querySelector("style[data-size]");
		this.keys = this.root.querySelector(".keys");

		this.handlePointerDown = this.handlePointerDown.bind(this);
		this.handlePointerMove = this.handlePointerMove.bind(this);
		this.handlePointerUp = this.handlePointerUp.bind(this);
		this.handlePointerLeave = this.handlePointerLeave.bind(this);
		this.handleTouch = this.handleTouch.bind(this);
		this.handleKey = this.handleKey.bind(this);
		this.handleFocusOut = this.handleFocusOut.bind(this);

		this.keys.addEventListener("pointerdown", this.handlePointerDown);
		this.keys.addEventListener("pointermove", this.handlePointerMove);
		this.keys.addEventListener("pointerup", this.handlePointerUp);
		this.keys.addEventListener("pointercancel", this.handlePointerUp);
		for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
			this.keys.addEventListener(type, this.handleTouch, { passive: false });
		}
		this.addEventListener("pointerleave", this.handlePointerLeave);
		this.addEventListener("keydown", this.handleKey);
		this.addEventListener("keyup", this.handleKey);
		this.addEventListener("focusout", this.handleFocusOut);
	}

	connectedCallback() {
		if (!this.hasAttribute("role")) this.setAttribute("role", "group");
		if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
		if (!this.hasAttribute("aria-label")) {
			this.setAttribute("aria-label", "Piano keyboard");
		}
		this.render();
	}

	disconnectedCallback() {
		this.allNotesOff();
	}

	attributeChangedCallback() {
		this.render();
	}

	get config() {
		const rootNote = clamp(
			Math.round(numberAttr(this, "root-note", DEFAULT_ROOT_NOTE)),
			0,
			127,
		);
		const noteCount = clamp(
			Math.round(numberAttr(this, "note-count", DEFAULT_NOTE_COUNT)),
			1,
			128 - rootNote,
		);
		const keyMap = this.getAttribute("key-map")?.trim() || DEFAULT_KEY_MAP;
		return { noteCount, rootNote, keyMap };
	}

	get docked() {
		return this.hasAttribute("dock") || !this.hasAttribute("inline");
	}

	isPlayableNote(note) {
		const { rootNote, noteCount } = this.config;
		return (
			Number.isInteger(note) &&
			note >= rootNote &&
			note < rootNote + noteCount &&
			note >= 0 &&
			note <= 127
		);
	}

	isNoteActive(note) {
		return this.isHeldByUser(note) || this.midiNotes.has(note);
	}

	handleMIDIMessage(message) {
		const note = noteFromMessage(message);
		if (isNoteOnMessage(message)) this.midiNotes.add(note);
		else if (isNoteOffMessage(message)) this.midiNotes.delete(note);
		else return;
		this.showNote(note);
	}

	handleExternalMIDI(message) {
		this.handleMIDIMessage(message);
	}

	allNotesOff() {
		const held = new Set([
			...this.keyNotes.values(),
			...this.touchNotes.values(),
		]);
		if (this.pointer.note !== null) held.add(this.pointer.note);
		const lit = [...this.midiNotes];

		this.pointer = { dragging: false, note: null };
		this.keyNotes.clear();
		this.touchNotes.clear();
		this.midiNotes.clear();

		for (const note of held) {
			this.showNote(note);
			this.emit("note-up", note);
		}
		for (const note of lit) this.showNote(note);
	}

	// The computer keys start on a C. Taking the first C at or above a point a
	// quarter of the way up the keyboard puts the 17 mapped keys in its lower
	// middle, and lets them drift upwards as the keyboard grows.
	computerKeyBase() {
		const { rootNote, noteCount } = this.config;
		return Math.ceil((rootNote + noteCount / 4) / 12) * 12;
	}

	render() {
		const { rootNote, noteCount } = this.config;
		const layout = this.layoutKeys(rootNote, noteCount);
		this.keyboardWidth = layout.width;
		this.toggleAttribute("data-docked", this.docked);
		this.sizeStyle.textContent = `:host { --_keyboard-width: ${em(layout.width)}; }`;
		this.keys.style.width = em(layout.width);

		this.keyElements.clear();
		const fragment = document.createDocumentFragment();
		for (const key of layout.keys) {
			const element = document.createElement("div");
			element.id = `note${key.note}`;
			element.dataset.note = String(key.note);
			element.className = key.natural ? "key natural" : "key accidental";
			if (key.last) element.classList.add("last");
			element.style.left = em(key.left);
			element.style.width = em(key.width);
			if (!key.natural) element.style.height = `${this.accidentalHeight}%`;
			if (chroma(key.note) === 0) {
				const label = document.createElement("span");
				label.className = "label";
				label.part = "label";
				label.textContent = noteName(key.note);
				element.append(label);
			}
			this.keyElements.set(key.note, element);
			this.showNote(key.note, element);
			fragment.append(element);
		}
		this.keys.replaceChildren(fragment);
	}

	// Lays the keys out from the left edge of the C below the range, then
	// shifts everything so the leftmost key sits one unit in from the edge.
	layoutKeys(rootNote, noteCount) {
		const keys = [];
		for (let note = rootNote; note < rootNote + noteCount; note += 1) {
			const span = this.keySpan(note - (rootNote - chroma(rootNote)));
			keys.push({ note, natural: isNaturalNote(note), ...span });
		}
		const naturals = keys.filter((key) => key.natural);
		if (naturals.length) naturals[naturals.length - 1].last = true;

		const left = Math.min(...keys.map((key) => key.left));
		const right = Math.max(...keys.map((key) => key.left + key.width));
		for (const key of keys) key.left += EDGE_MARGIN - left;
		return {
			keys,
			width: Math.ceil(right - left + 2 * EDGE_MARGIN),
		};
	}

	// A white key takes the next slot along. The black keys come from splitting
	// each group of white keys into equal slots, one more than twice the number
	// of black keys in it (5 for C-E, 7 for F-B), and centring each black key
	// on every second slot.
	keySpan(semitonesFromC) {
		const octave = Math.floor(semitonesFromC / 12);
		const pitch = chroma(semitonesFromC);
		const octaveLeft = octave * 7 * this.naturalWidth;

		if (pitch in NATURAL_INDEX) {
			return {
				left: octaveLeft + NATURAL_INDEX[pitch] * this.naturalWidth,
				width: this.naturalWidth,
			};
		}

		const group = pitch < F_GROUP.start ? C_GROUP : F_GROUP;
		const slots = group.naturals * 2 - 1;
		const slotWidth = (group.naturals * this.naturalWidth) / slots;
		const blackIndex = (pitch - group.start - 1) / 2;
		const centre =
			octaveLeft +
			NATURAL_INDEX[group.start] * this.naturalWidth +
			(2 * blackIndex + 1.5) * slotWidth;
		return {
			left: centre - this.accidentalWidth / 2,
			width: this.accidentalWidth,
		};
	}

	isHeldByUser(note) {
		if (this.pointer.note === note) return true;
		for (const held of this.keyNotes.values()) if (held === note) return true;
		for (const held of this.touchNotes.values()) if (held === note) return true;
		return false;
	}

	// Records a user press in one source's map and announces it if no other
	// source already holds that note.
	press(source, id, note) {
		const wasHeld = this.isHeldByUser(note);
		if (source) source.set(id, note);
		else this.pointer.note = note;
		this.showNote(note);
		if (!wasHeld) this.emit("note-down", note);
	}

	release(source, id) {
		const note = source ? source.get(id) : this.pointer.note;
		if (note === undefined || note === null) return;
		if (source) source.delete(id);
		else this.pointer.note = null;
		this.showNote(note);
		if (!this.isHeldByUser(note)) this.emit("note-up", note);
	}

	emit(type, note) {
		this.dispatchEvent(
			new CustomEvent(type, {
				bubbles: true,
				composed: true,
				detail: { note },
			}),
		);
	}

	showNote(note, element = this.keyElements.get(note)) {
		if (!element) return;
		const active = this.isNoteActive(note);
		element.classList.toggle("active", active);
		const role = element.classList.contains("natural")
			? "natural-key"
			: "accidental-key";
		element.part = active ? `key ${role} active-key` : `key ${role}`;
	}

	noteAt(target) {
		const key = target?.closest?.("[data-note]");
		if (!key || !this.keys.contains(key)) return null;
		const note = Number(key.dataset.note);
		return this.isPlayableNote(note) ? note : null;
	}

	// Moves one source's held note to whatever key is now under it, releasing
	// first so a glissando reads as up-then-down.
	slide(source, id, note) {
		const held = source ? source.get(id) : this.pointer.note;
		if (held === note) return;
		this.release(source, id);
		if (note !== null) this.press(source, id, note);
	}

	handlePointerDown(event) {
		if (event.pointerType === "touch" || event.button !== 0) return;
		const note = this.noteAt(event.target);
		if (note === null) return;
		this.focus({ preventScroll: true });
		this.pointer.dragging = true;
		this.slide(null, null, note);
	}

	handlePointerMove(event) {
		if (event.pointerType === "touch" || !this.pointer.dragging) return;
		if (!(event.buttons & 1)) {
			this.endPointer();
			return;
		}
		event.preventDefault();
		this.slide(null, null, this.noteAt(event.target));
	}

	handlePointerUp(event) {
		if (event.pointerType === "touch" || !this.pointer.dragging) return;
		event.preventDefault();
		this.endPointer();
	}

	handlePointerLeave(event) {
		if (event.pointerType === "touch") return;
		this.release(null, null);
	}

	endPointer() {
		this.pointer.dragging = false;
		this.release(null, null);
	}

	handleTouch(event) {
		if (event.cancelable) event.preventDefault();
		for (const touch of event.changedTouches ?? []) {
			const id = touch.identifier;
			if (event.type === "touchstart") {
				const note = this.noteAt(touch.target);
				if (note !== null) this.slide(this.touchNotes, id, note);
			} else if (event.type === "touchmove") {
				if (!this.touchNotes.has(id)) continue;
				const target = this.root.elementFromPoint(touch.clientX, touch.clientY);
				this.slide(this.touchNotes, id, this.noteAt(target));
			} else {
				this.release(this.touchNotes, id);
			}
		}
	}

	handleKey(event) {
		// A key lifted while a modifier is down still lets go of its note, so
		// pressing Shift mid-note cannot leave it stuck.
		if (event.type === "keyup") this.release(this.keyNotes, event.code);
		if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
			return;
		}
		const index = this.config.keyMap.split(/\s+/).indexOf(event.code);
		if (index < 0) return;
		event.preventDefault();
		if (event.type === "keyup") return;
		if (event.repeat || this.keyNotes.has(event.code)) return;
		const note = this.computerKeyBase() + index;
		if (this.isPlayableNote(note)) this.press(this.keyNotes, event.code, note);
	}

	handleFocusOut(event) {
		if (this.contains(event.relatedTarget)) return;
		this.allNotesOff();
	}
}

defineElement("compost-piano", CompostPiano);
