import { defineElement } from '../utils.js';
import './compost-button.js';

export class WebAudio extends HTMLElement {
  static get observedAttributes() {
    return [
      'start-label',
      'stop-label',
      'start-aria-label',
      'stop-aria-label',
      'centered-while-off',
      'latency-hint',
    ];
  }

  constructor() {
    super();

    this.context = null;
    this.status = '';
    this.lastAnnouncedState = '';
    this.handlePowerClick = this.handlePowerClick.bind(this);
    this.stopInternalControlEvent = this.stopInternalControlEvent.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-audio-text: currentColor;
          --compost-audio-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-audio-button-size: 4.625em;
          --compost-audio-modal-scrim: color-mix(in srgb, CanvasText 78%, transparent);
          color: var(--compost-audio-text);
          display: block;
          font: inherit;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([modal]:not([running])) {
          position: relative;
          z-index: 1001;
        }
        :host([modal][centered-while-off]:not([running])) {
          min-width: var(
            --compost-audio-centered-placeholder-width,
            var(--compost-audio-button-size)
          );
          min-height: var(
            --compost-audio-centered-placeholder-height,
            var(--compost-audio-button-size)
          );
        }
        :host([modal]:not([running]))::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          background: var(--compost-audio-modal-scrim);
        }
        :host([modal]:not([running])) .panel {
          position: relative;
        }
        :host([modal][centered-while-off]:not([running])) .panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 1002;
          pointer-events: auto;
        }
        .panel {
          display: grid;
          gap: 0.75em;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: inherit;
          font: inherit;
        }
        .buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75em;
          align-items: center;
        }
        compost-button {
          --compost-button-size: var(--compost-audio-button-size);
        }
        .status {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }
        :host([data-status-visible]) .status {
          position: static;
          width: auto;
          height: auto;
          margin: 0;
          overflow: visible;
          clip: auto;
          clip-path: none;
          white-space: normal;
          color: var(--compost-audio-muted);
          font-size: 0.75em;
        }
      </style>
      <div class="panel" part="panel">
        <div class="buttons">
          <compost-button part="power-button" exportparts="button" mode="switch"></compost-button>
        </div>
        <div class="status" part="status" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>`;

    this.panel = this.root.querySelector('.panel');
    this.powerButton = this.root.querySelector('compost-button');
    this.statusElement = this.root.querySelector('.status');
    this.powerButton.addEventListener('click', this.handlePowerClick, { capture: true });
    this.powerButton.addEventListener('change', this.stopInternalControlEvent);
    this.powerButton.addEventListener('parameter-begin', this.stopInternalControlEvent);
    this.powerButton.addEventListener('parameter-edit', this.stopInternalControlEvent);
    this.powerButton.addEventListener('parameter-end', this.stopInternalControlEvent);
  }

  connectedCallback() {
    this.refresh();

    if (this.hasAttribute('modal')) {
      queueMicrotask(() => this.focusPowerButton());
    }
  }

  attributeChangedCallback() {
    this.refresh();
  }

  disconnectedCallback() {
    this.stop(true);
  }

  get startLabel() {
    return this.getAttribute('start-label') || 'Start Audio';
  }

  get stopLabel() {
    return this.getAttribute('stop-label') || 'Stop Audio';
  }

  get startAriaLabel() {
    return this.getAttribute('start-aria-label') || this.startLabel;
  }

  get stopAriaLabel() {
    return this.getAttribute('stop-aria-label') || this.stopLabel;
  }

  get latencyHint() {
    const rawValue = (this.getAttribute('latency-hint') ?? '0').trim();

    if (rawValue === 'interactive' || rawValue === 'balanced' || rawValue === 'playback') {
      return rawValue;
    }

    const numericValue = Number(rawValue);

    return rawValue !== '' && Number.isFinite(numericValue) && numericValue >= 0
      ? numericValue
      : 0;
  }

  get isRunning() {
    return this.context?.state === 'running';
  }

  handlePowerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this.toggle();
  }

  stopInternalControlEvent(event) {
    event.stopPropagation();
  }

  async toggle() {
    return this.isRunning ? this.stop() : this.start();
  }

  async start() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      this.setStatus('Web Audio is not available');
      this.dispatchAudioEvent('audio-error');
      return null;
    }

    try {
      const previousState = this.context?.state;
      const wasResumable = Boolean(previousState
        && previousState !== 'running'
        && previousState !== 'closed');
      if (!this.context || this.context.state === 'closed') {
        try {
          this.context = new AudioContextConstructor({ latencyHint: this.latencyHint });
        } catch (_error) {
          this.context = new AudioContextConstructor();
        }

        this.context.addEventListener('statechange', () => this.handleStateChange());
      }

      if (this.context.state !== 'running' && this.context.state !== 'closed') {
        await this.context.resume();
      }

      this.handleStateChange();
      if (this.context.state === 'running') {
        this.dispatchAudioEvent(wasResumable ? 'audio-resumed' : 'audio-started');
      }
      return this.context;
    } catch (error) {
      this.setStatus(`Could not start audio: ${error.message}`);
      this.dispatchAudioEvent('audio-error', { error });
      return null;
    }
  }

  async stop(forceClose = false) {
    if (!this.context || this.context.state === 'closed') {
      this.context = null;
      this.refresh();
      this.focusPowerButton();
      return;
    }

    const context = this.context;

    if (!forceClose) {
      try {
        await context.suspend();
        this.setStatus('Audio context suspended.');
        this.dispatchAudioEvent('audio-suspended');
      } catch (error) {
        this.setStatus(`Could not suspend audio: ${error.message}`);
        this.dispatchAudioEvent('audio-error', { error });
      }
      this.refresh();
      this.focusPowerButton();
      return;
    }

    this.context = null;
    // Reflect the closed state before awaiting the browser's close promise.
    // Some implementations settle that promise only after their audio thread
    // has drained, but the control must be usable immediately.
    this.refresh();

    try {
      await context.close();
      this.setStatus('Audio context stopped.');
      this.dispatchAudioEvent('audio-stopped');
    } catch (error) {
      this.setStatus(`Could not stop audio: ${error.message}`);
      this.dispatchAudioEvent('audio-error', { error });
    }

    this.refresh();
    this.focusPowerButton();
  }

  getContext() {
    return this.context;
  }

  handleStateChange() {
    const state = this.context?.state || 'closed';
    this.setStatus(this.statusForState(state));
    this.dispatchAudioEvent('audio-state-change', {
      state,
    });
    this.refresh();
  }

  setStatus(status) {
    this.status = status;
    this.refresh();
  }

  statusForState(state) {
    if (state === 'running') return 'Audio context running.';
    if (state === 'suspended') return 'Audio context suspended.';
    if (state === 'interrupted') return 'Audio context interrupted.';
    if (state === 'closed') return 'Audio context stopped.';
    return '';
  }

  dispatchAudioEvent(type, extraDetail = {}) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: {
        context: this.context,
        state: this.context?.state || 'closed',
        ...extraDetail,
      },
    }));
  }

  refresh() {
    const isRunning = this.isRunning;
    const label = isRunning ? this.stopLabel : this.startLabel;
    const ariaLabel = isRunning ? this.stopAriaLabel : this.startAriaLabel;
    const stateStatus = this.status || this.statusForState(this.context?.state || (isRunning ? 'running' : 'closed'));
    const visibleStatuses = new Set([
      'Web Audio is not available',
    ]);
    const shouldShowStatus = Boolean(this.status && (
      visibleStatuses.has(this.status) ||
      this.status.startsWith('Could not ')
    ));

    this.toggleAttribute('running', Boolean(isRunning));
    this.powerButton.setAttribute('label', label);
    this.powerButton.setAttribute('aria-label', stateStatus ? `${ariaLabel}. ${stateStatus}` : ariaLabel);
    this.powerButton.setAttribute('aria-description', isRunning
      ? 'Audio is running. Press to stop the audio context.'
      : this.context?.state === 'interrupted'
        ? 'Audio was interrupted. Press to resume.'
      : this.context?.state === 'suspended'
        ? 'Audio is suspended. Press to resume the audio context.'
        : 'Audio is stopped. Press to start the audio context.');
    this.powerButton.toggleAttribute('pressed', isRunning);
    this.toggleAttribute('data-status-visible', shouldShowStatus);
    this.statusElement.textContent = this.status;
    this.statusElement.hidden = !this.status;

    if (!isRunning && this.hasAttribute('modal')) {
      this.focusPowerButton();
    }
  }

  focusPowerButton() {
    queueMicrotask(() => this.powerButton?.focus());
  }
}

defineElement('compost-audio', WebAudio);
