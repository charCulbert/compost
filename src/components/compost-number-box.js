import {
  moveValueByNormalisedDelta,
  normaliseCurveName,
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
  snap,
} from '../utils.js';

let nextNumberBoxID = 1;

function readNumberAttribute(element, name, fallback) {
  if (!element.hasAttribute(name)) return fallback;
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

const FINE_DRAG_SCALE = 0.1;
const SPLIT_DRAG_SCALES = Object.freeze({ left: 4, middle: 1, right: 0.25 });

export class CompostNumberBox extends HTMLElement {
  static get observedAttributes() {
    return [
      'name',
      'parameter-id',
      'label',
      'aria-label',
      'section',
      'min',
      'max',
      'mid',
      'curve',
      'shape',
      'step',
      'display-fraction-digits',
      'value',
      'text',
      'options',
      'unit',
      'reset-value',
      'min-label',
      'max-label',
      'init',
      'placeholder',
      'allow-empty',
      'disabled',
      'pointer-lock',
      'split-drag',
      'drag-step-left',
      'drag-step-middle',
      'drag-step-right',
      'fine-drag-scale',
    ];
  }

  constructor() {
    super();

    this.name = '';
    this.parameterID = '';
    this.label = 'Value';
    this.ariaLabelText = '';
    this.section = '';
    this.min = 0;
    this.max = 1;
    this.mid = null;
    this.curve = 'linear';
    this.shape = 1;
    this.step = 0;
    this.displayFractionDigits = null;
    this.unit = '';
    this.valueText = '';
    this.resetValue = 0;
    this.minLabel = '';
    this.maxLabel = '';
    this.placeholder = '';
    this._value = 0;
    this.empty = false;
    this.lastUpdateSource = 'control';
    this.lastClickTime = 0;
    this.drag = null;
    this.idBase = `compost-number-box-${nextNumberBoxID++}`;
    this.handleLockedMouseMove = this.handleLockedMouseMove.bind(this);
    this.handleLockedMouseUp = this.handleLockedMouseUp.bind(this);
    this.handlePointerLockChange = this.handlePointerLockChange.bind(this);
    this.handlePointerLockError = this.handlePointerLockError.bind(this);
    this.handleWindowBlur = () => this.endActiveDrag(false);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --number-box-bg: #f4f4f4;
          --number-box-text: #111111;
          --number-box-border: #bdbdbd;
          --number-box-active-bg: #d8edf4;
          --number-box-active-text: #111111;
          --number-box-fill: rgba(0, 95, 192, 0.28);
          --number-box-focus: #111111;
          --number-box-width: 72px;
          --number-box-height: 24px;
          --number-box-padding: 0 5px;
          --number-box-font-size: 13px;
          --number-box-font-weight: 700;
          --number-box-text-align: center;
          --number-box-color-scheme: light;
          --number-box-cursor: ns-resize;
          --number-box-percent: 0%;
          --midi-map-learn-color: #005fc0;
          --midi-map-label-text: var(--midi-map-learn-color);
          --midi-map-label-shadow: none;
          color-scheme: var(--number-box-color-scheme);
          display: inline-block;
          inline-size: var(--number-box-width);
          font: inherit;
          -webkit-user-select: none;
          user-select: none;
          vertical-align: top;
        }
        .box {
          box-sizing: border-box;
          inline-size: 100%;
          block-size: var(--number-box-height);
          display: grid;
          place-items: center;
          border: 1px solid var(--number-box-border);
          border-radius: 0;
          background:
            linear-gradient(90deg,
              var(--number-box-fill) 0 var(--number-box-percent, 0%),
              transparent var(--number-box-percent, 0%) 100%),
            var(--number-box-bg);
          color: var(--number-box-text);
          cursor: var(--number-box-cursor);
          font: inherit;
          font-size: var(--number-box-font-size);
          font-weight: var(--number-box-font-weight);
          line-height: 1;
          padding: var(--number-box-padding);
          position: relative;
          text-align: var(--number-box-text-align);
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
        }
        .box:active,
        :host([data-dragging]) .box {
          color: var(--number-box-active-text);
        }
        .box:focus,
        .box:focus-visible {
          outline: 2px solid var(--number-box-focus);
          outline-offset: 1px;
        }
        .value {
          display: grid;
          place-items: center;
          block-size: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          inline-size: 100%;
          font: inherit;
          font-size: var(--number-box-font-size);
          font-weight: var(--number-box-font-weight);
          line-height: 1;
        }
        .value.placeholder {
          color: color-mix(in srgb, var(--number-box-text) 62%, transparent);
        }
        input {
          box-sizing: border-box;
          inline-size: 100%;
          block-size: 100%;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: inherit;
          display: flex;
          align-items: center;
          font: inherit;
          font-size: var(--number-box-font-size);
          font-weight: var(--number-box-font-weight);
          line-height: 1;
          outline: 0;
          padding: 0;
          text-align: var(--number-box-text-align);
          -webkit-user-select: text;
          user-select: text;
          cursor: default;
        }
        :host([disabled]) .box {
          cursor: default;
          opacity: 0.48;
        }
        :host([data-midi-map-target-active]) .box {
          outline: 2px solid var(--midi-map-learn-color);
          outline-offset: 1px;
        }
        :host([data-midi-map-mode][data-midi-map-label]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 2;
          max-width: calc(100% - 10px);
          color: var(--midi-map-label-text);
          font-size: 9px;
          font-weight: 800;
          line-height: 1;
          overflow: hidden;
          pointer-events: none;
          text-shadow: var(--midi-map-label-shadow);
          text-overflow: ellipsis;
          transform: translate(-50%, -50%);
          white-space: nowrap;
        }
        :host([data-midi-map-mode][data-midi-map-label]) .value {
          opacity: 0;
        }
      </style>
      <div class="box" part="box" tabindex="0" role="spinbutton">
        <span class="value" part="value"></span>
        <span class="midi-map-label" aria-hidden="true"></span>
      </div>`;

    this.box = this.root.querySelector('.box');
    this.valueElement = this.root.querySelector('.value');

    this.box.addEventListener('pointerdown', (event) => this.beginDrag(event));
    this.box.addEventListener('pointermove', (event) => this.moveDrag(event));
    this.box.addEventListener('pointerup', (event) => this.endDrag(event));
    this.box.addEventListener('pointercancel', (event) => this.endDrag(event, false));
    this.box.addEventListener('keydown', (event) => this.handleKey(event));
  }

  connectedCallback() {
    this.readAttributes();
    this.refresh();
  }

  disconnectedCallback() {
    if (this.drag) this.endActiveDrag(false);
    else this.cleanupPointerLock();
  }

  attributeChangedCallback() {
    this.readAttributes();
    this.refresh();
  }

  get value() {
    return this.empty ? null : this._value;
  }

  set value(value) {
    this.setValue(value, false);
  }

  get allowEmpty() {
    return this.hasAttribute('allow-empty');
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get parameterKind() { return this.getAttribute('parameter-kind') || 'continuous'; }

  readAttributes() {
    this.name = this.getAttribute('name') || this.name;
    this.parameterID = this.getAttribute('parameter-id') || '';
    this.label = this.getAttribute('label') || this.label;
    // a host that names the box from outside owns the name the spinbutton reads
    this.ariaLabelText = this.getAttribute('aria-label') || this.label;
    this.section = this.getAttribute('section') || '';
    this.unit = this.getAttribute('unit') || '';
    this.valueText = this.getAttribute('text') ?? this.getAttribute('options') ?? '';
    this.placeholder = this.getAttribute('placeholder') || '';
    this.min = readNumberAttribute(this, 'min', this.min);
    this.max = readNumberAttribute(this, 'max', this.max);
    this.mid = this.hasAttribute('mid') ? readNumberAttribute(this, 'mid', this.mid ?? this.min + (this.max - this.min) / 2) : null;
    this.curve = normaliseCurveName(this.getAttribute('curve'));
    this.shape = this.hasAttribute('shape') ? readNumberAttribute(this, 'shape', this.shape ?? 1) : null;
    this.step = readNumberAttribute(this, 'step', this.step);
    this.displayFractionDigits = this.hasAttribute('display-fraction-digits')
      ? readNumberAttribute(this, 'display-fraction-digits', null)
      : null;
    this.resetValue = readNumberAttribute(this, 'reset-value', readNumberAttribute(this, 'init', this.resetValue));
    this.minLabel = this.getAttribute('min-label') ?? '';
    this.maxLabel = this.getAttribute('max-label') ?? '';

    if (this.hasAttribute('value')) {
      this.setValue(this.getAttribute('value'), false);
    } else if (!this.allowEmpty || !this.empty) {
      this.setValue(this._value, false);
    }
  }

  setValue(value, shouldEmit = true, source = 'control') {
    if ((value === null || value === undefined || value === '') && this.allowEmpty) {
      const changed = !this.empty;
      this.empty = true;
      this.removeAttribute('value');
      this.refresh();
      if (changed && shouldEmit) editParameterGesture(this, this.value, { source });
      return;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) return;

    const nextValue = clamp(snap(number, this.step), this.min, this.max);
    const changed = this.empty || nextValue !== this._value;
    this.empty = false;
    this.lastUpdateSource = source;
    this._value = nextValue;
    if (this.getAttribute('value') !== String(nextValue)) {
      this.setAttribute('value', String(nextValue));
    }
    this.refresh();

    if (changed && shouldEmit) {
      editParameterGesture(this, this.value, { source });
    }
  }

  getParameterValue() {
    return this.value;
  }

  focus(options) {
    this.box?.focus(options);
  }

  blur() {
    this.box?.blur();
  }

  beginDrag(event) {
    if (this.disabled || this.editing || event.button !== 0) return;

    event.preventDefault();
    this.box.focus({ preventScroll: true });
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      value: this.empty ? this.min : this._value,
      distance: 0,
      moved: false,
      locked: false,
      fineCandidate: this.lastClickTime > 0
        && performance.now() - this.lastClickTime < 380,
      fine: Boolean(event.altKey || event.shiftKey),
      zoneScale: this.dragScaleFor(event),
      lockDeltaEvents: 0,
      lockFallbackTimer: null,
    };
    beginParameterGesture(this, this.value);
    window.addEventListener('blur', this.handleWindowBlur);
    this.setPointerCapture?.(event.pointerId);
    this.box.setPointerCapture?.(event.pointerId);
    if (this.hasAttribute('pointer-lock')) {
      this.requestPointerLock();
    }
  }

  dragScaleFor(event) {
    if (!this.hasAttribute('split-drag')) return 1;

    const rect = this.box?.getBoundingClientRect?.();
    const width = Number(rect?.width || this.box?.offsetWidth);
    if (!(width > 0) || !Number.isFinite(event?.clientX)) return SPLIT_DRAG_SCALES.middle;

    const position = clamp((event.clientX - Number(rect?.left || 0)) / width, 0, 1);
    const zone = position < 1 / 3 ? 'left' : position > 2 / 3 ? 'right' : 'middle';
    const scale = readNumberAttribute(this, `drag-step-${zone}`, SPLIT_DRAG_SCALES[zone]);
    return scale > 0 ? scale : SPLIT_DRAG_SCALES[zone];
  }

  moveDrag(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId || this.disabled) return;
    if (this.drag.locked) return;

    const dx = event.clientX - this.drag.x;
    const dy = this.drag.y - event.clientY;
    this.applyDragDistance(dx + dy, event);
  }

  applyDragDistance(distance, event) {
    if (!this.drag) return;
    if (this.drag.fineCandidate && Math.abs(distance) <= 4) {
      event?.preventDefault?.();
      return;
    }
    if (this.drag.fineCandidate && Math.abs(distance) > 4) {
      this.drag.fine = true;
    }
    if (Math.abs(distance) < 2 && !this.drag.moved) return;
    this.drag.moved = this.drag.moved || Math.abs(distance) > 4;
    if (!this.drag.moved) return;
    this.toggleAttribute('data-dragging', true);
    event?.preventDefault?.();

    const fineScale = this.drag.fine || event?.altKey || event?.shiftKey
      ? (this.attributes == null ? FINE_DRAG_SCALE : readNumberAttribute(this, 'fine-drag-scale', FINE_DRAG_SCALE))
      : 1;
    const scale = (this.drag.zoneScale || 1) * fineScale;
    const delta = distance / 180 * scale;
    this.setValue(moveValueByNormalisedDelta(this.drag.value, delta, this.scaleOptions()), true, 'control');
  }

  requestPointerLock() {
    if (!this.hasAttribute('pointer-lock') || !this.drag || !this.box.requestPointerLock || this.isPointerLocked()) return;

    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleLockedMouseMove);
    document.addEventListener('mouseup', this.handleLockedMouseUp);

    try {
      const result = this.box.requestPointerLock();
      result?.catch?.(() => this.fallbackPointerLock());
    } catch {
      this.fallbackPointerLock();
    }
  }

  handlePointerLockChange() {
    if (this.isPointerLocked()) {
      if (this.drag) {
        this.drag.locked = true;
        this.drag.lockDeltaEvents = 0;
        this.startPointerLockFallbackTimer();
      }
      return;
    }

    if (this.drag?.locked) {
      this.endActiveDrag(true, false);
    } else {
      this.cleanupPointerLock(false);
    }
  }

  handlePointerLockError() {
    this.fallbackPointerLock();
  }

  handleLockedMouseMove(event) {
    if (!this.drag || !this.isPointerLocked()) return;

    const movementX = Number(event.movementX);
    const movementY = Number(event.movementY);
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) {
      this.fallbackPointerLock();
      return;
    }

    if (movementX !== 0 || movementY !== 0) {
      this.drag.lockDeltaEvents += 1;
    }

    this.drag.distance += movementX - movementY;
    this.applyDragDistance(this.drag.distance, event);
  }

  handleLockedMouseUp() {
    if (!this.drag) return;
    this.endActiveDrag(true);
  }

  endDrag(event, commit = true) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;

    this.endActiveDrag(commit);
  }

  endActiveDrag(commit = true, releaseLock = true) {
    if (!this.drag) return;

    const moved = this.drag.moved;
    const locked = this.drag.locked;
    clearTimeout(this.drag.lockFallbackTimer);
    this.drag = null;
    this.toggleAttribute('data-dragging', false);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.cleanupPointerLock(releaseLock);

    if (moved) {
      if (commit) endParameterGesture(this, this.value);
      else endParameterGesture(this, this.value, { cancelled: true });
      this.lastClickTime = 0;
    } else if (commit) {
      const now = performance.now();
      if (now - this.lastClickTime < 380) {
        this.lastClickTime = 0;
        this.setValue(this.resetTargetValue(), true, 'control');
      } else {
        this.lastClickTime = now;
      }
      endParameterGesture(this, this.value);
    } else {
      this.lastClickTime = 0;
      endParameterGesture(this, this.value, { cancelled: true });
    }

    if (locked) {
      this.box.focus({ preventScroll: true });
    }
  }

  cleanupPointerLock(releaseLock = true) {
    if (this.drag?.lockFallbackTimer) {
      clearTimeout(this.drag.lockFallbackTimer);
      this.drag.lockFallbackTimer = null;
    }

    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('mousemove', this.handleLockedMouseMove);
    document.removeEventListener('mouseup', this.handleLockedMouseUp);

    if (releaseLock && this.isPointerLocked()) {
      document.exitPointerLock?.();
    }
  }

  startPointerLockFallbackTimer() {
    if (!this.drag) return;

    if (this.drag.lockFallbackTimer) {
      clearTimeout(this.drag.lockFallbackTimer);
    }

    this.drag.lockFallbackTimer = setTimeout(() => {
      if (this.drag?.locked && this.drag.lockDeltaEvents === 0 && this.isPointerLocked()) {
        this.fallbackPointerLock();
      }
    }, 350);
  }

  fallbackPointerLock() {
    if (!this.drag) {
      this.cleanupPointerLock(true);
      return;
    }

    this.drag.locked = false;
    this.cleanupPointerLock(true);
    this.box.focus({ preventScroll: true });
  }

  isPointerLocked() {
    const root = this.box?.getRootNode?.();
    return (
      document.pointerLockElement === this.box ||
      document.pointerLockElement === this ||
      root?.pointerLockElement === this.box
    );
  }

  handleKey(event) {
    if (this.disabled || this.editing || event.metaKey || event.ctrlKey) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      this.beginEdit(this.editableValueText(), false);
      return;
    }

    if (event.key === 'Escape'
        || event.key === 'Delete'
        || event.key === 'Backspace') {
      event.preventDefault();
      this.setValue(this.resetTargetValue());
      endParameterGesture(this, this.value);
      return;
    }

    const smallStep = this.keyboardStep();
    const largeStep = this.largeKeyboardStep();
    const arrowStep = event.altKey ? largeStep : smallStep;
    const deltas = {
      ArrowUp: arrowStep,
      ArrowRight: arrowStep,
      ArrowDown: -arrowStep,
      ArrowLeft: -arrowStep,
      PageUp: largeStep,
      PageDown: -largeStep,
    };

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

    if (deltas[event.key] !== undefined) {
      event.preventDefault();
      this.setValue((this.empty ? this.min : this._value) + deltas[event.key]);
      endParameterGesture(this, this.value);
      return;
    }

    if (/^[0-9.+-]$/u.test(event.key)) {
      event.preventDefault();
      this.beginEdit(event.key, false);
    }
  }

  editableValueText() {
    if (this.empty) return '';
    return formatNumber(
      this._value,
      this.step,
      this.displayFractionDigits,
    );
  }

  beginEdit(initialValue = this.editableValueText(), selectValue = false) {
    if (this.disabled || this.editing) return;

    this.editing = true;
    beginParameterGesture(this, this.value);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = initialValue;
    input.setAttribute('aria-label', `Set ${this.label}`);

    const restoreOwnFocus = () => {
      queueMicrotask(() => {
        if (this.isConnected && this.box?.isConnected) {
          this.box.focus({ preventScroll: true });
        }
      });
    };

    const finish = (commit, restoreFocus = false) => {
      if (!this.editing) return;

      const raw = input.value.trim();
      this.editing = false;

      if (commit) {
        if (raw === '' && this.allowEmpty) {
          this.setValue(null);
          endParameterGesture(this, this.value, { source: 'control', restoreFocus });
        } else {
          const number = Number(raw);
          if (Number.isFinite(number)) {
            this.setValue(number);
            endParameterGesture(this, this.value, { source: 'control', restoreFocus });
          } else {
            this.refresh();
            endParameterGesture(this, this.value, {
              cancelled: true,
              source: 'control',
              restoreFocus,
            });
          }
        }
      } else {
        this.refresh();
        endParameterGesture(this, this.value, { cancelled: true });
      }

      if (restoreFocus) restoreOwnFocus();
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
    input.addEventListener('blur', () => finish(true, false));

    this.valueElement.replaceChildren(input);
    input.focus();
    if (selectValue) {
      input.select();
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  keyboardStep() {
    const range = Math.abs(this.max - this.min);
    const fallback = range / 100 || 0.01;
    return Number.isFinite(this.step) && this.step > 0 ? this.step : fallback;
  }

  largeKeyboardStep() {
    const range = Math.abs(this.max - this.min);
    return Math.max(this.keyboardStep() * 10, range / 100 || this.keyboardStep() * 10);
  }

  resetTargetValue() {
    if (this.hasAttribute('reset-value')) return this.resetValue;
    if (this.hasAttribute('init')) return this.resetValue;
    if (this.dataset?.field === 'max') return this.max;
    if (this.dataset?.field === 'min') return this.min;
    return this.resetValue;
  }

  refresh() {
    if (!this.box || this.editing) return;

    const valueText = this.empty
      ? this.placeholder
      : formatValue(
          this._value,
          this.step,
          this.unit,
          this.valueText,
          this.displayFractionDigits,
          {min: this.min, max: this.max, minLabel: this.minLabel, maxLabel: this.maxLabel},
        );
    this.style.setProperty('--number-box-percent', `${this.empty ? 0 : this.getPercent()}%`);
    this.valueElement.textContent = valueText;
    this.valueElement.classList.toggle('placeholder', this.empty);
    this.box.id = this.idBase;
    this.box.tabIndex = this.disabled ? -1 : 0;
    this.box.setAttribute('aria-label', this.ariaLabelText || this.label);
    this.box.setAttribute('aria-valuemin', String(this.min));
    this.box.setAttribute('aria-valuemax', String(this.max));
    this.box.setAttribute('aria-valuenow', this.empty ? '' : String(this._value));
    if (this.lastUpdateSource === 'control' || document.activeElement !== this.box) {
      this.box.setAttribute('aria-valuetext', this.empty ? (this.placeholder || 'empty') : valueText);
    }
    this.box.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
    this.box.removeAttribute('aria-description');
    this.box.removeAttribute('aria-keyshortcuts');
  }

  getPercent() {
    return clamp(valueToNormalisedPosition(this._value, this.scaleOptions()) * 100, 0, 100);
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

defineElement('compost-number-box', CompostNumberBox);
