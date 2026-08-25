/** The detail on `scope-frame`, fired after each drawn frame. */
export interface ScopeFrameDetail {
  /** The requestAnimationFrame timestamp. */
  time: number;
}

/**
 * `<compost-scope>`: an oscilloscope over Web Audio taps or caller-pushed
 * samples. Configuration is attribute-driven (trigger, window, markers,
 * colours); `connectAudio` taps a context or node, `setSamples` displays a
 * manual window. Emits `scope-frame` CustomEvents while drawing.
 */
export class ScopeVisualizer extends HTMLElement {
  frequency: number;
  drive: number;
  gain: number;
  gate: number;
  channelIndexes: number[];
  triggerChannel: number | null;
  fftSize: number;
  smoothingTimeConstant: number;
  trigger: string;
  triggerLevel: number;
  samplesShown: number;
  periodsShown: number | null;
  sampleRate: number;
  valueRange: number;
  yOffset: number;
  audioContext: BaseAudioContext | null;
  /** The tap node sources connect into while audio is connected. */
  input: AudioNode | null;

  /**
   * Taps an AudioContext or a source AudioNode. Returns the input node to
   * connect sources into.
   */
  connectAudio(
    contextOrSource: BaseAudioContext | AudioNode,
    options?: {
      source?: AudioNode | null;
      channels?: number | number[];
      sourceChannels?: Iterable<number>;
      triggerChannel?: number | null;
      fftSize?: number;
      smoothingTimeConstant?: number;
    },
  ): AudioNode;

  /** Displays a manual sample window: one channel array, or an array of channels. */
  setSamples(
    samples: ArrayLike<number> | ArrayLike<number>[],
    options?: {triggerSamples?: ArrayLike<number> | null, copy?: boolean},
  ): this;

  disconnectAudio(): void;
  /** Starts the draw loop; connectedCallback calls this automatically. */
  start(): void;
  stop(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-scope': ScopeVisualizer;
  }
}
