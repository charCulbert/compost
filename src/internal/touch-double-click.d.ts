/** Adds touch double-clicks; dispatch: false only suppresses the native double-tap gesture. */
export function installTouchDoubleClick(
	element: HTMLElement,
	options?: { dispatch?: boolean },
): void;
