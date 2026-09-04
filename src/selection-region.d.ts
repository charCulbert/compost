export interface TimeRange {
	start: number;
	end: number;
}

export interface SelectionRegion<T = string | number> {
	start: number;
	end: number;
	items?: T[];
}

/** Clamp and order a time range, including a collapsed edit cursor. */
export function normalizeTimeRange(
	start: number | null,
	end: number | null,
	max?: number,
): TimeRange | null;

export function normalizeSelectionRegion<T = string | number>(
	start: number,
	end: number,
	items?: T[],
	max?: number,
): SelectionRegion<T> | null;

export function extendSelectionRegion<T = string | number>(
	region: SelectionRegion<T> | null,
	beat: number,
	anchor: number,
	items?: T[],
	max?: number,
): SelectionRegion<T> | null;
