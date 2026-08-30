import { clamp } from "./utils.js";

const MIN_SPAN = 1e-9;

/** Normalise a time region and its optional row/lane extent. */
export function normalizeSelectionRegion(
	start,
	end,
	items,
	max = Number.POSITIVE_INFINITY,
) {
	const first = Number(start);
	const last = Number(end);
	if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
	const limit = Number.isFinite(Number(max))
		? Math.max(0, Number(max))
		: Number.POSITIVE_INFINITY;
	const low = clamp(Math.min(first, last), 0, limit);
	const high = clamp(Math.max(first, last), 0, limit);
	if (high <= low + MIN_SPAN) return null;
	const region = { start: low, end: high };
	if (Array.isArray(items) && items.length) region.items = [...new Set(items)];
	return region;
}

/** Extend from a region's start, or a caller-provided anchor when none exists. */
export function extendSelectionRegion(
	region,
	beat,
	anchor,
	items,
	max = Number.POSITIVE_INFINITY,
) {
	return normalizeSelectionRegion(
		region?.start ?? anchor,
		beat,
		items ?? region?.items,
		max,
	);
}
