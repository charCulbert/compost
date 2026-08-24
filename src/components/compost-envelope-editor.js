import {
  addEnvelopePoint,
  deleteEnvelopePoint,
  drawEnvelopePoints,
  effectiveEnvelopeStep,
  envelopeRange,
  envelopeValueAtTime,
  envelopeValueFromY,
  envelopeValueToY,
  moveEnvelopePoint,
  moveEnvelopePointsByY,
  moveEnvelopeRangeByY,
  preserveEnvelopeEdgePoints,
  snapEnvelopeValue,
} from '../envelope-model.js';
import { parameterScaleBreakpoints } from '../parameter-scale.js';
import { clamp, defineElement, numberAttr } from '../utils.js';

const DRAG_THRESHOLD = 3;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 24;
const TOUCH_TAP_MOVE_DISTANCE = 12;

const eventOf = (type, detail) => new CustomEvent(type, { bubbles: true, composed: true, detail });

/**
 * A generic time/value envelope surface. The caller owns the points and what
 * they mean; the editor only previews gestures and emits replacement arrays.
 */
export class CompostEnvelopeEditor extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'duration', 'min', 'max', 'scale', 'stepped', 'step', 'snap', 'grid', 'draw', 'readonly', 'disabled'];
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
    this.snapMode = 'grid';
    this.grid = .125;
    this.draw = false;
    this._points = [];
    this.selection = null;
    this.drag = null;
    this.longPressTimer = null;
    this.touchTapStart = null;
    this.lastTouchTap = null;
    this.suppressDoubleClickUntil = 0;
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.render()) : null;

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-envelope-bg: var(--compost-theme-bg, #1f1f1f);
          --compost-envelope-text: var(--compost-theme-text, #f2f2f2);
          --compost-envelope-muted: var(--compost-theme-muted, #aaaaaa);
          --compost-envelope-line: var(--compost-theme-line, rgba(255,255,255,.18));
          --compost-envelope-signal: var(--compost-theme-accent, #8ea9c7);
          --compost-envelope-point-bg: var(--compost-envelope-signal);
          --compost-envelope-point-border: var(--compost-envelope-bg);
          --compost-envelope-selection: color-mix(in srgb, var(--compost-envelope-signal) 12%, transparent);
          --compost-envelope-preview: var(--compost-theme-learn, #6fa8eb);
          --compost-envelope-radius: 0;
          --compost-envelope-grid-size: 1em;
          display: block;
          box-sizing: border-box;
          min-width: 0;
          min-height: 2.5em;
          overflow: hidden;
          border: 1px solid var(--compost-envelope-line);
          border-radius: var(--compost-envelope-radius);
          background: var(--compost-envelope-bg);
          color: var(--compost-envelope-text);
          font: inherit;
          outline: none;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([disabled]) { opacity: .55; pointer-events: none; }
        :host(:focus-visible) { box-shadow: inset 0 0 0 1px var(--compost-envelope-signal); }
        .surface { position: relative; width: 100%; height: 100%; min-height: inherit; touch-action: none; overflow: hidden; }
        .grid { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(to right, var(--compost-envelope-line) 1px, transparent 1px), linear-gradient(to bottom, var(--compost-envelope-line) 1px, transparent 1px); background-size: var(--compost-envelope-grid-size) var(--compost-envelope-grid-size); opacity: .22; }
        .selection { position: absolute; inset-block: 0; display: none; background: var(--compost-envelope-selection); border-inline: 1px solid var(--compost-envelope-signal); pointer-events: none; }
        svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
        .line { fill: none; stroke: var(--compost-envelope-signal); stroke-width: 1.25; vector-effect: non-scaling-stroke; pointer-events: stroke; cursor: ns-resize; }
        .line:hover { stroke-width: 1.75; }
        .point { cursor: grab; }
        .point-hit { fill: transparent; stroke: none; pointer-events: all; }
        .point-mark { fill: var(--compost-envelope-point-bg); stroke: var(--compost-envelope-point-border); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
        .point:hover .point-mark { transform: scale(1.3); transform-box: fill-box; transform-origin: center; }
        .point:focus-visible { outline: 1px solid var(--compost-envelope-signal); outline-offset: 2px; }
        :host([draw]) .surface { cursor: crosshair; }
        :host([data-preview]) .line { stroke: var(--compost-envelope-preview); }
        :host([data-preview]) .point-mark { fill: var(--compost-envelope-preview); }
        .readout { position: absolute; z-index: 2; transform: translate(-50%, -100%); padding: 2px 4px; background: var(--compost-envelope-bg); box-shadow: 0 0 0 1px var(--compost-envelope-line); color: var(--compost-envelope-text); font: .75em/1 ui-monospace, SFMono-Regular, Menlo, monospace; pointer-events: none; white-space: nowrap; }
      </style>
      <div class="surface" part="surface">
        <div class="grid" part="grid"></div>
        <div class="selection" part="selection"></div>
        <svg part="graph" aria-hidden="true"><path class="line" part="line"></path></svg>
        <span class="readout" part="readout" hidden></span>
      </div>
    `;
    this.surface = this.root.querySelector('.surface');
    this.svg = this.root.querySelector('svg');
    this.line = this.root.querySelector('.line');
    this.readout = this.root.querySelector('.readout');
    this.selectionElement = this.root.querySelector('.selection');

    this.surface.addEventListener('pointerdown', (event) => this.startPointer(event));
    this.surface.addEventListener('pointermove', (event) => this.movePointer(event));
    this.surface.addEventListener('pointerleave', () => { if (!this.drag) this.readout.hidden = true; });
    this.surface.addEventListener('pointerup', (event) => this.endPointer(event));
    this.surface.addEventListener('pointercancel', () => this.cancelPointer());
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
    this.snapMode = this.getAttribute('snap') === 'off' ? 'off' : 'grid';
    this.grid = Math.max(1e-9, numberAttr(this, 'grid', this.grid));
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
    this.render();
  }

  setPoints(points) { this.points = points; }

  setSelection(start, end) {
    const low = Math.max(0, Math.min(Number(start), Number(end)));
    const high = Math.min(this.duration, Math.max(Number(start), Number(end)));
    this.selection = Number.isFinite(low) && Number.isFinite(high) && high > low ? { start: low, end: high } : null;
    this.paintSelection();
  }

  size() {
    return { width: Math.max(1, this.surface.clientWidth || this.clientWidth || 1), height: Math.max(1, this.surface.clientHeight || this.clientHeight || 1) };
  }

  x(time, width = this.size().width) { return clamp(Number(time) / this.duration, 0, 1) * width; }
  y(value, height = this.size().height) { return envelopeValueToY(value, this.min, this.max, height, this.scale); }

  path(points, width, height) {
    if (!points.length) return '';
    const sorted = [...points].sort((a, b) => a.time - b.time);
    let path = `M 0 ${this.y(sorted[0].value, height)} L ${this.x(sorted[0].time, width)} ${this.y(sorted[0].value, height)}`;
    for (let index = 1; index < sorted.length; index += 1) {
      const before = sorted[index - 1];
      const after = sorted[index];
      if (this.stepped) path += ` H ${this.x(after.time, width)}`;
      else {
        if (this.scale === 'gain' && after.value !== before.value) {
          const turns = parameterScaleBreakpoints({ min: this.min, max: this.max, curve: 'gain' })
            .filter((value) => (value - before.value) * (value - after.value) < 0)
            .map((value) => ({
              time: before.time + (after.time - before.time) * (value - before.value) / (after.value - before.value),
              value,
            }))
            .sort((a, b) => a.time - b.time);
          for (const turn of turns) path += ` L ${this.x(turn.time, width)} ${this.y(turn.value, height)}`;
        }
        path += ` L ${this.x(after.time, width)} ${this.y(after.value, height)}`;
      }
    }
    path += ` H ${width}`;
    return path;
  }

  render(points = this._points) {
    if (!this.isConnected) return;
    const { width, height } = this.size();
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.line.setAttribute('d', this.path(points, width, height));
    this.svg.querySelectorAll('.point').forEach((point) => point.remove());
    points.forEach((point, index) => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      marker.classList.add('point');
      marker.dataset.pointIndex = String(index);
      const x = this.x(point.time, width); const y = this.y(point.value, height);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.classList.add('point-hit');
      hit.setAttribute('part', 'point-hit');
      hit.setAttribute('x', String(x - 11)); hit.setAttribute('y', String(y - 11));
      hit.setAttribute('width', '22'); hit.setAttribute('height', '22');
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      mark.classList.add('point-mark');
      mark.setAttribute('part', 'point');
      mark.setAttribute('x', String(x - 2.5)); mark.setAttribute('y', String(y - 2.5));
      mark.setAttribute('width', '5'); mark.setAttribute('height', '5');
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `${this.label} point ${Number(point.time).toFixed(2)} ${Number(point.value).toFixed(2)}`);
      marker.append(hit, mark);
      this.svg.append(marker);
    });
    this.paintSelection();
  }

  paintSelection() {
    if (!this.selectionElement) return;
    if (!this.selection) {
      this.selectionElement.style.display = 'none';
      return;
    }
    this.selectionElement.style.display = 'block';
    this.selectionElement.style.left = `${this.selection.start / this.duration * 100}%`;
    this.selectionElement.style.width = `${(this.selection.end - this.selection.start) / this.duration * 100}%`;
  }

  pointFromEvent(event) {
    const marker = event.composedPath().find((node) => node instanceof Element && node.classList.contains('point'));
    return marker instanceof Element ? { marker, index: Number(marker.dataset.pointIndex) } : null;
  }

  timeAtPointer(event, free = false) {
    const rect = this.surface.getBoundingClientRect();
    const raw = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * this.duration, 0, this.duration);
    if (free || this.snapMode === 'off') return raw;
    return clamp(Math.round(raw / this.grid) * this.grid, 0, this.duration);
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

  startPointer(event) {
    if (this.hasAttribute('disabled') || this.hasAttribute('readonly') || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.pointFromEvent(event);
    if (event.pointerType === 'touch' && event.isPrimary) {
      this.touchTapStart = { pointerId: event.pointerId, x: event.clientX,
        y: event.clientY, time: performance.now(), pointIndex: point?.index ?? -1 };
    }
    const rawTime = this.timeAtPointer(event, true);
    const time = this.timeAtPointer(event, event.altKey);
    const mode = this.draw ? 'draw'
      : point ? 'point'
        : this.selection && rawTime >= this.selection.start && rawTime <= this.selection.end ? 'range' : 'segment';
    if (!this.draw && !point && !event.composedPath().includes(this.line)) return;
    const rect = this.surface.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      mode,
      pointIndex: point?.index ?? -1,
      segmentIndex: this.segmentIndex(time),
      startX: event.clientX,
      startY: event.clientY,
      startLocalY: event.clientY - rect.top,
      origin: this.points,
      samples: [{ time, value: this.valueAtPointer(event) }],
      moved: false,
      freehand: event.altKey || this.snapMode === 'off',
    };
    clearTimeout(this.longPressTimer);
    this.longPressTimer = setTimeout(() => {
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
    }, 550);
    point?.marker.focus?.({ preventScroll: true });
    this.surface.setPointerCapture?.(event.pointerId);
    this.setAttribute('data-preview', '');
  }

  movePointer(event) {
    event.stopPropagation();
    const drag = this.drag;
    if (!drag) {
      const point = this.pointFromEvent(event);
      if (!point && !event.composedPath().includes(this.line)) {
        this.readout.hidden = true;
        return;
      }
      const time = point ? this._points[point.index]?.time : this.timeAtPointer(event, true);
      const value = point ? this._points[point.index]?.value
        : envelopeValueAtTime(this._points, time, this.min, this.max, this.scale, this.stepped);
      if (Number.isFinite(time) && Number.isFinite(value)) this.showReadout(time, value);
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.moved ||= Math.hypot(dx, dy) >= DRAG_THRESHOLD;
    if (drag.moved) clearTimeout(this.longPressTimer);
    if (!drag.moved && drag.mode !== 'draw') return;
    const rect = this.surface.getBoundingClientRect();
    const factor = event.shiftKey ? .25 : 1;
    const time = this.timeAtPointer(event, event.altKey || drag.freehand);
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
      points = moveEnvelopePointsByY(drag.origin, [drag.segmentIndex, drag.segmentIndex + 1], dy * factor, options);
    } else if (drag.mode === 'range') {
      points = moveEnvelopeRangeByY(drag.origin, this.selection.start, this.selection.end, dy * factor, options);
    } else {
      const sample = { time, value: this.valueAtPointer(event) };
      const previous = drag.samples.at(-1);
      if (!previous || previous.time !== sample.time || previous.value !== sample.value) drag.samples.push(sample);
      drag.freehand ||= event.altKey;
      points = drawEnvelopePoints(drag.origin, drag.samples, {
        ...options,
        gridStep: this.grid,
        snap: drag.freehand ? 'off' : this.snapMode,
        freehand: drag.freehand,
        tolerance: 0,
      });
    }
    drag.preview = points;
    this.render(points);
    this.showReadout(readoutTime, readoutValue);
    this.dispatchEvent(eventOf('envelope-input', { points: points.map((point) => ({ ...point })) }));
  }

  endPointer(event) {
    const touchDoubleTap = this.finishTouchTap(event);
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      if (touchDoubleTap) this.addAtPointer(event, touchDoubleTap.pointIndex);
      return;
    }
    event.stopPropagation();
    this.drag = null;
    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.removeAttribute('data-preview');
    this.readout.hidden = true;
    if (!drag.moved && drag.mode !== 'draw') {
      this.render();
      if (touchDoubleTap) this.addAtPointer(event, touchDoubleTap.pointIndex);
      return;
    }
    let points = drag.preview || drag.origin;
    if (drag.mode === 'draw') {
      points = drawEnvelopePoints(drag.origin, drag.samples, {
        min: this.min, max: this.max, height: this.size().height, scale: this.scale,
        stepped: this.stepped, step: this.step, gridStep: this.grid,
        snap: drag.freehand ? 'off' : this.snapMode, freehand: drag.freehand,
      });
    }
    this.render();
    this.dispatchEvent(eventOf('envelope-change', { points: points.map((point) => ({ ...point })) }));
  }

  cancelPointer() {
    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.touchTapStart = null;
    if (!this.drag) return;
    this.drag = null;
    this.removeAttribute('data-preview');
    this.readout.hidden = true;
    this.render();
  }

  finishTouchTap(event) {
    const start = this.touchTapStart;
    this.touchTapStart = null;
    if (!start || event.pointerType !== 'touch' || start.pointerId !== event.pointerId) return null;
    const now = performance.now();
    if (now - start.time > DOUBLE_TAP_MS || this.drag?.moved
        || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TOUCH_TAP_MOVE_DISTANCE) {
      this.lastTouchTap = null;
      return null;
    }
    const previous = this.lastTouchTap;
    this.lastTouchTap = { time: now, x: event.clientX, y: event.clientY };
    if (!previous || now - previous.time > DOUBLE_TAP_MS
        || Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > DOUBLE_TAP_DISTANCE) return null;
    this.lastTouchTap = null;
    this.suppressDoubleClickUntil = now + DOUBLE_TAP_MS;
    return { pointIndex: start.pointIndex };
  }

  addAtPointer(event, pointIndex = this.pointFromEvent(event)?.index ?? -1) {
    if (this.hasAttribute('disabled') || this.hasAttribute('readonly') || this.draw) return;
    event.preventDefault();
    event.stopPropagation();
    const points = pointIndex >= 0
      ? deleteEnvelopePoint(this._points, pointIndex)
      : addEnvelopePoint(this._points, {
        time: this.timeAtPointer(event, event.altKey),
        value: this.valueAtPointer(event),
      }, this.min, this.max);
    this.dispatchEvent(eventOf('envelope-change', { points }));
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
    if (!point || this.hasAttribute('disabled') || this.hasAttribute('readonly')) return;
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
    const timeStep = (this.snapMode === 'off' ? this.duration * .01 : this.grid) * factor;
    const valueStep = (this.step || (this.max - this.min) * .01) * factor;
    const points = moveEnvelopePoint(this._points, point.index, {
      time: pointValue.time + direction[0] * timeStep,
      value: snapEnvelopeValue(pointValue.value + direction[1] * valueStep, this.min, this.max, this.step),
    }, this.min, this.max);
    this.dispatchEvent(eventOf('envelope-change', { points }));
  }

  showReadout(time, value) {
    this.readout.hidden = false;
    this.readout.textContent = `${Number(time).toFixed(2)} · ${Number(value).toFixed(2)}`;
    this.readout.style.left = `${time / this.duration * 100}%`;
    this.readout.style.top = `${this.y(value)}px`;
  }
}

defineElement('compost-envelope-editor', CompostEnvelopeEditor);
