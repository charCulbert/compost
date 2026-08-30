import { envelopeRange, envelopeValueToY } from "../envelope-model.js";

/** Coarsen only the painted time grid until adjacent rules remain legible. */
export function visibleEnvelopeGridStep(
	grid,
	duration,
	width,
	minimumPixels = 12,
) {
	const source = Number(grid);
	if (!(source > 0) || !Number.isFinite(source)) return null;
	const span = Number(duration);
	if (!(span > 0) || !Number.isFinite(span)) return source;
	const pixelsPerTime = Math.max(1, Number(width) || 1) / span;
	const minimum = Math.max(1, Number(minimumPixels) || 1);
	let visible = source;
	while (visible * pixelsPerTime < minimum) visible *= 2;
	return visible;
}

/** Meaningful value rules: zero for bipolar ranges and actual stepped values. */
export function envelopeValueGuides(
	min,
	max,
	{
		height = 1,
		scale = "linear",
		stepped = false,
		step = 0,
		minimumPixels = 12,
	} = {},
) {
	const range = envelopeRange(min, max);
	const span = range.max - range.min;
	if (!(span > 0)) return [];
	const rowHeight = Math.max(1, Number(height) || 1);
	const minimum = Math.max(1, Number(minimumPixels) || 1);
	const values = range.min < 0 && range.max > 0 ? [0] : [];
	const increment = stepped ? Number(step) : 0;
	if (increment > 0 && Number.isFinite(increment)) {
		const count = Math.max(0, Math.ceil(span / increment) - 1);
		const visibleCount = Math.max(1, Math.floor(rowHeight / minimum));
		const stride = Math.max(1, Math.ceil(count / visibleCount));
		for (let index = stride; index * increment < span; index += stride) {
			values.push(range.min + index * increment);
		}
	}
	const zeroGuide = range.min < 0 && range.max > 0;
	const selected = [];
	for (const value of [...new Set(values)].sort(
		(a, b) =>
			envelopeValueToY(a, range, rowHeight, scale) -
			envelopeValueToY(b, range, rowHeight, scale),
	)) {
		const y = envelopeValueToY(value, range, rowHeight, scale);
		if (zeroGuide && value === 0) {
			for (let index = selected.length - 1; index >= 0; index -= 1) {
				if (
					Math.abs(
						envelopeValueToY(selected[index], range, rowHeight, scale) - y,
					) < minimum
				) {
					selected.splice(index, 1);
				}
			}
			selected.push(value);
		} else if (
			selected.every(
				(entry) =>
					Math.abs(envelopeValueToY(entry, range, rowHeight, scale) - y) >=
					minimum,
			)
		) {
			selected.push(value);
		}
	}
	return selected.sort((a, b) => a - b);
}
