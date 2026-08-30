import type {
	DeviceSelectorSnapshot,
	DeviceSettingsDetail,
} from "../device-settings.js";

export type {
	DeviceSelectorSnapshot,
	DeviceSettingsDetail,
} from "../device-settings.js";

/** The detail on `device-settings-refresh`. */
export interface DeviceSettingsRefreshDetail {
	requestId: number;
	snapshot: DeviceSelectorSnapshot | null;
}

/** The live connection `connectHost` returns. */
export interface DeviceSelectorHostConnection {
	connected: boolean;
	loadSnapshot(event?: Event | null): Promise<DeviceSelectorSnapshot | null>;
	applySettings(event: Event): Promise<DeviceSelectorSnapshot | null>;
}

/**
 * `<compost-device-selector>`: a device-settings dialog over a host
 * snapshot. It emits `device-settings-refresh` and `device-settings-input`
 * CustomEvents; `connectHost` wires both to async host callbacks with
 * stale-request protection.
 *
 * @attribute label - accessible name
 * @attribute heading - visible dialog heading
 * @attribute busy - shows the busy state while the host answers
 * @attribute disabled
 * @attribute error - error message shown in the dialog
 */
export class CompostDeviceSelector extends HTMLElement {
	get snapshot(): DeviceSelectorSnapshot | null;
	set snapshot(value: unknown);
	get busy(): boolean;
	set busy(value: boolean);
	get disabled(): boolean;
	set disabled(value: boolean);
	get error(): string;
	set error(value: string);

	open(): void;
	close(): void;
	focus(options?: FocusOptions): void;

	/** Applies a snapshot unless a newer request has superseded it. */
	applySnapshot(
		snapshot: unknown,
		options?: { requestId?: number | null },
	): boolean;
	/** Wires refresh and input events to host callbacks; loads once. */
	connectHost(options: {
		getSnapshot: () => Promise<unknown> | unknown;
		applySettings: (
			request: DeviceSettingsDetail,
		) => Promise<unknown> | unknown;
	}): Promise<DeviceSelectorSnapshot | null>;
	disconnectHost(): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"compost-device-selector": CompostDeviceSelector;
	}
}
