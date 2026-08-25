/** One audio or MIDI device as the selector lists it. */
export interface DeviceSettingsDevice {
  id: string;
  name: string;
  channels?: number;
}

/** A normalised snapshot of the host's device state. */
export interface DeviceSelectorSnapshot {
  /** The snapshot as the host supplied it. */
  raw: unknown;
  audio: {
    api: string;
    apis: string[];
    inputDeviceId: string;
    outputDeviceId: string;
    inputDevices: DeviceSettingsDevice[];
    outputDevices: DeviceSettingsDevice[];
    sampleRate: number;
    bufferSize: number;
    sampleRates: number[];
    bufferSizes: number[];
    requiredInputChannels: number | null;
    requiredOutputChannels: number | null;
  };
  midi: {
    inputDevices: DeviceSettingsDevice[];
    outputDevices: DeviceSettingsDevice[];
    inputDeviceIds: string[];
    outputDeviceIds: string[];
  };
}

/** The detail on `device-settings-input`: the requested settings. */
export interface DeviceSettingsDetail {
  requestId: number | null;
  changed: string;
  settings: {
    audio: {
      api: string;
      inputDeviceId: string;
      outputDeviceId: string;
      sampleRate: number;
      bufferSize: number;
    };
    midi: {
      inputDeviceIds: string[];
      outputDeviceIds: string[];
    };
  };
  snapshot: DeviceSelectorSnapshot;
}

/** Normalises a host snapshot into the selector's canonical shape. */
export function normaliseDeviceSelectorSnapshot(snapshot?: unknown): DeviceSelectorSnapshot;

/** Builds a settings-request detail from a snapshot plus overrides. */
export function deviceSettingsDetailFromSnapshot(
  snapshot?: unknown,
  overrides?: {
    requestId?: number | null;
    changed?: string;
    audio?: Record<string, unknown>;
    midi?: Record<string, unknown>;
  },
): DeviceSettingsDetail;
