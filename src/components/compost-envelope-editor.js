import {
  addEnvelopePoint,
  deleteEnvelopePoint,
  drawEnvelopePoints,
  effectiveEnvelopeStep,
  envelopeCurvePosition,
  envelopeRange,
  envelopeValueAtTime,
  envelopeValueFromY,
  envelopeValueToY,
  moveEnvelopePoint,
  moveEnvelopePointsByY,
  preserveEnvelopeEdgePoints,
  sliceEnvelopeRange,
  snapEnvelopeValue,
  splitEnvelopeAtTime,
} from '../envelope-model.js';
import { envelopeValueGuides, visibleEnvelopeGridStep } from '../internal/envelope-grid.js';
import { clamp, defineElement, numberAttr } from '../utils.js';
import {
  createLongPress,
  DOUBLE_TAP_DISTANCE,
  DOUBLE_TAP_MS,
  DRAG_SLOP,
  TAP_MOVE_DISTANCE,
} from '../internal/gestures.js';

const eventOf = (type, detail) => new CustomEvent(type, { bubbles: true, composed: true, detail });
const POINT_PREVIEW_DISTANCE = 3;
const SEGMENT_HANDLE_DISTANCE = 10;

/**
 * A generic time/value envelope surface. The caller owns the points and what
 * they mean; the editor only previews gestures and emits replacement arrays.
 */
export class CompostEnvelopeEditor extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'duration', 'min', 'max', 'scale', 'stepped', 'step', 'snap', 'grid', 'grid-lines', 'draw', 'readonly', 'disabled'];
  }

  constructor() {
    super();
    this.label = 'Envelope';
    this.duration = 1;
    this.min = 0;
    this.max = 1;
    this.scale = 'linear';
    this.stepped = false;
    this.step = 0;
    this.snapMode = 'off';
    this.grid = null;
    this.draw = false;
    this._points = [];
    this.selection = null;
    this.selectionPointIndexes = [];
    this.drag = null;
    this.longPress = createLongPress();
    this.touchTapStart = null;
    this.lastTouchTap = null;
    this.suppressDoubleClickUntil = 0;
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.render()) : null;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-envelope-bg: Canvas;
          --compost-envelope-text: currentColor;
          --compost-envelope-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-envelope-line: color-mix(in srgb, currentColor 30%, transparent);
          --compost-envelope-grid: color-mix(in srgb, currentColor 18%, transparent);
          --compost-envelope-signal: var(--compost-accent, AccentColor);
          --compost-envelope-point-bg: var(--compost-envelope-signal);
          --compost-envelope-point-border: var(--compost-envelope-bg);
          --compost-envelope-selection: color-mix(in srgb, var(--compost-envelope-signal) 12%, transparent);
          --compost-envelope-preview: var(--compost-envelope-signal);
          display: block;
          box-sizing: border-box;
          min-width: 0;
          min-height: 2.5em;
          overflow: hidden;
          border: 1px solid var(--compost-envelope-line);
          border-radius: 0;
          background: var(--compost-envelope-bg);
          color: var(--compost-envelope-text);
          font: inherit;
          outline: none;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([disabled]) { opacity: .55; pointer-events: none; }
        :host(:focus-visible) { outline: 2px solid currentColor; outline-offset: -2px; }
        .surface { position: relative; width: 100%; height: 100%; min-height: inherit; touch-action: none; overflow: hidden; }
        .grid { position: absolute; inset: 0; pointer-events: none; background-image: none; }
        .value-grid-line { position: absolute; inset-inline: 0; border-block-start: 1px solid var(--compost-envelope-grid); }
        .selection-marquee { position: absolute; z-index: 1; display: none; box-sizing: border-box; border: 1px solid var(--compost-envelope-signal); background: var(--compost-envelope-selection); pointer-events: none; }
        svg { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; overflow: visible; }
        .line-hit, .line, .selection-highlight, .segment-highlight { fill: none; vector-effect: non-scaling-stroke; }
        .line-hit { stroke: transparent; stroke-width: 1.25em; pointer-events: stroke; }
        .line { stroke: var(--compost-envelope-signal); stroke-width: 1px; pointer-events: none; }
        .selection-highlight { stroke: currentColor; stroke-width: 2px; opacity: .7; pointer-events: none; }
        .segment-highlight { stroke: currentColor; stroke-width: 3px; pointer-events: none; }
        .point-preview { pointer-events: none; }
        .point-preview[hidden] { display: none; }
        .surface[data-hover-target="point"] { cursor: crosshair; }
        .surface[data-hover-target="segment"] { cursor: ns-resize; }
        .point { cursor: grab; }
        .point-hit { x: -.75em; y: -.75em; width: 1.5em; height: 1.5em; fill: transparent; stroke: none; pointer-events: all; }
        .point-mark { x: -.1875em; y: -.1875em; width: .375em; height: .375em; fill: var(--compost-envelope-point-bg); stroke: var(--compost-envelope-point-border); stroke-width: 1px; vector-effect: non-scaling-stroke; pointer-events: none; }
        .point:hover .point-mark { x: -.25em; y: -.25em; width: .5em; height: .5em; }
        .point:focus-visible .point-mark { stroke: currentColor; stroke-width: 2px; }
        :host([draw]) .surface { cursor: crosshair; }
        :host([data-preview]) .line { stroke: var(--compost-envelope-preview); }
        :host([data-preview]) .point-mark { fill: var(--compost-envelope-preview); }
        .readout { position: absolute; z-index: 3; transform: translate(-50%, -100%); padding: .2em .35em; border: 1px solid var(--compost-envelope-line); background: var(--compost-envelope-bg); color: var(--compost-envelope-text); font: .75em/1 ui-monospace, SFMono-Regular, Menlo, monospace; pointer-events: none; white-space: nowrap; }
      </style>
      <div class="surface" part="surface">
        <div class="grid" part="grid"></div>
        <div class="selection-marquee" part="selection-marquee"></div>
        <svg part="graph" aria-hidden="true">
          <path class="line-hit" part="line-hit"></path>
          <path class="line" part="line"></path>
          <path class="selection-highlight" part="selection-highlight"></path>
          <path class="segment-highlight" part="segment-highlight"></path>
          <g class="point-preview" part="point-preview" hidden>
            <rect class="point-mark" part="point-preview-mark"></rect>
          </g>
        </svg>
        <span class="readout" part="readout" hidden></span>
      </div>
    `;
    this.surface = this.root.querySelector('.surface');
    this.gridElement = this.root.querySelector('.grid');
    this.selectionMarquee = this.root.querySelector('.selection-marquee');
    this.svg = this.root.querySelector('svg');
    this.lineHit = this.root.querySelector('.line-hit');
    this.line = this.root.querySelector('.line');
    this.selectionHighlight = this.root.querySelector('.selection-highlight');
    this.segmentHighlight = this.root.querySelector('.segment-highlight');
    this.pointPreview = this.root.querySelector('.point-preview');
    this.readout = this.root.querySelector('.readout');

    this.surface.addEventListener('pointerdown', (event) => this.startPointer(event));
    this.surface.addEventListener('pointermove', (event) => this.movePointer(event));
    this.surface.addEventListener('pointerleave', () => {
      if (!this.drag) {
        this.readout.hidden = true;
        this.segmentHighlight.setAttribute('d', '');
        this.pointPreview.hidden = true;
        delete this.surface.dataset.hoverTarget;
      }
    });
    this.surface.addEventListener('pointerup', (event) => this.endPointer(event));
    this.surface.addEventListener('pointercancel', () => this.cancelPointer());
    // A release outside the tracked area can go undelivered; capture being
    // dropped mid-gesture is the sign the drag is over.
    this.surface.addEventListener('lostpointercapture', (event) => {
      if (this.drag && this.drag.pointerId === event.pointerId) this.endPointer(event);
    });
    // iOS arms its double-tap-and-drag text-selection loupe at the second
    // touchstart, before the touchend default can be cancelled, so cancel it
    // as soon as a tap lands close behind a completed tap.
    this.surface.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches?.[0];
      const previous = this.lastTouchTap;
      if (!touch || event.touches?.length !== 1) return;
      if (previous && performance.now() - previous.time <= DOUBLE_TAP_MS
          && Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) <= DOUBLE_TAP_DISTANCE) {
        event.preventDefault();
      }
    }, { passive: false });
    this.surface.addEventListener('touchend', (event) => event.preventDefault(), { passive: false });
    this.surface.addEventListener('dblclick', (event) => {
      if (performance.now() >= this.suppressDoubleClickUntil) this.addAtPointer(event);
    });
    this.surface.addEventListener('contextmenu', (event) => this.openContext(event));
    this.addEventListener('keydown', (event) => this.handleKey(event));
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.syncAttributes();
    this.resizeObserver?.observe(this);
    this.render();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.cancelPointer();
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.syncAttributes();
    this.render();
  }

  syncAttributes() {
    this.label = this.getAttribute('label') || this.label;
    this.duration = Math.max(1e-9, numberAttr(this, 'duration', this.duration));
    const range = envelopeRange(numberAttr(this, 'min', this.min), numberAttr(this, 'max', this.max));
    this.min = range.min;
    this.max = range.max;
    this.scale = this.getAttribute('scale') === 'gain' ? 'gain' : 'linear';
    this.stepped = this.hasAttribute('stepped');
    this.step = effectiveEnvelopeStep(this.stepped, this.hasAttribute('step') ? this.getAttribute('step') : undefined);
    const grid = Number(this.getAttribute('grid'));
    this.grid = this.hasAttribute('grid') && grid > 0 && Number.isFinite(grid) ? grid : null;
    this.snapMode = this.grid && this.getAttribute('snap') !== 'off' ? 'grid' : 'off';
    this.draw = this.hasAttribute('draw');
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', this.label);
  }

  get points() { return this._points.map((point) => ({ ...point })); }

  set points(points) {
    this._points = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.time)) && Number.isFinite(Number(point?.value)))
      .map((point) => ({
        ...point,
        time: clamp(Number(point.time), 0, this.duration),
        value: snapEnvelopeValue(Number(point.value), this.min, this.max, this.step),
      }))
      .sort((a, b) => a.time - b.time);
    this.selectionPointIndexes = this.selectionPointIndexes
      .filter((index) => index >= 0 && index < this._points.length);
    this.render();
  }

  setPoints(points) { this.points = points; }

  get gridLines() {
    const value = this.getAttribute('grid-lines');
    return value === 'off' || value === 'time' ? value : 'all';
  }

  set gridLines(value) {
    if (value === 'off' || value === 'time') this.setAttribute('grid-lines', value);
    else this.removeAttribute('grid-lines');
  }

  get readonly() { return this.hasAttribute('readonly'); }
  set readonly(value) { this.toggleAttribute('readonly', Boolean(value)); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { this.toggleAttribute('disabled', Boolean(value)); }

  setSelection(start, end) {
    const low = Math.max(0, Math.min(Number(start), Number(end)));
    const high = Math.min(this.duration, Math.max(Number(start), Number(end)));
    this.selection = Number.isFinite(low) && Number.isFinite(high) && high > low ? { start: low, end: high } : null;
    this.selectionPointIndexes = this.selection
      ? this._points.flatMap((point, index) => point.time >= low && point.time <= high ? [index] : [])
      : [];
    this.render();
  }

  size() {
    return { width: Math.max(1, this.surface.clientWidth || this.clientWidth || 1), height: Math.max(1, this.surface.clientHeight || this.clientHeight || 1) };
  }

  x(time, width = this.size().width) { return clamp(Number(time) / this.duration, 0, 1) * width; }
  y(value, height = this.size().height) { return envelopeValueToY(value, this.min, this.max, height, this.scale); }

  paintGrid(width, height) {
    this.gridElement.replaceChildren();
    this.gridElement.style.backgroundImage = 'none';
    this.gridElement.style.removeProperty('background-size');
    if (this.gridLines === 'off') return;
    const visibleStep = visibleEnvelopeGridStep(this.grid, this.duration, width);
    if (visibleStep) {
      this.gridElement.style.backgroundImage = 'linear-gradient(to right, var(--compost-envelope-grid) 1px, transparent 1px)';
      this.gridElement.style.backgroundSize = `${visibleStep / this.duration * 100}% 100%`;
    }
    if (this.gridLines === 'time') return;
    for (const value of envelopeValueGuides(this.min, this.max, {
      height, scale: this.scale, stepped: this.stepped, step: this.step,
    })) {
      const line = document.createElement('span');
      line.className = 'value-grid-line';
      line.dataset.value = String(value);
      line.style.top = `${this.y(value, height)}px`;
      this.gridElement.append(line);
    }
  }

  path(points, width, height) {
    if (!points.length) return '';
    const sorted = [...points].sort((a, b) => a.time - b.time);
    let path = `M 0 ${this.y(sorted[0].value, height)} L ${this.x(sorted[0].time, width)} ${this.y(sorted[0].value, height)}`;
    for (let index = 1; index < sorted.length; index += 1) {
      const before = sorted[index - 1];
      const after = sorted[index];
      path += this.segmentCommands(before, after, width, height);
    }
    path += ` H ${width}`;
    return path;
  }

  render(points = this._points) {
    if (!this.isConnected) return;
    const { width, height } = this.size();
    this.paintGrid(width, height);
    this.pointPreview.hidden = true;
    delete this.surface.dataset.hoverTarget;
    this.selectionMarquee.style.display = this.selection ? 'block' : 'none';
    if (this.selection) {
      this.selectionMarquee.style.left = `${this.selection.start / this.duration * 100}%`;
      this.selectionMarquee.style.width = `${(this.selection.end - this.selection.start) / this.duration * 100}%`;
      this.selectionMarquee.style.insetBlock = '0';
    }
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const path = this.path(points, width, height);
    this.lineHit.setAttribute('d', path);
    this.line.setAttribute('d', path);
    this.selectionHighlight.setAttribute('d', this.selectionPath(points, width, height));
    this.segmentHighlight.setAttribute('d', '');
    this.svg.querySelectorAll('.point').forEach((point) => point.remove());
    points.forEach((point, index) => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      marker.classList.add('point');
      marker.dataset.pointIndex = String(index);
      const x = this.x(point.time, width); const y = this.y(point.value, height);
      marker.setAttribute('transform', `translate(${x} ${y})`);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.classList.add('point-hit');
      hit.setAttribute('part', 'point-hit');
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      mark.classList.add('point-mark');
      mark.setAttribute('part', 'point');
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `${this.label} point ${Number(point.time).toFixed(2)} ${Number(point.value).toFixed(2)}`);
      marker.append(hit, mark);
      this.svg.append(marker);
    });
  }

  selectSection(start, end) {
    const low = Math.max(0, Math.min(start, end));
    const high = Math.min(this.duration, Math.max(start, end));
    this.selection = high > low ? { start: low, end: high } : null;
    this.selectionPointIndexes = this.selection
      ? this._points.flatMap((point, index) => point.time >= low && point.time <= high ? [index] : [])
      : [];
    this.render();
    this.selectionMarquee.style.display = 'block';
    this.selectionMarquee.style.left = `${low / this.duration * 100}%`;
    this.selectionMarquee.style.width = `${(high - low) / this.duration * 100}%`;
    this.selectionMarquee.style.insetBlock = '0';
  }

  segmentPath(index, points = this._points, width = this.size().width, height = this.size().height) {
    const before = points[index];
    const after = points[index + 1];
    if (!before || !after) return '';
    return `M ${this.x(before.time, width)} ${this.y(before.value, height)}${this.segmentCommands(before, after, width, height)}`;
  }

  selectionPath(points, width, height) {
    if (!this.selection) return '';
    const selected = sliceEnvelopeRange(points, this.selection.start, this.selection.end,
      this.min, this.max, this.scale, this.stepped);
    if (selected.length < 2) return '';
    let path = `M ${this.x(selected[0].time, width)} ${this.y(selected[0].value, height)}`;
    for (let index = 1; index < selected.length; index += 1) {
      path += this.segmentCommands(selected[index - 1], selected[index], width, height);
    }
    return path;
  }

  segmentCommands(before, after, width, height) {
    if (this.stepped) {
      return ` H ${this.x(after.time, width)} V ${this.y(after.value, height)}`;
    }
    const curve = Number(before.curve) || 0;
    if (Math.abs(curve) < 1e-9 && this.scale === 'linear') {
      return ` L ${this.x(after.time, width)} ${this.y(after.value, height)}`;
    }
    let path = '';
    for (let index = 1; index <= 24; index += 1) {
      const position = index / 24;
      const curved = envelopeCurvePosition(position, curve);
      const time = before.time + (after.time - before.time) * position;
      const value = before.value + (after.value - before.value) * curved;
      path += ` L ${this.x(time, width)} ${this.y(value, height)}`;
    }
    return path;
  }

  pointFromEvent(event) {
    const marker = event.composedPath().find((node) => node instanceof Element && node.classList.contains('point'));
    return marker instanceof Element ? { marker, index: Number(marker.dataset.pointIndex) } : null;
  }

  timeAtPointer(event, free = false) {
    const rect = this.surface.getBoundingClientRect();
    const raw = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * this.duration, 0, this.duration);
    if (free || !this.grid) return raw;
    return clamp(Math.round(raw / this.grid) * this.grid, 0, this.duration);
  }

  freeTime(event) {
    if (!this.grid) return true;
    const modifier = event.metaKey || event.ctrlKey;
    return this.snapMode === 'off' ? !modifier : modifier;
  }

  valueAtPointer(event) {
    const rect = this.surface.getBoundingClientRect();
    return snapEnvelopeValue(
      envelopeValueFromY(event.clientY - rect.top, this.min, this.max, rect.height, this.scale),
      this.min,
      this.max,
      this.step,
    );
  }

  segmentIndex(time) {
    if (this._points.length < 2) return 0;
    for (let index = 0; index < this._points.length - 1; index += 1) {
      if (time >= this._points[index].time && time <= this._points[index + 1].time) return index;
    }
    return time < this._points[0].time ? 0 : this._points.length - 2;
  }

  curveTargetAtPointer(event) {
    if (!this._points.length) return null;
    const rect = this.surface.getBoundingClientRect();
    const rawTime = this.timeAtPointer(event, true);
    const curveY = this.y(envelopeValueAtTime(this._points, rawTime,
      this.min, this.max, this.scale, this.stepped), rect.height);
    const distance = event.clientY - rect.top - curveY;
    if (Math.abs(distance) <= POINT_PREVIEW_DISTANCE) {
      const time = this.timeAtPointer(event, this.freeTime(event));
      return {
        kind: 'point',
        time,
        value: envelopeValueAtTime(this._points, time,
          this.min, this.max, this.scale, this.stepped),
      };
    }
    const first = this._points[0].time;
    const last = this._points.at(-1).time;
    if (distance > POINT_PREVIEW_DISTANCE && distance <= SEGMENT_HANDLE_DISTANCE
        && rawTime >= first && rawTime <= last) {
      return { kind: 'segment', time: rawTime };
    }
    return null;
  }

  startPointer(event) {
    if (this.hasAttribute('disabled') || this.hasAttribute('readonly') || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    let point = this.pointFromEvent(event);
    let origin = this.points;
    let createdOnDoubleTap = false;
    if (event.pointerType === 'touch' && event.isPrimary) {
      const now = performance.now();
      const previous = this.lastTouchTap;
      const doubleTap = !this.draw && previous && now - previous.time <= DOUBLE_TAP_MS
        && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_DISTANCE;
      if (doubleTap) {
        this.lastTouchTap = null;
        this.touchTapStart = null;
        this.suppressDoubleClickUntil = now + DOUBLE_TAP_MS;
        const edit = this.addAtPointer(event, point?.index ?? -1,
          point ? 'envelope-change' : 'envelope-input');
        if (!edit || point) return;
        origin = edit.points;
        point = { index: edit.pointIndex };
        createdOnDoubleTap = true;
        this.render(origin);
      } else {
        this.touchTapStart = { pointerId: event.pointerId, x: event.clientX,
          y: event.clientY, time: now };
      }
    }
    const rawTime = this.timeAtPointer(event, true);
    const time = this.timeAtPointer(event, this.freeTime(event));
    const curveTarget = point ? null : this.curveTargetAtPointer(event);
    const selectedPoint = point && this.selectionPointIndexes.includes(point.index);
    const mode = this.draw ? 'draw'
      : selectedPoint ? 'range'
        : point ? 'point'
          : curveTarget?.kind === 'segment' ? 'segment'
            : curveTarget?.kind === 'point' ? 'insert' : 'selection';
    this.drag = {
      pointerId: event.pointerId,
      mode,
      pointIndex: point?.index ?? -1,
      segmentIndex: this.segmentIndex(curveTarget?.time ?? time),
      startX: event.clientX,
      startY: event.clientY,
      startTime: time,
      originSelection: this.selection ? { ...this.selection } : null,
      originSelectionPointIndexes: [...this.selectionPointIndexes],
      origin,
      samples: [{ time, value: this.valueAtPointer(event) }],
      clickPoint: curveTarget?.kind === 'point' ? curveTarget : null,
      moved: false,
      pressedSeen: (event.buttons & 1) === 1,
      freehand: this.freeTime(event),
      deletePoint: Boolean(point && event.altKey),
      created: createdOnDoubleTap,
    };
    this.segmentHighlight.setAttribute('d', '');
    this.pointPreview.hidden = true;
    delete this.surface.dataset.hoverTarget;
    this.longPress.cancel();
    if (!createdOnDoubleTap) this.longPress.start(() => {
      if (!this.drag || this.drag.pointerId !== event.pointerId || this.drag.moved) return;
      const pointValue = point ? this._points[point.index] : null;
      this.dispatchEvent(eventOf('envelope-context', {
        pointIndex: point?.index ?? -1,
        time: pointValue?.time ?? time,
        value: pointValue?.value ?? this.valueAtPointer(event),
        clientX: event.clientX,
        clientY: event.clientY,
      }));
      this.cancelPointer();
    });
    if (point) point.marker?.focus?.({ preventScroll: true });
    else this.focus({ preventScroll: true });
    this.surface.setPointerCapture?.(event.pointerId);
    if (mode !== 'selection') this.setAttribute('data-preview', '');
  }

  movePointer(event) {
    event.stopPropagation();
    const drag = this.drag;
    if (!drag) {
      const point = this.pointFromEvent(event);
      const curveTarget = point ? null : this.curveTargetAtPointer(event);
      if (!point && !curveTarget) {
        this.readout.hidden = true;
        this.segmentHighlight.setAttribute('d', '');
        this.pointPreview.hidden = true;
        delete this.surface.dataset.hoverTarget;
        return;
      }
      const time = point ? this._points[point.index]?.time : curveTarget.time;
      const value = point ? this._points[point.index]?.value
        : envelopeValueAtTime(this._points, time, this.min, this.max, this.scale, this.stepped);
      this.segmentHighlight.setAttribute('d', curveTarget?.kind === 'segment'
        ? this.segmentPath(this.segmentIndex(time))
        : '');
      this.pointPreview.hidden = curveTarget?.kind !== 'point';
      if (curveTarget?.kind === 'point') {
        this.pointPreview.setAttribute('transform', `translate(${this.x(time)} ${this.y(value)})`);
      }
      if (curveTarget) this.surface.dataset.hoverTarget = curveTarget.kind;
      else delete this.surface.dataset.hoverTarget;
      if (Number.isFinite(time) && Number.isFinite(value)) this.showReadout(time, value, false);
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    if (event.buttons & 1) drag.pressedSeen = true;
    else if (drag.pressedSeen && event.pointerType !== 'touch') {
      // The primary button was released out where the release never arrived;
      // finalize the gesture instead of letting the point keep following.
      this.endPointer(event);
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.moved ||= Math.hypot(dx, dy) >= DRAG_SLOP;
    if (drag.moved) this.longPress.cancel();
    if (!drag.moved && drag.mode !== 'draw') return;
    const rect = this.surface.getBoundingClientRect();
    const factor = event.shiftKey ? .25 : 1;
    drag.freehand = this.freeTime(event);
    const time = this.timeAtPointer(event, drag.freehand);
    if (drag.mode === 'selection') {
      this.selectSection(drag.startTime, time);
      return;
    }
    if (drag.mode === 'insert') return;
    const options = { min: this.min, max: this.max, height: rect.height, scale: this.scale, stepped: this.stepped, step: this.step };
    let points = drag.origin;
    let readoutTime = time;
    let readoutValue = this.valueAtPointer(event);
    if (drag.mode === 'point') {
      const origin = drag.origin[drag.pointIndex];
      points = moveEnvelopePoint(drag.origin, drag.pointIndex, {
        time: origin.time + (time - origin.time) * factor,
        value: moveEnvelopePointsByY([origin], [0], dy * factor, options)[0].value,
      }, this.min, this.max);
      readoutTime = points[drag.pointIndex].time;
      readoutValue = points[drag.pointIndex].value;
      points = preserveEnvelopeEdgePoints(drag.origin, points, drag.pointIndex);
    } else if (drag.mode === 'segment') {
      if (event.altKey && !this.stepped) {
        const before = drag.origin[drag.segmentIndex];
        const after = drag.origin[drag.segmentIndex + 1];
        const direction = Math.sign(after.value - before.value);
        const curve = clamp((Number(before.curve) || 0)
          + dy / Math.max(1, rect.height) * 2 * direction, -1, 1);
        points = drag.origin.map((point, index) => index === drag.segmentIndex
          ? { ...point, curve: Math.abs(curve) < 1e-9 ? 0 : curve }
          : { ...point });
        readoutTime = (before.time + after.time) / 2;
        readoutValue = envelopeValueAtTime(points, readoutTime,
          this.min, this.max, this.scale, this.stepped);
      } else {
        points = moveEnvelopePointsByY(drag.origin,
          [drag.segmentIndex, drag.segmentIndex + 1], dy * factor, options);
      }
    } else if (drag.mode === 'range') {
      const selection = drag.originSelection;
      const indexes = drag.originSelectionPointIndexes;
      const selected = new Set(indexes);
      const deltaTime = clamp((time - drag.startTime) * factor,
        -selection.start, this.duration - selection.end);
      const tagged = moveEnvelopePointsByY(drag.origin, indexes, dy * factor, options)
        .map((point, index) => ({
          point: selected.has(index) ? { ...point, time: point.time + deltaTime } : point,
          selected: selected.has(index),
        }))
        .sort((a, b) => a.point.time - b.point.time);
      points = tagged.map(({ point }) => point);
      drag.previewSelectionPointIndexes = tagged.flatMap(({ selected: isSelected }, index) => isSelected ? [index] : []);
      drag.previewSelection = {
        start: selection.start + deltaTime,
        end: selection.end + deltaTime,
      };
      this.selection = drag.previewSelection;
      this.selectionPointIndexes = drag.previewSelectionPointIndexes;
    } else {
      const sample = { time, value: this.valueAtPointer(event) };
      const previous = drag.samples.at(-1);
      if (!previous || previous.time !== sample.time || previous.value !== sample.value) drag.samples.push(sample);
      points = drawEnvelopePoints(drag.origin, drag.samples, {
        ...options,
        gridStep: this.grid,
        snap: drag.freehand ? 'off' : 'grid',
        freehand: drag.freehand,
        tolerance: 0,
      });
    }
    drag.preview = points;
    this.render(points);
    if (drag.mode === 'segment') {
      this.segmentHighlight.setAttribute('d', this.segmentPath(drag.segmentIndex, points));
    }
    this.showReadout(readoutTime, readoutValue, false);
    this.dispatchEvent(eventOf('envelope-input', { points: points.map((point) => ({ ...point })) }));
  }

  endPointer(event) {
    this.finishTouchTap(event);
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    this.drag = null;
    this.longPress.cancel();
    this.removeAttribute('data-preview');
    this.readout.hidden = true;
    if (drag.mode === 'selection') {
      if (!drag.moved) this.setSelection();
      this.dispatchSelection();
      return;
    }
    if (!drag.moved && drag.mode !== 'draw') {
      this.render();
      if (drag.deletePoint) {
        this.dispatchEvent(eventOf('envelope-change', {
          points: deleteEnvelopePoint(drag.origin, drag.pointIndex),
        }));
      } else if (drag.created) {
        this.dispatchEvent(eventOf('envelope-change', {
          points: drag.origin.map((point) => ({ ...point })),
        }));
      } else if (drag.clickPoint) {
        this.suppressDoubleClickUntil = performance.now() + DOUBLE_TAP_MS;
        this.dispatchEvent(eventOf('envelope-change', {
          points: splitEnvelopeAtTime(drag.origin, drag.clickPoint.time,
            this.min, this.max, this.scale, this.stepped),
        }));
      }
      return;
    }
    if (drag.mode === 'insert') {
      this.render();
      return;
    }
    let points = drag.preview || drag.origin;
    if (drag.mode === 'draw') {
      points = drawEnvelopePoints(drag.origin, drag.samples, {
        min: this.min, max: this.max, height: this.size().height, scale: this.scale,
        stepped: this.stepped, step: this.step, gridStep: this.grid,
        snap: drag.freehand ? 'off' : 'grid', freehand: drag.freehand,
      });
    }
    if (drag.mode === 'range' && drag.previewSelection) this.dispatchSelection();
    this.render();
    this.dispatchEvent(eventOf('envelope-change', { points: points.map((point) => ({ ...point })) }));
  }

  cancelPointer() {
    this.longPress.cancel();
    this.touchTapStart = null;
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.removeAttribute('data-preview');
    this.readout.hidden = true;
    if (drag.mode === 'selection' || drag.mode === 'range') {
      this.selection = drag.originSelection;
      this.selectionPointIndexes = drag.originSelectionPointIndexes;
    }
    this.render();
  }

  finishTouchTap(event) {
    const start = this.touchTapStart;
    this.touchTapStart = null;
    if (!start || event.pointerType !== 'touch' || start.pointerId !== event.pointerId) return;
    const now = performance.now();
    if (now - start.time > DOUBLE_TAP_MS || this.drag?.moved
        || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_DISTANCE) {
      this.lastTouchTap = null;
      return;
    }
    this.lastTouchTap = { time: now, x: event.clientX, y: event.clientY };
  }

  addAtPointer(event, pointIndex = this.pointFromEvent(event)?.index ?? -1,
    eventType = 'envelope-change') {
    if (this.hasAttribute('disabled') || this.hasAttribute('readonly') || this.draw) return null;
    event.preventDefault();
    event.stopPropagation();
    const added = { time: this.timeAtPointer(event, this.freeTime(event)), value: this.valueAtPointer(event) };
    const points = pointIndex >= 0 ? deleteEnvelopePoint(this._points, pointIndex)
      : addEnvelopePoint(this._points, added, this.min, this.max);
    let addedIndex = -1;
    if (pointIndex < 0) for (let index = 0; index < points.length; ++index)
      if (points[index].time === added.time && points[index].value === added.value) addedIndex = index;
    this.dispatchEvent(eventOf(eventType, { points }));
    return { points, pointIndex: addedIndex };
  }

  openContext(event) {
    event.preventDefault();
    event.stopPropagation();
    const point = this.pointFromEvent(event);
    this.dispatchEvent(eventOf('envelope-context', {
      pointIndex: point?.index ?? -1,
      time: this.timeAtPointer(event, true),
      value: this.valueAtPointer(event),
      clientX: event.clientX,
      clientY: event.clientY,
    }));
  }

  handleKey(event) {
    const point = this.pointFromEvent(event);
    if (this.hasAttribute('disabled') || this.hasAttribute('readonly')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && this.selection) {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (!point) return;
    if (event.shiftKey && event.key === 'F10') {
      event.preventDefault();
      const rect = point.marker.getBoundingClientRect();
      const value = this._points[point.index];
      this.dispatchEvent(eventOf('envelope-context', {
        pointIndex: point.index,
        time: value.time,
        value: value.value,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
      return;
    }
    if (this.draw && (event.key === 'Delete' || event.key === 'Backspace' || event.key.startsWith('Arrow'))) {
      if (event.key.startsWith('Arrow')) event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      point.marker.blur?.();
      this.focus({ preventScroll: true });
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.dispatchEvent(eventOf('envelope-change', { points: deleteEnvelopePoint(this._points, point.index) }));
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const factor = event.shiftKey ? .25 : 1;
    const pointValue = this._points[point.index];
    const timeStep = (this.snapMode === 'off' || !this.grid ? this.duration * .01 : this.grid) * factor;
    const valueStep = (this.step || (this.max - this.min) * .01) * factor;
    const points = moveEnvelopePoint(this._points, point.index, {
      time: pointValue.time + direction[0] * timeStep,
      value: snapEnvelopeValue(pointValue.value + direction[1] * valueStep, this.min, this.max, this.step),
    }, this.min, this.max);
    this.dispatchEvent(eventOf('envelope-change', { points }));
  }

  showReadout(time, value, includeTime = true) {
    this.readout.hidden = false;
    this.readout.textContent = includeTime
      ? `${Number(time).toFixed(2)} · ${Number(value).toFixed(2)}`
      : Number(value).toFixed(2);
    this.readout.style.left = `${time / this.duration * 100}%`;
    this.readout.style.top = `${Math.max(this.y(value), this.readout.offsetHeight)}px`;
  }

  dispatchSelection() {
    this.dispatchEvent(eventOf('envelope-selection', this.selection
      ? { ...this.selection }
      : { start: null, end: null }));
  }

  duplicateSelection() {
    const { start, end } = this.selection;
    const length = end - start;
    const nextEnd = end + length;
    if (!(length > 0) || nextEnd > this.duration) return;
    const selected = sliceEnvelopeRange(this._points, start, end,
      this.min, this.max, this.scale, this.stepped);
    if (!selected.length) return;
    let source = splitEnvelopeAtTime(this._points, start,
      this.min, this.max, this.scale, this.stepped);
    source = splitEnvelopeAtTime(source, end,
      this.min, this.max, this.scale, this.stepped);
    const tagged = source
      .filter((point) => point.time <= end || point.time > nextEnd)
      .map((point) => ({ point: { ...point }, selected: false }));
    for (const point of selected) {
      const duplicate = { ...point, time: point.time + length };
      const existing = tagged.find((entry) => entry.point.time === duplicate.time
        && entry.point.value === duplicate.value);
      if (existing) {
        existing.point = duplicate;
        existing.selected = true;
      }
      else tagged.push({ point: duplicate, selected: true });
    }
    tagged.sort((a, b) => a.point.time - b.point.time);
    const points = tagged.map(({ point }) => point);
    this.selection = { start: end, end: nextEnd };
    this.selectionPointIndexes = tagged.flatMap(({ selected: isSelected }, index) => isSelected ? [index] : []);
    this.dispatchSelection();
    this.dispatchEvent(eventOf('envelope-change', { points }));
  }
}

defineElement('compost-envelope-editor', CompostEnvelopeEditor);
