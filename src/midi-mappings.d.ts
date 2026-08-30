/** What a parameter provider says about one mappable parameter. */
export interface MIDIParameterDefinition {
	name?: string;
	kind?: string;
	min: number;
	max: number;
	mid?: number | null;
	shape?: number | null;
	step?: number | null;
	values?: readonly number[] | null;
	curve?: string | null;
	[key: string]: unknown;
}

/** Supplies parameter definitions; unknown ids return null. */
export interface MIDIParameterProvider {
	definition(parameterID: string): MIDIParameterDefinition | null;
}

/** A mapping as the caller proposes it; missing fields fall back to the definition. */
export interface MIDIMappingInput {
	parameterID: string;
	cc: number;
	channel?: number | null;
	min?: number;
	max?: number;
	mid?: number | null;
	shape?: number | null;
	curve?: string | null;
	label?: string;
	[key: string]: unknown;
}

/** A stored, normalised mapping. `channel` is null for any channel. */
export interface MIDIMapping {
	parameterID: string;
	cc: number;
	channel: number | null;
	label: string;
	kind: string;
	min: number;
	max: number;
	mid: number | null;
	step: number | null;
	values: number[] | null;
	curve: string;
	shape: number | null;
	[key: string]: unknown;
}

/** The detail on `midi-map`, `midi-unmap` and `midi-mapping-request` events. */
export interface MIDIMappingEventDetail extends MIDIMapping {
	/** e.g. "CC 21" or "ch 1 CC 21". */
	mappingLabel: string;
}

/** The detail on `midi-parameter` events. */
export interface MIDIParameterEventDetail {
	parameterID: string;
	kind: string;
	value: number;
	midi: MIDIMappingEventDetail;
}

/**
 * MIDI CC to parameter mappings with learn support. State changes arrive as
 * CustomEvents: `midi-mapping-request`/`midi-unmapping-request` ask the host
 * to apply a change, `midi-map`/`midi-unmap` report applied state,
 * `midi-learn-begin`/`midi-learn-captured`/`midi-learn-cancel` track learn,
 * and `midi-parameter` carries a mapped incoming value.
 */
export class MIDIMappings extends EventTarget {
	constructor(options: {
		parameterProvider: MIDIParameterProvider;
		learnChannel?: boolean;
	});
	parameterProvider: MIDIParameterProvider;
	learnChannel: boolean;

	/** A copy of the stored mapping for a parameter, or null. */
	get(parameterID: string): MIDIMapping | null;
	/** Copies of every stored mapping. */
	all(): MIDIMapping[];

	isLearning(): boolean;
	/** Starts learn for a parameter; the next CC message captures a mapping. */
	beginLearn(
		parameterID: string,
		options?: { learnChannel?: boolean },
	): boolean;
	cancelLearn(): boolean;

	/** Emits `midi-mapping-request` for a normalisable mapping. */
	requestSet(mapping: MIDIMappingInput): boolean;
	/** Emits `midi-unmapping-request` for a known parameter. */
	requestClear(parameterID: string): boolean;

	/** Stores one mapping and emits `midi-map`. */
	applyMapping(mapping: MIDIMappingInput): boolean;
	/** Replaces every mapping atomically; all entries must normalise. */
	applyMappings(mappings: MIDIMappingInput[]): boolean;
	/** Removes one mapping and emits `midi-unmap`. */
	applyClear(parameterID: string): boolean;

	/** Routes a CC message (a MIDI event, detail or raw message) to learn or mappings. */
	handleMIDIMessage(event: unknown): boolean;
}

export function createMIDIMappings(options: {
	parameterProvider: MIDIParameterProvider;
	learnChannel?: boolean;
}): MIDIMappings;
