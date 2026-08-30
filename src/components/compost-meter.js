import { valueToNormalisedPosition } from '../parameter-scale.js';
import { defineElement } from '../utils.js';

export class CompostMeter extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'min', 'max', 'mid', 'curve', 'shape'];
  }

  constructor() {
    super();
    this.state = {
      primaryLabel: 'Primary',
      secondaryLabel: '',
      holdLabel: '',
      unit: '',
      channels: [],
    };

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --_accent: var(--compost-accent, AccentColor);
          --_muted: color-mix(in srgb, currentColor 65%, transparent);
          --_outline: color-mix(in srgb, currentColor 30%, transparent);
          --_secondary: color-mix(in srgb, var(--_accent) 28%, transparent);
          --meter-width: 2.5em;
          --meter-length: 9em;
          --meter-gap: 0px;
          --meter-primary-width: 0.1875em;
          --meter-marker-thickness: 1px;
          --meter-clip-thickness: 2px;
          --meter-separator-thickness: 1px;
          display: inline-block;
          color: inherit;
          font: inherit;
        }
        .panel {
          display: grid;
          justify-items: center;
          gap: 0.4375em;
        }
        .label {
          justify-self: start;
        }
        .legend {
          color: var(--_muted);
          font-size: 0.75em;
          font-variant-numeric: lining-nums tabular-nums;
          line-height: 1.25;
          letter-spacing: 0.02em;
        }
        .meter {
          position: relative;
          display: flex;
          gap: var(--meter-gap);
          box-sizing: border-box;
          width: var(--meter-width);
          height: var(--meter-length);
          border-block: 1px solid var(--_outline);
        }
        .lane {
          position: relative;
          min-width: 1px;
          flex: 1 1 0;
          overflow: visible;
          border-left: var(--meter-separator-thickness) solid var(--_outline);
          background: transparent;
        }
        .lane:last-child {
          border-right: var(--meter-separator-thickness) solid var(--_outline);
        }
        .secondary,
        .primary,
        .over,
        .peak {
          position: absolute;
          bottom: 0;
        }
        .secondary {
          left: 0;
          width: 100%;
          background: var(--_secondary);
        }
        .primary,
        .over {
          left: calc(50% - var(--meter-primary-width) / 2);
          width: var(--meter-primary-width);
        }
        .primary {
          background: var(--meter-primary, var(--_accent));
        }
        .over {
          background: var(--meter-over, currentColor);
        }
        .peak {
          left: 0;
          width: 100%;
          height: var(--meter-marker-thickness);
          background: currentColor;
        }
        .clip {
          position: absolute;
          left: 0;
          right: 0;
          top: -0.3125em;
          height: var(--meter-clip-thickness);
          background: transparent;
        }
        .lane[data-clipped] .clip {
          background: currentColor;
        }
        .channel-labels {
          display: flex;
          gap: var(--meter-gap);
          width: var(--meter-width);
          color: var(--_muted);
        }
        .channel-labels span {
          flex: 1 1 0;
          min-width: 1px;
          text-align: center;
        }
      </style>
      <div class="panel" part="panel">
        <span class="label" part="label"></span>
        <span class="legend" part="legend"></span>
        <span class="meter" part="meter"></span>
        <span class="channel-labels" part="channel-labels"></span>
      </div>`;
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  get min() {
    return this.numberAttribute('min', 0);
  }

  get max() {
    return this.numberAttribute('max', 1);
  }

  setState(state = {}) {
    const channels = state.channels === undefined ? this.state.channels : state.channels;
    this.state = {
      ...this.state,
      ...state,
      channels: Array.isArray(channels) ? channels.map((channel) => ({ ...channel })) : [],
    };
    this.render();
  }

  position(value) {
    return valueToNormalisedPosition(this.level(value) ?? this.min, this.scaleOptions());
  }

  render() {
    if (!this.root) return;

    const label = this.getAttribute('label') || 'Meter';
    const channels = this.state.channels;
    this.root.querySelector('.label').textContent = label;
    this.root.querySelector('.legend').textContent = [
      this.state.primaryLabel,
      this.state.secondaryLabel,
      this.state.holdLabel,
    ].filter(Boolean).join('  ·  ');

    const meter = this.root.querySelector('.meter');
    const labels = this.root.querySelector('.channel-labels');
    meter.replaceChildren();
    labels.replaceChildren();

    for (const channel of channels) {
      const primaryValue = this.level(channel.primary);
      const secondaryValue = this.level(channel.secondary);
      const peakValue = this.level(channel.peak);
      const overValue = this.level(channel.over === true ? channel.primary : channel.over);
      const zeroPosition = this.position(0);

      const lane = document.createElement('span');
      lane.className = 'lane';
      lane.setAttribute('part', 'lane');
      lane.toggleAttribute('data-clipped', Boolean(channel.clipped));

      const secondary = this.bar('secondary', secondaryValue);
      const primary = this.bar('primary', primaryValue);
      const over = this.bar('over', overValue);
      over.style.bottom = `${zeroPosition * 100}%`;
      over.style.height = overValue === null
        ? '0%'
        : `${Math.max(0, this.position(overValue) - zeroPosition) * 100}%`;

      const peak = document.createElement('span');
      peak.className = 'peak';
      peak.setAttribute('part', 'peak');
      peak.hidden = peakValue === null;
      peak.style.bottom = peakValue === null ? '0%' : `${this.position(peakValue) * 100}%`;

      const clip = document.createElement('span');
      clip.className = 'clip';
      clip.setAttribute('part', 'clip');
      lane.append(secondary, primary, over, peak, clip);
      meter.append(lane);

      const channelLabel = document.createElement('span');
      channelLabel.setAttribute('part', 'channel-label');
      channelLabel.textContent = channel.label || '';
      labels.append(channelLabel);
      this.setLaneAccessibility(lane, channel, label, channels.length > 1);
    }

    this.setHostAccessibility(label, channels);
  }

  bar(name, value) {
    const element = document.createElement('span');
    element.className = name;
    element.setAttribute('part', name);
    element.hidden = value === null;
    element.style.height = value === null ? '0%' : `${this.position(value) * 100}%`;
    return element;
  }

  setHostAccessibility(label, channels) {
    this.setAttribute('aria-label', label);
    if (channels.length === 1) {
      this.setAttribute('role', 'meter');
      this.setMeterAccessibility(this, channels[0]);
      return;
    }

    this.setAttribute('role', 'group');
    for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) {
      this.removeAttribute(name);
    }
  }

  setLaneAccessibility(lane, channel, label, isMultichannel) {
    if (!isMultichannel) return;
    lane.setAttribute('role', 'meter');
    lane.setAttribute('aria-label', [channel.label, label].filter(Boolean).join(' '));
    this.setMeterAccessibility(lane, channel);
  }

  setMeterAccessibility(element, channel) {
    const primary = this.level(channel.primary) ?? this.min;
    const descriptions = [
      this.state.primaryLabel && `${this.state.primaryLabel} ${primary}`,
      this.state.secondaryLabel && this.level(channel.secondary) !== null
        ? `${this.state.secondaryLabel} ${this.level(channel.secondary)}`
        : '',
      this.state.holdLabel && this.level(channel.peak) !== null
        ? `${this.state.holdLabel} ${this.level(channel.peak)}`
        : '',
      this.state.unit,
    ].filter(Boolean);
    element.setAttribute('aria-valuemin', String(this.min));
    element.setAttribute('aria-valuemax', String(this.max));
    element.setAttribute('aria-valuenow', String(primary));
    element.setAttribute('aria-valuetext', descriptions.join(', '));
  }

  level(value) {
    if (value === Number.NEGATIVE_INFINITY) return this.min;
    if (value === Number.POSITIVE_INFINITY) return this.max;
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  numberAttribute(name, fallback) {
    const attribute = this.getAttribute(name);
    if (attribute === null || attribute === '') return fallback;
    const value = Number(attribute);
    return Number.isFinite(value) ? value : fallback;
  }

  scaleOptions() {
    return {
      min: this.min,
      max: this.max,
      mid: this.hasAttribute('mid') ? this.numberAttribute('mid', null) : null,
      curve: this.getAttribute('curve'),
      shape: this.hasAttribute('shape') ? this.numberAttribute('shape', null) : null,
    };
  }
}

defineElement('compost-meter', CompostMeter);
