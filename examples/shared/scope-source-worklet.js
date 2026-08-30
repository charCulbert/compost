class ScopeSource extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
			{
				name: "frequency",
				defaultValue: 110,
				minValue: 27.5,
				maxValue: 1760,
				automationRate: "k-rate",
			},
		];
	}

	constructor() {
		super();
		this.phase = 0;
		this.samples = new Float32Array(1024);
		this.sampleIndex = 0;
	}

	process(_inputs, outputs, parameters) {
		const [output] = outputs[0];
		const phaseStep = Math.min(0.49, parameters.frequency[0] / sampleRate);

		for (let frame = 0; frame < output.length; frame += 1) {
			output[frame] = (1 - this.phase * 2) * 0.65;
			this.samples[this.sampleIndex] = output[frame];
			this.sampleIndex += 1;
			if (this.sampleIndex === this.samples.length) {
				this.port.postMessage({ samples: this.samples });
				this.samples = new Float32Array(1024);
				this.sampleIndex = 0;
			}

			this.phase += phaseStep;
			if (this.phase >= 1) {
				this.phase -= Math.floor(this.phase);
			}
		}

		return true;
	}
}

registerProcessor("compost-scope-source", ScopeSource);
