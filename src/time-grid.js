/**
 * The time grid the editors share: one snapping rule for notes, clips, markers
 * and points, described in the README under Events. A value snaps to whichever
 * is nearest of an absolute grid line, its own original offset from the grid
 * (so a groove survives a move) and any anchors the caller passes (the edges
 * of neighbouring clips, locators, loop bounds).
 */

/** A numerical guard, not a tick or musical resolution. */
export const MIN_TIME = 1e-9;

const TIME_SIGNATURE_DENOMINATORS = new Set([1, 2, 4, 8, 16]);

/**
 * Parse a time signature while keeping model time in quarter-note beats.
 * Unparseable or missing values fall back to 4/4.
 */
export function timeSignatureOf(value) {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value ?? '');
  const numerator = Number(match?.[1]);
  const denominator = Number(match?.[2]);
  if (Number.isInteger(numerator) && numerator > 0 && TIME_SIGNATURE_DENOMINATORS.has(denominator)) {
    const beatLength = 4 / denominator;
    return {
      numerator, denominator, beatLength,
      barLength: numerator * beatLength,
      pulseLength: denominator === 8 && numerator > 3 && numerator % 3 === 0 ? beatLength * 3 : null,
      text: `${numerator}/${denominator}`,
    };
  }
  return { numerator: 4, denominator: 4, beatLength: 1, barLength: 4,
    pulseLength: null, text: '4/4' };
}

/** All distinct grid, denominator-beat, compound-pulse and bar lines. */
/** @param {number} end @param {{gridStep: number, beatLength: number, barLength: number, pulseLength?: number|null}} geometry */
export function timeGridLines(end, { gridStep, beatLength, barLength, pulseLength = null }) {
  const priorities = { cell: 0, beat: 1, pulse: 2, bar: 3 };
  const lines = new Map();
  const add = (step, kind) => {
    if (!(step > 0)) return;
    for (let time = 0; time <= end + MIN_TIME; time += step) {
      const key = Math.round(time / MIN_TIME);
      const previous = lines.get(key);
      if (!previous || priorities[kind] > priorities[previous.kind]) lines.set(key, { time, kind });
    }
  };
  add(gridStep, 'cell');
  add(beatLength, 'beat');
  add(pulseLength, 'pulse');
  add(barLength, 'bar');
  return [...lines.values()].sort((a, b) => a.time - b.time);
}

/** A grid step in quarter-note beats. Note values are meter-independent;
 * bare numbers remain the legacy number of cells per bar. */
/** @param {number} beatsPerBar @param {string|number} grid */
export function gridStepOf(beatsPerBar, grid) {
  const bar = Math.max(1, Number(beatsPerBar) || 4);
  const text = String(grid ?? '').trim();
  if (text.toLowerCase() === 'bar') return bar;
  const noteValue = /^1\/(1|2|4|8|16|32|64)(t)?$/i.exec(text);
  if (noteValue) {
    const straight = 4 / Number(noteValue[1]);
    return Math.max(MIN_TIME, noteValue[2] ? straight * 2 / 3 : straight);
  }
  return Math.max(MIN_TIME, bar / Math.max(1, Number(grid) || 4));
}

/** Pick the finest ordinary note grid that still leaves a usable gap on screen. */
/** @param {number} pxPerBeat @param {number} [beatsPerBar] @param {number} [minimumPixels] */
export function adaptiveGridStep(pxPerBeat, beatsPerBar = 4, minimumPixels = 12) {
  const px = Math.max(MIN_TIME, Number(pxPerBeat) || 1);
  const bar = Math.max(MIN_TIME, Number(beatsPerBar) || 4);
  const steps = [...new Set([bar, 4, 2, 1, .5, .25, .125, .0625])]
    .filter((step) => step <= bar + MIN_TIME)
    .sort((a, b) => a - b);
  return steps.find((step) => step * px >= minimumPixels) ?? bar;
}

/** Resolve a fixed or zoom-adaptive grid to quarter-note beats. */
export function gridStepForView(beatsPerBar, grid, pxPerBeat, adaptive = false) {
  return adaptive ? adaptiveGridStep(pxPerBeat, beatsPerBar) : gridStepOf(beatsPerBar, grid);
}

/** Display a resolved straight grid step. */
export function gridTextForStep(step, beatsPerBar = 4) {
  if (Math.abs(step - beatsPerBar) < MIN_TIME) return '1 bar';
  for (const denominator of [1, 2, 4, 8, 16, 32, 64]) {
    if (Math.abs(step - 4 / denominator) < MIN_TIME) return `1/${denominator}`;
  }
  return `${step} beats`;
}

/** The displayed name of a note-value or legacy cells-per-bar grid. */
/** @param {string|number} grid @param {number} [beatsPerBar] */
export function gridTextOf(grid, beatsPerBar = 4) {
  const text = String(grid ?? '').trim();
  if (text.toLowerCase() === 'bar') return '1 bar';
  const noteValue = /^1\/(1|2|4|8|16|32|64)(t)?$/i.exec(text);
  if (noteValue) return `1/${noteValue[1]}${noteValue[2] ? 'T' : ''}`;
  const division = Number(grid);
  if (division === 1) return '1 bar';
  for (const denominator of [4, 8, 16, 32, 64]) {
    const straight = beatsPerBar * denominator / 4;
    if (Math.abs(division - straight) < 1e-9) return `1/${denominator}`;
    if (Math.abs(division - straight * 1.5) < 1e-9) return `1/${denominator}T`;
  }
  return `${grid}/bar`;
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
