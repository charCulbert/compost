function stringValue(value, fallback = "") {
	const result = value ?? fallback;
	return result === undefined || result === null ? "" : String(result);
}

function positiveInteger(value, fallback = 0) {
	const number = Number(value ?? fallback);
	return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function nonNegativeIntegerOrNull(value) {
	if (value === undefined || value === null) return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function uniqueStrings(values = []) {
	const seen = new Set();
	const result = [];

	for (const value of values || []) {
		const text = stringValue(value).trim();
		if (!text || seen.has(text)) continue;
		seen.add(text);
		result.push(text);
	}

	return result;
}

function uniquePositiveIntegers(values = []) {
	const seen = new Set();
	const result = [];

	for (const value of values || []) {
		const number = positiveInteger(value);
		if (!number || seen.has(number)) continue;
		seen.add(number);
		result.push(number);
	}

	return result;
}

function normaliseDevice(device) {
	if (device === null || device === undefined) return null;

	const id = stringValue(device.id);
	const name = stringValue(device.name, id || "Device");
	if (!id) return null;

	const result = { id, name };
	const channels = positiveInteger(device.channels);
	if (channels) result.channels = channels;

	return result;
}

function normaliseDevices(devices = []) {
	const seen = new Set();
	const result = [];

	for (const item of devices || []) {
		const device = normaliseDevice(item);
		if (!device || seen.has(device.id)) continue;
		seen.add(device.id);
		result.push(device);
	}

	return result;
}

export function normaliseDeviceSelectorSnapshot(snapshot = {}) {
	const source = snapshot || {};
	const audio = source.audio || {};
	const midi = source.midi || {};
	const sampleRate = positiveInteger(audio.sampleRate);
	const bufferSize = positiveInteger(audio.bufferSize);

	return {
		raw: source,
		audio: {
			api: stringValue(audio.api),
			apis: uniqueStrings(audio.apis || []),
			inputDeviceId: stringValue(audio.inputDeviceId),
			outputDeviceId: stringValue(audio.outputDeviceId),
			inputDevices: normaliseDevices(audio.inputDevices || []),
			outputDevices: normaliseDevices(audio.outputDevices || []),
			sampleRate,
			bufferSize,
			sampleRates: uniquePositiveIntegers([
				sampleRate,
				...(audio.sampleRates || []),
			]),
			bufferSizes: uniquePositiveIntegers([
				bufferSize,
				...(audio.bufferSizes || []),
			]),
			requiredInputChannels: nonNegativeIntegerOrNull(
				audio.requiredInputChannels,
			),
			requiredOutputChannels: nonNegativeIntegerOrNull(
				audio.requiredOutputChannels,
			),
		},
		midi: {
			inputDevices: normaliseDevices(midi.inputDevices || []),
			outputDevices: normaliseDevices(midi.outputDevices || []),
			inputDeviceIds: uniqueStrings(midi.inputDeviceIds || []),
			outputDeviceIds: uniqueStrings(midi.outputDeviceIds || []),
		},
	};
}

export function deviceSettingsDetailFromSnapshot(
	snapshot = {},
	overrides = {},
) {
	const normalised = normaliseDeviceSelectorSnapshot(snapshot);
	const audio = {
		...normalised.audio,
		...(overrides.audio || {}),
	};
	const midi = {
		...normalised.midi,
		...(overrides.midi || {}),
	};

	return {
		requestId: overrides.requestId ?? null,
		changed: overrides.changed || "",
		settings: {
			audio: {
				api: stringValue(audio.api),
				inputDeviceId: stringValue(audio.inputDeviceId),
				outputDeviceId: stringValue(audio.outputDeviceId),
				sampleRate: positiveInteger(audio.sampleRate),
				bufferSize: positiveInteger(audio.bufferSize),
			},
			midi: {
				inputDeviceIds: uniqueStrings(midi.inputDeviceIds || []),
				outputDeviceIds: uniqueStrings(midi.outputDeviceIds || []),
			},
		},
		snapshot: normalised,
	};
}
