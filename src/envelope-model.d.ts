export const MIN_ENVELOPE_TIME: number;

export interface EnvelopeModelPoint {
  time: number;
  value: number;
  curve?: number;
  [key: string]: unknown;
}

export interface EnvelopeMoveOptions {
  min?: number;
  max?: number;
  height?: number;
  scale?: 'linear' | 'gain';
  stepped?: boolean;
  step?: number | string | null;
  [key: string]: unknown;
}

export function envelopeRange(min: number, max: number): {min: number, max: number};
export function envelopeValueToY(value: number, min: number, max: number, height: number, scale?: 'linear' | 'gain'): number;
export function envelopeValueFromY(y: number, min: number, max: number, height: number, scale?: 'linear' | 'gain'): number;
export function addEnvelopePoint(points: EnvelopeModelPoint[], point: EnvelopeModelPoint, min?: number, max?: number): EnvelopeModelPoint[];
export function moveEnvelopePoint(points: EnvelopeModelPoint[], index: number, point: EnvelopeModelPoint, min?: number, max?: number): EnvelopeModelPoint[];
export function preserveEnvelopeEdgePoints(originPoints: EnvelopeModelPoint[], movedPoints: EnvelopeModelPoint[], index: number): EnvelopeModelPoint[];
export function deleteEnvelopePoint(points: EnvelopeModelPoint[], index: number): EnvelopeModelPoint[];
export function snapEnvelopeValue(value: number, min?: number, max?: number, step?: number): number;
export function effectiveEnvelopeStep(stepped?: boolean, step?: number | string | null): number;
export function envelopeCurvePosition(position: number, curve?: number): number;
export function envelopeValueAtTime(points: EnvelopeModelPoint[], time: number, min?: number, max?: number, scale?: 'linear' | 'gain', stepped?: boolean): number;
export function splitEnvelopeAtTime(points: EnvelopeModelPoint[], time: number, min?: number, max?: number, scale?: 'linear' | 'gain', stepped?: boolean): EnvelopeModelPoint[];
export function sliceEnvelopeRange(points: EnvelopeModelPoint[], start: number, end: number, min?: number, max?: number, scale?: 'linear' | 'gain', stepped?: boolean): EnvelopeModelPoint[];
export function envelopeRangeEdgeValues(points: EnvelopeModelPoint[], start: number, end: number, options?: EnvelopeMoveOptions): {start: number, end: number};
export function moveEnvelopePointsByY(points: EnvelopeModelPoint[], indexes: number[], deltaY: number, options?: EnvelopeMoveOptions): EnvelopeModelPoint[];
export function moveEnvelopeRangeByY(points: EnvelopeModelPoint[], start: number, end: number, deltaY: number, options?: EnvelopeMoveOptions): EnvelopeModelPoint[];
export function thinEnvelopePoints(points: EnvelopeModelPoint[], tolerance?: number): EnvelopeModelPoint[];
export function drawEnvelopePoints(originPoints: EnvelopeModelPoint[], samples: EnvelopeModelPoint[], options?: EnvelopeMoveOptions & {gridStep?: number, snap?: string, freehand?: boolean, tolerance?: number}): EnvelopeModelPoint[];
export function flattenEnvelopeRange(points: EnvelopeModelPoint[], start: number, end: number, value: number, min?: number, max?: number, step?: number): EnvelopeModelPoint[];
export function moveEnvelopeRange(points: EnvelopeModelPoint[], start: number, end: number, delta: number, min?: number, max?: number, step?: number): EnvelopeModelPoint[];
