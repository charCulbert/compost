export type GridValue = string | number;

export interface TimeSignature {
  numerator: number;
  denominator: 1 | 2 | 4 | 8 | 16;
  beatLength: number;
  barLength: number;
  pulseLength: number | null;
  text: string;
}

export interface TimeGridLine {
  time: number;
  kind: 'cell' | 'beat' | 'pulse' | 'bar';
}

export interface SnapTimeOptions {
  step?: number;
  origin?: number | null;
  mode?: 'grid' | 'off';
  anchors?: number[];
  reach?: number;
}

export const MIN_TIME: number;
export function timeSignatureOf(value?: string | null): TimeSignature;
export function timeGridLines(end: number, geometry: {
  gridStep: number;
  beatLength: number;
  barLength: number;
  pulseLength?: number | null;
}): TimeGridLine[];
export function gridStepOf(beatsPerBar: number, grid: GridValue): number;
export function adaptiveGridStep(pxPerBeat: number, beatsPerBar?: number, minimumPixels?: number): number;
export function gridStepForView(beatsPerBar: number, grid: GridValue, pxPerBeat: number, adaptive?: boolean): number;
export function gridTextForStep(step: number, beatsPerBar?: number): string;
export function gridTextOf(grid: GridValue, beatsPerBar?: number): string;
export function snapModeWith(mode: 'grid' | 'off', modifierHeld: boolean): 'grid' | 'off';
export function snapTime(value: number, options?: SnapTimeOptions): number;
