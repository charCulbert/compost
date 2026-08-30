import "../../src/components/compost-knob.js";
import "../../src/components/compost-slider.js";
import { createParameterController } from "../../src/parameter-controller.js";

const parameters = createParameterController({
	root: document,
	definitions: [
		{
			parameterID: "frequency",
			kind: "continuous",
			name: "Frequency",
			min: 20,
			max: 20000,
			defaultValue: 440,
			step: 0,
			unit: "Hz",
		},
	],
});
const state = new Map([["frequency", 440]]);

function setBackendValue(parameterID, value) {
	state.set(parameterID, value);
	parameters.applyValue(parameterID, value, { source: "fake-backend" });
}

parameters.addEventListener("parameter-edit", (event) =>
	setBackendValue(event.detail.parameterID, event.detail.value),
);
document
	.querySelector("#set-880")
	.addEventListener("click", () => setBackendValue("frequency", 880));
