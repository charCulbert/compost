import { formatMIDIMapping, normaliseMIDIMapping } from './midi-mapping.js';

export const MAPPABLE_SELECTOR = '[parameter-id], [midi-map-target]';

let mapDescriptionID = 0;
const MIDI_MAP_STATE_ATTRIBUTE = 'midi-map-state';

function setMIDIMapState(target, token, enabled) {
  if (!target) return;
  const tokens = new Set(String(target.getAttribute?.(MIDI_MAP_STATE_ATTRIBUTE) || '').split(/\s+/u).filter(Boolean));
  if (enabled) tokens.add(token);
  else tokens.delete(token);
  if (tokens.size) target.setAttribute?.(MIDI_MAP_STATE_ATTRIBUTE, [...tokens].join(' '));
  else target.removeAttribute?.(MIDI_MAP_STATE_ATTRIBUTE);
}

const TEXT_EDITING_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
]);

export function mappableTargetFromEvent(event, selector = MAPPABLE_SELECTOR) {
  for (const item of event.composedPath?.() || []) {
    if (item?.matches?.(selector)) return item;
  }

  return event.target?.closest?.(selector) || null;
}

export function mappableTargetLabel(target) {
  if (!target) return 'parameter';

  return target.getAttribute('label')
    || target.getAttribute('aria-label')
    || target.textContent?.trim()
    || target.getAttribute('name')
    || target.getAttribute('parameter-id')
    || target.getAttribute('midi-map-target')
    || 'parameter';
}

export function mappableTargetParameterID(target) {
  if (!target) return '';

  return target.getAttribute?.('parameter-id')
    || target.getAttribute?.('midi-map-target')
    || target.getAttribute?.('name')
    || target.id
    || '';
}

function formatMIDIMappingForSpeech(mapping) {
  const normalised = normaliseMIDIMapping(mapping);
  if (!normalised) return 'unmapped';

  return normalised.channel === null
    ? `CC ${normalised.cc}`
    : `MIDI channel ${normalised.channel}, CC ${normalised.cc}`;
}

function mappableTargetFromNode(node, selector = MAPPABLE_SELECTOR) {
  if (!node || node === globalThis.document) return null;

  return node.matches?.(selector)
    ? node
    : node.closest?.(selector) || null;
}

function isTextEditingTarget(event) {
  const target = event.composedPath?.()[0] || event.target;
  const tagName = String(target?.tagName || '').toUpperCase();

  if (target?.isContentEditable) return true;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName !== 'INPUT') return false;

  const type = String(target.type || target.getAttribute?.('type') || 'text').toLowerCase();

  return TEXT_EDITING_INPUT_TYPES.has(type);
}

export class MIDILearnUI {
  constructor({
    mappings,
    root = document,
    button,
    status = null,
    selector = MAPPABLE_SELECTOR,
    learnChannel = false,
    onStateChange = null,
  } = {}) {
    this.mappings = mappings;
    this.root = root;
    this.button = button;
    this.status = status;
    this.selector = selector;
    this.learnChannel = learnChannel;
    this.onStateChange = onStateChange;
    this.lastTarget = null;
    this.highlightedTarget = null;
    this.labelledTargets = new Set();
    this.originalTargetDescriptions = new Map();
    this.lastAnnouncement = '';
    this.announcementTimer = 0;
    this.visualFrame = 0;
    this.pulseTimer = 0;
    this.pulseOn = false;
    this.isRetargeting = false;
    this.isExiting = false;
    this.announceLearnStartAsEntry = false;
    this.ignoreLearnCancelUntil = 0;
    this.state = 'idle';
    this.defaultButtonText = button?.textContent?.trim() || 'Map MIDI';

    this.handleButtonClick = this.handleButtonClick.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleMap = this.handleMap.bind(this);
    this.handleLearnStart = this.handleLearnStart.bind(this);
    this.handleLearnCancel = this.handleLearnCancel.bind(this);
    this.handleAudioStopped = this.handleAudioStopped.bind(this);

    this.connect();
  }

  connect() {
    this.button?.addEventListener('click', this.handleButtonClick);
    this.root?.addEventListener?.('focusin', this.handleFocusIn);
    this.root?.addEventListener?.('focusout', this.handleFocusOut);
    this.root?.addEventListener?.('pointerdown', this.handlePointerDown, true);
    this.root?.addEventListener?.('keydown', this.handleKeyDown, true);
    this.root?.addEventListener?.('audio-stopped', this.handleAudioStopped);
    this.root?.addEventListener?.('audio-suspended', this.handleAudioStopped);
    this.mappings?.addEventListener?.('midi-map', this.handleMap);
    this.mappings?.addEventListener?.('midi-learn-begin', this.handleLearnStart);
    this.mappings?.addEventListener?.('midi-learn-cancel', this.handleLearnCancel);
    this.updateIdleLabel();
  }

  disconnect() {
    this.mappings?.cancelLearn?.();
    this.button?.removeEventListener('click', this.handleButtonClick);
    this.root?.removeEventListener?.('focusin', this.handleFocusIn);
    this.root?.removeEventListener?.('focusout', this.handleFocusOut);
    this.root?.removeEventListener?.('pointerdown', this.handlePointerDown, true);
    this.root?.removeEventListener?.('keydown', this.handleKeyDown, true);
    this.root?.removeEventListener?.('audio-stopped', this.handleAudioStopped);
    this.root?.removeEventListener?.('audio-suspended', this.handleAudioStopped);
    this.mappings?.removeEventListener?.('midi-map', this.handleMap);
    this.mappings?.removeEventListener?.('midi-learn-begin', this.handleLearnStart);
    this.mappings?.removeEventListener?.('midi-learn-cancel', this.handleLearnCancel);
    clearTimeout(this.announcementTimer);
    this.announcementTimer = 0;
    this.stopPulse();
    this.clearTargetHighlight();
    this.clearMappingLabels();
    this.lastTarget = null;
    this.setModeState('idle');
    this.setPressed(false);
    this.setState('idle');
  }

  handleButtonClick() {
    if (this.state !== 'idle') {
      this.cancel('exited');
      return;
    }

    this.beginSelecting();
  }

  handleAudioStopped() {
    if (this.state === 'idle') return;

    this.cancel('audio-stopped', { announce: false });
    this.announce('MIDI map mode exited because audio stopped or suspended.', { priority: 'assertive' });
  }

  handleFocusIn(event) {
    const target = mappableTargetFromEvent(event, this.selector);
    if (!target || target === this.button) {
      this.clearTargetHighlight();
      return;
    }

    if (this.state === 'selecting') {
      this.beginLearn(target);
    } else if (this.state === 'learning' && this.lastTarget !== target) {
      this.beginLearn(target);
    } else {
      this.lastTarget = target;
    }

    if (this.state === 'idle') {
      this.updateIdleLabel();
    }
  }

  handleFocusOut(event) {
    if (this.state !== 'selecting') return;

    const nextTarget = mappableTargetFromNode(event.relatedTarget, this.selector);
    if (nextTarget && nextTarget !== this.button) return;

    this.clearTargetHighlight();
  }

  handlePointerDown(event) {
    const target = mappableTargetFromEvent(event, this.selector);
    if (!target || target === this.button) return;

    if (this.state === 'idle') return;
    event.preventDefault();
    event.stopPropagation();
    if (this.lastTarget !== target) {
      this.beginLearn(target);
    }
    this.focusTarget(target);
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (this.state === 'idle') return;

      event.preventDefault();
      this.cancel('exited');
      return;
    }

    const eventTarget = mappableTargetFromEvent(event, this.selector);

    if ((event.key === 'Delete' || event.key === 'Backspace') && this.state !== 'idle') {
      if (isTextEditingTarget(event)) return;

      const target = eventTarget && eventTarget !== this.button
        ? eventTarget
        : this.highlightedTarget;

      event.preventDefault();
      event.stopPropagation();
      this.clearMappingForTarget(target);
      return;
    }

    // Cmd/Ctrl-M, and never while the caret is in a text field: a bare "m" fired
    // in the middle of typing into a search box or a name field.
    if ((event.key === 'm' || event.key === 'M') && (event.metaKey || event.ctrlKey)) {
      if (isTextEditingTarget(event)) return;

      if (this.state !== 'idle') {
        event.preventDefault();
        event.stopPropagation();
        this.cancel('exited');
        return;
      }

      if (!eventTarget || eventTarget === this.button) {
        event.preventDefault();
        event.stopPropagation();
        this.beginSelecting();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.announceLearnStartAsEntry = true;
      this.beginLearn(eventTarget);
      return;
    }

    if (this.state !== 'selecting') return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!eventTarget || eventTarget === this.button) return;

    event.preventDefault();
    event.stopPropagation();
    this.beginLearn(eventTarget);
  }

  clearMappingForTarget(target) {
    if (!target || target === this.button) {
      this.announce('No mapping selected.');
      return false;
    }

    const parameterID = mappableTargetParameterID(target);
    const label = mappableTargetLabel(target);
    const previousMapping = this.mappingLabelForTarget(target);

    if (!parameterID) {
      this.announce(`${label} cannot be unmapped.`);
      return false;
    }

    if (this.state === 'learning') {
      this.isRetargeting = true;
      this.mappings?.cancelLearn();
      this.isRetargeting = false;
    }

    const cleared = this.mappings?.requestClear?.(parameterID);

    this.setModeState('selecting');
    this.lastTarget = target;
    this.syncLearnVisuals('selecting', target);
    this.showMappingLabels();

    if (!cleared || !previousMapping) {
      this.announce(`${label} is not mapped.`);
      return false;
    }

    this.announce(`${label} mapping cleared.`);
    return true;
  }

  beginLearn(target) {
    if (this.state === 'learning') {
      this.isRetargeting = true;
      this.mappings?.cancelLearn();
      this.isRetargeting = false;
    }

    if (!this.mappings?.beginLearn?.(mappableTargetParameterID(target))) {
      this.announce('That control cannot be MIDI mapped.');
      this.setModeState('idle');
      this.setPressed(false);
      this.setState('idle');
      this.stopPulse();
      this.updateIdleLabel();
      return;
    }

    this.lastTarget = target;
    this.setModeState('learning');
    this.syncLearnVisuals('learning', target);
  }

  selectTarget(target, { focus = true } = {}) {
    if (this.state === 'idle' || !target) return false;
    if (this.lastTarget !== target) this.beginLearn(target);
    if (focus) this.focusTarget(target);
    return this.state === 'learning';
  }

  beginSelecting() {
    const previousTarget = this.highlightedTarget || this.lastTarget;
    this.blurTarget(previousTarget);
    this.setModeState('selecting');
    this.lastTarget = null;
    this.setPressed(true);
    this.setState('selecting');
    this.showMappingLabels();
    this.startPulse();
    this.clearTargetHighlight();
    this.announce('MIDI map mode active. Focus a control, then move a MIDI CC.', { priority: 'assertive' });
  }

  cancel(reason, { announce = true } = {}) {
    this.isExiting = true;
    this.ignoreLearnCancelUntil = performance.now() + 500;
    this.mappings?.cancelLearn();
    this.setModeState('idle');
    this.setPressed(false);
    this.setState('idle');
    this.stopPulse();
    this.clearTargetHighlight();
    this.clearMappingLabels();
    this.updateIdleLabel();

    if (announce) {
      this.announce('MIDI map mode exited.', { priority: 'assertive' });
    }

    queueMicrotask(() => {
      this.isExiting = false;
    });
  }

  handleLearnStart(event) {
    const label = event.detail?.label || mappableTargetLabel(this.lastTarget);
    const mapping = this.lastTarget ? this.mappingLabelForTarget(this.lastTarget) : '';
    const existing = mapping ? ` Mapped to ${this.mappingSpeechLabelForTarget(this.lastTarget) || mapping}.` : '';
    const prefix = this.announceLearnStartAsEntry ? 'MIDI map mode active. ' : '';
    const priority = this.announceLearnStartAsEntry ? 'assertive' : 'polite';
    this.announceLearnStartAsEntry = false;
    this.announce(`${prefix}${label}.${existing} Move a CC to ${existing ? 'remap' : 'map'}.`, { priority });
  }

  handleMap(event) {
    const label = event.detail?.label || mappableTargetLabel(this.lastTarget);
    const mapping = formatMIDIMappingForSpeech(event.detail);

    // Host confirmation can arrive after the MIDI input has taken focus.
    // Restore the target while still in learning state so focus does not
    // immediately start a second learn cycle.
    const mappedTarget = this.lastTarget;
    if (mappedTarget) this.focusTarget(mappedTarget);

    this.announce(`${label} mapped to ${mapping}.`);
    if (this.state !== 'learning') return;

    if (mappedTarget && this.mappings?.beginLearn?.(mappableTargetParameterID(mappedTarget))) {
      this.setModeState('learning');
      this.syncLearnVisuals('learning', mappedTarget);
      return;
    }

    this.setModeState('selecting');
    this.setPressed(true);
    this.setState('selecting');
    this.showMappingLabels();
    this.stopPulse();
  }

  handleLearnCancel() {
    if (this.isRetargeting) return;
    if (this.isExiting || performance.now() < this.ignoreLearnCancelUntil) return;

    this.setModeState('idle');
    this.setPressed(false);
    this.setState('idle');
    this.stopPulse();
    this.clearTargetHighlight();
    this.clearMappingLabels();
    this.updateIdleLabel();
  }

  updateIdleLabel() {
    this.setButtonText(this.defaultButtonText);
    this.button?.setAttribute('aria-label', this.defaultButtonText);
    this.button?.setAttribute('aria-description', 'Activate to enter MIDI map mode.');
    this.setState('idle');
    if (this.state === 'idle') {
      this.stopPulse();
    }
  }

  setButtonText(text) {
    if (this.button) this.button.textContent = text;
  }

  setPressed(pressed) {
    this.button?.setAttribute('aria-pressed', String(Boolean(pressed)));
  }

  setModeState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange?.(state);
  }

  setState(state) {
    if (!this.button) return;

    if (state === 'idle') {
      this.button.removeAttribute('data-midi-learn-state');
      this.button.setAttribute('aria-label', this.defaultButtonText);
      this.button.setAttribute('aria-description', 'Activate to enter MIDI map mode.');
      this.clearMappingLabels();
    } else {
      this.button.setAttribute('data-midi-learn-state', state);
      this.button.setAttribute('aria-label', this.defaultButtonText);
      this.button.setAttribute('aria-description', 'MIDI map mode active. Escape exits.');
    }
  }

  setTargetHighlight(target) {
    this.clearTargetHighlight();
    this.highlightedTarget = target;
    this.visualFrame = requestAnimationFrame(() => {
      if (this.highlightedTarget === target) {
        setMIDIMapState(this.highlightedTarget, 'active', true);
      }
    });
  }

  clearTargetHighlight() {
    cancelAnimationFrame(this.visualFrame);
    this.visualFrame = 0;
    setMIDIMapState(this.highlightedTarget, 'active', false);
    setMIDIMapState(this.highlightedTarget, 'pulse', false);
    this.highlightedTarget = null;
  }

  syncLearnVisuals(state, target) {
    cancelAnimationFrame(this.visualFrame);
    this.clearTargetHighlight();
    this.setState('idle');
    this.highlightedTarget = target;

    this.visualFrame = requestAnimationFrame(() => {
      if (this.state !== state || this.highlightedTarget !== target) return;

      setMIDIMapState(this.highlightedTarget, 'active', true);
      this.showMappingLabels();
      this.describeMappingTarget(this.highlightedTarget, this.mappingLabelForTarget(this.highlightedTarget));
      this.setPressed(true);
      this.setState(state);
      this.startPulse();
    });
  }

  startPulse() {
    if (this.pulseTimer) return;

    this.pulseOn = true;
    this.applyPulse();
    this.pulseTimer = setInterval(() => {
      this.pulseOn = !this.pulseOn;
      this.applyPulse();
    }, 650);
  }

  stopPulse() {
    clearInterval(this.pulseTimer);
    this.pulseTimer = 0;
    this.pulseOn = false;
    this.applyPulse();
  }

  applyPulse() {
    setMIDIMapState(this.highlightedTarget, 'pulse', this.pulseOn);
  }

  showMappingLabels() {
    if (this.state === 'idle') return;

    this.clearMappingLabels();

    for (const target of this.findMappableTargets()) {
      const label = this.mappingLabelForTarget(target);
      if (!label) continue;

      this.describeMappingTarget(target, label);
    }
  }

  clearMappingLabels() {
    for (const target of this.labelledTargets) {
      setMIDIMapState(target, 'mode', false);
      setMIDIMapState(target, 'label', false);
      target.style?.removeProperty?.('--midi-map-label');
      this.restoreMappingTargetDescription(target);
    }

    this.labelledTargets.clear();
  }

  findMappableTargets() {
    const targets = [];

    if (this.root?.matches?.(this.selector)) {
      targets.push(this.root);
    }

    if (this.root?.querySelectorAll) {
      targets.push(...this.root.querySelectorAll(this.selector));
    }

    return targets;
  }

  mappingLabelForTarget(target) {
    const mapping = this.mappings?.get?.(mappableTargetParameterID(target));
    return mapping ? formatMIDIMapping(mapping) : '';
  }

  mappingSpeechLabelForTarget(target) {
    const mapping = this.mappings?.get?.(mappableTargetParameterID(target));
    return mapping ? formatMIDIMappingForSpeech(mapping) : '';
  }

  describeMappingTarget(target, mappingLabel = '') {
    const focusableNodes = this.focusableNodesForTarget(target);
    if (!this.originalTargetDescriptions.has(target)) {
      this.originalTargetDescriptions.set(target, {
        ariaDescription: target.getAttribute?.('aria-description'),
        title: target.getAttribute?.('title'),
        describedByID: target.shadowRoot?.querySelector?.('[data-midi-map-description]')?.id || '',
        focusableDescriptions: focusableNodes.map((node) => ({
          node,
          ariaDescription: node.getAttribute?.('aria-description'),
          ariaDescribedBy: node.getAttribute?.('aria-describedby'),
        })),
      });
    }

    const controlLabel = mappableTargetLabel(target);
    const hasMapping = Boolean(mappingLabel);
    const mappingSpeechLabel = this.mappingSpeechLabelForTarget(target) || mappingLabel;
    const description = hasMapping
      ? `Mapped to ${mappingSpeechLabel}. Move a MIDI CC to remap. Delete clears. Escape exits.`
      : 'Move a MIDI CC to map. Escape exits.';

    setMIDIMapState(target, 'mode', true);
    target.setAttribute?.('aria-description', description);
    if (hasMapping) {
      setMIDIMapState(target, 'label', true);
      target.style?.setProperty?.('--midi-map-label', JSON.stringify(mappingLabel));
    } else {
      setMIDIMapState(target, 'label', false);
      target.style?.removeProperty?.('--midi-map-label');
    }
    const describedByID = this.setShadowDescription(target, description);

    for (const node of focusableNodes) {
      if (describedByID) {
        this.addDescribedBy(node, describedByID);
      }
    }

    this.labelledTargets.add(target);
  }

  restoreMappingTargetDescription(target) {
    const original = this.originalTargetDescriptions.get(target);
    if (!original) return;

    if (original.ariaDescription === null) {
      target.removeAttribute?.('aria-description');
    } else {
      target.setAttribute?.('aria-description', original.ariaDescription);
    }

    if (original.title === null) {
      target.removeAttribute?.('title');
    } else {
      target.setAttribute?.('title', original.title);
    }

    for (const { node, ariaDescription, ariaDescribedBy } of original.focusableDescriptions || []) {
      if (ariaDescription === null) {
        node.removeAttribute?.('aria-description');
      } else {
        node.setAttribute?.('aria-description', ariaDescription);
      }

      if (ariaDescribedBy === null) {
        node.removeAttribute?.('aria-describedby');
      } else {
        node.setAttribute?.('aria-describedby', ariaDescribedBy);
      }
    }

    const descriptionNode = target.shadowRoot?.querySelector?.('[data-midi-map-description]');
    if (descriptionNode && descriptionNode.id !== original.describedByID) {
      descriptionNode.remove();
    }

    this.originalTargetDescriptions.delete(target);
  }

  focusableNodesForTarget(target) {
    if (!target?.shadowRoot?.querySelectorAll) return [];

    return [...target.shadowRoot.querySelectorAll('button, input, select, textarea, [role], [tabindex]')]
      .filter((node) => !node.hasAttribute('aria-hidden') && node.tabIndex >= 0);
  }

  focusTarget(target) {
    const focusable = this.focusableNodesForTarget(target)[0];
    if (focusable?.focus) {
      focusable.focus({ preventScroll: true });
    } else {
      target?.focus?.({ preventScroll: true });
    }
  }

  blurTarget(target) {
    for (const node of this.focusableNodesForTarget(target)) node.blur?.();
    target?.blur?.();
  }

  mappingControlKind(target, focusableNodes) {
    const tagName = target.localName || '';
    if (tagName.includes('radio') || focusableNodes.some((node) => node.type === 'radio' || node.getAttribute?.('role') === 'radio')) {
      return 'choice';
    }

    if (tagName.includes('button') || focusableNodes.some((node) => node.tagName === 'BUTTON')) {
      return 'button';
    }

    if (focusableNodes.some((node) => node.getAttribute?.('role') === 'spinbutton')) {
      return 'number';
    }

    if (focusableNodes.some((node) => node.getAttribute?.('role') === 'slider')) {
      return 'continuous';
    }

    return 'control';
  }

  mappingActionText(kind) {
    if (kind === 'choice') return 'Mapped CC values will choose between the options in this group.';
    if (kind === 'button') return 'Mapped CC values will trigger or toggle this control.';
    if (kind === 'number') return 'Mapped CC values will set this numeric value.';
    return 'Mapped CC values will update this control.';
  }

  setShadowDescription(target, description) {
    if (!target?.shadowRoot) return '';

    let node = target.shadowRoot.querySelector('[data-midi-map-description]');
    if (!node) {
      node = document.createElement('span');
      node.id = `compost-midi-mappings-description-${++mapDescriptionID}`;
      node.setAttribute('data-midi-map-description', '');
      Object.assign(node.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      });
      target.shadowRoot.append(node);
    }

    node.textContent = description;
    return node.id;
  }

  addDescribedBy(node, id) {
    const ids = new Set((node.getAttribute?.('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(id);
    node.setAttribute?.('aria-describedby', [...ids].join(' '));
  }

  announce(message, { priority = 'polite' } = {}) {
    if (this.status) {
      this.lastAnnouncement = message;
      clearTimeout(this.announcementTimer);
      this.announcementTimer = 0;
      this.status.setAttribute?.('aria-live', priority);

      if (priority === 'assertive') {
        this.status.setAttribute?.('role', 'alert');
      } else {
        this.status.removeAttribute?.('role');
      }

      this.status.textContent = '';
      this.announcementTimer = setTimeout(() => {
        if (this.status) this.status.textContent = message;
        this.announcementTimer = 0;
      }, priority === 'assertive' ? 20 : 0);
    }
  }
}

export function createMIDILearnUI(options) {
  return new MIDILearnUI(options);
}
