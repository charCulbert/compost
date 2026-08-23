/** The shared audio-fader taper as dB/fraction pairs. */
export const DEFAULT_TAPER = Object.freeze([
  [12, 1], [6, 0.85], [0, 0.7], [-6, 0.6], [-12, 0.5], [-24, 0.35],
  [-36, 0.25], [-48, 0.17], [-60, 0.1], [-90, 0],
]);

/** Reads a taper attribute like "12:1 6:.85 0:.7 -90:0".
 * @param {string|null|undefined} text @returns {readonly (readonly [number, number])[]} */
export function parseTaper(text) {
  if (!text) return DEFAULT_TAPER;
  const points = String(text).trim().split(/[\s,]+/u).map((pair) => {
    const [db, rawFraction] = pair.split(':').map(Number);
    const fraction = Math.max(0, Math.min(1, rawFraction));
    return Number.isFinite(db) && Number.isFinite(fraction) ? [db, fraction] : null;
  }).filter((point) => point !== null).sort((a, b) => b[0] - a[0]);
  return points.length >= 2 ? /** @type {[number, number][]} */ (points) : DEFAULT_TAPER;
}

/** Height of the wash for a level, as a 0..1 fraction of the column.
 * @param {number} db @param {readonly (readonly [number, number])[]} [taper] */
export function washPosition(db, taper = DEFAULT_TAPER) {
  const value = Number(db);
  if (!Number.isFinite(value)) return 0;
  const top = taper[0]; const bottom = taper[taper.length - 1];
  if (value >= top[0]) return top[1];
  if (value <= bottom[0]) return bottom[1];
  for (let index = 0; index < taper.length - 1; index += 1) {
    const [a, fa] = taper[index]; const [b, fb] = taper[index + 1];
    if (value <= a && value >= b) return fb + (fa - fb) * (value - b) / (a - b);
  }
  return 0;
}

/** The level at a 0..1 column fraction; washPosition run backwards.
 * @param {number} fraction @param {readonly (readonly [number, number])[]} [taper] */
export function washLevel(fraction, taper = DEFAULT_TAPER) {
  const value = Number(fraction);
  if (!Number.isFinite(value)) return taper[taper.length - 1][0];
  const top = taper[0]; const bottom = taper[taper.length - 1];
  if (value >= top[1]) return top[0];
  if (value <= bottom[1]) return bottom[0];
  for (let index = 0; index < taper.length - 1; index += 1) {
    const [a, fa] = taper[index]; const [b, fb] = taper[index + 1];
    if (value <= fa && value >= fb) return fa === fb ? b : b + (a - b) * (value - fb) / (fa - fb);
  }
  return bottom[0];
}
