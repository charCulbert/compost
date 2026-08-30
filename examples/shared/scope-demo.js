export function setupScopeDemo(container, scopes) {
	container.innerHTML = `
    <div style="display: flex; align-items: end; gap: 1em; flex-wrap: wrap">
      <button type="button" data-run>Run oscillator</button>
      <label>Frequency
        <input data-frequency type="range" min="27.5" max="1760" step="0.5" value="110">
        <span data-frequency-value>110 Hz</span>
      </label>
      <label>Vertical range
        <select data-range>
          <option value="0.5">±0.5</option>
          <option value="1" selected>±1</option>
          <option value="2">±2</option>
          <option value="4">±4</option>
        </select>
      </label>
      <label>Offset
        <input data-offset type="range" min="-1" max="1" step="0.1" value="0">
        <span data-offset-value>0</span>
      </label>
      <label>X labels
        <input data-x-labels value="0:start,0.5:middle,1:end">
      </label>
      <label>Y labels
        <input data-y-labels value="-0.5:low,0:center,0.5:high">
      </label>
    </div>`;

	const runButton = container.querySelector("[data-run]");
	const frequencyInput = container.querySelector("[data-frequency]");
	const frequencyValue = container.querySelector("[data-frequency-value]");
	const rangeSelect = container.querySelector("[data-range]");
	const offsetInput = container.querySelector("[data-offset]");
	const offsetValue = container.querySelector("[data-offset-value]");
	const xLabelsInput = container.querySelector("[data-x-labels]");
	const yLabelsInput = container.querySelector("[data-y-labels]");
	let context;
	let source;

	runButton.addEventListener("click", async () => {
		if (!context) {
			context = new AudioContext();
			await context.audioWorklet.addModule("../shared/scope-source-worklet.js");
			source = new AudioWorkletNode(context, "compost-scope-source", {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [1],
				parameterData: { frequency: Number(frequencyInput.value) },
			});
			source.port.onmessage = ({ data }) => {
				for (const scope of scopes) scope.setSamples(data.samples);
			};
			source
				.connect(new GainNode(context, { gain: 0 }))
				.connect(context.destination);
			await context.resume();
			runButton.textContent = "Stop oscillator";
			return;
		}

		if (context.state === "running") {
			await context.suspend();
			runButton.textContent = "Run oscillator";
		} else {
			await context.resume();
			runButton.textContent = "Stop oscillator";
		}
	});

	frequencyInput.addEventListener("input", () => {
		const frequency = Number(frequencyInput.value);
		frequencyValue.textContent = `${frequency} Hz`;
		source?.parameters
			.get("frequency")
			.setValueAtTime(frequency, context.currentTime);
	});

	rangeSelect.addEventListener("change", () => {
		for (const scope of scopes)
			scope.setAttribute("value-range", rangeSelect.value);
	});

	offsetInput.addEventListener("input", () => {
		offsetValue.textContent = offsetInput.value;
		for (const scope of scopes)
			scope.setAttribute("y-offset", offsetInput.value);
	});

	xLabelsInput.addEventListener("input", () => {
		for (const scope of scopes)
			scope.setAttribute("x-marker-labels", xLabelsInput.value);
	});

	yLabelsInput.addEventListener("input", () => {
		for (const scope of scopes)
			scope.setAttribute("y-marker-labels", yLabelsInput.value);
	});
}
