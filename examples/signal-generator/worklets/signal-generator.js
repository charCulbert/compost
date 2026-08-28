import { envelopeCurvePosition } from '../../../src/envelope-model.js';

class CompostMonoSynth extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'waveShape', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'transpose', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'amplitude', defaultValue: .8, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'offset', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'outputGain', defaultValue: .5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'tempo', defaultValue: 120, minValue: 40, maxValue: 240, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: .08, minValue: .001, maxValue: 10, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: .2, minValue: .001, maxValue: 10, automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: .65, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: .35, minValue: .001, maxValue: 10, automationRate: 'k-rate' },
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
    this.voiceAge = 0;
    this.velocity = 0;
    this.level = 0;
    this.stage = 'idle';
    this.stageStep = 0;
    this.pitchEnvelope = [{ time: 0, value: 0 }, { time: 1, value: 0 }];
    this.capture = new Float32Array(1024);
    this.outputCapture = new Float32Array(1024);
    this.captureIndex = 0;
    this.port.onmessage = ({ data }) => this.handleMessage(data);
  }

  handleMessage(data) {
    if (data?.type === 'resetPhase') this.phase = 0;
    if (data?.type === 'pitchEnvelope' && Array.isArray(data.points)) {
      this.pitchEnvelope = data.points
        .filter((point) => Number.isFinite(Number(point.time)) && Number.isFinite(Number(point.value)))
        .map((point) => ({
          time: Math.max(0, Number(point.time)),
          value: clamp(Number(point.value), -12, 12),
          curve: clamp(Number(point.curve) || 0, -1, 1),
        }))
        .sort((a, b) => a.time - b.time);
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
    const attack = parameters.attack[0];
    const decay = parameters.decay[0];
    const sustain = parameters.sustain[0];
    const release = parameters.release[0];

    for (let frame = 0; frame < frames; frame += 1) {
      this.updateVoice(attack, release);
      const envelope = this.nextEnvelopeValue(decay, sustain);
      const pitch = this.voiceNote + transpose + pitchEnvelopeValue(this.pitchEnvelope, this.voiceAge);
      const frequency = 440 * 2 ** ((pitch - 69) / 12);
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
      this.voiceAge += 1 / sampleRate;
      if (this.playing) this.beat = wrap(this.beat + tempo / 60 / sampleRate,
        this.loopStart, this.loopEnd);

      if (this.captureIndex === this.capture.length) this.publishCapture();
    }
    return true;
  }

  updateVoice(attack, release) {
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
      if (this.voiceKey !== null) this.releaseVoice(release);
      return;
    }
    this.voiceKey = target.key;
    this.voiceNote = target.note;
    this.voiceAge = 0;
    this.velocity = clamp(target.velocity / 127, 0, 1);
    this.stage = 'attack';
    this.stageStep = (1 - this.level) / Math.max(1, attack * sampleRate);
  }

  releaseVoice(release) {
    this.voiceKey = null;
    this.stage = 'release';
    this.stageStep = this.level / Math.max(1, release * sampleRate);
  }

  nextEnvelopeValue(decay, sustain) {
    if (this.stage === 'attack') {
      this.level += this.stageStep;
      if (this.level >= 1) {
        this.level = 1;
        this.stage = 'decay';
        this.stageStep = (1 - sustain) / Math.max(1, decay * sampleRate);
      }
    } else if (this.stage === 'decay') {
      this.level -= this.stageStep;
      if (this.level <= sustain) {
        this.level = sustain;
        this.stage = 'sustain';
      }
    } else if (this.stage === 'sustain') {
      this.level = sustain;
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

function pitchEnvelopeValue(points, time) {
  if (!points.length) return 0;
  if (time <= points[0].time) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    const previous = points[index - 1];
    if (time > next.time) continue;
    const span = next.time - previous.time;
    if (!(span > 0)) return previous.value;
    const position = envelopeCurvePosition((time - previous.time) / span, previous.curve);
    return previous.value + (next.value - previous.value) * position;
  }
  return points.at(-1).value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrap(value, start, end) {
  const length = end - start;
  return start + ((value - start) % length + length) % length;
}

registerProcessor('compost-mono-synth', CompostMonoSynth);
