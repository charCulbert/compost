import {
  isControlChangeMessage,
  midiMappingFromMessage,
  midiMappingMatchesMessage,
  normaliseMIDIMapping,
} from './midi-mapping.js';
import { controllerValueFromMessage } from './midi.js';
import { normalisedPositionToValue } from './parameter-scale.js';

function cloneMapping(mapping) {
  return mapping
    ? { ...mapping, values: mapping.values ? [...mapping.values] : null }
    : null;
}

function mappingDetail(mapping) {
  const snapshot = cloneMapping(mapping);
  return {
    ...snapshot,
    mappingLabel: snapshot.channel === null
      ? `CC ${snapshot.cc}`
      : `ch ${snapshot.channel} CC ${snapshot.cc}`,
  };
}

function normaliseMapping(mapping, parameters) {
  const parameterID = String(mapping?.parameterID ?? '');
  const definition = parameters.definition(parameterID);
  const midi = normaliseMIDIMapping(mapping);
  if (!parameterID || !definition || !midi) return null;

  const rawMin = Number(mapping.min ?? mapping.midiMin ?? definition.min);
  const rawMax = Number(mapping.max ?? mapping.midiMax ?? definition.max);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) return null;
  if (rawMin > rawMax
      || rawMin < definition.min
      || rawMax > definition.max) return null;

  const min = rawMin;
  const max = rawMax;
  const rawMid = mapping.mid ?? mapping.midiMid ?? mapping.mappingMid;
  const mid = rawMid === null || rawMid === undefined || rawMid === ''
    ? null
    : Number(rawMid);
  if (mid !== null
      && (!Number.isFinite(mid) || mid < definition.min || mid > definition.max
        || mid < min || mid > max)) return null;

  const rawShape = mapping.shape ?? mapping.midiShape ?? mapping.mappingShape;
  const shape = rawShape === null || rawShape === undefined || rawShape === ''
    ? null
    : Number(rawShape);
  if (shape !== null && (!Number.isFinite(shape) || shape <= 0)) return null;

  return {
    ...midi,
    parameterID,
    label: mapping.label ?? definition.name,
    kind: definition.kind,
    min,
    max,
    mid,
    step: definition.step,
    values: definition.values ? [...definition.values] : null,
    curve: mapping.curve ?? 'linear',
    shape,
  };
}

function valueForMapping(mapping, ccValue) {
  const value = Math.max(0, Math.min(127, Number(ccValue) || 0));

  if (mapping.values?.length) {
    const values = mapping.values
      .filter((candidate) => candidate >= mapping.min - 1e-9 && candidate <= mapping.max + 1e-9);
    if (values.length && values.length <= 128) {
      const ordered = mapping.min <= mapping.max ? values : [...values].reverse();
      return ordered[Math.min(ordered.length - 1, Math.floor((value * ordered.length) / 128))];
    }
  }

  if (mapping.step > 0) {
    const intervalEstimate = (mapping.max - mapping.min) / mapping.step;
    const intervalCount = Math.round(intervalEstimate);
    const count = Math.abs(intervalEstimate - intervalCount) <= 1e-9
      ? intervalCount + 1
      : 0;
    if (count > 1 && count <= 128) {
      const index = Math.min(count - 1, Math.floor((value * count) / 128));
      return mapping.min + index * mapping.step;
    }
  }

  const mapped = normalisedPositionToValue(value / 127, {
    min: mapping.min,
    max: mapping.max,
    mid: mapping.mid,
    curve: mapping.curve,
    shape: mapping.shape,
  });

  if (mapping.step > 0) {
    const snapped = mapping.min + Math.round((mapped - mapping.min) / mapping.step) * mapping.step;
    return Math.min(mapping.max, Math.max(mapping.min, snapped));
  }
  return mapped;
}

export class MIDIMappings extends EventTarget {
  constructor({ parameters, learnChannel = false } = {}) {
    super();
    if (!parameters) throw new Error('MIDIMappings needs a ParameterController.');
    this.parameters = parameters;
    this.learnChannel = learnChannel;
    this.mappingState = new Map();
    this.learning = null;
    this.triggerActive = new Map();
  }

  get(parameterID) {
    return cloneMapping(this.mappingState.get(String(parameterID)));
  }

  all() {
    return [...this.mappingState.values()].map(cloneMapping);
  }

  isLearning() {
    return this.learning !== null;
  }

  beginLearn(parameterID, {learnChannel = this.learnChannel} = {}) {
    const id = String(parameterID ?? '');
    const definition = this.parameters.definition(id);
    if (!definition) return false;
    if (this.learning !== null) this.cancelLearn();
    this.learning = {parameterID: id, learnChannel};
    this.dispatchEvent(new CustomEvent('midi-learn-begin', {
      detail: { parameterID: id, label: definition.name },
    }));
    return true;
  }

  cancelLearn() {
    if (this.learning === null) return false;
    const parameterID = this.learning.parameterID;
    this.learning = null;
    this.dispatchEvent(new CustomEvent('midi-learn-cancel', { detail: { parameterID } }));
    return true;
  }

  requestSet(mapping) {
    const normalised = normaliseMapping(mapping, this.parameters);
    if (!normalised) return false;
    this.dispatchEvent(new CustomEvent('midi-mapping-request', {
      detail: mappingDetail(normalised),
    }));
    return true;
  }

  requestClear(parameterID) {
    const id = String(parameterID ?? '');
    if (!this.parameters.definition(id)) return false;
    this.dispatchEvent(new CustomEvent('midi-unmapping-request', { detail: { parameterID: id } }));
    return true;
  }

  applyMapping(mapping) {
    const normalised = normaliseMapping(mapping, this.parameters);
    if (!normalised) return false;

    this.mappingState.set(normalised.parameterID, normalised);
    this.triggerActive.delete(normalised.parameterID);
    this.dispatchEvent(new CustomEvent('midi-map', { detail: mappingDetail(normalised) }));
    return true;
  }

  applyMappings(mappingList = []) {
    if (!Array.isArray(mappingList)) return false;
    const normalised = mappingList.map((mapping) => normaliseMapping(mapping, this.parameters));
    if (normalised.some((mapping) => !mapping)) return false;
    const parameterIDs = new Set(normalised.map((mapping) => mapping.parameterID));
    if (parameterIDs.size !== normalised.length) return false;

    const next = new Map(normalised.map((mapping) => [mapping.parameterID, mapping]));
    const previous = this.mappingState;
    this.mappingState = next;
    this.triggerActive.clear();

    for (const [parameterID, mapping] of previous) {
      if (!next.has(parameterID)) {
        this.dispatchEvent(new CustomEvent('midi-unmap', { detail: mappingDetail(mapping) }));
      }
    }
    for (const mapping of next.values()) {
      this.dispatchEvent(new CustomEvent('midi-map', { detail: mappingDetail(mapping) }));
    }
    return true;
  }

  applyClear(parameterID) {
    const id = String(parameterID ?? '');
    const mapping = this.mappingState.get(id);
    if (!mapping) return false;
    this.mappingState.delete(id);
    this.triggerActive.delete(id);
    this.dispatchEvent(new CustomEvent('midi-unmap', { detail: mappingDetail(mapping) }));
    return true;
  }

  handleMIDIMessage(event) {
    const message = event?.detail?.message
      ?? event?.detail?.data
      ?? event?.data
      ?? event;
    if (!isControlChangeMessage(message)) return false;

    if (this.learning !== null) {
      const {parameterID, learnChannel} = this.learning;
      const midi = midiMappingFromMessage(message, {learnChannel});
      this.learning = null;
      const requested = this.requestSet({ parameterID, ...midi });
      if (requested) {
        this.dispatchEvent(new CustomEvent('midi-learn-captured', {
          detail: {parameterID, ...midi},
        }));
      }
      if (!requested) {
        this.dispatchEvent(new CustomEvent('midi-learn-cancel', {
          detail: { parameterID, reason: 'mapping-rejected' },
        }));
      }
      return requested;
    }

    const matching = [...this.mappingState.values()]
      .filter((candidate) => midiMappingMatchesMessage(candidate, message));
    if (!matching.length) return false;

    const ccValue = controllerValueFromMessage(message);
    for (const mapping of matching) {
      if (mapping.kind === 'trigger') {
        const active = ccValue > 0;
        const wasActive = this.triggerActive.get(mapping.parameterID) || false;
        this.triggerActive.set(mapping.parameterID, active);
        if (!active || wasActive) continue;

        this.dispatchEvent(new CustomEvent('midi-parameter', {
          detail: {
            parameterID: mapping.parameterID,
            kind: 'trigger',
            value: 1,
            midi: mappingDetail(mapping),
          },
        }));
        continue;
      }

      this.dispatchEvent(new CustomEvent('midi-parameter', {
        detail: {
          parameterID: mapping.parameterID,
          kind: mapping.kind,
          value: valueForMapping(mapping, ccValue),
          midi: mappingDetail(mapping),
        },
      }));
    }
    return true;
  }
}

export function createMIDIMappings(options = {}) {
  return new MIDIMappings(options);
}
