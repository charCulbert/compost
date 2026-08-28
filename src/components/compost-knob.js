import {
  moveValueByNormalisedDelta,
  normaliseCurveName,
  normalisedKeyboardStep,
  normalisedPositionToValue,
  valueToNormalisedPosition,
} from '../parameter-scale.js';
import { installTouchDoubleClick } from '../internal/touch-double-click.js';
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

let nextKnobID = 1;
const FINE_DRAG_SCALE = 0.1;

export class SynthKnob extends HTMLElement {
  static get observedAttributes() {
    return [
      'name',
      'parameter-id',
      'label',
      'section',
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
      'pointer-lock',
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
    this.inputID = `compost-knob-${nextKnobID++}`;
    this.labelID = `${this.inputID}-label`;
    this.lastUpdateSource = 'control';
    this.lastClickTime = 0;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --knob-scale: 1;
          --knob-dial-size: 4.75em;
          --knob-ring-width: 0.45em;
          --knob-ring-stroke-width: calc(var(--knob-ring-width) * var(--knob-scale));
          --knob-cap-size: calc(var(--knob-dial-size) - (var(--knob-ring-width) * 2));
          --knob-cap-inset: calc(((var(--knob-dial-size) - var(--knob-cap-size)) / 2) * var(--knob-scale));
          --knob-indicator-width: 1px;
          --knob-indicator-inset: calc(0.3em * var(--knob-scale));
          --knob-indicator-length: calc(0.8em * var(--knob-scale));
          --_accent: var(--compost-accent, AccentColor);
          --_muted: color-mix(in srgb, currentColor 65%, transparent);
          --_track: color-mix(in srgb, currentColor 30%, transparent);
          display: inline-block;
          vertical-align: top;
          -webkit-user-select: none;
          user-select: none;
        }
        :host(:focus-visible) {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"]) {
          outline: 2px solid var(--_accent);
          outline-offset: 2px;
        }
        :host([midi-map-state~="active"][midi-map-state~="pulse"]) {
          outline-offset: 4px;
        }
        .knob {
          display: grid;
          justify-items: center;
          gap: calc(0.6em * var(--knob-scale));
          position: relative;
        }
        .dial {
          --arc-ratio: 0;
          --arc: 0deg;
          width: calc(var(--knob-dial-size) * var(--knob-scale));
          height: calc(var(--knob-dial-size) * var(--knob-scale));
          border-radius: 50%;
          display: grid;
          place-items: center;
          cursor: ns-resize;
          touch-action: none;
          position: relative;
        }
        .ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            conic-gradient(from -135deg,
              var(--_accent) 0deg var(--arc),
              var(--_track) var(--arc) 270deg,
              transparent 270deg);
          -webkit-mask:
            radial-gradient(farthest-side,
              transparent calc(100% - var(--knob-ring-stroke-width)),
              #000 calc(100% - var(--knob-ring-stroke-width)));
          mask:
            radial-gradient(farthest-side,
              transparent calc(100% - var(--knob-ring-stroke-width)),
              #000 calc(100% - var(--knob-ring-stroke-width)));
          pointer-events: none;
        }
        :host([disabled]) .knob {
          opacity: 0.45;
        }
        :host([disabled]) .dial,
        :host([disabled]) .value {
          cursor: default;
        }
        :host([midi-map-state~="mode"][midi-map-state~="label"]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 2;
          max-width: calc(100% - 10px);
          color: var(--_accent);
          font-size: 0.65em;
          font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
          line-height: 1;
          overflow: hidden;
          pointer-events: none;
          text-overflow: ellipsis;
          transform: translate(-50%, -50%);
          white-space: nowrap;
        }
        .cap {
          box-sizing: border-box;
          position: absolute;
          inset: var(--knob-cap-inset);
          border: 1px solid currentColor;
          border-radius: 50%;
          z-index: 1;
        }
        .cap::before {
          content: "";
          position: absolute;
          left: 50%;
          top: var(--knob-indicator-inset);
          width: var(--knob-indicator-width);
          height: var(--knob-indicator-length);
          background: currentColor;
          transform: translateX(-50%);
        }
        .midi-map-label {
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
          z-index: 2;
        }
        .label {
          font-size: calc(0.8125em * var(--knob-scale));
          line-height: 1.2;
          text-align: center;
          overflow-wrap: anywhere;
        }
        .value {
          color: var(--_muted);
          font-size: calc(0.75em * var(--knob-scale));
          font-variant-numeric: lining-nums tabular-nums;
          min-block-size: 1.3em;
          min-inline-size: calc(var(--knob-value-editor-width, 4.5em) * var(--knob-scale));
          position: relative;
          text-align: center;
        }
        :host([editable]:not([disabled])) .value {
          cursor: text;
          padding: 1px 4px;
        }
        .value-editor {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 4;
          width: calc(var(--knob-value-editor-width, 4.5em) * var(--knob-scale));
          border: 1px solid currentColor;
          border-radius: 0;
          background: Field;
          color: inherit;
          font: inherit;
          text-align: center;
          transform: translate(-50%, -50%);
          -webkit-user-select: text;
          user-select: text;
        }
      </style>
      <div class="knob" part="panel">
        <div class="dial" part="dial">
          <span class="ring" part="ring track fill" aria-hidden="true"></span>
          <span class="cap" part="cap"></span>
          <span class="midi-map-label" aria-hidden="true"></span>
        </div>
        <div class="label" part="label"></div>
        <div class="value" part="value"></div>
      </div>`;

    this.dial = this.root.querySelector('.dial');
    this.cap = this.root.querySelector('.cap');
    this.labelElement = this.root.querySelector('.label');
    this.valueElement = this.root.querySelector('.value');

    this.dial.addEventListener('pointerdown', (event) => this.beginDrag(event));
    installTouchDoubleClick(this.dial, { dispatch: false });
    this.addEventListener('keydown', (event) => this.handleKey(event));
    this.valueElement.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.beginValueEdit();
    });
  }

  connectedCallback() {
    this.readAttributes();
    this.refresh();
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
    this.positionStep = this.hasAttribute('position-step') ? numberAttr(this, 'position-step', null) : null;
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

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  get parameterKind() { return this.getAttribute('parameter-kind') || 'continuous'; }

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

  beginDrag(event) {
    // Only the primary button drags. A secondary button opens the context
    // menu, which swallows the pointerup and would leave the drag running.
    if (this.disabled || (event.button !== undefined && event.button !== 0)) return;

    event.preventDefault();
    HTMLElement.prototype.focus.call(this, { preventScroll: true });
    this.dial.setPointerCapture(event.pointerId);

    let ended = false;
    const drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: this.value,
      distance: 0,
      moved: false,
      fineCandidate: this.lastClickTime > 0
        && performance.now() - this.lastClickTime < 380,
      fine: Boolean(event.shiftKey),
      locked: false,
    };
    beginParameterGesture(this, this.value);

    let lockFallbackTimer = null;

    const applyDistance = (distance, sourceEvent) => {
      if (drag.fineCandidate && Math.abs(distance) <= 4) {
        sourceEvent?.preventDefault?.();
        return;
      }

      if (drag.fineCandidate && Math.abs(distance) > 4) {
        drag.fine = true;
      }
      drag.moved = drag.moved || Math.abs(distance) > 4;
      const scale = drag.fine || sourceEvent?.shiftKey
        ? FINE_DRAG_SCALE
        : 1;
      this.setValue(moveValueByNormalisedDelta(
        drag.startValue,
        distance / 180 * scale,
        this.scaleOptions(),
      ));
      sourceEvent?.preventDefault?.();
    };

    const isPointerLocked = () => {
      const root = this.dial?.getRootNode?.();
      return (
        document.pointerLockElement === this.dial ||
        document.pointerLockElement === this ||
        root?.pointerLockElement === this.dial
      );
    };

    const clearLockFallbackTimer = () => {
      if (lockFallbackTimer) {
        clearTimeout(lockFallbackTimer);
        lockFallbackTimer = null;
      }
    };

    const fallbackPointerLock = () => {
      clearLockFallbackTimer();
      if (isPointerLocked()) {
        document.exitPointerLock?.();
      }
      drag.locked = false;
    };

    const startLockFallbackTimer = () => {
      clearLockFallbackTimer();
      drag.lockDeltaEvents = 0;
      lockFallbackTimer = setTimeout(() => {
        if (!ended && drag.locked && drag.lockDeltaEvents === 0 && isPointerLocked()) {
          fallbackPointerLock();
        }
      }, 350);
    };

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== drag.pointerId) {
        return;
      }

      if (drag.locked) {
        return;
      }

      applyDistance(drag.startY - moveEvent.clientY, moveEvent);
    };

    const lockedMove = (moveEvent) => {
      if (!isPointerLocked()) {
        return;
      }

      drag.locked = true;
      const movementY = Number(moveEvent.movementY);
      if (!Number.isFinite(movementY)) {
        fallbackPointerLock();
        return;
      }

      if (movementY !== 0) {
        drag.lockDeltaEvents = (drag.lockDeltaEvents || 0) + 1;
      }

      drag.distance -= movementY;
      applyDistance(drag.distance, moveEvent);
    };

    const lockedMouseUp = () => {
      end({ pointerId: drag.pointerId, type: 'pointerup' });
    };

    const pointerLockChange = () => {
      if (ended) {
        return;
      }

      if (isPointerLocked()) {
        drag.locked = true;
        startLockFallbackTimer();
        return;
      }

      if (drag.locked) {
        end({ pointerId: drag.pointerId, type: 'pointerup' });
      }
    };

    const cleanup = () => {
      clearLockFallbackTimer();
      this.dial.removeEventListener('pointerup', end);
      this.dial.removeEventListener('pointercancel', end);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('mousemove', lockedMove);
      document.removeEventListener('mouseup', lockedMouseUp);
      document.removeEventListener('pointerlockchange', pointerLockChange);
      document.removeEventListener('pointerlockerror', fallbackPointerLock);
      if (isPointerLocked()) {
        document.exitPointerLock?.();
      }
    };

    const cancel = () => {
      if (ended) {
        return;
      }

      ended = true;
      cleanup();
      this.lastClickTime = 0;
      endParameterGesture(this, this.value, { cancelled: true });
    };

    const end = (endEvent) => {
      if (ended) {
        return;
      }

      if (endEvent.pointerId !== drag.pointerId) {
        return;
      }

      ended = true;
      if (this.dial.hasPointerCapture?.(endEvent.pointerId)) {
        this.dial.releasePointerCapture(endEvent.pointerId);
      }
      cleanup();

      if (endEvent.type === 'pointercancel') {
        this.lastClickTime = 0;
        endParameterGesture(this, this.value, { cancelled: true });
        return;
      }

      if (!drag.moved && this.handleClickReset()) {
        return;
      }

      if (drag.moved) {
        this.lastClickTime = 0;
      }

      endParameterGesture(this, this.value);
    };

    this.dial.addEventListener('pointerup', end);
    this.dial.addEventListener('pointercancel', end);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', cancel);
    document.addEventListener('mousemove', lockedMove);
    document.addEventListener('mouseup', lockedMouseUp);
    document.addEventListener('pointerlockchange', pointerLockChange);
    document.addEventListener('pointerlockerror', fallbackPointerLock);

    if (this.hasAttribute('pointer-lock')) {
      try {
        const pointerLockRequest = this.dial.requestPointerLock?.();
        pointerLockRequest?.catch?.(() => fallbackPointerLock());
      } catch {
        fallbackPointerLock();
      }
    }
  }

  handleKey(event) {
    if (this.disabled) return;

    if (this.handleValueEditKey(event)) {
      return;
    }

    const smallStep = this.normalisedKeyboardStep();
    const largeStep = this.largeNormalisedKeyboardStep();
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
    this.setValue(normalisedPositionToValue(
      valueToNormalisedPosition(this.value, this.scaleOptions()) + deltas[event.key],
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

  largeNormalisedKeyboardStep() {
    return clamp(this.normalisedKeyboardStep() * 10, 0, 1);
  }

  handleClickReset() {
    const now = performance.now();

    if (now - this.lastClickTime < 380) {
      this.lastClickTime = 0;
      this.reset();
      return true;
    } else {
      this.lastClickTime = now;
      return false;
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
        queueMicrotask(() =>
          HTMLElement.prototype.focus.call(this, { preventScroll: true }));
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

    this.valueElement.replaceChildren(input);
    input.focus();
    if (selectValue) {
      input.select();
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  refresh() {
    if (!this.dial) {
      return;
    }

    const normalised = valueToNormalisedPosition(this.value, this.scaleOptions());
    const arcRatio = clamp(normalised, 0, 1);
    this.dial.style.setProperty('--arc-ratio', String(arcRatio));
    this.dial.style.setProperty('--arc', `${arcRatio * 270}deg`);
    this.cap.style.transform = `rotate(${-135 + normalised * 270}deg)`;
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
      this.valueElement.textContent = valueText;
    }
    this.refreshEditableValue();
    this.tabIndex = this.disabled ? -1 : 0;
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-label', this.label);
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-valuetext', valueText);
    this.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
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

  refreshEditableValue() {
    if (!this.editable) {
      this.valueElement.removeAttribute('role');
      this.valueElement.removeAttribute('tabindex');
      this.valueElement.removeAttribute('aria-label');
      this.valueElement.removeAttribute('title');
      return;
    }

    this.valueElement.removeAttribute('role');
    this.valueElement.removeAttribute('tabindex');
    this.valueElement.removeAttribute('aria-label');
    this.valueElement.removeAttribute('title');
  }
}

defineElement('compost-knob', SynthKnob);
