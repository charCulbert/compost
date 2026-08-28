class CompostMonoSynth extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'waveShape', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'transpose', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'amplitude', defaultValue: .8, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'offset', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'outputGain', defaultValue: .5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'tempo', defaultValue: 120, minValue: 40, maxValue: 240, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.notes = [];
    this.liveNotes = new Map();
    this.loopStart = 0;
    this.loopEnd = 4;
    this.beat = 0;
    this.playing = false;
    this.voiceKey = null;
    this.voiceNote = 60;
    this.velocity = 0;
    this.level = 0;
    this.stage = 'idle';
    this.stageStep = 0;
    this.adsr = { attack: .08, decay: .2, sustain: .65, release: .35 };
    this.capture = new Float32Array(1024);
    this.outputCapture = new Float32Array(1024);
    this.captureIndex = 0;
    this.port.onmessage = ({ data }) => this.handleMessage(data);
  }

  handleMessage(data) {
    if (data?.type === 'resetPhase') this.phase = 0;
    if (data?.type === 'adsr') {
      this.adsr = {
        attack: Math.max(.001, Number(data.attack) || .001),
        decay: Math.max(.001, Number(data.decay) || .001),
        sustain: clamp(Number(data.sustain), 0, 1),
        release: Math.max(.001, Number(data.release) || .001),
      };
    }
    if (data?.type === 'sequence') {
      this.notes = Array.isArray(data.notes)
        ? data.notes.map((note) => ({ ...note, key: `sequence:${note.id}` })) : [];
      this.loopStart = Math.max(0, Number(data.loopStart) || 0);
      this.loopEnd = Math.max(this.loopStart + .001, Number(data.loopEnd) || 4);
      this.beat = wrap(this.beat, this.loopStart, this.loopEnd);
    }
    if (data?.type === 'transport') {
      this.playing = Boolean(data.playing);
      if (this.playing) this.beat = this.loopStart;
    }
    if (data?.type === 'noteOn') {
      const key = `${data.source ?? 'live'}:${data.note}`;
      this.liveNotes.delete(key);
      this.liveNotes.set(key, {
        key, note: Number(data.note), velocity: Number(data.velocity) || 100,
      });
    }
    if (data?.type === 'noteOff') this.liveNotes.delete(`${data.source ?? 'live'}:${data.note}`);
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output?.length) return true;
    const frames = output[0].length;
    const shape = Math.round(parameters.waveShape[0]);
    const transpose = parameters.transpose[0];
    const tempo = parameters.tempo[0];

    for (let frame = 0; frame < frames; frame += 1) {
      this.updateVoice();
      const envelope = this.nextEnvelopeValue();
      const frequency = 440 * 2 ** ((this.voiceNote + transpose - 69) / 12);
      const amplitude = valueAt(parameters.amplitude, frame);
      const offset = valueAt(parameters.offset, frame);
      const gain = valueAt(parameters.outputGain, frame);
      const raw = shape === 0 ? Math.sin(this.phase * Math.PI * 2)
        : shape === 2 ? (this.phase < .5 ? 1 : -1)
          : this.phase * 2 - 1;
      const scopeSample = (raw * amplitude + offset) * envelope * this.velocity;
      const outputSample = clamp(scopeSample * gain, -1, 1);
      for (const channel of output) channel[frame] = outputSample;
      this.capture[this.captureIndex] = scopeSample;
      this.outputCapture[this.captureIndex] = outputSample;
      this.captureIndex += 1;
      this.phase = (this.phase + frequency / sampleRate) % 1;
      if (this.playing) this.beat = wrap(this.beat + tempo / 60 / sampleRate,
        this.loopStart, this.loopEnd);

      if (this.captureIndex === this.capture.length) this.publishCapture();
    }
    return true;
  }

  updateVoice() {
    let target = null;
    for (const note of this.liveNotes.values()) target = note;
    if (!target && this.playing) {
      for (const note of this.notes) {
        if (note.start <= this.beat && this.beat < note.start + note.duration
          && (!target || note.start >= target.start)) {
          target = note;
        }
      }
    }
    if (target?.key === this.voiceKey) return;
    if (!target) {
      if (this.voiceKey !== null) this.releaseVoice();
      return;
    }
    this.voiceKey = target.key;
    this.voiceNote = target.note;
    this.velocity = clamp(target.velocity / 127, 0, 1);
    this.stage = 'attack';
    this.stageStep = (1 - this.level) / Math.max(1, this.adsr.attack * sampleRate);
  }

  releaseVoice() {
    this.voiceKey = null;
    this.stage = 'release';
    this.stageStep = this.level / Math.max(1, this.adsr.release * sampleRate);
  }

  nextEnvelopeValue() {
    if (this.stage === 'attack') {
      this.level += this.stageStep;
      if (this.level >= 1) {
        this.level = 1;
        this.stage = 'decay';
        this.stageStep = (1 - this.adsr.sustain) / Math.max(1, this.adsr.decay * sampleRate);
      }
    } else if (this.stage === 'decay') {
      this.level -= this.stageStep;
      if (this.level <= this.adsr.sustain) {
        this.level = this.adsr.sustain;
        this.stage = 'sustain';
      }
    } else if (this.stage === 'sustain') {
      this.level = this.adsr.sustain;
    } else if (this.stage === 'release') {
      this.level -= this.stageStep;
      if (this.level <= 0) {
        this.level = 0;
        this.velocity = 0;
        this.stage = 'idle';
      }
    }
    return this.level;
  }

  publishCapture() {
    const samples = this.capture;
    const outputSamples = this.outputCapture;
    this.capture = new Float32Array(samples.length);
    this.outputCapture = new Float32Array(outputSamples.length);
    this.captureIndex = 0;
    this.port.postMessage({ type: 'scope-samples', samples, outputSamples, beat: this.beat }, [
      samples.buffer,
      outputSamples.buffer,
    ]);
  }
}

function valueAt(parameter, frame) {
  return parameter.length === 1 ? parameter[0] : parameter[frame];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrap(value, start, end) {
  const length = end - start;
  return start + ((value - start) % length + length) % length;
}

registerProcessor('compost-mono-synth', CompostMonoSynth);
