import './compost-number-box.js';
import {
  beginParameterGesture,
  clamp,
  defineElement,
  editParameterGesture,
  endParameterGesture,
  formatNumber,
  numberAttr,
  snap,
} from '../utils.js';

let nextCardID = 1;
const SWITCHES = Object.freeze(['arm', 'monitor', 'mute', 'solo']);
const PAN_PER_PIXEL = 0.016;
const PAN_PER_PIXEL_FINE = 0.004;
/** Below this much lane beside the gutter, the level and the sends stack. */
const TIGHT_LANE_EM = 4;
/** Below this width the card reads as narrow: smaller switches, full-width sends. */
const NARROW_WIDTH_EM = 10.2;

// Monitor reads as the arm's dot radiating: the same circle, now making sound.
export const MONITOR_SVG = '<svg viewBox="0 0 14 12" aria-hidden="true">'
  + '<circle cx="4.6" cy="6" r="2.1"/>'
  + '<path d="M8.3 3.4a3.9 3.9 0 0 1 0 5.2" fill="none" stroke-width="1.1"/>'
  + '<path d="M10.7 1.9a6.6 6.6 0 0 1 0 8.2" fill="none" stroke-width="1.1" class="far"/></svg>';

/** @param {number} pan */
export function panText(pan) {
  if (Math.abs(pan) < 0.02) return 'C';
  return `${Math.round(Math.abs(pan) * 100)}${pan < 0 ? 'L' : 'R'}`;
}

/** Where the sides of the pan bar go for a pan value, as percentages. */
/** @param {number} pan */
export function panBar(pan) {
  const width = Math.abs(pan) * 50;
  return { left: pan < 0 ? 50 - width : 50, width };
}

/** @typedef {{label: string, value: number, parameterID?: string, min?: number, max?: number,
 *   step?: number, mid?: number, resetValue?: number, minLabel?: string}} SendSpec */

/**
 * The channel card at the foot of a track column: input, pan, level figure,
 * sends and the state switches, laid out around the meter gutter the column
 * runs through it. The level figure sits left of the gutter, the sends stack
 * to its right, and the switches straddle it along the bottom; when the
 * column is too narrow for a lane beside the gutter the rows stack instead.
 *
 * Every control reports through parameter-begin / parameter-edit /
 * parameter-end with its own parameter id: `gain-parameter-id` for a typed
 * level, `pan-parameter-id` for the pan rail and figure, one id per switch
 * (`arm-parameter-id`, …, discrete 0/1), and each send's own id. The input
 * is a button: it raises `input-click` with the button as `detail.anchor`
 * so the host can hang its own chooser off it.
 */
export class CompostChannelCard extends HTMLElement {
  static get observedAttributes() {
    return [
      'label', 'input', 'input-live', 'value', 'min', 'max', 'step', 'reset-value',
      'gain-parameter-id', 'pan', 'pan-parameter-id', 'pan-reset-value', 'switches',
      'arm', 'monitor', 'mute', 'solo', 'solo-safe', 'arm-parameter-id', 'monitor-parameter-id',
      'mute-parameter-id', 'solo-parameter-id', 'solo-safe-parameter-id', 'muted', 'disabled',
    ];
  }

  constructor() {
    super();

    this.label = 'Channel';
    this.min = -90;
    this.max = 12;
    this.step = 0.1;
    this.resetValue = 0;
    this.panResetValue = 0;
    this._value = 0;
    this._pan = 0;
    /** @type {SendSpec[]} */ this._sends = [];
    this.cardID = `compost-channel-card-${nextCardID++}`;
    this.editing = false;
    /** @type {{pointerId: number, x: number, pan: number}|null} */ this.panDrag = null;
    /** @type {Element|null} */ this.strip = null;
    this.measure = this.measure.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-channel-card-bg: transparent;
          --compost-channel-card-hover-bg: rgba(255, 255, 255, 0.72);
          --compost-channel-card-text: #111111;
          --compost-channel-card-muted: #6a6a6a;
          --compost-channel-card-faint: #8a8a8a;
          --compost-channel-card-rule: rgba(17, 17, 17, 0.12);
          --compost-channel-card-signal: #c45a2c;
          --compost-channel-card-signal-hi: #c45a2c;
          --compost-channel-card-over: #d98a4a;
          --compost-channel-card-select: #2f6da8;
          --compost-channel-card-hover: rgba(17, 17, 17, 0.07);
          --compost-channel-card-editor-bg: #ffffff;
          --compost-channel-card-figure-size: 1.09em;
          /* a host on a small screen sets these to give fingers something to hit */
          --compost-channel-card-switch-min: 0px;
          --compost-channel-card-send-label-min: 0px;
          --compost-channel-card-send-height: 1.36em;
          --compost-channel-card-numeral-font: ui-monospace, SFMono-Regular, Menlo, monospace;
          --compost-channel-card-gutter-left: var(--compost-channel-strip-meter-left, 50%);
          --compost-channel-card-gutter-width: var(--compost-channel-strip-meter-measured-width, 0px);
          --compost-channel-card-gutter-air: 0.36em;
          --compost-channel-card-color-scheme: light;
          --number-box-color-scheme: var(--compost-channel-card-color-scheme);
          color-scheme: var(--compost-channel-card-color-scheme);
          /* lanes either side of the gutter, measured from this card's padding edge */
          --ml: max(0px, calc(var(--compost-channel-card-gutter-left) - var(--pad-x) - var(--compost-channel-card-gutter-air)));
          --mw: calc(var(--compost-channel-card-gutter-width) + var(--compost-channel-card-gutter-air) * 2);
          /* 100% here is the content box, one padding inside the edge the gutter is measured from */
          --mr: max(0px, calc(100% + var(--pad-x) - var(--compost-channel-card-gutter-left) - var(--compost-channel-card-gutter-width) - var(--compost-channel-card-gutter-air)));
          --pad-x: 0.64em;
          --panw: 5.3em;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 0.27em;
          box-sizing: border-box;
          padding: 0.55em var(--pad-x) 0.45em;
          background: var(--compost-channel-card-bg);
          color: var(--compost-channel-card-text);
          font: inherit;
          cursor: default;
          -webkit-user-select: none;
          user-select: none;
          transition: background 130ms;
        }
        :host(:hover), :host(:focus-within) { background: var(--compost-channel-card-hover-bg); }
        :host([disabled]) { opacity: 0.5; pointer-events: none; }
        .mono { font-family: var(--compost-channel-card-numeral-font); letter-spacing: 0; }
        button {
          appearance: none;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          padding: 0;
          margin: 0;
          cursor: pointer;
        }
        button:focus-visible { outline: 1px solid var(--compost-channel-card-select); outline-offset: 1px; }

        /* input: the source the track listens to, in the signal colour when live */
        .input {
          align-self: flex-start;
          max-width: 100%;
          box-sizing: border-box;
          padding: 0.1em 0.36em;
          margin-left: -0.36em;
          border-radius: 2px;
          font-family: var(--compost-channel-card-numeral-font);
          letter-spacing: 0;
          font-size: 0.82em;
          color: var(--compost-channel-card-faint);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: left;
        }
        .input[hidden] { display: none !important; }
        :host([input-live]) .input { color: var(--compost-channel-card-signal); }
        .input:hover { background: var(--compost-channel-card-hover); color: var(--compost-channel-card-text); }
        :host([input-live]) .input:hover { color: var(--compost-channel-card-signal-hi); }
        :host([data-tight]) .input { max-width: calc(var(--ml) + 0.36em); }

        /* pan: the rail centred on the channel, the figure reading from the left edge */
        .panwrap {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          padding: 0.27em 0 0.18em;
        }
        .panwrap[hidden] { display: none !important; }
        .figure {
          font-family: var(--compost-channel-card-numeral-font);
          letter-spacing: 0;
          font-size: var(--compost-channel-card-figure-size);
          color: var(--compost-channel-card-text);
          white-space: nowrap;
          line-height: 1.4;
        }
        .pandb { grid-column: 1; justify-self: start; cursor: ew-resize; }
        .pandb[data-mid] { color: var(--compost-channel-card-muted); }
        .pan {
          grid-column: 2;
          position: relative;
          width: var(--panw);
          max-width: 100%;
          height: 0.64em;
          cursor: ew-resize;
          touch-action: none;
        }
        .pan:focus-visible { outline: 1px solid var(--compost-channel-card-select); outline-offset: 2px; }
        .pan .track { position: absolute; left: 0; right: 0; top: 0.27em; height: 1px;
          background: var(--compost-channel-card-muted); opacity: 0.5; }
        .pan .bar { position: absolute; top: 0.18em; height: 0.27em;
          background: var(--compost-channel-card-text); opacity: 0.75; }
        .pan .centre { position: absolute; top: 0; left: 50%; width: 1px; height: 100%;
          background: var(--compost-channel-card-muted); }
        :host(:hover) .pan .track { opacity: 0.8; }
        :host(:hover) .pan .bar { opacity: 1; }
        :host([data-tight]) .panwrap { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        :host([data-tight]) .panwrap .pandb { align-self: flex-start; }

        /* level to the left of the gutter, sends to the right; the gutter is the meter's */
        .main {
          display: grid;
          grid-template-columns: var(--ml) var(--mw) var(--mr);
          align-items: start;
        }
        .level {
          grid-column: 1;
          justify-self: start;
          align-self: start;
          text-align: left;
          position: relative;
        }
        :host([muted]) .level { color: var(--compost-channel-card-muted); }
        /* a figure wider than its lane sits in a notch cut through the rail */
        :host([data-cramped]) .level { z-index: 3; padding-right: 0.27em;
          background: var(--compost-channel-card-notch-bg, var(--compost-channel-strip-bg, #ffffff)); }
        .sends { grid-column: 3; justify-self: stretch; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .send { display: flex; align-items: center; justify-content: flex-end; gap: 0.45em; min-width: 0; }
        .send label { flex: none; box-sizing: border-box; width: 0.87em;
          min-width: var(--compost-channel-card-send-label-min, 0px);
          min-height: var(--compost-channel-card-send-label-min, 0px);
          display: flex; align-items: center;
          font-family: var(--compost-channel-card-numeral-font); letter-spacing: 0;
          font-size: 0.73em; color: var(--compost-channel-card-faint); cursor: pointer; }
        .send[data-live] label { color: var(--compost-channel-card-signal); }
        .send compost-number-box {
          --number-box-width: 4.2em;
          --number-box-height: var(--compost-channel-card-send-height, 1.36em);
          --number-box-font-size: 0.82em;
          --number-box-font-weight: 300;
          --number-box-text-align: right;
          --number-box-padding: 0 0.18em;
          --number-box-bg: transparent;
          --number-box-border: transparent;
          --number-box-active-bg: transparent;
          --number-box-fill: transparent;
          --number-box-text: var(--compost-channel-card-faint);
          --number-box-active-text: var(--compost-channel-card-text);
          --number-box-focus: var(--compost-channel-card-select);
          font-family: var(--compost-channel-card-numeral-font);
          letter-spacing: 0;
        }
        .send[data-live] compost-number-box { --number-box-text: var(--compost-channel-card-muted); }
        .send compost-number-box:hover { --number-box-text: var(--compost-channel-card-text); }
        :host([data-tight]) .main { display: flex; flex-direction: column; gap: 0.27em; align-items: stretch; }
        :host([data-tight]) .sends { width: 100%; }
        :host([data-tight]) .send { display: grid; align-items: center; gap: 0;
          grid-template-columns: var(--ml) var(--mw) var(--mr); }
        :host([data-tight]) .send label { grid-column: 1; justify-self: start; }
        :host([data-tight]) .send compost-number-box { grid-column: 3; --number-box-width: 100%; --number-box-font-size: 0.73em; --number-box-padding: 0; }
        :host([data-tight]) .figure { font-size: 1em; }
        :host([data-narrow][data-tight]) .figure { font-size: 0.91em; }
        :host([data-narrow]) .send compost-number-box { --number-box-width: 100%; }
        .editor {
          box-sizing: border-box;
          width: 5.2em;
          border: 0;
          outline: 1px solid var(--compost-channel-card-select);
          background: var(--compost-channel-card-editor-bg);
          color: var(--compost-channel-card-text);
          font: inherit;
          font-family: var(--compost-channel-card-numeral-font);
          font-size: var(--compost-channel-card-figure-size);
          padding: 0 0.27em;
          -webkit-user-select: text;
          user-select: text;
        }

        /* the state switches straddle the gutter: an equal reach from each edge
           to the gutter's own edges, and the pair on each side spaced inside it */
        .switches {
          display: flex;
          align-items: center;
          padding-top: 0.45em;
          box-shadow: inset 0 1px 0 var(--compost-channel-card-rule);
          font-size: 0.91em;
          letter-spacing: 0.04em;
        }
        .switches[hidden] { display: none !important; }
        .switches .side { display: flex; justify-content: space-around; min-width: 0; }
        .switches .side.l { width: var(--ml); }
        .switches .side.r { width: var(--mr); }
        .switches .gap { width: var(--mw); flex: none; }
        .switch {
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-width: var(--compost-channel-card-switch-min, 0px);
          min-height: max(1.4em, var(--compost-channel-card-switch-min, 0px));
          padding: 0.1em 0.3em;
          font-weight: 300;
          color: var(--compost-channel-card-faint);
          text-align: center;
        }
        .switch:hover { color: var(--compost-channel-card-muted); }
        .switch svg { display: block; width: 1.4em; height: 1.2em; fill: currentColor; stroke: currentColor;
          stroke-linecap: round; opacity: 0.9; }
        /* monitor: off is the dot and faint arcs; auto ("monitor while armed") is
           the dot and the near arc; in is the dot and both arcs — the attribute
           may carry the mode, monitor="auto" or monitor="in" (bare = in) */
        .switch svg .far { opacity: 0.45; }
        .switch[aria-pressed="true"] svg .far { opacity: 1; }
        :host([monitor="auto"]) .switch[data-switch="monitor"][aria-pressed="true"] { color: var(--compost-channel-card-text); }
        :host([monitor="auto"]) .switch[data-switch="monitor"][aria-pressed="true"] svg .far { opacity: 0.28; }
        .switch[data-switch="arm"][aria-pressed="true"],
        .switch[data-switch="mute"][aria-pressed="true"] { color: var(--compost-channel-card-over); }
        .switch[data-switch="monitor"][aria-pressed="true"] { color: var(--compost-channel-card-signal); }
        .switch[data-switch="solo"][aria-pressed="true"] { color: var(--compost-channel-card-select); }
        :host([solo-safe]) .switch[data-switch="solo"] {
          border-radius: 2px;
          box-shadow: inset 0 0 0 1px var(--compost-channel-card-select);
        }
        :host([data-narrow]) .switch { padding: 0.1em 0; }
        :host([data-narrow]) .switch svg { width: 1.1em; height: 1em; }
        @media (prefers-reduced-motion: reduce) { :host { transition: none; } }
      </style>
      <button class="input" part="input" type="button" hidden></button>
      <div class="panwrap" part="pan" hidden>
        <span class="pandb figure" part="pan-figure"></span>
        <div class="pan" part="pan-rail" role="slider" tabindex="0"><span class="track"></span><span class="bar"></span><span class="centre"></span></div>
      </div>
      <div class="main">
        <span class="level figure" part="level" tabindex="0" role="spinbutton"></span>
        <div class="sends" part="sends"></div>
      </div>
      <div class="switches" part="switches" hidden>
        <span class="side l"></span><span class="gap"></span><span class="side r"></span>
      </div>`;

    this.inputButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.input'));
    this.panWrap = /** @type {HTMLElement} */ (this.root.querySelector('.panwrap'));
    this.panFigure = /** @type {HTMLElement} */ (this.root.querySelector('.pandb'));
    this.panRail = /** @type {HTMLElement} */ (this.root.querySelector('.pan'));
    this.panBar = /** @type {HTMLElement} */ (this.root.querySelector('.pan .bar'));
    this.levelFigure = /** @type {HTMLElement} */ (this.root.querySelector('.level'));
    this.sendsElement = /** @type {HTMLElement} */ (this.root.querySelector('.sends'));
    this.switchesElement = /** @type {HTMLElement} */ (this.root.querySelector('.switches'));
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(this.measure) : null;

    this.inputButton.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('input-click', {
        bubbles: true, composed: true, detail: { anchor: this.inputButton },
      }));
    });
    for (const element of [this.panRail, this.panFigure]) {
      element.addEventListener('pointerdown', (event) => this.beginPanDrag(event));
      element.addEventListener('pointermove', (event) => this.movePanDrag(event));
      element.addEventListener('pointerup', (event) => this.endPanDrag(event));
      element.addEventListener('pointercancel', (event) => this.endPanDrag(event));
      element.addEventListener('dblclick', (event) => {
        event.preventDefault(); event.stopPropagation(); this.resetPan();
      });
    }
    this.panRail.addEventListener('keydown', (event) => this.handlePanKey(event));
    this.levelFigure.addEventListener('click', (event) => {
      event.stopPropagation(); this.beginEdit(this.editableValueText(), true);
    });
    this.levelFigure.addEventListener('keydown', (event) => this.handleLevelKey(event));
    this.switchesElement.addEventListener('click', (event) => {
      const button = event.composedPath().find((node) =>
        node instanceof HTMLElement && node.classList.contains('switch'));
      if (button instanceof HTMLElement && button.dataset.switch) {
        event.stopPropagation();
        this.toggleSwitch(event.altKey && button.dataset.switch === 'solo'
          ? 'solo-safe' : button.dataset.switch);
      }
    });
    // a send's own gesture must not read as a press on the column behind it
    this.sendsElement.addEventListener('pointerdown', (event) => event.stopPropagation());
  }

  connectedCallback() {
    this.readAttributes();
    this.refresh();
    this.resizeObserver?.observe(this);
    // a press on an idle part of this element is the column's to use
    if (!this.hasAttribute('data-strip-passthrough')) this.setAttribute('data-strip-passthrough', '');
    // the strip publishes where its gutter is after it has measured; lay out again then
    this.strip = this.closest('compost-channel-strip');
    this.strip?.addEventListener('channel-strip-measure', this.measure);
    requestAnimationFrame(this.measure);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.strip?.removeEventListener('channel-strip-measure', this.measure);
    this.strip = null;
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.readAttributes();
    this.refresh();
  }

  readAttributes() {
    this.label = this.getAttribute('label') || this.label;
    this.min = numberAttr(this, 'min', this.min);
    this.max = numberAttr(this, 'max', this.max);
    this.step = Math.max(0, numberAttr(this, 'step', this.step));
    this.resetValue = numberAttr(this, 'reset-value', this.resetValue);
    this.panResetValue = clamp(numberAttr(this, 'pan-reset-value', this.panResetValue), -1, 1);
    this._value = clamp(snap(numberAttr(this, 'value', this._value), this.step), this.min, this.max);
    this._pan = clamp(numberAttr(this, 'pan', this._pan), -1, 1);
  }

  get value() { return this._value; }

  set value(value) { this.setValue(value, false); }

  get pan() { return this._pan; }

  set pan(value) { this.setPan(value, false); }

  get sends() { return this._sends.map((send) => ({ ...send })); }

  set sends(value) { this.setSends(value); }

  get switches() {
    const list = (this.getAttribute('switches') ?? '').split(/[\s,]+/u).filter(Boolean);
    return list.filter((name) => SWITCHES.includes(name));
  }

  get disabled() { return this.hasAttribute('disabled'); }

  /** @param {string} name */
  switchParameterID(name) {
    return this.getAttribute(`${name}-parameter-id`) || '';
  }

  /** @param {unknown} value @param {boolean} [shouldEmit] @param {string} [source] */
  setValue(value, shouldEmit = true, source = 'control') {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const next = clamp(snap(number, this.step), this.min, this.max);
    if (next === this._value) return;
    this._value = next;
    if (this.getAttribute('value') !== String(next)) this.setAttribute('value', String(next));
    this.refresh();
    if (shouldEmit) {
      editParameterGesture(this, next, { source, parameterID: this.getAttribute('gain-parameter-id') || '', name: 'gain' });
    }
  }

  /** @param {unknown} value @param {boolean} [shouldEmit] @param {string} [source] */
  setPan(value, shouldEmit = true, source = 'control') {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const next = clamp(number, -1, 1);
    if (next === this._pan) return;
    this._pan = next;
    if (this.hasAttribute('pan') && this.getAttribute('pan') !== String(next)) this.setAttribute('pan', String(next));
    this.refresh();
    if (shouldEmit) editParameterGesture(this, next, { source, ...this.panDetail() });
  }

  panDetail() {
    return { parameterID: this.getAttribute('pan-parameter-id') || '', kind: 'continuous', name: 'pan' };
  }

  /** Replaces the sends; each is {label, value, parameterID, min, max, step, mid, resetValue, minLabel}. */
  /** @param {SendSpec[]} sends */
  setSends(sends) {
    this._sends = Array.isArray(sends) ? sends.map((send) => ({ ...send })) : [];
    this.renderSends();
    requestAnimationFrame(this.measure);
  }

  /** Updates one send's value without rebuilding or emitting. */
  /** @param {number} index @param {number} value */
  setSendValue(index, value) {
    const send = this._sends[index];
    if (!send) return;
    send.value = Number(value);
    const row = this.sendsElement.children[index];
    const box = row?.querySelector('compost-number-box');
    if (box) {
      /** @type {any} */ (box).setValue(send.value, false, 'host');
      row.toggleAttribute('data-live', send.value > (send.min ?? -90));
    }
  }

  // ---- Switches ---------------------------------------------------------------

  /** @param {string} name */
  toggleSwitch(name) {
    if (this.disabled) return;
    const next = !this.hasAttribute(name);
    const detail = { parameterID: this.switchParameterID(name), kind: 'discrete', name };
    beginParameterGesture(this, next ? 1 : 0, detail);
    editParameterGesture(this, next ? 1 : 0, detail);
    endParameterGesture(this, next ? 1 : 0, detail);
  }

  // ---- Pan gesture ------------------------------------------------------------

  /** @param {PointerEvent} event */
  beginPanDrag(event) {
    if (this.disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.panDrag = { pointerId: event.pointerId, x: event.clientX, pan: this._pan };
    /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
    beginParameterGesture(this, this._pan, this.panDetail());
  }

  /** @param {PointerEvent} event */
  movePanDrag(event) {
    if (!this.panDrag || event.pointerId !== this.panDrag.pointerId) return;
    const fine = event.altKey || event.shiftKey;
    this.setPan(this.panDrag.pan + (event.clientX - this.panDrag.x) * (fine ? PAN_PER_PIXEL_FINE : PAN_PER_PIXEL));
  }

  /** @param {PointerEvent} event */
  endPanDrag(event) {
    if (!this.panDrag || event.pointerId !== this.panDrag.pointerId) return;
    this.panDrag = null;
    endParameterGesture(this, this._pan, this.panDetail());
  }

  resetPan() {
    this.setPan(this.panResetValue);
    endParameterGesture(this, this._pan, this.panDetail());
  }

  /** Arrows walk the rail: a twentieth of the field, a quarter with Alt. */
  /** @param {KeyboardEvent} event */
  handlePanKey(event) {
    if (this.disabled || event.metaKey || event.ctrlKey) return;
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    const home = event.key === 'Home' || event.key === 'End' || event.key === 'Escape';
    if (!direction && !home) return;
    event.preventDefault();
    event.stopPropagation();
    const detail = this.panDetail();
    beginParameterGesture(this, this._pan, detail);
    if (home) this.setPan(event.key === 'End' ? 1 : event.key === 'Home' ? -1 : this.panResetValue);
    else this.setPan(this._pan + direction * (event.altKey ? 0.25 : 0.05));
    endParameterGesture(this, this._pan, detail);
  }

  // ---- Level entry ------------------------------------------------------------

  editableValueText() {
    return formatNumber(this._value, this.step);
  }

  /** @param {KeyboardEvent} event */
  handleLevelKey(event) {
    if (this.disabled || this.editing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      this.beginEdit(this.editableValueText(), true);
    } else if (/^[0-9.+-]$/u.test(event.key)) {
      event.preventDefault(); event.stopPropagation();
      this.beginEdit(event.key, false);
    }
  }

  /** @param {string} initialValue @param {boolean} selectValue */
  beginEdit(initialValue, selectValue) {
    if (this.editing || this.disabled) return;
    this.editing = true;
    const gainDetail = { parameterID: this.getAttribute('gain-parameter-id') || '', name: 'gain' };
    beginParameterGesture(this, this._value, gainDetail);
    const input = document.createElement('input');
    input.className = 'editor';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = initialValue;
    input.setAttribute('aria-label', `Set ${this.label} level`);
    const finish = (/** @type {boolean} */ commit) => {
      if (!this.editing) return;
      this.editing = false;
      const number = Number(input.value.trim());
      this.levelFigure.replaceChildren();
      if (commit && input.value.trim() !== '' && Number.isFinite(number)) {
        this.setValue(number);
        endParameterGesture(this, this._value, gainDetail);
      } else {
        endParameterGesture(this, this._value, { ...gainDetail, cancelled: true });
      }
      this.refresh();
      queueMicrotask(() => this.levelFigure.focus({ preventScroll: true }));
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.levelFigure.replaceChildren(input);
    input.focus();
    if (selectValue) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }

  // ---- Layout -------------------------------------------------------------------

  /** Reads how much lane the gutter leaves and stacks the rows when it is too little. */
  measure() {
    if (!this.isConnected) return;
    const width = this.clientWidth;
    if (!width) return;
    const style = getComputedStyle(this);
    const fontSize = parseFloat(style.fontSize) || 12;
    const pad = parseFloat(style.paddingLeft) || 0;
    const gutterLeft = parseFloat(style.getPropertyValue('--compost-channel-card-gutter-left'));
    const gutterWidth = parseFloat(style.getPropertyValue('--compost-channel-card-gutter-width')) || 0;
    const air = fontSize * 0.36;
    // the gutter is given in px when the strip has measured; a percentage falls back to the middle
    const left = Number.isFinite(gutterLeft) && style.getPropertyValue('--compost-channel-card-gutter-left').trim().endsWith('px')
      ? gutterLeft : (width - gutterWidth) / 2;
    const laneRight = Math.max(0, width - left - gutterWidth - pad - air);
    const laneLeft = Math.max(0, left - pad - air);
    this.style.setProperty('--panw', `${Math.round(clamp((width - pad * 2) * 0.52, fontSize * 3.45, fontSize * 8.7))}px`);
    this.toggleAttribute('data-tight', laneRight < fontSize * TIGHT_LANE_EM);
    this.toggleAttribute('data-narrow', width < fontSize * NARROW_WIDTH_EM);
    // a figure the lane cannot hold is cut through the rail instead of run across it
    this.removeAttribute('data-cramped');
    if (this.levelFigure.scrollWidth > laneLeft + air) this.setAttribute('data-cramped', '');
  }

  // ---- Rendering --------------------------------------------------------------------

  renderSends() {
    const rows = this._sends.map((send, index) => {
      const row = document.createElement('div');
      row.className = 'send';
      row.part.add('send');
      const min = send.min ?? -90;
      row.toggleAttribute('data-live', send.value > min);
      const label = document.createElement('label');
      label.textContent = send.label;
      label.htmlFor = `${this.cardID}-send-${index}`;
      label.title = `Send ${send.label} · ${this.label}`;
      // the letter names the return; a host may take a press on it as "show me that return"
      label.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('send-click', {
          bubbles: true, composed: true, detail: { index, label: send.label },
        }));
      });
      const box = document.createElement('compost-number-box');
      box.id = `${this.cardID}-send-${index}`;
      if (send.parameterID) box.setAttribute('parameter-id', send.parameterID);
      box.setAttribute('label', `Send ${send.label}`);
      // the card knows whose channel this is; the send says so out loud
      box.setAttribute('aria-label', `Send ${send.label} · ${this.label}`);
      box.setAttribute('min', String(min));
      box.setAttribute('max', String(send.max ?? 6));
      box.setAttribute('step', String(send.step ?? 0.1));
      box.setAttribute('mid', String(send.mid ?? -18));
      box.setAttribute('min-label', send.minLabel ?? '—');
      box.setAttribute('reset-value', String(send.resetValue ?? min));
      box.setAttribute('value', String(send.value));
      box.addEventListener('parameter-edit', (event) => {
        const value = Number(/** @type {CustomEvent} */ (event).detail?.value);
        if (Number.isFinite(value)) {
          send.value = value;
          row.toggleAttribute('data-live', value > min);
        }
      });
      row.append(label, box);
      return row;
    });
    this.sendsElement.replaceChildren(...rows);
  }

  renderSwitches() {
    const names = this.switches;
    this.switchesElement.hidden = names.length === 0;
    if (names.length === 0) return;
    const half = Math.ceil(names.length / 2);
    const sides = [this.switchesElement.children[0], this.switchesElement.children[2]];
    const existing = [...this.switchesElement.querySelectorAll('.switch')].map((button) =>
      /** @type {HTMLElement} */ (button).dataset.switch);
    if (existing.join(' ') !== names.join(' ')) {
      sides[0].replaceChildren();
      sides[1].replaceChildren();
      names.forEach((name, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'switch';
        button.part.add('switch');
        button.dataset.switch = name;
        if (name === 'monitor') button.innerHTML = MONITOR_SVG;
        else button.textContent = { arm: '●', mute: 'M', solo: 'S' }[name] ?? name;
        sides[index < half ? 0 : 1].append(button);
      });
    }
    for (const button of this.switchesElement.querySelectorAll('.switch')) {
      const name = /** @type {HTMLElement} */ (button).dataset.switch ?? '';
      const on = this.hasAttribute(name);
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', `${name === 'arm' ? 'Arm' : name === 'monitor' ? 'Monitor'
        : name === 'mute' ? 'Mute' : 'Solo'} ${this.label}`);
      button.title = name === 'arm' ? 'arm'
        : name === 'monitor' ? 'monitor: off · auto · in'
        : name === 'mute' ? 'mute  m' : 'solo  s · ⌥-click: solo defeat';
      button.toggleAttribute('disabled', this.disabled);
    }
  }

  refresh() {
    if (!this.levelFigure) return;
    const input = this.getAttribute('input');
    this.inputButton.hidden = input === null;
    this.inputButton.textContent = input ?? '';
    this.inputButton.setAttribute('aria-label', `${this.label} input: ${input ?? 'none'}`);
    this.inputButton.setAttribute('aria-haspopup', 'menu');
    const hasPan = this.hasAttribute('pan');
    this.panWrap.hidden = !hasPan;
    if (hasPan) {
      this.panFigure.textContent = panText(this._pan);
      this.panFigure.toggleAttribute('data-mid', Math.abs(this._pan) < 0.02);
      const bar = panBar(this._pan);
      this.panBar.style.left = `${bar.left.toFixed(1)}%`;
      this.panBar.style.width = `${bar.width.toFixed(1)}%`;
      this.panRail.setAttribute('aria-label', `${this.label} pan`);
      this.panRail.setAttribute('aria-valuemin', '-1');
      this.panRail.setAttribute('aria-valuemax', '1');
      this.panRail.setAttribute('aria-valuenow', String(this._pan));
      this.panRail.setAttribute('aria-valuetext', panText(this._pan));
      this.panRail.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
      this.panRail.tabIndex = this.disabled ? -1 : 0;
    }
    if (!this.editing) {
      this.levelFigure.textContent = this._value <= this.min ? '-inf' : formatNumber(this._value, this.step);
    }
    this.levelFigure.setAttribute('aria-label', `${this.label} level`);
    this.levelFigure.setAttribute('aria-valuemin', String(this.min));
    this.levelFigure.setAttribute('aria-valuemax', String(this.max));
    this.levelFigure.setAttribute('aria-valuenow', String(this._value));
    this.levelFigure.setAttribute('aria-valuetext', this._value <= this.min ? '-inf dB'
      : `${formatNumber(this._value, this.step)} dB`);
    this.levelFigure.tabIndex = this.disabled ? -1 : 0;
    this.renderSwitches();
    requestAnimationFrame(this.measure);
  }
}

defineElement('compost-channel-card', CompostChannelCard);
