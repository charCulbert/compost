/** The detail on `audio-*` lifecycle events. */
export interface AudioEventDetail {
  context: AudioContext | null;
  state: AudioContextState | 'closed';
  error?: Error;
  [key: string]: unknown;
}

/**
 * `<compost-audio>`: an audio power button that owns an AudioContext.
 * Emits `audio-started`, `audio-resumed`, `audio-suspended`,
 * `audio-stopped`, `audio-state-change` and `audio-error` CustomEvents.
 */
export class WebAudio extends HTMLElement {
  /** The owned context; null before the first start and after a close. */
  context: AudioContext | null;
  status: string;

  get startLabel(): string;
  get stopLabel(): string;
  get startAriaLabel(): string;
  get stopAriaLabel(): string;
  /** The `latency-hint` attribute as a category or seconds; defaults to 0. */
  get latencyHint(): AudioContextLatencyCategory | number;
  get isRunning(): boolean;

  /** Starts or resumes the context; resolves with it, or null on failure. */
  start(): Promise<AudioContext | null>;
  /** Suspends the context, or closes and drops it when forced. */
  stop(forceClose?: boolean): Promise<void>;
  toggle(): Promise<AudioContext | null | void>;
  getContext(): AudioContext | null;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-audio': WebAudio;
  }
}
