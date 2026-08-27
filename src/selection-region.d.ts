export interface SelectionRegion<T = string | number> {
  start: number;
  end: number;
  items?: T[];
}

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
