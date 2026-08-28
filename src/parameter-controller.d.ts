import type { ParameterCurveName } from './parameter-scale.js';
import type { ParameterControl, ParameterEventDetail, ParameterKind } from './utils.js';
export type { ParameterKind } from './utils.js';

export interface ParameterDefinitionInput {
  parameterID?: string;
  id?: string;
  kind?: ParameterKind;
  name?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  step?: number;
  values?: readonly number[] | null;
  unit?: string;
  readOnly?: boolean;
  mid?: number | null;
  curve?: ParameterCurveName | string | null;
  shape?: number | null;
}

export interface ParameterDefinition {
  parameterID: string;
  kind: ParameterKind;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
  step: number;
  values: number[] | null;
  unit: string;
  readOnly: boolean;
  mid?: number;
  curve?: ParameterCurveName;
  shape?: number;
}

export interface ParameterValueDetail extends ParameterEventDetail {
  source: string;
}

export interface ParameterControllerOptions {
  root?: ParentNode | Element | null;
  definitions?: ParameterDefinitionInput[] | Record<string, ParameterDefinitionInput> | null;
}

export function normaliseDefinition(input?: ParameterDefinitionInput): ParameterDefinition;

export class ParameterController extends EventTarget {
  constructor(options?: ParameterControllerOptions);
  root: ParentNode | Element | null;
  connected: boolean;
  setDefinitions(definitions?: ParameterControllerOptions['definitions']): this;
  definition(parameterID: string): ParameterDefinition | null;
  value(parameterID: string): number | undefined;
  registerControl<T extends ParameterControl>(control: T): T;
  refresh(): this;
  applyValue(parameterID: string, value: number, options?: {source?: string}): boolean;
  applyValues(
    values: Record<string, number> | Array<{parameterID: string, value: number}>,
    options?: {source?: string},
  ): boolean;
  handleEvent(event: CustomEvent<ParameterEventDetail>): void;
  disconnect(): void;
}

export function createParameterController(options?: ParameterControllerOptions): ParameterController;
