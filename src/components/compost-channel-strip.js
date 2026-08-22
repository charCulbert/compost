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

let nextStripID = 1;
const MAX_CHANNELS = 16;
const AXIS_DEADZONE = 3;
const PAN_BIAS = 1.4;
const GAIN_PER_PIXEL = 0.22;
const GAIN_PER_PIXEL_FINE = 0.06;
const PAN_PER_PIXEL = 0.014;
const PAN_PER_PIXEL_FINE = 0.004;
const SECOND_PRESS_MS = 320;

// The fader's taper, as (dB, fraction of the column) pairs from the top down:
// 0 dB lands at 70% of the height, with the quiet end compressed. The wash,
// the 0 dB notch, the scale marks and the meters all read off this one table,
// which is what keeps a meter level and the wash edge on the same axis.
export const DEFAULT_TAPER = Object.freeze([
  [12, 1], [6, 0.85], [0, 0.7], [-6, 0.6], [-12, 0.5], [-24, 0.35],
  [-36, 0.25], [-48, 0.17], [-60, 0.1], [-90, 0],
]);

/** Reads a taper attribute like "12:1 6:.85 0:.7 -90:0". */
/** @param {string|null|undefined} text @returns {readonly (readonly [number, number])[]} */
export function parseTaper(text) {
  if (!text) return DEFAULT_TAPER;
  const points = String(text).trim().split(/[\s,]+/u).map((pair) => {
    const [db, fraction] = pair.split(':').map(Number);
    return Number.isFinite(db) && Number.isFinite(fraction) ? [db, clamp(fraction, 0, 1)] : null;
  }).filter((point) => point !== null).sort((a, b) => b[0] - a[0]);
  return points.length >= 2 ? /** @type {[number, number][]} */ (points) : DEFAULT_TAPER;
}

/** Height of the wash for a level, as a 0..1 fraction of the column. */
/** @param {number} db @param {readonly (readonly [number, number])[]} [taper] */
export function washPosition(db, taper = DEFAULT_TAPER) {
  const value = Number(db);
  if (!Number.isFinite(value)) return 0;
  const top = taper[0];
  const bottom = taper[taper.length - 1];
  if (value >= top[0]) return top[1];
  if (value <= bottom[0]) return bottom[1];
  for (let index = 0; index < taper.length - 1; index += 1) {
    const [a, fa] = taper[index];
    const [b, fb] = taper[index + 1];
    if (value <= a && value >= b) return fb + (fa - fb) * (value - b) / (a - b);
  }
  return 0;
}

/** Chooses the drag axis from the first movement: sideways means pan. */
/** @param {number} dx @param {number} dy */
export function dragAxis(dx, dy) {
  if (Math.abs(dx) < AXIS_DEADZONE && Math.abs(dy) < AXIS_DEADZONE) return null;
  return Math.abs(dx) > Math.abs(dy) * PAN_BIAS ? 'pan' : 'gain';
}

/**
 * A track column that is the channel: a translucent wash rising from the
 * floor to the gain level is the fader — its top edge is the handle, and a
 * drag anywhere in the column moves it. Meters ride over the wash on the
 * same dB axis, with 0 dB cut through the rail as a notch, so a meter level
 * that meets the wash edge means signal at unity. Slotted content (header,
 * clips, devices, the channel card) sits on top.
 *
 * Vertical drags set gain and horizontal drags set pan, the axis picked from
 * the first movement. Alt, Shift, or a second press makes the drag fine;
 * double-click resets gain (with Alt, pan); typing a number sets the gain;
 * arrows nudge by 1 dB and 5% pan, Alt for more.
 *
 * UI only: it draws the gain, pan and levels it is handed, and reports
 * intent through parameter-begin / parameter-edit / parameter-end.
 */
export class CompostChannelStrip extends HTMLElement {
  static get observedAttributes() {
    return [
      'name', 'parameter-id', 'pan-parameter-id', 'label',
      'min', 'max', 'step', 'value', 'reset-value', 'pan', 'pan-reset-value',
      'channels', 'meter-position', 'scale', 'scale-marks', 'taper',
      'muted', 'disabled',
    ];
  }

  constructor() {
    super();

    this.name = '';
    this.parameterID = '';
    this.panParameterID = '';
    this.label = 'Channel';
    this.min = -90;
    this.max = 12;
    this.step = 0.1;
    this.resetValue = 0;
    this.panResetValue = 0;
    this._value = 0;
    this._pan = 0;
    this.channels = 2;
    this.taper = DEFAULT_TAPER;
    this.scaleMarks = [0, -12, -24, -48];
    /** @type {number[]} */ this._levels = [];
    this.inputID = `compost-channel-strip-${nextStripID++}`;
    this.lastUpdateSource = 'control';
    this.lastPressTime = 0;
    /** @type {{pointerId: number, x: number, y: number, gain: number, pan: number,
     * axis: 'gain'|'pan'|null, fine: boolean}|null} */
    this.drag = null;
    this.editing = false;
    this.renderedChannels = 0;
    this.handleWindowBlur = () => this.cancelDrag();
    this.measure = this.measure.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-channel-strip-bg: #ffffff;
          --compost-channel-strip-signal: #c45a2c;
          --compost-channel-strip-wash-opacity: 0.15;
          --compost-channel-strip-meter-opacity: 0.72;
          --compost-channel-strip-over: #d98a4a;
          --compost-channel-strip-rail: rgba(17, 17, 17, 0.12);
          --compost-channel-strip-zero: rgba(17, 17, 17, 0.42);
          --compost-channel-strip-scale-text: #6a6a6a;
          --compost-channel-strip-editor-bg: #ffffff;
          --compost-channel-strip-editor-text: #111111;
          --compost-channel-strip-focus: #005fc0;
          --compost-channel-strip-meter-width: 1.18em;
          --compost-channel-strip-meter-top: 2.73em;
          --compost-channel-strip-meter-bottom: 0.36em;
          --compost-channel-strip-meter-right: 1.73em;
          --compost-channel-strip-scale-font-size: 0.73em;
          --compost-channel-strip-numeral-font: ui-monospace, SFMono-Regular, Menlo, monospace;
          --compost-channel-strip-color-scheme: light;
          color-scheme: var(--compost-channel-strip-color-scheme);
          position: relative;
          display: block;
          box-sizing: border-box;
          min-height: 0;
          cursor: ns-resize;
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
          outline: none;
        }
        :host([disabled]) { cursor: default; }
        .surface {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .wash {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 0;
          background: var(--compost-channel-strip-signal);
          opacity: var(--compost-channel-strip-wash-opacity);
          transition: opacity 120ms;
        }
        :host([muted]) .wash { opacity: calc(var(--compost-channel-strip-wash-opacity) * 0.3); }
        /* the rail is inset from the header and the floor, but every bar spans
           the whole column and is clipped to the rail, so its percentages are
           the wash's percentages: one axis */
        .meter {
          position: absolute;
          top: 0;
          bottom: 0;
          display: flex;
          gap: 1px;
          width: var(--compost-channel-strip-meter-width);
          opacity: var(--compost-channel-strip-meter-opacity);
          clip-path: inset(var(--compost-channel-strip-meter-top) 0 var(--compost-channel-strip-meter-bottom) 0);
        }
        .meter, .zero { left: 50%; transform: translateX(-50%); }
        :host([meter-position="right"]) .meter,
        :host([meter-position="right"]) .zero {
          left: auto;
          right: var(--compost-channel-strip-meter-right);
          transform: none;
        }
        .bar { position: relative; flex: 1 1 0; min-width: 1px; }
        .bar .rail {
          position: absolute;
          left: 0;
          right: 0;
          top: var(--compost-channel-strip-meter-top);
          bottom: var(--compost-channel-strip-meter-bottom);
          background: var(--compost-channel-strip-rail);
        }
        .bar .fill {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 0;
          background: var(--compost-channel-strip-signal);
        }
        .bar .over {
          position: absolute;
          left: 0;
          right: 0;
          height: 0;
          background: var(--compost-channel-strip-over);
        }
        /* 0 dB is a notch cut through the rail — a gap, not a rule on top */
        .zero {
          position: absolute;
          width: var(--compost-channel-strip-meter-width);
          height: 2px;
          margin-top: -1px;
          background: var(--compost-channel-strip-bg);
          z-index: 2;
        }
        :host(:hover) .zero, :host([data-dragging]) .zero {
          box-shadow: inset 0 0 0 99px var(--compost-channel-strip-zero);
        }
        .scale {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 140ms;
          font-family: var(--compost-channel-strip-numeral-font);
          font-size: var(--compost-channel-strip-scale-font-size);
          letter-spacing: 0;
          color: var(--compost-channel-strip-scale-text);
        }
        :host([data-dragging]) .scale, :host([scale="always"]) .scale { opacity: 0.75; }
        :host([scale="none"]) .scale { display: none; }
        .scale span {
          position: absolute;
          right: 0.25em;
          transform: translateY(-50%);
          line-height: 1;
          white-space: nowrap;
        }
        :host(:not([meter-position="right"])) .scale span {
          right: auto;
          left: calc(50% + var(--compost-channel-strip-meter-width) * 1.5);
        }
        .content {
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
        }
        .editor {
          position: absolute;
          left: 0.5em;
          z-index: 3;
          width: 5em;
          box-sizing: border-box;
          border: 0;
          outline: 1px solid var(--compost-channel-strip-focus);
          background: var(--compost-channel-strip-editor-bg);
          color: var(--compost-channel-strip-editor-text);
          font: inherit;
          font-family: var(--compost-channel-strip-numeral-font);
          padding: 0.1em 0.3em;
          transform: translateY(-100%);
          -webkit-user-select: text;
          user-select: text;
        }
        :host(:focus-visible) .zero { box-shadow: inset 0 0 0 99px var(--compost-channel-strip-focus); }
        @media (prefers-reduced-motion: reduce) { .wash, .scale { transition: none; } }
      </style>
      <div class="surface" part="surface" aria-hidden="true">
        <div class="wash" part="wash"></div>
        <div class="meter" part="meter"></div>
        <div class="zero" part="zero"></div>
        <div class="scale" part="scale"></div>
      </div>
      <div class="content" part="content"><slot></slot></div>`;

    this.surface = /** @type {HTMLElement} */ (this.root.querySelector('.surface'));
    this.wash = /** @type {HTMLElement} */ (this.root.querySelector('.wash'));
    this.meter = /** @type {HTMLElement} */ (this.root.querySelector('.meter'));
    this.zero = /** @type {HTMLElement} */ (this.root.querySelector('.zero'));
    this.scale = /** @type {HTMLElement} */ (this.root.querySelector('.scale'));
    this.content = /** @type {HTMLElement} */ (this.root.querySelector('.content'));
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(this.measure) : null;

    this.addEventListener('pointerdown', (event) => this.beginDrag(event));
    this.addEventListener('pointermove', (event) => this.moveDrag(event));
    this.addEventListener('pointerup', (event) => this.endDrag(event));
    this.addEventListener('pointercancel', () => this.cancelDrag());
    this.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    this.addEventListener('keydown', (event) => this.handleKey(event));
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.readAttributes();
    this.refresh();
    this.resizeObserver?.observe(this);
    requestAnimationFrame(this.measure);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    window.removeEventListener('blur', this.handleWindowBlur);
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.readAttributes();
    this.refresh();
  }

  readAttributes() {
    this.name = this.getAttribute('name') || this.name;
    this.parameterID = this.getAttribute('parameter-id') || '';
    this.panParameterID = this.getAttribute('pan-parameter-id') || '';
    this.label = this.getAttribute('label') || this.label;
    this.min = numberAttr(this, 'min', this.min);
    this.max = numberAttr(this, 'max', this.max);
    this.step = Math.max(0, numberAttr(this, 'step', this.step));
    this.resetValue = numberAttr(this, 'reset-value', this.resetValue);
    this.panResetValue = clamp(numberAttr(this, 'pan-reset-value', this.panResetValue), -1, 1);
    this.channels = clamp(Math.round(numberAttr(this, 'channels', this.channels)), 1, MAX_CHANNELS);
    this.taper = parseTaper(this.getAttribute('taper'));
    const marks = this.getAttribute('scale-marks');
    this.scaleMarks = marks === null ? this.scaleMarks
      : marks.split(/[\s,]+/u).map(Number).filter(Number.isFinite);
    this.setValue(numberAttr(this, 'value', this._value), false);
    this.setPan(numberAttr(this, 'pan', this._pan), false);
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this.setValue(value, false);
  }

  get pan() {
    return this._pan;
  }

  set pan(value) {
    this.setPan(value, false);
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get parameterKind() {
    return this.getAttribute('parameter-kind') || 'continuous';
  }

  get levels() {
    return this._levels.slice();
  }

  /** @param {unknown} value @param {boolean} [shouldEmit] @param {string} [source] */
  setValue(value, shouldEmit = true, source = 'control') {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const next = clamp(snap(number, this.step), this.min, this.max);
    if (next === this._value) return;
    this.lastUpdateSource = source;
    this._value = next;
    if (this.getAttribute('value') !== String(next)) this.setAttribute('value', String(next));
    this.refresh();
    if (shouldEmit) editParameterGesture(this, this._value, { source });
  }

  /** @param {unknown} value @param {boolean} [shouldEmit] @param {string} [source] */
  setPan(value, shouldEmit = true, source = 'control') {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const next = clamp(number, -1, 1);
    if (next === this._pan) return;
    this._pan = next;
    if (this.getAttribute('pan') !== String(next)) this.setAttribute('pan', String(next));
    this.refresh();
    if (shouldEmit) editParameterGesture(this, this._pan, { source, ...this.panDetail() });
  }

  panDetail() {
    return { parameterID: this.panParameterID, kind: 'continuous' };
  }

  /** The host hands over peak levels in dB, one per channel; nothing is emitted. */
  /** @param {readonly number[]|number} levels */
  setLevels(levels) {
    const list = Array.isArray(levels) ? levels : [levels];
    const next = [];
    for (let index = 0; index < this.channels; index += 1) {
      const raw = Number(list[index]);
      next[index] = Number.isFinite(raw) ? raw : this.min;
    }
    this._levels = next;
    this.renderMeter();
  }

  getParameterValue() {
    return this._value;
  }

  // ---- Geometry -------------------------------------------------------------

  /** @param {number} db */
  position(db) {
    return washPosition(db, this.taper);
  }

  /** Publishes where the meter sits, so slotted content can lay out around it. */
  measure() {
    if (!this.isConnected) return;
    const host = this.getBoundingClientRect();
    const meter = this.meter.getBoundingClientRect();
    if (!host.width || !meter.width) return;
    this.style.setProperty('--compost-channel-strip-meter-left', `${(meter.left - host.left).toFixed(2)}px`);
    this.style.setProperty('--compost-channel-strip-meter-measured-width', `${meter.width.toFixed(2)}px`);
    this.style.setProperty('--compost-channel-strip-meter-right-gap', `${(host.right - meter.right).toFixed(2)}px`);
    this.dispatchEvent(new CustomEvent('channel-strip-measure', { detail: { left: meter.left - host.left, width: meter.width } }));
  }

  // ---- Gestures -------------------------------------------------------------

  /** Anything that has its own job — a control, a link, a marked element — keeps its press. */
  /** @param {Event} event */
  ownsPointer(event) {
    return event.composedPath().some((node) => {
      if (!(node instanceof Element) || node === this) return false;
      if (node.hasAttribute?.('data-strip-ignore')) return true;
      const tag = node.tagName;
      return tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
        || (tag === 'A' && node.hasAttribute('href')) || node.getAttribute('contenteditable') === 'true'
        || node.getAttribute('draggable') === 'true' || tag.includes('-');
    });
  }

  /** @param {PointerEvent} event */
  beginDrag(event) {
    if (this.disabled || event.button !== 0 || this.drag || this.ownsPointer(event)) return;
    const now = performance.now();
    const secondPress = this.lastPressTime > 0 && now - this.lastPressTime < SECOND_PRESS_MS;
    this.drag = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      gain: this._value, pan: this._pan, axis: null,
      fine: Boolean(event.altKey || event.shiftKey || secondPress),
    };
    this.setPointerCapture?.(event.pointerId);
    HTMLElement.prototype.focus.call(this, { preventScroll: true });
    window.addEventListener('blur', this.handleWindowBlur);
  }

  /** @param {PointerEvent} event */
  moveDrag(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = drag.y - event.clientY;
    if (!drag.axis) {
      drag.axis = dragAxis(dx, dy);
      if (!drag.axis) return;
      this.setAttribute('data-dragging', drag.axis);
      if (drag.axis === 'gain') beginParameterGesture(this, this._value);
      else beginParameterGesture(this, this._pan, this.panDetail());
    }
    event.preventDefault();
    const fine = drag.fine || event.altKey || event.shiftKey;
    if (drag.axis === 'gain') {
      this.setValue(drag.gain + dy * (fine ? GAIN_PER_PIXEL_FINE : GAIN_PER_PIXEL));
    } else {
      this.setPan(drag.pan + dx * (fine ? PAN_PER_PIXEL_FINE : PAN_PER_PIXEL));
    }
  }

  /** @param {PointerEvent} event */
  endDrag(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.finishDrag(false);
  }

  cancelDrag() {
    if (this.drag) this.finishDrag(true);
  }

  /** @param {boolean} cancelled */
  finishDrag(cancelled) {
    const drag = this.drag;
    this.drag = null;
    window.removeEventListener('blur', this.handleWindowBlur);
    this.removeAttribute('data-dragging');
    if (!drag) return;
    if (drag.axis === 'gain') {
      endParameterGesture(this, this._value, cancelled ? { cancelled: true } : {});
      this.lastPressTime = 0;
    } else if (drag.axis === 'pan') {
      endParameterGesture(this, this._pan, { ...this.panDetail(), ...(cancelled ? { cancelled: true } : {}) });
      this.lastPressTime = 0;
    } else {
      // a press that went nowhere arms the next one as fine
      this.lastPressTime = cancelled ? 0 : performance.now();
    }
  }

  /** @param {MouseEvent} event */
  handleDoubleClick(event) {
    if (this.disabled || this.ownsPointer(event)) return;
    event.preventDefault();
    if (event.altKey || event.shiftKey) this.resetPan();
    else this.reset();
  }

  reset() {
    this.setValue(this.resetValue);
    endParameterGesture(this, this._value);
  }

  resetPan() {
    this.setPan(this.panResetValue);
    endParameterGesture(this, this._pan, this.panDetail());
  }

  /** @param {KeyboardEvent} event */
  handleKey(event) {
    if (this.disabled || this.editing || event.metaKey || event.ctrlKey) return;
    if (event.composedPath()[0] !== this) return;   // slotted controls keep their keys
    const gainStep = event.altKey ? 6 : 1;
    const panStep = event.altKey ? 0.25 : 0.05;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.setValue(this._value + (event.key === 'ArrowUp' ? gainStep : -gainStep));
      endParameterGesture(this, this._value);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.setPan(this._pan + (event.key === 'ArrowRight' ? panStep : -panStep));
      endParameterGesture(this, this._pan, this.panDetail());
    } else if (event.key === 'Home') {
      event.preventDefault(); this.setValue(this.min); endParameterGesture(this, this._value);
    } else if (event.key === 'End') {
      event.preventDefault(); this.setValue(this.max); endParameterGesture(this, this._value);
    } else if (event.key === 'Enter') {
      event.preventDefault(); this.beginEdit(formatNumber(this._value, this.step), true);
    } else if (/^[0-9.+-]$/u.test(event.key) && !event.altKey) {
      event.preventDefault(); this.beginEdit(event.key, false);
    }
  }

  /** Typing a number straight onto a focused channel sets its gain. */
  /** @param {string} initialValue @param {boolean} selectValue */
  beginEdit(initialValue, selectValue) {
    if (this.editing || this.disabled) return;
    this.editing = true;
    beginParameterGesture(this, this._value);
    const input = document.createElement('input');
    input.className = 'editor';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = initialValue;
    input.setAttribute('aria-label', `Set ${this.label} gain`);
    input.style.top = `${(1 - this.position(this._value)) * 100}%`;
    const finish = (/** @type {boolean} */ commit) => {
      if (!this.editing) return;
      this.editing = false;
      const number = Number(input.value.trim());
      input.remove();
      if (commit && input.value.trim() !== '' && Number.isFinite(number)) {
        this.setValue(number);
        endParameterGesture(this, this._value);
      } else {
        endParameterGesture(this, this._value, { cancelled: true });
      }
      queueMicrotask(() => HTMLElement.prototype.focus.call(this, { preventScroll: true }));
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.surface.append(input);
    input.focus();
    if (selectValue) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }

  // ---- Rendering ------------------------------------------------------------

  renderChannels() {
    if (this.renderedChannels === this.channels) return;
    const markup = [];
    for (let index = 0; index < this.channels; index += 1) {
      markup.push('<span class="bar" part="bar"><span class="rail"></span>'
        + '<span class="fill" part="fill"></span><span class="over" part="over"></span></span>');
    }
    this.meter.innerHTML = markup.join('');
    this.renderedChannels = this.channels;
    requestAnimationFrame(this.measure);
  }

  renderMeter() {
    this.renderChannels();
    const zero = this.position(0) * 100;
    const bars = this.meter.children;
    for (let index = 0; index < bars.length; index += 1) {
      const bar = /** @type {HTMLElement} */ (bars[index]);
      const level = this._levels[index];
      const fill = Number.isFinite(level) ? this.position(level) * 100 : 0;
      const fillElement = /** @type {HTMLElement} */ (bar.children[1]);
      const overElement = /** @type {HTMLElement} */ (bar.children[2]);
      fillElement.style.height = `${fill.toFixed(2)}%`;
      overElement.style.bottom = `${zero.toFixed(2)}%`;
      overElement.style.height = `${Math.max(0, fill - zero).toFixed(2)}%`;
    }
  }

  renderScale() {
    this.scale.innerHTML = this.scaleMarks
      .filter((db) => db <= this.max && db >= this.min)
      .map((db) => `<span style="top:${((1 - this.position(db)) * 100).toFixed(2)}%">${db}</span>`)
      .join('');
  }

  valueText() {
    const gain = this._value <= this.min ? '-inf dB' : `${formatNumber(this._value, this.step)} dB`;
    const pan = Math.abs(this._pan) < 0.02 ? 'centre'
      : `${Math.round(Math.abs(this._pan) * 100)}% ${this._pan < 0 ? 'left' : 'right'}`;
    return `${gain}, pan ${pan}`;
  }

  refresh() {
    if (!this.wash) return;
    this.wash.style.height = `${(this.position(this._value) * 100).toFixed(2)}%`;
    this.zero.style.top = `${((1 - this.position(0)) * 100).toFixed(2)}%`;
    this.renderScale();
    this.renderMeter();
    this.tabIndex = this.disabled ? -1 : 0;
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-label', this.label);
    this.setAttribute('aria-orientation', 'vertical');
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this._value));
    this.setAttribute('aria-valuetext', this.valueText());
    this.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
  }
}

defineElement('compost-channel-strip', CompostChannelStrip);
