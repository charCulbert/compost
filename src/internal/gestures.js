/**
 * The shared gesture constants and recognizers described in the README under Events.
 * Elements import these instead of restating the numbers, so every element
 * feels the same distances and delays.
 */

/** Movement in px before a press becomes a drag. */
export const DRAG_SLOP = 3;
/** Press duration in ms, within the drag slop, before a context intent. */
const LONG_PRESS_MS = 550;
/** Delay in ms between taps of one double-tap. */
export const DOUBLE_TAP_MS = 350;
/** Distance in px between taps of one double-tap. */
export const DOUBLE_TAP_DISTANCE = 24;
/** Movement in px within one tap before it stops being a tap. */
export const TAP_MOVE_DISTANCE = 12;
/** Grab edge in px for trimming an item, by pointer type. */
const TOUCH_TRIM_EDGE = 12;
const MOUSE_TRIM_EDGE = 6;

/**
 * One long-press timer. `start(fire)` schedules `fire` once, LONG_PRESS_MS
 * after the press; `cancel()` stops it when the pointer crosses the drag
 * slop, lifts, or the gesture cancels. Starting again reschedules.
 */
export function createLongPress() {
	let timer = null;
	return {
		start(fire) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				fire();
			}, LONG_PRESS_MS);
		},
		cancel() {
			clearTimeout(timer);
			timer = null;
		},
	};
}
