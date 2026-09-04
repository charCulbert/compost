/** Bar, denominator-beat and grid-cell labels, made sparser when space is tight. */
/** @param {number} beats @param {number|{barLength: number, beatLength: number}} meter @param {number} pxPerBeat
 * @param {number} [gridStep] @param {number} [origin] */
export function rulerLabels(beats, meter, pxPerBeat, gridStep = 1, origin = 0) {
	const barLength = typeof meter === "number" ? meter : meter.barLength;
	const beatLength = typeof meter === "number" ? 1 : meter.beatLength;
	const labelStep =
		gridStep > 0 && gridStep < 0.25
			? gridStep * Math.ceil(0.25 / gridStep - 1e-9)
			: gridStep;
	const showCells =
		labelStep > 0 && labelStep < beatLength && pxPerBeat * labelStep >= 40;
	const showBeats = pxPerBeat * beatLength >= 40;
	const step = showCells ? labelStep : showBeats ? beatLength : barLength;
	const labels = [];
	const first = origin + Math.ceil((0 - origin - 1e-9) / step) * step;
	for (let beat = first; beat < beats - 1e-9; beat += step) {
		if (beat < -1e-9) continue;
		if (Math.abs(beat) < 1e-9) beat = 0;
		const musicalBeat = beat - origin;
		const barIndex = Math.floor((musicalBeat + 1e-9) / barLength);
		const inBar = musicalBeat - barIndex * barLength;
		const beatIndex = Math.floor((inBar + 1e-9) / beatLength);
		const bar = barIndex + 1;
		if (showCells) {
			const fraction = Math.max(0, inBar - beatIndex * beatLength);
			const cell = Math.round(fraction / labelStep) + 1;
			labels.push({ beat, text: `${bar}.${beatIndex + 1}.${cell}` });
		} else {
			labels.push({
				beat,
				text: beatIndex === 0 ? String(bar) : `${bar}.${beatIndex + 1}`,
			});
		}
	}
	return labels;
}
