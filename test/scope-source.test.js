import assert from 'node:assert/strict';
import test from 'node:test';

test('scope worklet publishes consecutive 1024-sample blocks', async () => {
  const previousProcessor = globalThis.AudioWorkletProcessor;
  const previousRegister = globalThis.registerProcessor;
  const previousSampleRate = globalThis.sampleRate;
  let Processor;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = {
        messages: [],
        postMessage: (message) => this.port.messages.push(message),
      };
    }
  };
  globalThis.registerProcessor = (_name, constructor) => { Processor = constructor; };
  globalThis.sampleRate = 48000;

  try {
    await import('../examples/shared/scope-source-worklet.js');
    const processor = new Processor();
    const output = new Float32Array(1024);
    processor.process([], [[output]], { frequency: [12000] });
    assert.equal(processor.port.messages.length, 1);

    const { samples } = processor.port.messages[0];
    assert.equal(samples.length, 1024);
    assert.equal(samples[0], Math.fround(0.65));
    assert.deepEqual(samples, output);
  } finally {
    globalThis.AudioWorkletProcessor = previousProcessor;
    globalThis.registerProcessor = previousRegister;
    globalThis.sampleRate = previousSampleRate;
  }
});
