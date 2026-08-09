import { clamp, defineElement, numberAttr } from '../utils.js';

const styles = `
  :host {
    --scope-background: #ffffff;
    --scope-grid: rgba(17, 17, 17, 0.08);
    --scope-zero: rgba(17, 17, 17, 0.36);
    --scope-trace: #111111;
    --scope-trigger: #005fcc;
    --scope-marker: rgba(17, 17, 17, 0.24);
    --scope-label: rgba(17, 17, 17, 0.72);
    --scope-border: rgba(17, 17, 17, 0.22);
    display: block;
    height: var(--scope-height, 320px);
    min-height: 0;
    contain: layout paint;
  }

  .scope {
    position: relative;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: var(--scope-background);
  }

  .scope::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    box-sizing: border-box;
    border: 1px solid var(--scope-border);
    border-radius: inherit;
    pointer-events: none;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .wave {
    z-index: 0;
  }

  .overlay {
    z-index: 1;
  }
`;

const markup = `
  <div class="scope" part="scope">
    <canvas class="wave" part="wave-canvas" aria-hidden="true"></canvas>
    <canvas class="overlay" part="overlay-canvas" aria-hidden="true"></canvas>
  </div>
`;

export class ScopeVisualizer extends HTMLElement {
  static get observedAttributes() {
    return [
      'frequency',
      'drive',
      'gain',
      'gate',
      'channels',
      'source-channels',
      'trigger-channel',
      'fft-size',
      'smoothing-time-constant',
      'trigger',
      'trigger-level',
      'samples-shown',
      'periods-shown',
      'sample-rate',
      'value-range',
      'y-offset',
      'x-markers',
      'y-markers',
      'x-marker-labels',
      'y-marker-labels',
      'background-color',
      'grid-color',
      'zero-color',
      'trace-color',
      'trace-colors',
      'trigger-color',
      'marker-color',
      'label-color',
    ];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${styles}</style>${markup}`;
    this.scopeElement = this.root.querySelector('.scope');
    this.waveCanvas = this.root.querySelector('.wave');
    this.overlayCanvas = this.root.querySelector('.overlay');
    this.waveCtx = this.waveCanvas.getContext('2d');
    this.overlayCtx = this.overlayCanvas.getContext('2d');

    this.frequency = 220;
    this.drive = 0.35;
    this.gain = 0.75;
    this.gate = 1;
    this.channelIndexes = [0];
    this.triggerChannel = null;
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0;
    this.traceColors = [];
    this.trigger = 'up';
    this.triggerLevel = 0;
    this.samplesShown = 1024;
    this.periodsShown = null;
    this.sampleRate = 48000;
    this.valueRange = 1;
    this.yOffset = 0;
    this.xMarkers = [];
    this.yMarkers = [];
    this.xMarkerLabels = new Map();
    this.yMarkerLabels = new Map();
    this._level = 1;
    this.channelSamples = [new Float32Array(this.captureSampleCount())];
    this.samples = this.channelSamples[0];
    this.triggerSamples = null;
    this.sampleSource = 'none';
    this.audioContext = null;
    this.input = null;
    this.splitter = null;
    this.analysers = [];
    this.triggerAnalyser = null;
    this.connectedSource = null;
    this.manualTriggerHold = false;
    this._phase = 0;
    this._raf = 0;
    this._overlayDirty = true;
    this._overlayState = '';
    this.generatedAriaDescription = '';
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'img');
    }

    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Oscilloscope waveform display');
    }

    this.readAttributes();

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.scopeElement);
    this.start();
  }

  disconnectedCallback() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.disconnectAudio();
  }

  attributeChangedCallback(name) {
    if (name === 'x-marker-labels') {
      this.xMarkerLabels = this.parseMarkerLabels(this.getAttribute('x-marker-labels'));
      this._overlayDirty = true;
      return;
    }

    if (name === 'y-marker-labels') {
      this.yMarkerLabels = this.parseMarkerLabels(this.getAttribute('y-marker-labels'));
      this._overlayDirty = true;
      return;
    }

    this.readAttributes();
  }

  readAttributes() {
    const previousAudioConfig = this.audioConfigKey();
    this.frequency = numberAttr(this, 'frequency', this.frequency);
    this.drive = numberAttr(this, 'drive', this.drive);
    this.gain = numberAttr(this, 'gain', this.gain);
    this.gate = numberAttr(this, 'gate', this.gate);
    this.channelIndexes = this.readChannelIndexes();
    this.triggerChannel = this.readTriggerChannel();
    this.smoothingTimeConstant = clamp(numberAttr(this, 'smoothing-time-constant', this.smoothingTimeConstant), 0, 1);
    this.trigger = this.normaliseTrigger(this.getAttribute('trigger') || this.trigger);
    this.triggerLevel = clamp(numberAttr(this, 'trigger-level', this.triggerLevel), -1, 1);
    this.samplesShown = Math.round(clamp(numberAttr(this, 'samples-shown', this.samplesShown), 16, 8192));
    this.periodsShown = this.hasAttribute('periods-shown')
      ? clamp(numberAttr(this, 'periods-shown', this.periodsShown ?? 4), 0.25, 64)
      : null;
    this.sampleRate = clamp(numberAttr(this, 'sample-rate', this.sampleRate), 1, 768000);
    this.fftSize = this.readFFTSize();
    this.valueRange = clamp(numberAttr(this, 'value-range', this.valueRange), 0.05, 8);
    this.yOffset = clamp(numberAttr(this, 'y-offset', this.yOffset), -8, 8);
    this.xMarkers = this.parseMarkers(this.getAttribute('x-markers'));
    this.yMarkers = this.parseMarkers(this.getAttribute('y-markers'));
    this.xMarkerLabels = this.parseMarkerLabels(this.getAttribute('x-marker-labels'));
    this.yMarkerLabels = this.parseMarkerLabels(this.getAttribute('y-marker-labels'));
    this.traceColors = this.parseTraceColors(this.getAttribute('trace-colors'));
    this.ensureSampleBuffer();
    if (this.audioContext && this.audioConfigKey() !== previousAudioConfig) {
      this.configureAudioTap();
    }
    this.refreshAccessibilityDescription();
    this._overlayDirty = true;
  }

  refreshAccessibilityDescription() {
    if (typeof this.getAttribute !== 'function' || typeof this.setAttribute !== 'function') return;

    const current = this.getAttribute('aria-description');
    if (current && current !== this.generatedAriaDescription) return;

    const channels = this.channelIndexes.length;
    const windowDescription = this.periodsShown === null
      ? `${this.samplesShown}-sample window`
      : `${this.accessibleNumber(this.periodsShown)}-period window`;
    const minimum = this.accessibleNumber(this.yOffset - this.valueRange);
    const maximum = this.accessibleNumber(this.yOffset + this.valueRange);
    const triggerDescription = {
      off: 'trigger off',
      up: `rising edge trigger at ${this.accessibleNumber(this.triggerLevel)}`,
      down: `falling edge trigger at ${this.accessibleNumber(this.triggerLevel)}`,
      external: 'external trigger',
      manual: 'manual trigger',
    }[this.trigger];
    const description = `${channels} ${channels === 1 ? 'channel' : 'channels'}; ${windowDescription}; vertical range ${minimum} to ${maximum}; ${triggerDescription}.`;

    this.generatedAriaDescription = description;
    this.setAttribute('aria-description', description);
  }

  accessibleNumber(value) {
    return String(Number(Number(value).toPrecision(4)));
  }

  normaliseTrigger(trigger) {
    return ['off', 'up', 'down', 'external', 'manual'].includes(trigger) ? trigger : 'off';
  }

  readChannelIndexes() {
    const explicitChannels = this.parseIntegerList(this.getAttribute('source-channels'));
    if (explicitChannels.length > 0) return explicitChannels;

    const channelCount = Math.round(clamp(numberAttr(this, 'channels', this.channelIndexes.length || 1), 1, 8));
    return Array.from({ length: channelCount }, (_value, index) => index);
  }

  readTriggerChannel() {
    if (!this.hasAttribute('trigger-channel')) return null;

    const value = Number(this.getAttribute('trigger-channel'));
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
  }

  readFFTSize() {
    if (typeof this.getAttribute !== 'function') {
      const minimumSize = this.captureSampleCount();
      return this.normaliseFFTSize(Math.max(this.fftSize, minimumSize), minimumSize);
    }

    const hasExplicitFFTSize = this.hasAttribute?.('fft-size') ?? false;
    const minimumSize = hasExplicitFFTSize ? 32 : this.captureSampleCount();
    const requestedSize = numberAttr(this, 'fft-size', Math.max(this.fftSize, minimumSize));
    return this.normaliseFFTSize(requestedSize, minimumSize);
  }

  normaliseFFTSize(value, minimumSize = 32) {
    const requested = Number.isFinite(value) ? value : minimumSize;
    const minimum = Math.max(32, minimumSize);
    const target = Math.max(requested, minimum);
    const power = 2 ** Math.ceil(Math.log2(target));
    return Math.round(clamp(power, 32, 32768));
  }

  parseIntegerList(value) {
    if (!value) return [];

    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 0);
  }

  parseTraceColors(value) {
    if (!value) return [];
    return value.split(',').map((color) => color.trim()).filter(Boolean);
  }

  parseMarkers(value) {
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((marker) => Number(marker.trim()))
      .filter((marker) => Number.isFinite(marker));
  }

  parseMarkerLabels(value) {
    const labels = new Map();

    if (!value) {
      return labels;
    }

    for (const item of value.split(',')) {
      const trimmedItem = item.trim();
      if (!trimmedItem) {
        continue;
      }

      const separator = trimmedItem.includes(':') ? ':' : '=';
      const [rawValue, ...rawLabel] = trimmedItem.split(separator);
      const marker = Number(rawValue.trim());
      const label = rawLabel.length > 0 ? rawLabel.join(separator).trim() : rawValue.trim();

      if (Number.isFinite(marker) && label) {
        labels.set(marker, label);
      }
    }

    return labels;
  }

  markerValues(markers, labels) {
    return [...new Set([...markers, ...labels.keys()])].sort((a, b) => a - b);
  }

  color(attributeName, cssVariableName, fallback) {
    const attribute = this.getAttribute(attributeName);
    if (attribute) {
      return attribute;
    }

    return getComputedStyle(this).getPropertyValue(cssVariableName).trim() || fallback;
  }

  captureSampleCount() {
    return Math.max(32, this.visibleSampleCount() * 2);
  }

  visibleSampleCount() {
    if (this.usesExternalPeriodWindow()) {
      return this.samplesShown;
    }

    if (this.periodsShown === null || !(this.frequency > 0)) {
      return this.samplesShown;
    }

    const sampleRate = this.audioContext?.sampleRate || this.sampleRate;
    return Math.round(clamp(this.periodsShown * sampleRate / this.frequency, 16, 8192));
  }

  usesExternalPeriodWindow() {
    return this.trigger === 'external' && this.periodsShown !== null;
  }

  xAxisRange() {
    return this.periodsShown ?? this.visibleSampleCount();
  }

  ensureSampleBuffer() {
    if (this.sampleSource === 'manual' && this.channelSamples.length > 0) {
      this.samples = this.channelSamples[0];
      return;
    }

    const sampleCount = this.fftSize || this.captureSampleCount();
    const previousSamples = this.channelSamples || [];

    this.channelSamples = this.channelIndexes.map((_channelIndex, index) => {
      const existing = previousSamples[index];
      return existing instanceof Float32Array && existing.length === sampleCount
        ? existing
        : new Float32Array(sampleCount);
    });

    if (this.channelSamples.length === 0) {
      this.channelSamples = [new Float32Array(sampleCount)];
    }

    this.samples = this.channelSamples[0];

    if (this.triggerChannel !== null || this.trigger === 'external') {
      if (!(this.triggerSamples instanceof Float32Array) || this.triggerSamples.length !== sampleCount) {
        this.triggerSamples = new Float32Array(sampleCount);
      }
    } else {
      this.triggerSamples = null;
    }
  }

  connectAudio(contextOrSource, options = {}) {
    let context = contextOrSource;
    let source = options.source || null;

    if (contextOrSource?.connect && contextOrSource?.context && !contextOrSource.createGain) {
      source = contextOrSource;
      context = contextOrSource.context;
    }

    if (!context) {
      throw new Error('compost-scope.connectAudio requires an AudioContext or AudioNode');
    }

    this.disconnectConnectedSource();
    this.sampleSource = 'audio';
    this.applyAudioOptions(options);
    this.audioContext = context;
    this.fftSize = this.readFFTSize();
    this.configureAudioTap();

    if (source) {
      source.connect(this.input);
      this.connectedSource = source;
    }

    return this.input;
  }

  setSamples(samples, { triggerSamples = null, copy = false } = {}) {
    const channels = this.normaliseManualChannels(samples, copy);
    const sampleCount = channels[0].length;

    if (channels.some((channel) => channel.length !== sampleCount)) {
      throw new RangeError('compost-scope.setSamples requires every channel to have the same length');
    }

    const trigger = triggerSamples === null
      ? null
      : this.normaliseManualSampleArray(triggerSamples, copy, 'triggerSamples');

    if (trigger && trigger.length !== sampleCount) {
      throw new RangeError('compost-scope.setSamples requires triggerSamples to match the channel length');
    }

    if (this.sampleSource === 'audio') {
      this.disconnectAudio();
    }
    this.sampleSource = 'manual';
    this.channelIndexes = channels.map((_channel, index) => index);
    this.channelSamples = channels;
    this.samples = channels[0];
    this.triggerSamples = trigger;
    this.manualTriggerHold = false;
    this.refreshAccessibilityDescription();

    return this;
  }

  normaliseManualChannels(samples, copy) {
    if (this.isTypedSampleArray(samples)) {
      return [this.normaliseManualSampleArray(samples, copy, 'samples')];
    }

    if (!Array.isArray(samples) || samples.length === 0) {
      throw new TypeError('compost-scope.setSamples requires a sample array or an array of channels');
    }

    if (typeof samples[0] === 'number') {
      return [this.normaliseManualSampleArray(samples, copy, 'samples')];
    }

    return samples.map((channel) => this.normaliseManualSampleArray(channel, copy, 'channel'));
  }

  normaliseManualSampleArray(samples, copy, name) {
    if (this.isTypedSampleArray(samples)) {
      if (samples.length === 0) {
        throw new RangeError(`compost-scope.setSamples requires ${name} to contain samples`);
      }

      return copy ? samples.slice() : samples;
    }

    if (Array.isArray(samples) && samples.length > 0 && samples.every((sample) => typeof sample === 'number')) {
      return copy ? samples.slice() : samples;
    }

    throw new TypeError(`compost-scope.setSamples requires ${name} to be a numeric array or typed array`);
  }

  isTypedSampleArray(samples) {
    return ArrayBuffer.isView(samples)
      && !(samples instanceof DataView)
      && (samples.length === 0 || typeof samples[0] === 'number');
  }

  applyAudioOptions(options = {}) {
    if (options.channels !== undefined) {
      if (Array.isArray(options.channels)) {
        this.setAttribute('source-channels', options.channels.join(','));
      } else {
        this.removeAttribute('source-channels');
        this.setAttribute('channels', String(options.channels));
      }
    }

    if (options.sourceChannels !== undefined) {
      this.setAttribute('source-channels', Array.from(options.sourceChannels).join(','));
    }

    if (options.triggerChannel !== undefined) {
      if (options.triggerChannel === null) {
        this.removeAttribute('trigger-channel');
      } else {
        this.setAttribute('trigger-channel', String(options.triggerChannel));
      }
    }

    if (options.fftSize !== undefined) {
      this.setAttribute('fft-size', String(options.fftSize));
    }

    if (options.smoothingTimeConstant !== undefined) {
      this.setAttribute('smoothing-time-constant', String(options.smoothingTimeConstant));
    }

    this.readAttributes();
  }

  configureAudioTap() {
    if (!this.audioContext) return null;

    const context = this.audioContext;
    const inputChannelCount = this.inputChannelCount();
    this.ensureSampleBuffer();

    if (!this.input || this.input.context !== context) {
      this.input = new GainNode(context, { gain: 1 });
    }

    this.splitter?.disconnect();
    for (const analyser of this.analysers) analyser.disconnect();
    this.triggerAnalyser?.disconnect();

    this.input.channelCount = inputChannelCount;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'discrete';
    this.input.disconnect();

    this.splitter = new ChannelSplitterNode(context, { numberOfOutputs: inputChannelCount });
    this.input.connect(this.splitter);

    this.analysers = this.channelIndexes.map((channelIndex) => {
      const analyser = new AnalyserNode(context, {
        fftSize: this.fftSize,
        smoothingTimeConstant: this.smoothingTimeConstant,
      });
      this.splitter.connect(analyser, channelIndex);
      return analyser;
    });

    this.triggerAnalyser = null;
    if (this.triggerChannel !== null) {
      this.triggerAnalyser = new AnalyserNode(context, {
        fftSize: this.fftSize,
        smoothingTimeConstant: this.smoothingTimeConstant,
      });
      this.splitter.connect(this.triggerAnalyser, this.triggerChannel);
    }

    return this.input;
  }

  inputChannelCount() {
    const maxChannel = Math.max(...this.channelIndexes, this.triggerChannel ?? 0);
    return Math.max(1, maxChannel + 1);
  }

  disconnectAudio() {
    this.disconnectConnectedSource();
    this.input?.disconnect();
    this.splitter?.disconnect();
    for (const analyser of this.analysers) analyser.disconnect();
    this.triggerAnalyser?.disconnect();
    this.input = null;
    this.splitter = null;
    this.analysers = [];
    this.triggerAnalyser = null;
    this.audioContext = null;
    if (this.sampleSource === 'audio') {
      this.sampleSource = 'none';
    }
  }

  disconnectConnectedSource() {
    if (this.connectedSource && this.input) {
      try {
        this.connectedSource.disconnect(this.input);
      } catch (_error) {
        // The source may already have been disconnected by the app.
      }
    }

    this.connectedSource = null;
  }

  audioConfigKey() {
    return [
      this.channelIndexes.join(','),
      this.triggerChannel ?? '',
      this.fftSize,
      this.smoothingTimeConstant,
    ].join('|');
  }

  updateAnalyserSamples({ force = false } = {}) {
    if (this.trigger !== 'manual') {
      this.manualTriggerHold = false;
    }

    if (this.manualTriggerHold && this.trigger === 'manual' && !force) {
      return true;
    }

    if (!this.analysers.length) {
      return false;
    }

    this.ensureSampleBuffer();
    for (let index = 0; index < this.analysers.length; index += 1) {
      this.analysers[index].getFloatTimeDomainData(this.channelSamples[index]);
    }

    if (this.triggerAnalyser && this.triggerSamples) {
      this.triggerAnalyser.getFloatTimeDomainData(this.triggerSamples);
    }

    return true;
  }

  captureTrigger() {
    if (this.trigger !== 'manual') return false;

    this.updateAnalyserSamples({ force: true });
    this.ensureSampleBuffer();

    const sampleCount = this.samples.length || this.captureSampleCount();
    this.triggerSamples = new Float32Array(sampleCount);
    const pulseIndex = Math.max(1, Math.min(sampleCount - 2, this.visibleSampleCount()));
    this.triggerSamples[pulseIndex - 1] = 0;
    this.triggerSamples[pulseIndex] = 1;
    this.triggerSamples[pulseIndex + 1] = 0;
    this.manualTriggerHold = true;
    this.draw();
    return true;
  }

  start() {
    if (this._raf) {
      return;
    }

    const tick = (time) => {
      if (this.sampleSource === 'manual') {
        // Manual sample windows are swapped by setSamples and drawn at display refresh rate.
      } else if (this.hasAttribute('demo')
          && !(this.trigger === 'manual' && this.manualTriggerHold)) {
        this.generateDemoSamples(time);
      } else {
        this.updateAnalyserSamples();
      }

      if (this.draw()) {
        this.dispatchEvent(new CustomEvent('scope-frame', {
          detail: { time },
          bubbles: true,
          composed: true,
        }));
      }
      this._raf = requestAnimationFrame(tick);
    };

    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  resizeCanvas() {
    const rect = this.scopeElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    let resized = false;

    for (const canvas of [this.waveCanvas, this.overlayCanvas]) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        resized = true;
      }
    }

    if (resized) {
      this._overlayDirty = true;
    }

    return resized;
  }

  generateDemoSamples() {
    this.ensureSampleBuffer();

    const sampleRate = 48000;
    const phaseStep = this.frequency / sampleRate;
    this._level += (this.gate - this._level) * 0.08;

    for (let channel = 0; channel < this.channelSamples.length; channel += 1) {
      const samples = this.channelSamples[channel];
      const phaseOffset = channel * 0.13;

      for (let index = 0; index < samples.length; index += 1) {
        const phase = this._phase + phaseOffset + phaseStep * index;
        const wrappedPhase = phase - Math.floor(phase);
        const fundamental = Math.sin(phase * Math.PI * 2);
        const overtone = Math.sin(phase * Math.PI * 6) * this.drive;
        samples[index] =
          Math.tanh((fundamental + overtone) * (1 + this.drive * 4)) *
          this.gain *
          this._level;

        if (channel === 0 && this.triggerSamples) {
          this.triggerSamples[index] = wrappedPhase < Math.max(phaseStep * 2, 0.01) ? 1 : 0;
        }
      }
    }

    this.samples = this.channelSamples[0];
    this._phase = (this._phase + phaseStep * this.samples.length) % 1;
  }

  draw() {
    this.resizeCanvas();

    const { waveCanvas } = this;
    const width = waveCanvas.width;
    const height = waveCanvas.height;
    const midY = height * 0.5;
    const overlayState = this.overlayState(width, height);

    if (this._overlayDirty || this._overlayState !== overlayState) {
      this.drawOverlay(width, height, midY);
      this._overlayDirty = false;
      this._overlayState = overlayState;
    }

    return this.drawWave(width, height, midY);
  }

  overlayState(width, height) {
    return [
      width,
      height,
      this.trigger,
      this.triggerLevel,
      this.visibleSampleCount(),
      this.xAxisRange(),
      this.valueRange,
      this.yOffset,
      this.xMarkers.join(','),
      this.yMarkers.join(','),
      [...this.xMarkerLabels].flat().join(','),
      [...this.yMarkerLabels].flat().join(','),
      this.color('background-color', '--scope-background', '#ffffff'),
      this.color('grid-color', '--scope-grid', 'rgba(17, 17, 17, 0.08)'),
      this.color('zero-color', '--scope-zero', 'rgba(17, 17, 17, 0.36)'),
      this.color('trigger-color', '--scope-trigger', '#005fcc'),
      this.color('marker-color', '--scope-marker', 'rgba(17, 17, 17, 0.24)'),
      this.color('label-color', '--scope-label', 'rgba(17, 17, 17, 0.72)'),
    ].join('|');
  }

  drawOverlay(width, height, midY) {
    const { overlayCtx: ctx } = this;

    this.scopeElement.style.background = this.color('background-color', '--scope-background', '#ffffff');
    ctx.clearRect(0, 0, width, height);
    this.drawGrid(width, height, midY);
    this.drawMarkers(width, height, midY);
    this.drawMarkerLabels(width, height, midY);
  }

  valueToY(value, height, midY) {
    return midY - (value - this.yOffset) / this.valueRange * height * 0.46;
  }

  drawGrid(width, height, midY) {
    const ctx = this.overlayCtx;

    ctx.strokeStyle = this.color('grid-color', '--scope-grid', 'rgba(17, 17, 17, 0.08)');
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= width; x += width / 8) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += height / 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }

    ctx.stroke();

    ctx.strokeStyle = this.color('zero-color', '--scope-zero', 'rgba(17, 17, 17, 0.36)');
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    if (!['off', 'external', 'manual'].includes(this.trigger)) {
      const y = this.valueToY(this.triggerLevel, height, midY);
      ctx.strokeStyle = this.color('trigger-color', '--scope-trigger', '#005fcc');
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawMarkers(width, height, midY) {
    const ctx = this.overlayCtx;
    const xMarkerValues = this.markerValues(this.xMarkers, this.xMarkerLabels);
    const yMarkerValues = this.markerValues(this.yMarkers, this.yMarkerLabels);
    const xAxisRange = this.xAxisRange();

    if (xMarkerValues.length === 0 && yMarkerValues.length === 0) {
      return;
    }

    ctx.strokeStyle = this.color('marker-color', '--scope-marker', 'rgba(17, 17, 17, 0.24)');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();

    for (const sampleOffset of xMarkerValues) {
      if (sampleOffset < 0 || sampleOffset > xAxisRange) {
        continue;
      }

      const x = sampleOffset / xAxisRange * width;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }

    for (const value of yMarkerValues) {
      const y = this.valueToY(value, height, midY);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawMarkerLabels(width, height, midY) {
    const ctx = this.overlayCtx;

    if (this.xMarkerLabels.size === 0 && this.yMarkerLabels.size === 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const xAxisRange = this.xAxisRange();
    ctx.fillStyle = this.color('label-color', '--scope-label', 'rgba(17, 17, 17, 0.72)');
    ctx.font = `${12 * ratio}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';

    for (const [sampleOffset, label] of this.xMarkerLabels) {
      if (sampleOffset < 0 || sampleOffset > xAxisRange) {
        continue;
      }

      const x = sampleOffset / xAxisRange * width;
      ctx.fillText(label, x + 5 * ratio, 8 * ratio);
    }

    ctx.textBaseline = 'bottom';

    for (const [value, label] of this.yMarkerLabels) {
      const y = this.valueToY(value, height, midY);
      if (y < 0 || y > height) {
        continue;
      }

      const textY = clamp(y - 5 * ratio, 16 * ratio, height - 6 * ratio);
      ctx.fillText(label, 8 * ratio, textY);
    }
  }

  drawWave(width, height, midY) {
    const ctx = this.waveCtx;
    const channels = this.channelSamples.length ? this.channelSamples : [this.samples];
    const periodWindow = this.getExternalPeriodWindow();

    if (this.usesExternalPeriodWindow() && !periodWindow) {
      return false;
    }

    const window = periodWindow || this.displayWindow();

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = Math.max(2, window.devicePixelRatio || 1);

    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const samples = channels[channelIndex];
      const startIndex = Math.min(window.startIndex, Math.max(0, samples.length - 1));
      const endIndex = Math.min(window.endIndex, samples.length);
      const count = Math.max(2, endIndex - startIndex);
      const xStep = width / (count - 1);

      ctx.strokeStyle = this.traceColor(channelIndex);
      ctx.beginPath();

      for (let index = startIndex; index < endIndex; index += 1) {
        const x = (index - startIndex) * xStep;
        const y = this.valueToY(samples[index], height, midY);

        if (index === startIndex) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    return true;
  }

  traceColor(index) {
    if (this.traceColors[index]) return this.traceColors[index];

    const fallbackColors = ['#111111', '#005fcc', '#b00020', '#007a3d'];
    const variableName = index === 0 ? '--scope-trace' : `--scope-trace-${index + 1}`;
    return getComputedStyle(this).getPropertyValue(variableName).trim() || fallbackColors[index % fallbackColors.length];
  }

  getTriggeredStartIndex() {
    const periodWindow = this.getExternalPeriodWindow();
    if (periodWindow) return periodWindow.startIndex;

    const samplesShown = this.visibleSampleCount();
    const maxStartIndex = Math.max(0, this.samples.length - samplesShown);

    if (this.trigger === 'off') {
      return maxStartIndex;
    }

    if (this.trigger === 'external') {
      return this.getExternalTriggerStartIndex();
    }

    if (this.trigger === 'manual') {
      return this.manualTriggerHold ? this.getExternalTriggerStartIndex() : maxStartIndex;
    }

    const { samples, triggerLevel } = this;
    const maxTriggeredStartIndex = Math.max(1, maxStartIndex);

    for (let index = maxTriggeredStartIndex; index >= 1; index -= 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const crossedUp = previous < triggerLevel && current >= triggerLevel;
      const crossedDown = previous > triggerLevel && current <= triggerLevel;

      if ((this.trigger === 'up' && crossedUp) || (this.trigger === 'down' && crossedDown)) {
        return Math.max(0, index - 1);
      }
    }

    return 0;
  }

  getExternalTriggerStartIndex() {
    if (!this.triggerSamples) {
      return 0;
    }

    const maxStartIndex = Math.max(1, Math.min(
      this.samples.length,
      this.triggerSamples.length,
    ) - this.visibleSampleCount());

    for (let index = maxStartIndex; index >= 1; index -= 1) {
      if (this.triggerSamples[index - 1] < 0.5 && this.triggerSamples[index] >= 0.5) {
        return index;
      }
    }

    return 0;
  }

  getExternalPeriodWindow() {
    if (!this.usesExternalPeriodWindow() || !this.triggerSamples) return null;

    const sampleCount = Math.min(this.samples.length, this.triggerSamples.length);
    const periods = Math.max(1, Math.round(this.periodsShown));
    const edges = [];

    for (let index = 1; index < sampleCount; index += 1) {
      if (this.triggerSamples[index - 1] < 0.5 && this.triggerSamples[index] >= 0.5) {
        edges.push(index);
      }
    }

    if (edges.length <= periods) return null;

    return {
      startIndex: edges.at(-(periods + 1)),
      endIndex: Math.min(sampleCount, edges.at(-1) + 1),
    };
  }

  displayWindow() {
    const periodWindow = this.getExternalPeriodWindow();
    if (this.usesExternalPeriodWindow()) return periodWindow;

    if (periodWindow) return periodWindow;

    const startIndex = this.getTriggeredStartIndex();
    return {
      startIndex,
      endIndex: Math.min(this.samples.length, startIndex + this.visibleSampleCount()),
    };
  }
}

defineElement('compost-scope', ScopeVisualizer);
