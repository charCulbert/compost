import type { MIDIMappings } from '../midi-mappings.js';

/** The detail on `midi-map-mode-change`. */
export interface MIDIMapModeChangeDetail {
  active: boolean;
  state: string;
}

/**
 * `<compost-midi-mappings>`: a table over a MIDIMappings model, with a
 * map-mode toggle and per-row CC, channel and range fields. Assign the
 * model to `mappings`; the element listens for its events and emits
 * `midi-map-mode-change` when learn mode starts or stops.
 */
export class MIDIMappingsEditor extends HTMLElement {
  /** The mappings model this editor edits, or null. */
  get mappings(): MIDIMappings | null;
  set mappings(value: MIDIMappings | null);

  /** Clears one mapping through the model's request path. */
  clearMapping(parameterID: string): void;
  /** Clears every mapping through the model's request path. */
  clearMappings(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'compost-midi-mappings': MIDIMappingsEditor;
  }
}
