import {
  channelFromMessage,
  controllerFromMessage,
  controllerValueFromMessage,
  isControlChangeMessage,
  normaliseMIDIMessage,
} from './midi.js';
import { normalisedPositionToValue } from './parameter-scale.js';

export {
  channelFromMessage as midiChannelFromMessage,
  controllerFromMessage as midiControllerFromMessage,
  controllerValueFromMessage as midiControllerValueFromMessage,
  isControlChangeMessage,
  normaliseMIDIMessage,
};

export function readMIDIMessage(event) {
  return event.detail?.message || event.detail?.data || event.detail || event.data;
}

export function isValidMIDICC(cc) {
  return Number.isInteger(cc) && cc >= 0 && cc <= 127;
}

export function isValidMIDIChannel(channel) {
  return channel === null || (Number.isInteger(channel) && channel >= 1 && channel <= 16);
}

export function normaliseMIDIMapping(mapping = {}) {
  if (!mapping) return null;

  const {
    cc = null,
    midiCC = null,
    channel = null,
    midiChannel = null,
  } = mapping;
  const rawCC = midiCC ?? cc;
  const rawChannel = midiChannel ?? channel;

  if (rawCC === null || rawCC === undefined) return null;

  const mappedCC = Number(rawCC);
  const mappedChannel = rawChannel === null || rawChannel === undefined ? null : Number(rawChannel);

  if (!isValidMIDICC(mappedCC)) return null;
  if (!isValidMIDIChannel(mappedChannel)) return null;

  return {
    cc: mappedCC,
    midiCC: mappedCC,
    channel: mappedChannel,
    midiChannel: mappedChannel,
  };
}

export function midiMappingFromMessage(message, { learnChannel = true, channel = null } = {}) {
  if (!isControlChangeMessage(message)) return null;

  return normaliseMIDIMapping({
    cc: controllerFromMessage(message),
    channel: channel ?? (learnChannel ? channelFromMessage(message) + 1 : null),
  });
}

export function midiMappingMatchesMessage(mapping, message) {
  const normalised = normaliseMIDIMapping(mapping);
  if (!normalised || !isControlChangeMessage(message)) return false;

  const cc = controllerFromMessage(message);
  const channel = channelFromMessage(message) + 1;

  return normalised.cc === cc && (normalised.channel === null || normalised.channel === channel);
}

export function mapMIDIValueToRange(ccValue, options = {}) {
  const { min = 0, max = 1 } = options;
  const normalized = Math.min(1, Math.max(0, Number(ccValue) / 127));
  return normalisedPositionToValue(normalized, { ...options, min, max });
}

export function formatMIDIMapping(mapping) {
  const normalised = normaliseMIDIMapping(mapping);
  if (!normalised) return 'Unmapped';

  return normalised.channel === null
    ? `CC ${normalised.cc}`
    : `ch ${normalised.channel} CC ${normalised.cc}`;
}
