class CompostSignalGenerator extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'waveShape', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'frequency', defaultValue: 220, minValue: 1, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'amplitude', defaultValue: .8, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'offset', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'outputGain', defaultValue: .5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'mute', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.gate = 1;
    this.capture = new Float32Array(1024);
    this.captureIndex = 0;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'noteOn') this.gate = 1;
      if (data?.type === 'noteOff') this.gate = 0;
    };
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output?.length) return true;
    const frames = output[0].length;
    const shape = Math.round(parameters.waveShape[0]);

    for (let frame = 0; frame < frames; frame += 1) {
      const frequency = valueAt(parameters.frequency, frame);
      const amplitude = valueAt(parameters.amplitude, frame);
      const offset = valueAt(parameters.offset, frame);
      const gain = valueAt(parameters.outputGain, frame);
      const mute = parameters.mute[0];
      const raw = shape === 0 ? Math.sin(this.phase * Math.PI * 2)
        : shape === 2 ? (this.phase < .5 ? 1 : -1)
          : this.phase * 2 - 1;
      const sample = (raw * amplitude + offset) * gain * this.gate * (1 - mute);
      for (const channel of output) channel[frame] = sample;
      this.capture[this.captureIndex++] = sample;
      this.phase = (this.phase + frequency / sampleRate) % 1;

      if (this.captureIndex === this.capture.length) {
        const samples = this.capture;
        this.capture = new Float32Array(samples.length);
        this.captureIndex = 0;
        this.port.postMessage({ type: 'scope-samples', samples }, [samples.buffer]);
      }
    }
    return true;
  }
}

function valueAt(parameter, frame) {
  return parameter.length === 1 ? parameter[0] : parameter[frame];
}

registerProcessor('compost-signal-generator', CompostSignalGenerator);
