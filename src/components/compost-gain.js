import {
  moveValueByNormalisedDelta,
  normaliseCurveName,
  normalisedKeyboardStep,
  normalisedPositionToValue,
  valueToNormalisedPosition,
} from '../parameter-scale.js';
import {
  clamp,
  beginParameterGesture,
  defineElement,
  editParameterGesture,
  endParameterGesture,
  formatNumber,
  formatValue,
  numberAttr,
  snap,
} from '../utils.js';

let nextGainID = 1;
const FINE_DRAG_SCALE = 0.1;
const MAX_CHANNELS = 16;

// Meter fraction is DOM-free so it can be unit-tested directly.
// The fader and the meter share one rail, so they must share one dB -> position
// mapping or unity on the fader lands nowhere near 0 on the printed scale.
// The fader's scale is the authority: it is the one that has to span min..max.
export function railFraction(db, scaleOptions) {
  const value = Number(db);
  if (!Number.isFinite(value)) return 0;
  return clamp(valueToNormalisedPosition(value, scaleOptions), 0, 1);
}

export function meterFraction(level, meterMin, meterMax) {
  const value = Number(level);
  if (!Number.isFinite(value)) return 0;
  if (meterMax === meterMin) return 0;
  return clamp((value - meterMin) / (meterMax - meterMin), 0, 1);
}

export class CompostGain extends HTMLElement {
  static get observedAttributes() {
    return [
      'name',
      'parameter-id',
      'label',
      'section',
      'orientation',
      'min',
      'max',
      'mid',
      'curve',
      'shape',
      'position-step',
      'step',
      'display-fraction-digits',
      'value',
      'text',
      'options',
      'editable',
      'unit',
      'reset-value',
      'min-label',
      'max-label',
      'init',
      'disabled',
      'channels',
      'meter-min',
      'meter-max',
      'clip-level',
      'peak-hold',
    ];
  }

  constructor() {
    super();

    // Fader state (mirrors compost-slider).
    this.name = '';
    this.parameterID = '';
    this.label = 'Gain';
    this.section = '';
    this.min = -90;
    this.max = 12;
    this.mid = -12;
    this.curve = 'linear';
    this.shape = 1;
    this.positionStep = null;
    this.step = 0.1;
    this.displayFractionDigits = null;
    this.unit = ' dB';
    this.valueText = '';
    this._value = 0;
    this.resetValue = 0;
    this.minLabel = '';
    this.maxLabel = '';
    this.inputID = `compost-gain-${nextGainID++}`;
    this.labelID = `${this.inputID}-label`;
    this.lastUpdateSource = 'control';
    this.lastClickTime = 0;
    this.pointerStart = null;
    this.handleWindowBlur = () => this.cancelPointer();

    // Meter state (independent of the gain value).
    this.channels = 2;
    this.meterMin = -60;
    this.meterMax = 6;
    this.clipLevel = 0;
    this.peakHold = 1500;
    this._levels = [];
    this._peaks = [];
    this._peakTimes = [];
    this._clipUntil = [];
    this._clipTimer = null;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --gain-panel-bg: transparent;
          --gain-text: #111111;
          --gain-value: #555555;
          --gain-track: rgba(17, 17, 17, 0.16);
          --gain-rail-bg: rgba(17, 17, 17, 0.06);
          --gain-meter-unlit: #efefef;
          --gain-thumb: #111111;
          --gain-thumb-border: #ffffff;
          --gain-scale-line: rgba(17, 17, 17, 0.22);
          --gain-scale-text: #6a6a6a;
          --gain-meter-low: #35b34a;
          --gain-meter-mid: #d8a021;
          --gain-meter-high: #d83a2f;
          --gain-meter-peak: #111111;
          --gain-clip-off: rgba(17, 17, 17, 0.14);
          --gain-clip-on: #d83a2f;
          --gain-clip-text: #ffffff;
          --gain-value-editor-bg: #ffffff;
          --gain-thumb-size: 18px;
          --gain-thumb-line: 3px;
          --gain-rail-width: 34px;
          --gain-rail-length: 168px;
          --gain-label-gap: 8px;
          --gain-row-gap: 6px;
          --gain-label-size: 13px;
          --gain-scale-size: 9px;
          --gain-radius: 0;
          --gain-scale-width: 22px;
          --gain-scale-gap: 6px;
          --gain-percent: 0%;
          --gain-focus-bracket-color: #111111;
          --gain-focus-bracket-offset: 7px;
          --gain-focus-bracket-pulse-offset: 9px;
          --gain-focus-bracket-length: 12px;
          --gain-focus-bracket-thickness: 2px;
          --gain-focus-bracket-opacity: 0.45;
          --gain-color-scheme: light;
          --midi-map-learn-color: #005fc0;
          --midi-map-label-text: var(--midi-map-learn-color);
          --midi-map-label-shadow: none;
          color-scheme: var(--gain-color-scheme);
          display: inline-block;
          inline-size: max-content;
          -webkit-user-select: none;
          user-select: none;
        }
        label {
          display: grid;
          gap: var(--gain-label-gap);
          justify-items: center;
          padding: 0;
          margin: 0;
          color: var(--gain-text);
          font-size: var(--gain-label-size);
          position: relative;
        }
        label::before {
          content: "";
          position: absolute;
          inset: calc(-1 * var(--gain-focus-bracket-offset));
          opacity: 0;
          pointer-events: none;
          background:
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) left top / var(--gain-focus-bracket-length) var(--gain-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) left top / var(--gain-focus-bracket-thickness) var(--gain-focus-bracket-length) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) right top / var(--gain-focus-bracket-length) var(--gain-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) right top / var(--gain-focus-bracket-thickness) var(--gain-focus-bracket-length) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) left bottom / var(--gain-focus-bracket-length) var(--gain-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) left bottom / var(--gain-focus-bracket-thickness) var(--gain-focus-bracket-length) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) right bottom / var(--gain-focus-bracket-length) var(--gain-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--gain-focus-bracket-color), var(--gain-focus-bracket-color)) right bottom / var(--gain-focus-bracket-thickness) var(--gain-focus-bracket-length) no-repeat;
        }
        :host(:focus) label::before { opacity: var(--gain-focus-bracket-opacity); }
        :host(:focus-visible) label::before { opacity: 1; }
        :host(:focus) { outline: none; }

        .head {
          display: grid;
          justify-items: center;
          gap: 2px;
          text-align: center;
        }
        .value {
          color: var(--gain-value);
          font-variant-numeric: tabular-nums;
          min-block-size: 1.3em;
          opacity: 0.78;
          position: relative;
        }
        :host([editable]:not([disabled])) .value {
          cursor: text;
          border-radius: var(--gain-radius);
          padding: 1px 4px;
        }
        .value-editor {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 5;
          width: var(--gain-value-editor-width, 64px);
          border: 1px solid var(--gain-thumb);
          border-radius: var(--gain-radius);
          background: var(--gain-value-editor-bg);
          color: var(--gain-text);
          font: inherit;
          text-align: center;
          transform: translate(-50%, -50%);
          -webkit-user-select: text;
          user-select: text;
        }

        .clip {
          box-sizing: border-box;
          inline-size: var(--gain-rail-width);
          min-block-size: 14px;
          display: grid;
          place-items: center;
          border-radius: var(--gain-radius);
          background: var(--gain-clip-off);
          color: transparent;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        :host([data-clipping]) .clip {
          background: var(--gain-clip-on);
          color: var(--gain-clip-text);
        }

        .strip {
          display: flex;
          align-items: stretch;
          gap: var(--gain-scale-gap);
        }
        /* Balances the scale column so the rail sits centred under the readout
           instead of being pushed left by the labels beside it. */
        .strip::before {
          content: "";
          flex: none;
          inline-size: var(--gain-scale-width);
        }
        .rail {
          position: relative;
          box-sizing: border-box;
          inline-size: var(--gain-rail-width);
          block-size: var(--gain-rail-length);
          background: var(--gain-rail-bg);
          border-radius: var(--gain-radius);
          cursor: pointer;
          touch-action: none;
          overflow: hidden;
        }
        :host([disabled]) .rail { cursor: default; }
        .meter {
          position: absolute;
          inset: 0;
          display: flex;
          gap: 1px;
          padding: 2px;
          box-sizing: border-box;
        }
        .meter-channel {
          position: relative;
          flex: 1 1 0;
          min-inline-size: 0;
          border-radius: var(--gain-radius);
          overflow: hidden;
          background: linear-gradient(0deg,
            var(--gain-meter-low) 0 var(--gain-warn-pos, 70%),
            var(--gain-meter-mid) var(--gain-warn-pos, 70%) var(--gain-clip-pos, 92%),
            var(--gain-meter-high) var(--gain-clip-pos, 92%) 100%);
        }
        .meter-unlit {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          block-size: calc(100% - var(--fill, 0%));
          background: var(--gain-meter-unlit);
        }
        /* A clipped channel keeps its level gradient; the CLIP badge and a red
           peak tick carry the state, so the meter stays readable. */
        .meter-channel[data-clip] .meter-peak {
          background: var(--gain-clip-on);
          opacity: 1;
          block-size: 3px;
        }
        .meter-peak {
          position: absolute;
          left: 0;
          right: 0;
          bottom: var(--peak, 0%);
          block-size: 2px;
          background: var(--gain-meter-peak);
          opacity: 0.85;
        }
        .thumb {
          position: absolute;
          left: -2px;
          right: -2px;
          top: calc(100% - var(--gain-percent));
          block-size: var(--gain-thumb-line);
          background: var(--gain-thumb);
          border-radius: var(--gain-radius);
          box-shadow: 0 0 0 1px var(--gain-thumb-border);
          transform: translateY(-50%);
          pointer-events: none;
          z-index: 3;
        }
        .scale {
          position: relative;
          display: block;
          flex: none;
          inline-size: var(--gain-scale-width);
          block-size: var(--gain-rail-length);
          font-size: var(--gain-scale-size);
          color: var(--gain-scale-text);
        }
        .scale span {
          position: absolute;
          left: 0;
          transform: translateY(-50%);
          white-space: nowrap;
          line-height: 1;
        }
        .scale span::before {
          content: "";
          position: absolute;
          right: 100%;
          top: 50%;
          margin-right: 3px;
          inline-size: 4px;
          block-size: 1px;
          background: var(--gain-scale-line);
        }

        :host([orientation="horizontal"]) .strip { flex-direction: column; }
        :host([orientation="horizontal"]) .rail {
          inline-size: var(--gain-rail-length);
          block-size: var(--gain-rail-width);
        }
        :host([orientation="horizontal"]) .meter { flex-direction: column; }
        :host([orientation="horizontal"]) .meter-channel {
          background: linear-gradient(90deg,
            var(--gain-meter-low) 0 var(--gain-warn-pos, 70%),
            var(--gain-meter-mid) var(--gain-warn-pos, 70%) var(--gain-clip-pos, 92%),
            var(--gain-meter-high) var(--gain-clip-pos, 92%) 100%);
        }
        :host([orientation="horizontal"]) .meter-unlit {
          inset: 0 0 0 auto;
          block-size: auto;
          inline-size: calc(100% - var(--fill, 0%));
        }
        :host([orientation="horizontal"]) .meter-peak {
          inset: 0 auto 0 var(--peak, 0%);
          inline-size: 2px;
          block-size: auto;
        }
        :host([orientation="horizontal"]) .thumb {
          left: var(--gain-percent);
          right: auto;
          top: -2px;
          bottom: -2px;
          block-size: auto;
          inline-size: var(--gain-thumb-line);
          transform: translateX(-50%);
        }
        :host([orientation="horizontal"]) .scale,
        :host([orientation="horizontal"]) .strip::before { display: none; }

        :host([disabled]) label { opacity: 0.45; }

        :host([data-midi-map-target-active]) label::before {
          --gain-focus-bracket-color: var(--midi-map-learn-color);
          inset: calc(-1 * var(--gain-focus-bracket-offset));
          opacity: 1;
          transition: inset 220ms ease;
        }
        :host([data-midi-map-target-active][data-midi-map-pulse]) label::before {
          inset: calc(-1 * var(--gain-focus-bracket-pulse-offset));
        }
        :host([data-midi-map-mode][data-midi-map-label]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          bottom: 100%;
          z-index: 2;
          width: min(90%, 92px);
          color: var(--midi-map-label-text);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.02em;
          line-height: 1;
          opacity: 1;
          overflow: hidden;
          pointer-events: none;
          text-shadow: var(--midi-map-label-shadow);
          text-overflow: ellipsis;
          text-align: center;
          transform: translate(-50%, -4px);
          white-space: nowrap;
        }
        @media (prefers-reduced-motion: reduce) {
          :host([data-midi-map-target-active]) label::before { transition: none; }
        }
      </style>
      <label part="panel">
        <span class="head" part="row">
          <span class="label" part="label"></span>
          <span class="value" part="value"></span>
          <span class="clip" part="clip" aria-hidden="true">CLIP</span>
        </span>
        <span class="strip">
          <span class="rail" part="rail" aria-hidden="true">
            <span class="meter" part="meter"></span>
            <span class="thumb" part="thumb"></span>
          </span>
          <span class="scale" part="scale" aria-hidden="true"></span>
        </span>
        <span class="midi-map-label" aria-hidden="true"></span>
      </label>`;

    this.labelElement = this.root.querySelector('.label');
    this.output = this.root.querySelector('.value');
    this.rail = this.root.querySelector('.rail');
    this.meterElement = this.root.querySelector('.meter');
    this.scaleElement = this.root.querySelector('.scale');
    this.renderedChannels = 0;

    this.rail.addEventListener('pointerdown', (event) => this.beginPointer(event));
    this.rail.addEventListener('pointermove', (event) => this.movePointer(event));
    this.rail.addEventListener('pointerup', (event) => this.endPointer(event));
    this.rail.addEventListener('pointercancel', () => this.cancelPointer());

    this.addEventListener('keydown', (event) => this.handleKey(event));
    this.output.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.beginValueEdit();
    });
  }

  connectedCallback() {
    this.readAttributes();
    this.refresh();
  }

  disconnectedCallback() {
    window.removeEventListener('blur', this.handleWindowBlur);
    if (this._clipTimer) clearTimeout(this._clipTimer);
  }

  attributeChangedCallback() {
    this.readAttributes();
    this.refresh();
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this.setValue(value, false);
  }

  readAttributes() {
    this.name = this.getAttribute('name') || this.name;
    this.parameterID = this.getAttribute('parameter-id') || '';
    this.label = this.getAttribute('label') || this.label;
    this.section = this.getAttribute('section') || '';
    this.unit = this.getAttribute('unit') ?? this.unit;
    this.min = numberAttr(this, 'min', this.min);
    this.max = numberAttr(this, 'max', this.max);
    this.mid = this.hasAttribute('mid')
      ? numberAttr(this, 'mid', this.mid ?? this.min + (this.max - this.min) / 2)
      : this.mid;
    this.curve = normaliseCurveName(this.getAttribute('curve'));
    this.shape = this.hasAttribute('shape') ? numberAttr(this, 'shape', this.shape ?? 1) : null;
    this.positionStep = this.hasAttribute('position-step')
      ? numberAttr(this, 'position-step', null)
      : null;
    this.step = numberAttr(this, 'step', this.step);
    this.displayFractionDigits = this.hasAttribute('display-fraction-digits')
      ? numberAttr(this, 'display-fraction-digits', null)
      : null;
    this.valueText = this.getAttribute('text') ?? this.getAttribute('options') ?? '';
    this.resetValue = numberAttr(this, 'reset-value', numberAttr(this, 'init', this.resetValue));
    this.minLabel = this.getAttribute('min-label') ?? '';
    this.maxLabel = this.getAttribute('max-label') ?? '';

    this.channels = clamp(Math.round(numberAttr(this, 'channels', this.channels)), 1, MAX_CHANNELS);
    this.meterMin = numberAttr(this, 'meter-min', this.meterMin);
    this.meterMax = numberAttr(this, 'meter-max', this.meterMax);
    this.clipLevel = numberAttr(this, 'clip-level', this.clipLevel);
    this.peakHold = Math.max(0, numberAttr(this, 'peak-hold', this.peakHold));

    this.setValue(numberAttr(this, 'value', this._value), false);
  }

  get editable() {
    return this.hasAttribute('editable');
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get parameterKind() {
    return this.getAttribute('parameter-kind') || 'continuous';
  }

  get orientation() {
    return this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
  }

  setValue(value, shouldEmit = true, source = 'control') {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    const nextValue = clamp(snap(numericValue, this.step), this.min, this.max);

    if (nextValue === this._value) return;

    this.lastUpdateSource = source;
    this._value = nextValue;
    this.refresh();

    if (shouldEmit) {
      editParameterGesture(this, this.value, { source });
    }
  }

  reset() {
    this.setValue(this.resetValue);
    endParameterGesture(this, this.value);
  }

  // ---- Meter API (independent of the gain value; emits no events) ----

  setLevels(levels) {
    const list = Array.isArray(levels) ? levels : [levels];
    const now = Date.now();
    const next = [];
    let clipped = false;

    for (let i = 0; i < this.channels; i += 1) {
      const raw = Number(list[i]);
      const level = Number.isFinite(raw) ? raw : this.min;
      next[i] = level;

      // Peak-hold: adopt a new high immediately; otherwise hold until it ages out.
      const heldPeak = this._peaks[i];
      const expired = now - (this._peakTimes[i] || 0) > this.peakHold;
      if (!Number.isFinite(heldPeak) || level >= heldPeak || expired) {
        this._peaks[i] = level;
        this._peakTimes[i] = now;
      }

      if (level >= this.clipLevel) {
        this._clipUntil[i] = now + this.peakHold;
      }
      if ((this._clipUntil[i] || 0) > now) clipped = true;
    }

    this._levels = next;
    this.renderMeter();
    this.updateClipState(clipped);
    this.refreshValueText();
  }

  clearClip() {
    this._clipUntil = [];
    if (this._clipTimer) {
      clearTimeout(this._clipTimer);
      this._clipTimer = null;
    }
    this.updateClipState(false);
    this.renderMeter();
    this.refreshValueText();
  }

  get levels() {
    return this._levels.slice();
  }

  get clipping() {
    const now = Date.now();
    return this._clipUntil.some((until) => (until || 0) > now);
  }

  updateClipState(clipped) {
    if (clipped) {
      this.setAttribute('data-clipping', '');
      if (this._clipTimer) clearTimeout(this._clipTimer);
      // Auto-clear even if the host stops sending levels.
      this._clipTimer = setTimeout(() => {
        this._clipTimer = null;
        if (!this.clipping) {
          this.removeAttribute('data-clipping');
          this.renderMeter();
          this.refreshValueText();
        }
      }, this.peakHold + 20);
    } else {
      this.removeAttribute('data-clipping');
    }
  }

  // ---- Fader gestures (mirror compost-slider) ----

  editableValueText() {
    return formatNumber(this.value, this.step, this.displayFractionDigits);
  }

  beginValueEdit(initialValue = this.editableValueText(), selectValue = true) {
    if (this.disabled || !this.editable || this.isEditingValue) return;

    this.isEditingValue = true;
    beginParameterGesture(this, this.value);

    const input = document.createElement('input');
    input.className = 'value-editor';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = initialValue;
    input.min = String(this.min);
    input.max = String(this.max);
    input.step = String(this.step);
    input.setAttribute('aria-label', `Set ${this.label} value`);

    const finish = (commit, restoreFocus = false) => {
      if (!this.isEditingValue) return;

      const nextValue = Number(input.value);
      this.isEditingValue = false;

      if (commit && input.value.trim() !== '' && Number.isFinite(nextValue)) {
        this.setValue(nextValue);
        endParameterGesture(this, this.value);
      } else {
        this.refresh();
        endParameterGesture(this, this.value, { cancelled: true });
      }

      if (restoreFocus) {
        queueMicrotask(() => HTMLElement.prototype.focus?.call(this, { preventScroll: true }));
      }
    };

    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true, true);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false, true);
      }
    });
    input.addEventListener('blur', () => finish(true));

    this.output.replaceChildren(input);
    input.focus();
    if (selectValue) {
      input.select();
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  beginPointer(event) {
    if (this.disabled || (event.button !== undefined && event.button !== 0)) return;

    const fineCandidate = this.lastClickTime > 0 && performance.now() - this.lastClickTime < 380;
    event.preventDefault?.();
    HTMLElement.prototype.focus?.call(this, { preventScroll: true });
    this.rail?.setPointerCapture?.(event.pointerId);
    beginParameterGesture(this, this.value);
    this.pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      value: this.value,
      fineCandidate,
      fine: Boolean(event.altKey || event.shiftKey),
      moved: false,
      orientation: this.orientation,
    };
    if (!fineCandidate && !this.pointerStart.fine) {
      this.setValue(this.valueFromPointer(event));
    }
    window.addEventListener('blur', this.handleWindowBlur);
  }

  movePointer(event) {
    const pointer = this.pointerStart;
    if (!pointer || event.pointerId !== pointer.pointerId) return;

    const distance = pointer.orientation === 'vertical'
      ? pointer.y - event.clientY
      : event.clientX - pointer.x;
    pointer.moved = pointer.moved || Math.abs(distance) > 4;
    event.preventDefault();
    if (pointer.fineCandidate || pointer.fine) {
      if (!pointer.moved) return;
      pointer.fine = true;
      this.setValue(moveValueByNormalisedDelta(
        pointer.value,
        (distance / 180) * FINE_DRAG_SCALE,
        this.scaleOptions(),
      ));
    } else {
      this.setValue(this.valueFromPointer(event));
    }
  }

  valueFromPointer(event) {
    const bounds = this.rail?.getBoundingClientRect?.();
    if (!bounds) return this.value;
    const orientation = this.pointerStart?.orientation ?? this.orientation;
    const extent = orientation === 'vertical' ? bounds.height : bounds.width;
    const offset = orientation === 'vertical'
      ? bounds.top + bounds.height - event.clientY
      : event.clientX - bounds.left;
    const position = extent > 0 ? clamp(offset / extent, 0, 1) : this.getPosition();
    return normalisedPositionToValue(position, this.scaleOptions());
  }

  endPointer(event) {
    if (!this.pointerStart || event.pointerId !== this.pointerStart.pointerId) return;

    const pointer = this.pointerStart;
    const moved = pointer.moved
      || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4;
    this.pointerStart = null;
    window.removeEventListener('blur', this.handleWindowBlur);

    if (moved) {
      this.lastClickTime = 0;
      endParameterGesture(this, this.value);
      return;
    }

    const now = performance.now();
    if (now - this.lastClickTime < 380) {
      this.lastClickTime = 0;
      this.reset();
    } else {
      this.lastClickTime = now;
      endParameterGesture(this, this.value);
    }
  }

  cancelPointer() {
    this.pointerStart = null;
    window.removeEventListener('blur', this.handleWindowBlur);
    this.lastClickTime = 0;
    endParameterGesture(this, this.value, { cancelled: true });
  }

  handleKey(event) {
    if (this.disabled) return;
    if (this.handleValueEditKey(event)) return;

    const smallStep = this.normalisedKeyboardStep();
    const largeStep = Math.min(1, smallStep * 10);
    const arrowStep = event.altKey ? largeStep : smallStep;
    const deltas = {
      ArrowUp: arrowStep,
      ArrowRight: arrowStep,
      ArrowDown: -arrowStep,
      ArrowLeft: -arrowStep,
      PageUp: largeStep,
      PageDown: -largeStep,
    };

    if (event.key === 'Escape' || event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.reset();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      this.setValue(this.min);
      endParameterGesture(this, this.value);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.setValue(this.max);
      endParameterGesture(this, this.value);
      return;
    }

    if (deltas[event.key] === undefined) return;

    event.preventDefault();
    this.setValue(moveValueByNormalisedDelta(this.value, deltas[event.key], this.scaleOptions()));
    endParameterGesture(this, this.value);
  }

  handleValueEditKey(event) {
    if (!this.editable || this.isEditingValue || event.metaKey || event.ctrlKey || event.altKey) {
      return false;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.beginValueEdit(this.editableValueText(), true);
      return true;
    }

    if (!/^[0-9.+-]$/u.test(event.key)) return false;

    event.preventDefault();
    this.beginValueEdit(event.key, false);
    return true;
  }

  normalisedKeyboardStep() {
    return normalisedKeyboardStep({
      min: this.min,
      max: this.max,
      step: this.step,
      positionStep: this.positionStep,
    });
  }

  // ---- Rendering ----

  channelLabel(index) {
    if (this.channels === 1) return 'M';
    if (this.channels === 2) return index === 0 ? 'L' : 'R';
    return String(index + 1);
  }

  renderChannels() {
    if (this.renderedChannels === this.channels) return;
    const markup = [];
    for (let i = 0; i < this.channels; i += 1) {
      markup.push('<span class="meter-channel"><span class="meter-unlit"></span><span class="meter-peak"></span></span>');
    }
    this.meterElement.innerHTML = markup.join('');
    this.renderedChannels = this.channels;
  }

  renderScale() {
    if (!this.scaleElement) return;
    const marks = [0, -12, -24, -36, -48, -60];
    const html = marks
      .filter((db) => db <= this.meterMax && db >= this.meterMin)
      .map((db) => {
        const pos = (1 - railFraction(db, this.scaleOptions())) * 100;
        const text = db === 0 ? '0' : String(db);
        return `<span style="top:${pos}%">${text}</span>`;
      })
      .join('');
    this.scaleElement.innerHTML = html;
  }

  renderMeter() {
    this.renderChannels();
    const scale = this.scaleOptions();
    const warnPos = railFraction(this.clipLevel - 12, scale) * 100;
    const clipPos = railFraction(this.clipLevel, scale) * 100;
    this.style.setProperty('--gain-warn-pos', `${warnPos}%`);
    this.style.setProperty('--gain-clip-pos', `${clipPos}%`);

    const now = Date.now();
    const channelNodes = this.meterElement.children;
    for (let i = 0; i < channelNodes.length; i += 1) {
      const node = channelNodes[i];
      const level = this._levels[i];
      const fill = Number.isFinite(level) ? railFraction(level, scale) * 100 : 0;
      const peak = Number.isFinite(this._peaks[i])
        ? railFraction(this._peaks[i], scale) * 100
        : 0;
      node.style.setProperty('--fill', `${fill}%`);
      node.style.setProperty('--peak', `${peak}%`);
      if ((this._clipUntil[i] || 0) > now) {
        node.setAttribute('data-clip', '');
      } else {
        node.removeAttribute('data-clip');
      }
    }
  }

  meterReadout() {
    if (!this._levels.length) return '';
    const parts = this._levels.map((level, i) => {
      const text = Number.isFinite(level) ? formatNumber(level, 0.1) : '—';
      return `${this.channelLabel(i)} ${text} dB`;
    });
    let readout = `, peak ${parts.join(', ')}`;
    if (this.clipping) readout += ' — clipping';
    return readout;
  }

  gainValueText() {
    return formatValue(
      this.value,
      this.step,
      this.unit,
      this.valueText,
      this.displayFractionDigits,
      {min: this.min, max: this.max, minLabel: this.minLabel, maxLabel: this.maxLabel},
    );
  }

  refreshValueText() {
    if (!this.rail) return;
    this.setAttribute('aria-valuetext', `${this.gainValueText()}${this.meterReadout()}`);
  }

  refresh() {
    if (!this.rail) return;

    this.labelElement.textContent = this.label;
    this.labelElement.id = this.labelID;
    const valueText = this.gainValueText();
    if (!this.isEditingValue) {
      this.output.textContent = valueText;
    }
    this.style.setProperty('--gain-percent', `${this.getPercent()}%`);
    this.renderScale();
    this.renderMeter();

    this.tabIndex = this.disabled ? -1 : 0;
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-label', this.label);
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-valuetext', `${valueText}${this.meterReadout()}`);
    this.setAttribute('aria-orientation', this.orientation);
    this.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
  }

  getPercent() {
    return this.getPosition() * 100;
  }

  getPosition() {
    return clamp(valueToNormalisedPosition(this.value, this.scaleOptions()), 0, 1);
  }

  scaleOptions() {
    return {
      min: this.min,
      max: this.max,
      mid: this.mid,
      curve: this.curve,
      shape: this.shape,
    };
  }
}

defineElement('compost-gain', CompostGain);
