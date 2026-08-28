import { normaliseCurveName } from './parameter-scale.js';

const PARAMETER_SELECTOR = '[parameter-id]';
const EPSILON = 1e-9;

function number(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function valuesFromControl(control) {
  if (Array.isArray(control.parameterValues)) return control.parameterValues;
  const text = control.getAttribute?.('parameter-values');
  if (!text) return null;

  const values = text
    .split(/[|,]/u)
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  return values.length ? values : null;
}

function definitionFromControl(control) {
  const parameterID = control.parameterID
    || control.getAttribute?.('parameter-id')
    || '';
  if (!parameterID) return null;

  const value = number(control.getParameterValue?.() ?? control.value, 0);
  const declaredDefault = control.getAttribute?.('reset-value');
  const defaultValue = number(declaredDefault, value);
  const kind = control.parameterKind || control.getAttribute?.('parameter-kind')
    || (control.tagName === 'COMPOST-RADIO-GROUP' || control.tagName === 'COMPOST-TOGGLE'
      ? 'discrete'
      : 'continuous');

  const scale = {};
  for (const field of ['mid', 'curve', 'shape']) {
    if (control.hasAttribute?.(field)) scale[field] = control.getAttribute(field);
  }

  return normaliseDefinition({
    parameterID,
    kind,
    name: control.getAttribute?.('name') || control.getAttribute?.('label') || parameterID,
    min: number(control.min ?? control.getAttribute?.('min'), 0),
    max: number(control.max ?? control.getAttribute?.('max'), 1),
    defaultValue,
    step: number(control.step ?? control.getAttribute?.('step'), kind === 'trigger' ? 1 : 0),
    values: valuesFromControl(control),
    unit: control.unit ?? control.getAttribute?.('unit') ?? '',
    readOnly: Boolean(control.readOnly || control.disabled || control.hasAttribute?.('disabled')),
    ...scale,
  });
}

export function normaliseDefinition(input = {}) {
  const parameterID = input.parameterID ?? input.id ?? '';
  if (!parameterID) throw new Error('Parameter definition needs parameterID.');

  const rawMin = number(input.min, 0);
  const rawMax = number(input.max, 1);
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  const values = Array.isArray(input.values)
    ? input.values.map(Number).filter(Number.isFinite)
    : null;
  const kind = ['continuous', 'discrete', 'trigger'].includes(input.kind)
    ? input.kind
    : 'continuous';

  const definition = {
    parameterID: String(parameterID),
    kind,
    name: input.name || String(parameterID),
    min,
    max,
    defaultValue: number(input.defaultValue, min),
    step: Math.max(0, number(input.step, kind === 'trigger' ? 1 : 0)),
    values: values?.length ? values : null,
    unit: input.unit ?? '',
    readOnly: Boolean(input.readOnly),
  };

  if (input.mid !== null && input.mid !== undefined && input.mid !== '') {
    definition.mid = number(input.mid);
    if (definition.mid === null || definition.mid < min || definition.mid > max) {
      throw new Error(`Invalid scale midpoint for parameter "${definition.parameterID}".`);
    }
  }
  if (input.curve !== null && input.curve !== undefined && input.curve !== '') {
    definition.curve = normaliseCurveName(input.curve);
  }
  if (input.shape !== null && input.shape !== undefined && input.shape !== '') {
    definition.shape = number(input.shape);
    if (!(definition.shape > 0)) {
      throw new Error(`Invalid scale shape for parameter "${definition.parameterID}".`);
    }
  }

  if (!validValue(definition, definition.defaultValue)) {
    throw new Error(`Invalid default value for parameter "${definition.parameterID}".`);
  }

  return definition;
}

function sameDefinition(a, b) {
  return a.kind === b.kind
    && a.min === b.min
    && a.max === b.max
    && a.defaultValue === b.defaultValue
    && a.step === b.step
    && a.readOnly === b.readOnly
    && a.mid === b.mid
    && a.curve === b.curve
    && a.shape === b.shape
    && JSON.stringify(a.values) === JSON.stringify(b.values);
}

function validValue(definition, value) {
  const parsed = number(value);
  if (parsed === null) return false;

  const tolerance = Math.max(EPSILON, Math.abs(definition.max - definition.min) * EPSILON);
  if (parsed < definition.min - tolerance || parsed > definition.max + tolerance) return false;
  if (definition.values
      && !definition.values.some((candidate) => Math.abs(candidate - parsed) <= tolerance)) {
    return false;
  }

  if (definition.step > 0) {
    const steps = (parsed - definition.min) / definition.step;
    if (Math.abs(steps - Math.round(steps)) > tolerance) return false;
  }

  return true;
}

function applyDefinition(control, definition) {
  const fields = {
    'parameter-kind': definition.kind,
    min: definition.min,
    max: definition.max,
    step: definition.step,
    'reset-value': definition.defaultValue,
    unit: definition.unit,
  };

  for (const [name, value] of Object.entries(fields)) {
    control.setAttribute?.(name, String(value));
  }

  for (const name of ['mid', 'curve', 'shape']) {
    if (definition[name] !== undefined) control.setAttribute?.(name, String(definition[name]));
  }

  if (definition.values) {
    control.setAttribute?.('parameter-values', definition.values.join(','));
  } else {
    control.removeAttribute?.('parameter-values');
  }

  control.toggleAttribute?.('disabled', definition.readOnly);
}

function setControlValue(control, value, source = 'controller') {
  if (typeof control.setValue === 'function') {
    control.setValue(value, false, source);
    return;
  }

  if ('value' in Object(control)) {
    control.value = value;
  } else {
    control.setAttribute?.('value', String(value));
  }
}

function eventValue(detail, fallback = null) {
  const parsed = number(detail?.value, fallback);
  return parsed;
}

export class ParameterController extends EventTarget {
  constructor({ root = globalThis.document ?? null, definitions = null } = {}) {
    super();
    this.root = root;
    this.controls = new Map();
    this.definitions = new Map();
    this.externalDefinitions = new Set();
    this.values = new Map();
    this.connected = true;
    this.handleEvent = this.handleEvent.bind(this);

    if (definitions !== null && definitions !== undefined) this.setDefinitions(definitions);

    this.root?.addEventListener?.('parameter-begin', this.handleEvent);
    this.root?.addEventListener?.('parameter-edit', this.handleEvent);
    this.root?.addEventListener?.('parameter-end', this.handleEvent);
    this.refresh();
  }

  setDefinitions(definitions = []) {
    const list = Array.isArray(definitions) ? definitions : Object.values(definitions || {});
    const previousValues = this.values;
    const nextDefinitions = new Map();
    const nextExternalDefinitions = new Set();

    for (const definition of list) {
      const normalised = normaliseDefinition(definition);
      if (nextDefinitions.has(normalised.parameterID)) {
        throw new Error(`Duplicate parameter definition for "${normalised.parameterID}".`);
      }
      nextDefinitions.set(normalised.parameterID, normalised);
      nextExternalDefinitions.add(normalised.parameterID);
    }

    const nextValues = new Map(
      [...previousValues].filter(([parameterID]) =>
        nextDefinitions.has(parameterID) || this.controls.has(parameterID)),
    );
    for (const [parameterID, definition] of nextDefinitions) {
      const previous = previousValues.get(parameterID);
      nextValues.set(
        parameterID,
        validValue(definition, previous) ? previous : definition.defaultValue,
      );
    }
    for (const [parameterID, controls] of this.controls) {
      let definition = nextDefinitions.get(parameterID);
      if (!definition) {
        const [first, ...rest] = controls;
        if (!first) continue;
        definition = definitionFromControl(first);
        if (!definition) continue;
        if (rest.some((control) => !sameDefinition(definition, definitionFromControl(control)))) {
          throw new Error(`Conflicting parameter definition for "${parameterID}".`);
        }
        nextDefinitions.set(parameterID, definition);
      }

      const previous = previousValues.get(parameterID);
      nextValues.set(
        parameterID,
        validValue(definition, previous) ? previous : definition.defaultValue,
      );
    }

    this.definitions = nextDefinitions;
    this.externalDefinitions = nextExternalDefinitions;
    this.values = nextValues;

    for (const [parameterID, controls] of this.controls) {
      const definition = this.definitions.get(parameterID);
      if (!definition) continue;
      controls.forEach((control) => applyDefinition(control, definition));
      controls.forEach((control) => setControlValue(
        control,
        this.values.get(parameterID),
        'definitions',
      ));
    }

    return this;
  }

  definition(parameterID) {
    return this.definitions.get(String(parameterID)) || null;
  }

  value(parameterID) {
    return this.values.get(String(parameterID));
  }

  registerControl(control) {
    if (!control) return control;

    const parameterID = control.parameterID
      || control.getAttribute?.('parameter-id')
      || '';
    if (!parameterID) return control;

    let definition = this.definitions.get(parameterID);
    if (definition && this.externalDefinitions.has(parameterID)) {
      applyDefinition(control, definition);
    } else {
      const local = definitionFromControl(control);
      if (!local) return control;
      if (definition && !sameDefinition(definition, local)) {
        throw new Error(`Conflicting parameter definition for "${parameterID}".`);
      }
      if (!definition) {
        definition = local;
        this.definitions.set(parameterID, local);
      }
    }

    const controls = this.controls.get(parameterID) || new Set();
    controls.add(control);
    this.controls.set(parameterID, controls);

    if (!this.values.has(parameterID)) {
      this.values.set(parameterID, definition.defaultValue);
    }

    setControlValue(control, this.values.get(parameterID), 'controller');
    return control;
  }

  refresh() {
    const query = this.root?.querySelectorAll;
    if (typeof query !== 'function' && typeof this.root?.matches !== 'function') return this;

    const controls = [];
    if (this.root?.matches?.(PARAMETER_SELECTOR)) controls.push(this.root);
    if (typeof query === 'function') controls.push(...query.call(this.root, PARAMETER_SELECTOR));

    const seen = new Set(controls);
    controls.forEach((control) => this.registerControl(control));

    for (const [parameterID, registered] of this.controls) {
      for (const control of registered) {
        if (!seen.has(control)) registered.delete(control);
      }
      if (!registered.size) this.controls.delete(parameterID);
    }

    return this;
  }

  applyValue(parameterID, value, { source = 'backend' } = {}) {
    const id = String(parameterID);
    const definition = this.definition(id);
    const parsed = number(value);
    if (!definition || parsed === null || !validValue(definition, parsed)) return false;

    this.values.set(id, parsed);
    for (const control of this.controls.get(id) || []) {
      setControlValue(control, parsed, source);
    }

    this.dispatchEvent(new CustomEvent('parameter-value', {
      detail: {
        parameterID: id,
        value: parsed,
        kind: definition.kind,
        source,
      },
    }));
    return true;
  }

  applyValues(values, options = {}) {
    const list = Array.isArray(values)
      ? values
      : Object.entries(values || {}).map(([parameterID, value]) => ({ parameterID, value }));

    const parsed = list.map((entry) => {
      if (!entry) return null;
      const parameterID = String(entry.parameterID ?? '');
      const definition = this.definition(parameterID);
      const value = number(entry.value);
      return definition && value !== null && validValue(definition, value)
        ? { parameterID, value }
        : null;
    });

    if (parsed.some((entry) => !entry)) return false;
    for (const entry of parsed) {
      if (!this.applyValue(entry.parameterID, entry.value, options)) return false;
    }
    return true;
  }

  handleEvent(event) {
    const id = String(event.detail?.parameterID || '');
    const definition = this.definition(id);
    if (!definition || definition.readOnly) return;

    const parsed = eventValue(event.detail, this.value(id));
    if (parsed === null || !validValue(definition, parsed)) return;

    const detail = {
      ...event.detail,
      parameterID: id,
      value: parsed,
      kind: definition.kind,
      source: event.detail?.source ?? 'control',
      cancelled: Boolean(event.detail?.cancelled),
    };

    if (event.type === 'parameter-edit'
        || event.type === 'parameter-end' && detail.cancelled) {
      this.values.set(id, parsed);
      for (const control of this.controls.get(id) || []) {
        if (control !== event.target) setControlValue(control, parsed, 'sibling');
      }
    }

    this.dispatchEvent(new CustomEvent(event.type, { detail }));
  }

  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.root?.removeEventListener?.('parameter-begin', this.handleEvent);
    this.root?.removeEventListener?.('parameter-edit', this.handleEvent);
    this.root?.removeEventListener?.('parameter-end', this.handleEvent);
    this.controls.clear();
  }
}

export function createParameterController(options = {}) {
  return new ParameterController(options);
}
