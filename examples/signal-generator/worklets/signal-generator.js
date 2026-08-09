class SignalGeneratorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'amplitude', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'offset', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'outputGain', defaultValue: 0.75, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'waveShape', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.currentFrequency = 220;
    this.heldNotes = [];
    this.phaseWrapPending = true;
    this.scopeCaptureSize = 1024;
    this.scopeCaptureIndex = 0;
    this.scopeSignalCapture = new Float32Array(this.scopeCaptureSize);
    this.scopeTriggerCapture = new Float32Array(this.scopeCaptureSize);
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (message.type === 'noteOn') {
      if (!this.heldNotes.includes(message.note)) this.heldNotes.push(message.note);
      return;
    }

    if (message.type === 'noteOff') {
      this.heldNotes = this.heldNotes.filter((note) => note !== message.note);
      return;
    }

    if (message.type === 'allNotesOff') {
      this.heldNotes.length = 0;
      return;
    }

  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    const left = output[0];
    if (!left) return true;

    const right = output[1] || left;
    const scopeSignal = output[2];
    const scopeTrigger = output[3];
    const shape = clamp(Math.round(parameters.waveShape[0]), 0, 2);
    const baseFrequency = parameters.frequency[0];
    const targetFrequency = clamp(this.noteFrequency(baseFrequency), 1, sampleRate * 0.45);
    const amplitude = clamp(parameters.amplitude[0], 0, 2);
    const offset = clamp(parameters.offset[0], -1, 1);
    const outputGain = clamp(parameters.outputGain[0], 0, 1) * 0.35;

    for (let frame = 0; frame < left.length; frame += 1) {
      this.currentFrequency += (targetFrequency - this.currentFrequency) * 0.0035;
      const phaseStep = clamp(this.currentFrequency / sampleRate, 0, 0.49);
      let sample = waveSample(this.phase, shape) * amplitude * 0.5 + offset;
      const trigger = this.phaseWrapPending ? 1 : 0;
      this.phaseWrapPending = false;

      this.phase += phaseStep;
      if (this.phase >= 1) {
        this.phase -= Math.floor(this.phase);
        this.phaseWrapPending = true;
      }

      const audio = clamp(sample * outputGain, -1, 1);
      left[frame] = audio;
      right[frame] = audio;
      if (scopeSignal) scopeSignal[frame] = sample;
      if (scopeTrigger) scopeTrigger[frame] = trigger;

      this.scopeSignalCapture[this.scopeCaptureIndex] = sample;
      this.scopeTriggerCapture[this.scopeCaptureIndex] = trigger;
      this.scopeCaptureIndex += 1;

      if (this.scopeCaptureIndex === this.scopeCaptureSize) {
        const signal = this.scopeSignalCapture;
        const scopeTriggerSamples = this.scopeTriggerCapture;
        this.scopeSignalCapture = new Float32Array(this.scopeCaptureSize);
        this.scopeTriggerCapture = new Float32Array(this.scopeCaptureSize);
        this.scopeCaptureIndex = 0;
        this.port.postMessage({ type: 'scope-samples', signal, trigger: scopeTriggerSamples }, [
          signal.buffer,
          scopeTriggerSamples.buffer,
        ]);
      }
    }

    return true;
  }

  noteFrequency(fallback) {
    const note = this.heldNotes.at(-1);
    return note === undefined ? fallback : 440 * (2 ** ((note - 69) / 12));
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function waveSample(phase, shape) {
  if (shape === 0) return Math.sin(phase * Math.PI * 2);
  if (shape === 2) return phase < 0.5 ? 1 : -1;
  return 1 - phase * 2;
}

registerProcessor('compost-signal-generator', SignalGeneratorProcessor);
