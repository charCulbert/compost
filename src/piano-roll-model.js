// Pure note-list maths for note editors, kept DOM-free so the editing rules can
// be unit-tested directly.

import { clamp } from './utils.js';

/** @typedef {{id: string, note: number, start: number, duration: number, velocity: number, channel: number}} RollNote */

// A numerical guard, not a musical grid. Hosts remain free to store and edit
// beat positions far below one audio sample before scheduling rounds to frames.
export const MIN_DURATION = 1e-9;

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

/** Snaps to whichever is nearer: an absolute grid line or the origin's grid offset. */
/** @param {number} value @param {number} origin @param {number} step @param {string} [mode] */
export function snapWithOffset(value, origin, step, mode = 'grid') {
  if (mode === 'off' || !(step > 0)) return Math.max(0, value);
  const absolute = Math.round(value / step) * step;
  const offset = origin + Math.round((value - origin) / step) * step;
  return Math.max(0, Math.abs(value - offset) <= Math.abs(value - absolute) ? offset : absolute);
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
    const start = snapWithOffset(note.start + deltaBeats, note.start, step, mode);
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
    const minimum = mode === 'off' || !(step > 0) ? MIN_DURATION : step;
    return normaliseNote({
      ...note,
      duration: Math.min(Math.max(minimum,
        snapWithOffset(note.duration + deltaBeats, note.duration, step, mode)), beats - note.start),
    }, beats);
  });
}

function swungGridBeat(value, step, swing) {
  const amount = clamp(Number(swing) || 0, -1, 1);
  const index = Math.floor(value / step);
  const candidates = [];
  for (let cell = index - 1; cell <= index + 2; cell += 1) {
    candidates.push(cell * step + (Math.abs(cell % 2) === 1 ? step * amount * 0.5 : 0));
  }
  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest);
}

/** Snaps starts to the grid, and lengths too unless lengths are left alone. */
/** @param {RollNote[]} notes @param {number} step
 * @param {{ids?: string[]|null, lengths?: boolean, beats?: number, strength?: number, swing?: number}} [options] */
export function quantizedNotes(notes, step, {
  ids = null, lengths = false, beats = Infinity, strength = 1, swing = 0,
} = {}) {
  if (!(step > 0)) return notes;
  const chosen = ids ? new Set(ids) : null;
  const amount = clamp(Number(strength) || 0, 0, 1);
  const result = notes.map((note) => {
    if (chosen && !chosen.has(note.id)) return note;
    const targetStart = swungGridBeat(note.start, step, swing);
    const start = note.start + (targetStart - note.start) * amount;
    const targetDuration = Math.max(step, Math.round(note.duration / step) * step);
    const duration = lengths ? note.duration + (targetDuration - note.duration) * amount : note.duration;
    return normaliseNote({ ...note, start, duration }, Number.isFinite(beats) ? beats : start + duration);
  });
  return resolveOverlaps(result, ids ?? result.map((note) => note.id));
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
    const start = clamp(snapWithOffset(note.start + deltaBeats, note.start, step, mode), 0, end - minimum);
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

/** Edited notes replace a covered start, or trim the tail of an earlier note.
 * Notes on another pitch or MIDI channel remain independent. */
/** @param {RollNote[]} notes @param {string[]} activeIds */
export function resolveOverlaps(notes, activeIds) {
  const active = new Set(activeIds);
  const overlaps = (note, other) => note.note === other.note
      && note.channel === other.channel
      && note.start < other.start + other.duration
      && other.start < note.start + note.duration;
  const edited = notes.filter((note) => active.has(note.id))
    .sort((a, b) => b.start - a.start);
  const winners = [];
  for (const note of edited) {
    const collisions = winners.filter((other) => overlaps(note, other));
    if (collisions.some((other) => other.start <= note.start)) continue;
    const end = collisions.length ? Math.min(...collisions.map((other) => other.start))
      : note.start + note.duration;
    if (end - note.start >= MIN_DURATION) winners.push({ ...note, duration: end - note.start });
  }
  const winnerById = new Map(winners.map((note) => [note.id, note]));
  return notes.flatMap((note) => {
    if (active.has(note.id)) return winnerById.has(note.id) ? [winnerById.get(note.id)] : [];
    const collisions = winners.filter((other) => overlaps(note, other));
    if (!collisions.length) return [note];
    if (collisions.some((other) => other.start <= note.start)) return [];
    const end = Math.min(...collisions.map((other) => other.start));
    return end - note.start >= MIN_DURATION ? [{ ...note, duration: end - note.start }] : [];
  });
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
 * a cell — and returns the copies, which a caller usually selects. A selected
 * time range that reaches past the notes stretches the spacing to match. */
/** @param {RollNote[]} notes @param {string[]} ids @param {number} step @param {number} beats
 * @param {() => string} newId @param {string} [mode]
 * @param {{start: number, end: number}|null} [range] */
export function duplicatedNotes(notes, ids, step, beats, newId, mode = 'grid', range = null) {
  const span = selectionSpan(notes, ids);
  if (!span) return [];
  const raw = Math.max(span.end - span.start, range ? range.end - range.start : 0);
  const shift = mode === 'off' || !(step > 0) ? raw : Math.max(step, Math.ceil(raw / step - 1e-9) * step);
  return notes.filter((note) => ids.includes(note.id)).map((note) => normaliseNote({
    ...note, id: newId(), start: Math.min(Math.max(0, beats - note.duration), note.start + shift),
  }, beats));
}
