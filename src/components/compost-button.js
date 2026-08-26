import { beginParameterGesture, defineElement, editParameterGesture, endParameterGesture, numberAttr } from '../utils.js';

export class CircleButton extends HTMLElement {
  static get observedAttributes() {
    return [
      'label',
      'mode',
      'name',
      'parameter-id',
      'section',
      'pressed',
      'value',
      'disabled',
      'aria-label',
      'aria-description',
    ];
  }

  constructor() {
    super();
    this.flashTimer = 0;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          display: inline-block;
          --compost-button-bg: #ffffff;
          --compost-button-border: #111111;
          --compost-button-text: #111111;
          --compost-button-fill: #111111;
          --compost-button-fill-text: #ffffff;
          --compost-button-border-width: 3px;
          --compost-button-radius: 0;
          --compost-button-focus-bracket-color: #111111;
          --compost-button-focus-bracket-offset: 9px;
          --compost-button-focus-bracket-pulse-offset: 10px;
          --compost-button-focus-bracket-length: 11px;
          --compost-button-focus-bracket-thickness: 2px;
          --compost-button-focus-bracket-opacity: 0.45;
          --compost-button-gap: #ffffff;
          --compost-button-ring-space: 10px;
          --compost-button-flash-ms: 180ms;
          --compost-button-color-scheme: light;
          --midi-map-learn-color: #005fc0;
          --midi-map-label-text: var(--midi-map-learn-color);
          --midi-map-label-shadow: none;
          color-scheme: var(--compost-button-color-scheme);
          color: var(--compost-button-text);
          font: inherit;
          padding: var(--compost-button-ring-space);
          -webkit-user-select: none;
          user-select: none;
        }
        button {
          width: var(--compost-button-width, var(--compost-button-size, 64px));
          height: var(--compost-button-height, var(--compost-button-size, 64px));
          border: var(--compost-button-border-width) solid var(--compost-button-gap);
          border-radius: var(--compost-button-radius);
          background: var(--compost-button-bg);
          color: var(--compost-button-text);
          outline: var(--compost-button-outline-width, 1px) solid var(--compost-button-border);
          outline-offset: 0;
          cursor: pointer;
          font: inherit;
          display: grid;
          place-items: center;
          padding: 0;
          text-align: center;
          touch-action: manipulation;
          position: relative;
        }
        button::before {
          content: "";
          position: absolute;
          inset: calc(-1 * var(--compost-button-focus-bracket-offset));
          border: 0 solid var(--compost-button-focus-bracket-color);
          opacity: 0;
          pointer-events: none;
        }
        button::after {
          content: "";
          position: absolute;
          inset: calc(-1 * var(--compost-button-focus-bracket-offset));
          border: 0 solid var(--compost-button-focus-bracket-color);
          opacity: 0;
          pointer-events: none;
        }
        button::before {
          border-top-width: var(--compost-button-focus-bracket-thickness);
          border-bottom-width: var(--compost-button-focus-bracket-thickness);
          clip-path: polygon(0 0, var(--compost-button-focus-bracket-length) 0, var(--compost-button-focus-bracket-length) 100%, 0 100%, 0 0, 100% 0, calc(100% - var(--compost-button-focus-bracket-length)) 0, calc(100% - var(--compost-button-focus-bracket-length)) 100%, 100% 100%, 100% 0);
        }
        button::after {
          border-left-width: var(--compost-button-focus-bracket-thickness);
          border-right-width: var(--compost-button-focus-bracket-thickness);
          clip-path: polygon(0 0, 100% 0, 100% var(--compost-button-focus-bracket-length), 0 var(--compost-button-focus-bracket-length), 0 0, 0 100%, 100% 100%, 100% calc(100% - var(--compost-button-focus-bracket-length)), 0 calc(100% - var(--compost-button-focus-bracket-length)), 0 100%);
        }
        :host([pressed]) button,
        :host([data-active-flash]) button {
          outline-color: var(--compost-button-fill);
          background: var(--compost-button-fill);
          color: var(--compost-button-fill-text);
        }
        button:active {
          opacity: 0.82;
        }
        button:disabled {
          cursor: default;
          opacity: 0.45;
        }
        button:focus-visible {
          outline-width: 1px;
          outline-offset: 0;
        }
        button:focus::before,
        button:focus::after {
          opacity: var(--compost-button-focus-bracket-opacity);
        }
        button:focus-visible::before,
        button:focus-visible::after {
          opacity: 1;
        }
        :host([data-midi-map-target-active]) button::before,
        :host([data-midi-map-target-active]) button::after {
          border-color: var(--midi-map-learn-color);
          inset: calc(-1 * var(--compost-button-focus-bracket-offset));
          opacity: 1;
          transition: inset 220ms ease;
        }
        :host([data-midi-map-target-active][data-midi-map-pulse]) button::before,
        :host([data-midi-map-target-active][data-midi-map-pulse]) button::after {
          inset: calc(-1 * var(--compost-button-focus-bracket-pulse-offset));
        }
        :host([data-midi-map-mode][data-midi-map-label]) .midi-map-label::after {
          content: var(--midi-map-label);
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 2;
          max-width: calc(100% - 10px);
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
          transform: translate(-50%, -50%);
          white-space: nowrap;
        }
        @media (prefers-reduced-motion: reduce) {
          :host([data-midi-map-target-active]) button::before,
          :host([data-midi-map-target-active]) button::after {
            transition: none;
          }
        }
        .content {
          grid-area: 1 / 1;
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          padding: var(--compost-button-label-padding, 0 8px);
          pointer-events: none;
          text-align: center;
          line-height: 1;
        }
        :host([data-midi-map-mode][data-midi-map-label]) .content {
          opacity: 0;
        }
        slot {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          line-height: 1.05;
          overflow-wrap: anywhere;
          white-space: normal;
        }
        .midi-map-label {
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
          z-index: 2;
        }
        .fallback {
          display: block;
          line-height: 1.05;
          max-width: var(--compost-button-label-max-width, calc(100% - 12px));
          overflow: visible;
          overflow-wrap: anywhere;
          text-overflow: clip;
          white-space: normal;
        }
        ::slotted(*) {
          display: block;
          line-height: 1.05;
          max-width: var(--compost-button-label-max-width, calc(100% - 12px));
          overflow-wrap: anywhere;
          white-space: normal;
        }
      </style>
      <button part="button" type="button">
        <span class="content" part="label"><slot><span class="fallback"></span></slot></span>
        <span class="midi-map-label" aria-hidden="true"></span>
      </button>`;

    this.button = this.root.querySelector('button');
    this.fallback = this.root.querySelector('.fallback');

    this.button.addEventListener('click', () => {
      if (this.mode !== 'switch') {
        this.trigger('control');
        return;
      }

      beginParameterGesture(this, this.value);
      this.pressed = !this.pressed;
      editParameterGesture(this, this.value);
      this.dispatchEvent(new Event('change', {
        bubbles: true,
        composed: true,
      }));
      endParameterGesture(this, this.value);
    });
  }

  connectedCallback() {
    this.refresh();
  }

  disconnectedCallback() {
    clearTimeout(this.flashTimer);
  }

  focus(options) {
    this.button?.focus(options);
  }

  blur() {
    this.button?.blur();
  }

  attributeChangedCallback(name) {
    // `pressed` is the canonical switch state; a `value` attribute is accepted
    // for symmetry with the other parameter controls and maps onto it.
    if (name === 'value') this.setValue(numberAttr(this, 'value', this.value), false);
    this.refresh();
  }

  get mode() {
    return this.getAttribute('mode') === 'switch' ? 'switch' : 'momentary';
  }

  get pressed() {
    return this.hasAttribute('pressed');
  }

  set pressed(value) {
    this.toggleAttribute('pressed', Boolean(value));
  }

  get value() {
    return this.pressed ? 1 : 0;
  }

  set value(value) {
    this.setValue(value, false);
  }

  get parameterID() {
    return this.getAttribute('parameter-id') || '';
  }

  get parameterKind() { return this.mode === 'switch' ? 'discrete' : 'trigger'; }

  get transientParameter() {
    return this.mode !== 'switch';
  }

  setValue(value, shouldEmit = true, source = 'api') {
    const active = Number(value) >= 0.5;

    if (this.mode !== 'switch') {
      if (shouldEmit && active) {
        this.trigger(source);
      }
      return;
    }

    if (this.pressed === active) return;

    this.pressed = active;

    if (shouldEmit) {
      beginParameterGesture(this, active ? 0 : 1, { source });
      editParameterGesture(this, this.value, { source });
      this.dispatchEvent(new Event('change', {
        bubbles: true,
        composed: true,
      }));
      endParameterGesture(this, this.value, { source });
    }
  }

  trigger(source = 'control') {
    if (this.mode !== 'switch') {
      this.flashActive();
    }

    this.dispatchEvent(new CustomEvent('button-trigger', {
      bubbles: true,
      composed: true,
      detail: {
        name: this.getAttribute('name') || '',
        parameterID: this.parameterID,
        value: 1,
        source,
      },
    }));
    beginParameterGesture(this, 0, { source });
    editParameterGesture(this, 1, { source });
    editParameterGesture(this, 0, { source });
    endParameterGesture(this, 0, { source });
  }

  flashActive() {
    clearTimeout(this.flashTimer);
    this.setAttribute('data-active-flash', '');

    const duration = this.readDurationCSS('--compost-button-flash-ms', 180);
    this.flashTimer = setTimeout(() => {
      this.removeAttribute('data-active-flash');
      this.flashTimer = 0;
    }, duration);
  }

  readDurationCSS(name, fallback) {
    const raw = getComputedStyle(this).getPropertyValue(name).trim();
    if (!raw) return fallback;

    if (raw.endsWith('ms')) return Number.parseFloat(raw) || fallback;
    if (raw.endsWith('s')) return (Number.parseFloat(raw) || fallback / 1000) * 1000;

    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  refresh() {
    const label = this.getAttribute('label') || '';
    this.fallback.textContent = label;
    this.button.disabled = this.hasAttribute('disabled');
    this.button.setAttribute('aria-label', this.getAttribute('aria-label') || label || this.textContent.trim() || 'Button');

    if (this.hasAttribute('aria-description')) {
      this.button.setAttribute('aria-description', this.getAttribute('aria-description'));
    } else {
      this.button.removeAttribute('aria-description');
    }

    if (this.mode === 'switch') {
      this.button.setAttribute('aria-pressed', String(this.pressed));
    } else {
      this.button.removeAttribute('aria-pressed');
    }
  }
}

defineElement('compost-button', CircleButton);
