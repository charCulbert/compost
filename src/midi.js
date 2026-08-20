const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NATURAL_NOTES = new Set([0, 2, 4, 5, 7, 9, 11]);

/** @param {number} note */
export function chroma(note) {
  return ((note % 12) + 12) % 12;
}

/** @param {number} note */
export function isNaturalNote(note) {
  return NATURAL_NOTES.has(chroma(note));
}

/** @param {number} note */
export function noteName(note) {
  return `${NOTE_NAMES[chroma(note)]}${Math.floor(note / 12) - 1}`;
}

/** @param {number} note @param {number} [tuning] */
export function midiNoteToFrequency(note, tuning = 440) {
  return tuning * 2 ** ((note - 69) / 12);
}

/** @param {number|number[]|Uint8Array} message */
export function isNoteOnMessage(message) {
  const [status, , velocity] = normaliseMIDIMessage(message);
  return (status & 0xf0) === 0x90 && velocity > 0;
}

/** @param {number|number[]|Uint8Array} message */
export function isNoteOffMessage(message) {
  const [status, , velocity] = normaliseMIDIMessage(message);
  return (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && velocity === 0);
}

/** @param {number|number[]|Uint8Array} message */
export function isControlChangeMessage(message) {
  const [status] = normaliseMIDIMessage(message);
  return (status & 0xf0) === 0xb0;
}

/** @param {number|number[]|Uint8Array} message */
export function channelFromMessage(message) {
  return normaliseMIDIMessage(message)[0] & 0x0f;
}

/** @param {number|number[]|Uint8Array} message */
export function noteFromMessage(message) {
  return normaliseMIDIMessage(message)[1];
}

/** @param {number|number[]|Uint8Array} message */
export function controllerFromMessage(message) {
  return normaliseMIDIMessage(message)[1];
}

/** @param {number|number[]|Uint8Array} message */
export function controllerValueFromMessage(message) {
  return normaliseMIDIMessage(message)[2];
}

/** @param {ArrayLike<number>} data */
export function packMIDIMessage(data) {
  return ((data[0] ?? 0) << 16) | ((data[1] ?? 0) << 8) | (data[2] ?? 0);
}

/** @param {number|number[]|Uint8Array} message */
export function unpackMIDIMessage(message) {
  return normaliseMIDIMessage(message);
}

/** @param {number|number[]|Uint8Array} message @returns {number[]} */
export function normaliseMIDIMessage(message) {
  if (typeof message === 'number') {
    return [(message >> 16) & 0xff, (message >> 8) & 0xff, message & 0xff];
  }

  return [message?.[0] ?? 0, message?.[1] ?? 0, message?.[2] ?? 0];
}
