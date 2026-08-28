import type { MIDIMessageLike } from './midi.js';
import type { MIDIMapping, MIDIMappingInput } from './midi-mappings.js';

export type { MIDIMapping, MIDIMappingInput } from './midi-mappings.js';

export interface NormalisedMIDIMapping {
  cc: number;
  midiCC: number;
  channel: number | null;
  midiChannel: number | null;
}

export { channelFromMessage as midiChannelFromMessage, controllerFromMessage as midiControllerFromMessage, controllerValueFromMessage as midiControllerValueFromMessage, isControlChangeMessage, normaliseMIDIMessage } from './midi.js';

export function readMIDIMessage(event: unknown): unknown;
export function isValidMIDICC(cc: unknown): boolean;
export function isValidMIDIChannel(channel: unknown): boolean;
export function normaliseMIDIMapping(mapping?: Partial<MIDIMappingInput> & {midiCC?: number, midiChannel?: number | null}): NormalisedMIDIMapping | null;
export function midiMappingFromMessage(
  message: unknown,
  options?: {learnChannel?: boolean, channel?: number | null},
): NormalisedMIDIMapping | null;
export function midiMappingMatchesMessage(mapping: Partial<MIDIMappingInput>, message: MIDIMessageLike): boolean;
export function mapMIDIValueToRange(ccValue: number, options?: Partial<MIDIMapping>): number;
export function formatMIDIMapping(mapping: MIDIMappingInput): string;
