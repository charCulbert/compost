import type { RollNote } from "./components/compost-note-editor.js";

export const MIN_DURATION: number;
export type NoteSnapMode = "grid" | "off";
export interface NoteBox {
	fromBeat: number;
	toBeat: number;
	fromNote: number;
	toNote: number;
}
export interface NoteSpan {
	start: number;
	end: number;
}

export function gridStep(division: number, beatsPerBar?: number): number;
export function snapBeats(
	value: number,
	step: number,
	mode?: NoteSnapMode,
): number;
export function snapDuration(
	value: number,
	step: number,
	mode?: NoteSnapMode,
): number;
export function snapWithOffset(
	value: number,
	origin: number,
	step: number,
	mode?: NoteSnapMode,
): number;
export function normaliseNote(note: Partial<RollNote>, beats: number): RollNote;
export function normaliseNotes(
	notes: Partial<RollNote>[],
	beats: number,
): RollNote[];
export function movedNotes(
	notes: RollNote[],
	ids: string[],
	deltaBeats: number,
	deltaNote: number,
	beats: number,
	step: number,
	mode?: NoteSnapMode,
): RollNote[];
export function resizedNotes(
	notes: RollNote[],
	ids: string[],
	deltaBeats: number,
	beats: number,
	step: number,
	mode?: NoteSnapMode,
): RollNote[];
export function quantizedNotes(
	notes: RollNote[],
	step: number,
	options?: {
		ids?: string[] | null;
		lengths?: boolean;
		beats?: number;
		strength?: number;
		swing?: number;
	},
): RollNote[];
export function notesInBox(notes: RollNote[], box: NoteBox): RollNote[];
export function trimmedNotes(
	notes: RollNote[],
	ids: string[],
	deltaBeats: number,
	beats: number,
	step: number,
	mode?: NoteSnapMode,
): RollNote[];
export function velocityShiftedNotes(
	notes: RollNote[],
	ids: string[],
	delta: number,
): RollNote[];
export function resolveOverlaps(
	notes: RollNote[],
	activeIds: string[],
): RollNote[];
export function selectionSpan(
	notes: RollNote[],
	ids?: string[] | null,
): NoteSpan | null;
export function duplicatedNotes(
	notes: RollNote[],
	ids: string[],
	step: number,
	beats: number,
	newId: () => string,
	mode?: NoteSnapMode,
	range?: NoteSpan | null,
): RollNote[];
