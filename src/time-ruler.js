/** Bar, beat and grid-cell labels, made sparser when space is tight. */
/** @param {number} beats @param {number} beatsPerBar @param {number} pxPerBeat
 * @param {number} [gridStep] */
export function rulerLabels(beats, beatsPerBar, pxPerBeat, gridStep = 1) {
  const labelStep = gridStep > 0 && gridStep < 0.25
    ? gridStep * Math.ceil(0.25 / gridStep - 1e-9) : gridStep;
  const showCells = labelStep > 0 && labelStep < 1 && pxPerBeat * labelStep >= 40;
  const showBeats = pxPerBeat >= 40;
  const step = showCells ? labelStep : showBeats ? 1 : beatsPerBar;
  const labels = [];
  for (let index = 0; index * step < beats - 1e-9; index += 1) {
    const beat = index * step;
    const barIndex = Math.floor((beat + 1e-9) / beatsPerBar);
    const inBar = beat - barIndex * beatsPerBar;
    const beatIndex = Math.floor(inBar + 1e-9);
    const bar = barIndex + 1;
    if (showCells) {
      const fraction = Math.max(0, inBar - beatIndex);
      const cell = Math.round(fraction / labelStep) + 1;
      labels.push({ beat, text: `${bar}.${beatIndex + 1}.${cell}` });
    } else {
      labels.push({ beat, text: beatIndex === 0 ? String(bar) : `${bar}.${beatIndex + 1}` });
    }
  }
  return labels;
}
