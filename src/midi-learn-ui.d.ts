import type { MIDIMappings } from './midi-mappings.js';

export const MAPPABLE_SELECTOR: string;
export type MIDILearnState = 'idle' | 'selecting' | 'learning';

export interface MIDILearnUIOptions {
  mappings: MIDIMappings;
  root?: ParentNode | Element;
  button?: HTMLElement | null;
  status?: HTMLElement | null;
  selector?: string;
  learnChannel?: boolean;
  onStateChange?: ((state: MIDILearnState) => void) | null;
}

export function mappableTargetFromEvent(event: Event, selector?: string): Element | null;
export function mappableTargetLabel(target: Element | null): string;
export function mappableTargetParameterID(target: Element | null): string;

export class MIDILearnUI {
  constructor(options: MIDILearnUIOptions);
  state: MIDILearnState;
  lastTarget: Element | null;
  highlightedTarget: Element | null;
  connect(): void;
  disconnect(): void;
  beginSelecting(): void;
  beginLearn(target: Element): boolean;
  selectTarget(target: Element, options?: {focus?: boolean}): boolean;
  cancel(reason?: string, options?: {announce?: boolean}): void;
  clearMappingForTarget(target: Element): boolean;
  mappingLabelForTarget(target: Element): string;
  findMappableTargets(): Element[];
  announce(message: string, options?: {priority?: 'polite' | 'assertive'}): void;
}

export function createMIDILearnUI(options: MIDILearnUIOptions): MIDILearnUI;
