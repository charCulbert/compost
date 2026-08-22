/** The bar and beat labels a ruler shows, sparser when beats are tight. */
/** @param {number} beats @param {number} beatsPerBar @param {number} pxPerBeat */
export function rulerLabels(beats, beatsPerBar, pxPerBeat) {
  const step = pxPerBeat * beatsPerBar > 150 ? 1 : beatsPerBar;
  const labels = [];
  for (let beat = 0; beat < beats; beat += step) {
    const bar = Math.floor(beat / beatsPerBar) + 1;
    const inBar = (beat % beatsPerBar) + 1;
    labels.push({ beat, text: inBar === 1 ? String(bar) : `${bar}.${inBar}` });
  }
  return labels;
}
