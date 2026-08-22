// Pure note-list maths for compost-piano-roll, kept DOM-free so the editing
// rules can be unit-tested directly.

import { clamp } from './utils.js';

/** @typedef {{id: string, note: number, start: number, duration: number, velocity: number, channel: number}} RollNote */

export const MIN_DURATION = 1 / 64;

/** Beats per cell for a grid division, where 4 means a quarter of a beat. */
/** @param {number} division @param {number} [beatsPerBar] */
export function gridStep(division, beatsPerBar = 4) {
  const number = Number(division);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return beatsPerBar / number;
}

/** Snaps a position to the grid, or leaves it alone when snapping is off. */
/** @param {number} value @param {number} step @param {string} [mode] */
export function snapBeats(value, step, mode = 'grid') {
  if (mode === 'off' || !(step > 0)) return Math.max(0, value);
  return Math.max(0, Math.round(value / step) * step);
}

/** Rounds a value that must stay strictly positive, such as a note length. */
/** @param {number} value @param {number} step @param {string} [mode] */
export function snapDuration(value, step, mode = 'grid') {
  if (mode === 'off' || !(step > 0)) return Math.max(MIN_DURATION, value);
  return Math.max(step, Math.round(value / step) * step);
}

/** @param {any} note @param {number} beats @returns {RollNote} */
export function normaliseNote(note, beats) {
  const start = clamp(Number(note.start) || 0, 0, Math.max(0, beats - MIN_DURATION));
  const duration = clamp(Number(note.duration) || MIN_DURATION, MIN_DURATION, beats - start);
  return {
    id: String(note.id ?? ''),
    note: clamp(Math.round(Number(note.note) || 0), 0, 127),
    start,
    duration,
    velocity: clamp(Math.round(Number(note.velocity ?? 100)), 1, 127),
    channel: clamp(Math.round(Number(note.channel) || 0), 0, 15),
  };
}

/** @param {any[]} notes @param {number} beats @returns {RollNote[]} */
export function normaliseNotes(notes, beats) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => normaliseNote(note, beats)).sort(
    (a, b) => a.start - b.start || a.note - b.note,
  );
}

/** Moves notes by a pitch and time delta, keeping them inside the clip. */
/** @param {RollNote[]} notes @param {string[]} ids @param {number} deltaBeats
 * @param {number} deltaNote @param {number} beats @param {number} step @param {string} [mode] */
export function movedNotes(notes, ids, deltaBeats, deltaNote, beats, step, mode = 'grid') {
  const moving = new Set(ids);
  return notes.map((note) => {
    if (!moving.has(note.id)) return note;
    const start = snapBeats(note.start + deltaBeats, step, mode);
    return normaliseNote({
      ...note,
      note: note.note + deltaNote,
      start: Math.min(start, Math.max(0, beats - note.duration)),
    }, beats);
  });
}

/** Resizes notes from their right edge. */
/** @param {RollNote[]} notes @param {string[]} ids @param {number} deltaBeats
 * @param {number} beats @param {number} step @param {string} [mode] */
export function resizedNotes(notes, ids, deltaBeats, beats, step, mode = 'grid') {
  const sizing = new Set(ids);
  return notes.map((note) => {
    if (!sizing.has(note.id)) return note;
    return normaliseNote({
      ...note,
      duration: Math.min(snapDuration(note.duration + deltaBeats, step, mode), beats - note.start),
    }, beats);
  });
}

/** Snaps starts to the grid, and lengths too unless lengths are left alone. */
/** @param {RollNote[]} notes @param {number} step
 * @param {{ids?: string[]|null, lengths?: boolean, beats?: number}} [options] */
export function quantizedNotes(notes, step, { ids = null, lengths = false, beats = Infinity } = {}) {
  if (!(step > 0)) return notes;
  const chosen = ids ? new Set(ids) : null;
  return notes.map((note) => {
    if (chosen && !chosen.has(note.id)) return note;
    const start = Math.round(note.start / step) * step;
    const duration = lengths ? Math.max(step, Math.round(note.duration / step) * step) : note.duration;
    return normaliseNote({ ...note, start, duration }, Number.isFinite(beats) ? beats : start + duration);
  });
}

/** Notes overlapping a marquee, in beats and MIDI note numbers. */
/** @param {RollNote[]} notes
 * @param {{fromBeat: number, toBeat: number, fromNote: number, toNote: number}} box */
export function notesInBox(notes, box) {
  const startBeat = Math.min(box.fromBeat, box.toBeat);
  const endBeat = Math.max(box.fromBeat, box.toBeat);
  const lowNote = Math.min(box.fromNote, box.toNote);
  const highNote = Math.max(box.fromNote, box.toNote);
  return notes.filter((note) => note.note >= lowNote && note.note <= highNote
    && note.start < endBeat && note.start + note.duration > startBeat);
}

/** Trims notes from their left edge: the start moves, the end stays put. */
/** @param {RollNote[]} notes @param {string[]} ids @param {number} deltaBeats
 * @param {number} beats @param {number} step @param {string} [mode] */
export function trimmedNotes(notes, ids, deltaBeats, beats, step, mode = 'grid') {
  const trimming = new Set(ids);
  return notes.map((note) => {
    if (!trimming.has(note.id)) return note;
    const end = note.start + note.duration;
    const minimum = mode === 'off' || !(step > 0) ? MIN_DURATION : step;
    const start = clamp(snapBeats(note.start + deltaBeats, step, mode), 0, end - minimum);
    return normaliseNote({ ...note, start, duration: end - start }, beats);
  });
}

/** Shifts velocities, pinned to the MIDI range. */
/** @param {RollNote[]} notes @param {string[]} ids @param {number} delta */
export function velocityShiftedNotes(notes, ids, delta) {
  const changing = new Set(ids);
  return notes.map((note) => (changing.has(note.id)
    ? { ...note, velocity: clamp(Math.round(note.velocity + delta), 1, 127) }
    : note));
}

/** The first start and last end of a set of notes, or null when empty. */
/** @param {RollNote[]} notes @param {string[]|null} [ids] */
export function selectionSpan(notes, ids = null) {
  const chosen = ids ? notes.filter((note) => ids.includes(note.id)) : notes;
  if (!chosen.length) return null;
  return {
    start: Math.min(...chosen.map((note) => note.start)),
    end: Math.max(...chosen.map((note) => note.start + note.duration)),
  };
}

/** Copies notes one span later — rounded up to the grid so the copy lands on
 * a cell — and returns the copies, which a caller usually selects. */
/** @param {RollNote[]} notes @param {string[]} ids @param {number} step @param {number} beats
 * @param {() => string} newId @param {string} [mode] */
export function duplicatedNotes(notes, ids, step, beats, newId, mode = 'grid') {
  const span = selectionSpan(notes, ids);
  if (!span) return [];
  const raw = span.end - span.start;
  const shift = mode === 'off' || !(step > 0) ? raw : Math.max(step, Math.ceil(raw / step - 1e-9) * step);
  return notes.filter((note) => ids.includes(note.id)).map((note) => normaliseNote({
    ...note, id: newId(), start: Math.min(Math.max(0, beats - note.duration), note.start + shift),
  }, beats));
}
