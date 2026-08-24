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

let nextSliderID = 1;
const FINE_DRAG_SCALE = 0.1;

export class ParameterSlider extends HTMLElement {
  static get observedAttributes() {
    return [
      'name',
      'parameter-id',
      'label',
      'section',
      'orientation',
      'interaction',
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
    ];
  }

  constructor() {
    super();

    this.name = '';
    this.parameterID = '';
    this.label = 'Parameter';
    this.section = '';
    this.min = 0;
    this.max = 1;
    this.mid = null;
    this.curve = 'linear';
    this.shape = 1;
    this.positionStep = null;
    this.step = 0;
    this.displayFractionDigits = null;
    this.unit = '';
    this.valueText = '';
    this._value = 0.5;
    this.resetValue = 0.5;
    this.minLabel = '';
    this.maxLabel = '';
    this.inputID = `compost-slider-${nextSliderID++}`;
    this.labelID = `${this.inputID}-label`;
    this.lastUpdateSource = 'control';
    this.lastClickTime = 0;
    this.pointerStart = null;
    this.handleWindowBlur = () => this.cancelPointer();

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --slider-panel-bg: transparent;
          --slider-border: transparent;
          --slider-text: #111111;
          --slider-value: #555555;
          --slider-track: rgba(17, 17, 17, 0.2);
          --slider-fill: #111111;
          --slider-thumb: #111111;
          --slider-thumb-border: #ffffff;
          --slider-value-editor-bg: #ffffff;
          --slider-track-height: 3px;
          --slider-thumb-size: 18px;
          --slider-label-gap: 12px;
          --slider-row-gap: 12px;
          --slider-label-size: 13px;
          --slider-vertical-length: 144px;
          --slider-vertical-width: 72px;
          --slider-vertical-row-gap: 2px;
          --slider-percent: 0%;
          --slider-focus-bracket-color: #111111;
          --slider-focus-bracket-offset: 7px;
          --slider-focus-bracket-pulse-offset: 9px;
          --slider-focus-bracket-length: 12px;
          --slider-focus-bracket-thickness: 2px;
          --slider-focus-bracket-opacity: 0.45;
          --slider-color-scheme: light;
          --midi-map-learn-color: #005fc0;
          --midi-map-label-text: var(--midi-map-learn-color);
          --midi-map-label-shadow: none;
          color-scheme: var(--slider-color-scheme);
          display: block;
          -webkit-user-select: none;
          user-select: none;
        }
        label {
          display: grid;
          gap: var(--slider-label-gap);
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: var(--slider-text);
          font-size: var(--slider-label-size);
          position: relative;
        }
        label::before {
          content: "";
          position: absolute;
          inset: calc(-1 * var(--slider-focus-bracket-offset));
          opacity: 0;
          pointer-events: none;
          background:
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) left top / var(--slider-focus-bracket-length) var(--slider-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) left top / var(--slider-focus-bracket-thickness) var(--slider-focus-bracket-length) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) right top / var(--slider-focus-bracket-length) var(--slider-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) right top / var(--slider-focus-bracket-thickness) var(--slider-focus-bracket-length) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) left bottom / var(--slider-focus-bracket-length) var(--slider-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) left bottom / var(--slider-focus-bracket-thickness) var(--slider-focus-bracket-length) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) right bottom / var(--slider-focus-bracket-length) var(--slider-focus-bracket-thickness) no-repeat,
            linear-gradient(var(--slider-focus-bracket-color), var(--slider-focus-bracket-color)) right bottom / var(--slider-focus-bracket-thickness) var(--slider-focus-bracket-length) no-repeat;
        }
        :host(:focus) label::before {
          opacity: var(--slider-focus-bracket-opacity);
        }
        :host(:focus-visible) label::before {
          opacity: 1;
        }
        .row { display: flex; justify-content: space-between; gap: var(--slider-row-gap); }
        output {
          color: var(--slider-value);
          font-variant-numeric: tabular-nums;
          min-block-size: 1.3em;
          min-inline-size: var(--slider-value-width, var(--slider-value-editor-width, 72px));
          opacity: 0.72;
          position: relative;
          text-align: right;
        }
        :host([editable]:not([disabled])) output {
          cursor: text;
          border-radius: 4px;
          padding: 1px 4px;
        }
        .value-editor {
          position: absolute;
          right: 0;
          top: 50%;
          z-index: 4;
          width: var(--slider-value-editor-width, 72px);
          border: 1px solid var(--slider-fill);
          border-radius: 4px;
          background: var(--slider-value-editor-bg);
          color: var(--slider-text);
          font: inherit;
          text-align: center;
          transform: translateY(-50%);
          -webkit-user-select: text;
          user-select: text;
        }
        .range-input {
          position: relative;
          box-sizing: border-box;
          width: 100%;
          height: var(--slider-thumb-size);
          margin: 0;
          border-radius: 999px;
          cursor: pointer;
          opacity: 0.78;
          touch-action: none;
        }
        .track,
        .fill {
          position: absolute;
          left: 0;
          top: calc(50% - var(--slider-track-height) / 2);
          height: var(--slider-track-height);
        }
        .track {
          width: 100%;
          background: var(--slider-track);
        }
        .fill {
          width: var(--slider-percent);
          background: var(--slider-fill);
        }
        .thumb {
          position: absolute;
          left: var(--slider-percent);
          top: 50%;
          box-sizing: border-box;
          width: var(--slider-thumb-size);
          height: var(--slider-thumb-size);
          border: 2px solid var(--slider-thumb-border);
          border-radius: 50%;
          background: var(--slider-thumb);
          transform: translate(-50%, -50%);
        }
        .range-input:active {
          opacity: 1;
        }
        :host([orientation="vertical"]) {
          display: inline-block;
          inline-size: var(--slider-vertical-width);
        }
        :host([orientation="vertical"]) .row {
          align-items: center;
          flex-direction: column;
          gap: var(--slider-vertical-row-gap);
        }
        :host([orientation="vertical"]) .label,
        :host([orientation="vertical"]) output {
          box-sizing: border-box;
          inline-size: 100%;
          min-inline-size: 0;
          text-align: center;
        }
        :host([orientation="vertical"]) .range-input {
          width: var(--slider-thumb-size);
          height: var(--slider-vertical-length);
          margin-inline: auto;
        }
        :host([orientation="vertical"]) .track,
        :host([orientation="vertical"]) .fill {
          left: calc(50% - var(--slider-track-height) / 2);
          top: auto;
          bottom: 0;
          width: var(--slider-track-height);
        }
        :host([orientation="vertical"]) .track {
          height: 100%;
        }
        :host([orientation="vertical"]) .fill {
          height: var(--slider-percent);
        }
        :host([orientation="vertical"]) .thumb {
          left: 50%;
          top: calc(100% - var(--slider-percent));
        }
        :host([disabled]) label {
          opacity: 0.45;
        }
        :host([disabled]) .range-input,
        :host([disabled]) output {
          cursor: default;
        }
        :host(:focus) {
          outline: none;
        }
        :host([data-midi-map-target-active]) label::before {
          --slider-focus-bracket-color: var(--midi-map-learn-color);
          inset: calc(-1 * var(--slider-focus-bracket-offset));
          opacity: 1;
          transition: inset 220ms ease;
        }
        :host([data-midi-map-target-active][data-midi-map-pulse]) label::before {
          inset: calc(-1 * var(--slider-focus-bracket-pulse-offset));
        }
        :host([data-midi-map-mode][data-midi-map-label]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          bottom: calc(var(--slider-thumb-size) / 2 - 2px);
          z-index: 2;
          width: min(90%, 92px);
          padding: 0;
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
          text-align: left;
          transform: translate(-50%, 50%);
          white-space: nowrap;
        }
        @media (prefers-reduced-motion: reduce) {
          :host([data-midi-map-target-active]) label::before {
            transition: none;
          }
        }
      </style>
      <label part="panel">
        <span class="row" part="row"><span class="label" part="label"></span><output part="value"></output></span>
        <div class="range-input" part="input" aria-hidden="true">
          <span class="track" part="track"></span>
          <span class="fill" part="fill"></span>
          <span class="thumb" part="thumb"></span>
        </div>
        <span class="midi-map-label" aria-hidden="true"></span>
      </label>`;

    this.labelElement = this.root.querySelector('.label');
    this.output = this.root.querySelector('output');
    this.input = this.root.querySelector('.range-input');

    this.input.addEventListener('pointerdown', (event) => {
      this.beginPointer(event);
    });
    this.input.addEventListener('pointermove', (event) => this.movePointer(event));
    this.input.addEventListener('pointerup', (event) => this.endPointer(event));
    this.input.addEventListener('pointercancel', () => this.cancelPointer());

    this.addEventListener('keydown', (event) => {
      this.handleKey(event);
    });
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
    this.unit = this.getAttribute('unit') || this.unit;
    this.min = numberAttr(this, 'min', this.min);
    this.max = numberAttr(this, 'max', this.max);
    this.mid = this.hasAttribute('mid') ? numberAttr(this, 'mid', this.mid ?? this.min + (this.max - this.min) / 2) : null;
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
    this.setValue(numberAttr(this, 'value', this._value), false);
  }

  get editable() {
    return this.hasAttribute('editable');
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get parameterKind() { return this.getAttribute('parameter-kind') || 'continuous'; }

  get orientation() {
    return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
  }

  get interaction() {
    return this.getAttribute('interaction') === 'relative' ? 'relative' : 'position';
  }

  setValue(value, shouldEmit = true, source = 'control') {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    const nextValue = clamp(snap(numericValue, this.step), this.min, this.max);

    if (nextValue === this._value) {
      return;
    }

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

  editableValueText() {
    return formatNumber(
      this.value,
      this.step,
      this.displayFractionDigits,
    );
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

    const fineCandidate = this.lastClickTime > 0
      && performance.now() - this.lastClickTime < 380;
    event.preventDefault?.();
    HTMLElement.prototype.focus?.call(this, { preventScroll: true });
    this.input?.setPointerCapture?.(event.pointerId);
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
      relative: this.interaction === 'relative',
    };
    if (!this.pointerStart.relative && !fineCandidate && !this.pointerStart.fine) {
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
    if (pointer.relative || pointer.fineCandidate || pointer.fine) {
      if (!pointer.moved) return;
      const bounds = this.input?.getBoundingClientRect?.();
      const extent = pointer.orientation === 'vertical' ? bounds?.height : bounds?.width;
      const scale = pointer.relative && extent > 0 ? 1 / extent : 1 / 180;
      const fine = pointer.fineCandidate || pointer.fine;
      pointer.fine = fine;
      this.setValue(moveValueByNormalisedDelta(
        pointer.value,
        distance * scale * (fine ? FINE_DRAG_SCALE : 1),
        this.scaleOptions(),
      ));
    } else {
      this.setValue(this.valueFromPointer(event));
    }
  }

  valueFromPointer(event) {
    const bounds = this.input?.getBoundingClientRect?.();
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
    if (!this.pointerStart || event.pointerId !== this.pointerStart.pointerId) {
      return;
    }

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

    if (this.handleValueEditKey(event)) {
      return;
    }

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

    if (event.key === 'Escape'
        || event.key === 'Delete'
        || event.key === 'Backspace') {
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

    if (deltas[event.key] === undefined) {
      return;
    }

    event.preventDefault();
    this.setValue(moveValueByNormalisedDelta(
      this.value,
      deltas[event.key],
      this.scaleOptions(),
    ));
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

    if (!/^[0-9.+-]$/u.test(event.key)) {
      return false;
    }

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

  refresh() {
    if (!this.input) {
      return;
    }

    this.labelElement.textContent = this.label;
    this.labelElement.id = this.labelID;
    const valueText = formatValue(
      this.value,
      this.step,
      this.unit,
      this.valueText,
      this.displayFractionDigits,
      {min: this.min, max: this.max, minLabel: this.minLabel, maxLabel: this.maxLabel},
    );
    if (!this.isEditingValue) {
      this.output.textContent = valueText;
    }
    this.style.setProperty('--slider-percent', `${this.getPercent()}%`);
    this.tabIndex = this.disabled ? -1 : 0;
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-label', this.label);
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-valuetext', valueText);
    this.setAttribute('aria-orientation', this.orientation);
    this.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
    this.refreshEditableValue(valueText);
  }

  refreshEditableValue(valueText) {
    if (!this.editable) {
      this.output.removeAttribute('role');
      this.output.removeAttribute('tabindex');
      this.output.removeAttribute('aria-label');
      this.output.removeAttribute('title');
      return;
    }

    this.output.removeAttribute('role');
    this.output.removeAttribute('tabindex');
    this.output.removeAttribute('aria-label');
    this.output.removeAttribute('title');
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

defineElement('compost-slider', ParameterSlider);
