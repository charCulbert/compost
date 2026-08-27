/**
 * The time grid the editors share: one snapping rule for notes, clips, markers
 * and points, described in the README under Events. A value snaps to whichever
 * is nearest of an absolute grid line, its own original offset from the grid
 * (so a groove survives a move) and any anchors the caller passes (the edges
 * of neighbouring clips, locators, loop bounds).
 */

/** A numerical guard, not a tick or musical resolution. */
export const MIN_TIME = 1e-9;

/** A grid step in beats: a bar divided into `division` cells. */
/** @param {number} beatsPerBar @param {number} division */
export function gridStepOf(beatsPerBar, division) {
  const bar = Math.max(1, Number(beatsPerBar) || 4);
  return Math.max(MIN_TIME, bar / Math.max(1, Number(division) || 4));
}

/** The snap mode a gesture uses: the modifier inverts whatever the host set. */
/** @param {'grid'|'off'} mode @param {boolean} modifierHeld */
export function snapModeWith(mode, modifierHeld) {
  const on = mode !== 'off';
  return (modifierHeld ? !on : on) ? 'grid' : 'off';
}

/**
 * Snap a time. `origin` is where the moved thing started, so its offset from the
 * grid is a candidate too; `anchors` are absolute times that also attract,
 * within `reach` of the value. Anything below zero clamps to zero.
 * @param {number} value
 * @param {{step?: number, origin?: number, mode?: 'grid'|'off', anchors?: number[], reach?: number}} [options]
 */
export function snapTime(value, {
  step = 0, origin = null, mode = 'grid', anchors = [], reach = Number.POSITIVE_INFINITY,
} = {}) {
  const raw = Math.max(0, Number(value) || 0);
  if (mode === 'off') return raw;
  // anchors come first so a tie with the grid goes to the neighbour's edge
  const candidates = [];
  for (const anchor of anchors) {
    const time = Number(anchor);
    if (Number.isFinite(time) && Math.abs(time - raw) <= reach) candidates.push(time);
  }
  if (step > 0) {
    const base = Number(origin);
    if (origin !== null && Number.isFinite(base)) candidates.push(base + Math.round((raw - base) / step) * step);
    candidates.push(Math.round(raw / step) * step);
  }
  if (!candidates.length) return raw;
  const nearest = candidates.reduce((best, candidate) =>
    Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best);
  return Math.max(0, nearest);
}
