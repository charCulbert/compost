/** Bar, denominator-beat and grid-cell labels, made sparser when space is tight. */
/** @param {number} beats @param {number|{barLength: number, beatLength: number}} meter @param {number} pxPerBeat
 * @param {number} [gridStep] */
export function rulerLabels(beats, meter, pxPerBeat, gridStep = 1) {
  const barLength = typeof meter === 'number' ? meter : meter.barLength;
  const beatLength = typeof meter === 'number' ? 1 : meter.beatLength;
  const labelStep = gridStep > 0 && gridStep < 0.25
    ? gridStep * Math.ceil(0.25 / gridStep - 1e-9) : gridStep;
  const showCells = labelStep > 0 && labelStep < beatLength && pxPerBeat * labelStep >= 40;
  const showBeats = pxPerBeat * beatLength >= 40;
  const step = showCells ? labelStep : showBeats ? beatLength : barLength;
  const labels = [];
  for (let index = 0; index * step < beats - 1e-9; index += 1) {
    const beat = index * step;
    const barIndex = Math.floor((beat + 1e-9) / barLength);
    const inBar = beat - barIndex * barLength;
    const beatIndex = Math.floor((inBar + 1e-9) / beatLength);
    const bar = barIndex + 1;
    if (showCells) {
      const fraction = Math.max(0, inBar - beatIndex * beatLength);
      const cell = Math.round(fraction / labelStep) + 1;
      labels.push({ beat, text: `${bar}.${beatIndex + 1}.${cell}` });
    } else {
      labels.push({ beat, text: beatIndex === 0 ? String(bar) : `${bar}.${beatIndex + 1}` });
    }
  }
  return labels;
}
