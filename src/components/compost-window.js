import { clamp, defineElement, numberAttr } from '../utils.js';

let nextWindowID = 1;
let topZIndex = 0;

/**
 * Where a window goes when asked to move: the whole frame stays inside the
 * viewport, so every part of it is always reachable.
 * @param {{x: number, y: number, width: number, height: number,
 *   viewportWidth: number, viewportHeight: number}} request
 */
export function boundedPosition({ x, y, width, height, viewportWidth, viewportHeight }) {
  return {
    x: clamp(x, 0, Math.max(0, viewportWidth - width)),
    y: clamp(y, 0, Math.max(0, viewportHeight - height)),
  };
}

/**
 * Rounds a requested content size to one the window allows: inside the
 * minimum and maximum, inside the viewport, and — when an aspect ratio is
 * fixed — following whichever edge moved further so the frame tracks the
 * drag instead of fighting it.
 * @param {{width: number, height: number, current: {width: number, height: number},
 *   minWidth: number, minHeight: number, maxWidth: number, maxHeight: number,
 *   aspectRatio?: number|null, axis?: 'both'|'horizontal'|'vertical'|'none'}} request
 */
export function constrainedSize({
  width, height, current, minWidth, minHeight, maxWidth, maxHeight,
  aspectRatio = null, axis = 'both',
}) {
  let nextWidth = axis === 'vertical' || axis === 'none' ? current.width : width;
  let nextHeight = axis === 'horizontal' || axis === 'none' ? current.height : height;
  if (aspectRatio && aspectRatio > 0 && Number.isFinite(aspectRatio)) {
    if (Math.abs(nextWidth - current.width) >= Math.abs(nextHeight - current.height)) {
      nextHeight = nextWidth / aspectRatio;
    } else {
      nextWidth = nextHeight * aspectRatio;
    }
  }
  const boundedWidth = clamp(nextWidth, minWidth, Math.max(minWidth, maxWidth));
  const boundedHeight = clamp(nextHeight, minHeight, Math.max(minHeight, maxHeight));
  if (aspectRatio && aspectRatio > 0 && Number.isFinite(aspectRatio)) {
    // a bound on one side pulls the other back into ratio
    if (boundedWidth !== nextWidth) {
      return { width: Math.round(boundedWidth), height: Math.round(boundedWidth / aspectRatio) };
    }
    if (boundedHeight !== nextHeight) {
      return { width: Math.round(boundedHeight * aspectRatio), height: Math.round(boundedHeight) };
    }
  }
  return { width: Math.round(boundedWidth), height: Math.round(boundedHeight) };
}

/** @param {string|null} value */
function parseAspectRatio(value) {
  if (value === null || value === '') return null;
  const text = String(value).trim();
  if (text.includes('/')) {
    const [w, h] = text.split('/').map((part) => Number(part.trim()));
    return w > 0 && h > 0 ? w / h : null;
  }
  const number = Number(text);
  return number > 0 && Number.isFinite(number) ? number : null;
}

/**
 * A floating window: a header with a title and a close control, dragged
 * by the header, resized from a corner grip, and never allowed past the
 * viewport's edges. The content is whatever is slotted in — a plug-in's own
 * interface, a keyboard, a panel. `width` and `height` name the content
 * size, which is what a plug-in negotiates; the frame adds its own chrome.
 */
export class CompostWindow extends HTMLElement {
  static get observedAttributes() {
    return [
      'open', 'heading', 'x', 'y', 'width', 'height',
      'min-width', 'min-height', 'max-width', 'max-height',
      'aspect-ratio', 'resizable', 'fullscreen', 'sheet', 'static',
    ];
  }

  constructor() {
    super();

    this.windowID = `compost-window-${nextWindowID++}`;
    this.minWidth = 200;
    this.minHeight = 120;
    this.maxWidth = Infinity;
    this.maxHeight = Infinity;
    /** @type {number|null} */ this.aspectRatio = null;
    /** @type {{pointerId: number, x: number, y: number, left: number, top: number}|null} */
    this.drag = null;
    /** @type {{pointerId: number, x: number, y: number, width: number, height: number}|null} */
    this.resize = null;
    this.handleViewportResize = this.handleViewportResize.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-window-bg: Canvas;
          --compost-window-text: currentColor;
          --compost-window-muted: color-mix(in srgb, currentColor 65%, transparent);
          --compost-window-border: color-mix(in srgb, currentColor 30%, transparent);
          --compost-window-header-height: 2em;
          --compost-window-header-font-size: .875em;
          --compost-window-close-color: currentColor;
          --compost-window-close-hover-color: currentColor;
          --compost-window-grip-color: color-mix(in srgb, currentColor 65%, transparent);
          --compost-window-focus: currentColor;
          --compost-window-z-index: 900;
          position: fixed;
          left: 0;
          top: 0;
          z-index: var(--compost-window-z-index);
          box-sizing: border-box;
          display: none;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          max-width: 100vw;
          max-height: 100vh;
          background: var(--compost-window-bg);
          color: var(--compost-window-text);
          border: 1px solid var(--compost-window-border);
          font: inherit;
          outline: none;
        }
        :host([open]) { display: flex; }
        :host(:focus-visible) { outline: 2px solid var(--compost-window-focus); outline-offset: -2px; }
        header {
          flex: none;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 0.6em;
          height: var(--compost-window-header-height);
          padding: 0 0 0 .7em;
          border-bottom: 1px solid var(--compost-window-border);
          background: color-mix(in srgb, currentColor 6%, transparent);
          color: var(--compost-window-muted);
          font-size: var(--compost-window-header-font-size);
          cursor: move;
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
        }
        :host([static]) header { cursor: default; }
        .title {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .close {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-width: var(--compost-window-control-min, 0px);
          min-height: var(--compost-window-control-min, 0px);
          width: 2em;
          height: 100%;
          padding: 0;
          border: 0;
          background: none;
          color: var(--compost-window-close-color);
          cursor: pointer;
          font: inherit;
        }
        /* whatever a host slots into the bar is a target too, not just the close box */
        ::slotted([slot="controls"]) {
          min-height: var(--compost-window-control-min, 0px);
          display: flex;
          align-items: center;
        }
        .close:hover { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--compost-window-close-hover-color); }
        .close:focus-visible { outline: 2px solid var(--compost-window-focus); outline-offset: -2px; }
        .content {
          flex: 1 1 auto;
          min-width: 0;
          min-height: 0;
          position: relative;
          overflow: hidden;
        }
        .grip {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 1.2em;
          height: 1.2em;
          cursor: nwse-resize;
          touch-action: none;
          z-index: 2;
        }
        .grip::after {
          content: "";
          position: absolute;
          right: 0.25em;
          bottom: 0.25em;
          width: 0.55em;
          height: 0.55em;
          border-right: 1px solid var(--compost-window-grip-color);
          border-bottom: 1px solid var(--compost-window-grip-color);
          opacity: 0.7;
        }
        :host([resizable="none"]) .grip, :host([fullscreen]) .grip { display: none; }
        :host([resizable="horizontal"]) .grip { cursor: ew-resize; }
        :host([resizable="vertical"]) .grip { cursor: ns-resize; }
        /* on a small screen the window takes the screen, less nothing */
        :host([fullscreen]) {
          left: 0 !important;
          top: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: none;
          max-height: none;
        }
        :host([fullscreen]) header, :host([sheet]) header { cursor: default; }
        /* a sheet keeps the bottom of the screen and grows upward: for a phone
           keyboard or a picker, where taking the whole screen buys nothing */
        :host([sheet]) {
          left: 0 !important;
          right: 0;
          top: auto !important;
          bottom: 0;
          width: 100vw !important;
          height: auto;
          max-width: none;
        }
        :host([sheet]) .grip { display: none; }
        /* the bar clears the notch when the frame owns an edge of the screen */
        :host([fullscreen]) header, :host([sheet]) header {
          height: calc(var(--compost-window-header-height) + env(safe-area-inset-top, 0px));
          padding-top: env(safe-area-inset-top, 0px);
        }
        :host([sheet]) header {
          height: var(--compost-window-header-height);
          padding-top: 0;
        }
        :host([sheet]) .content { padding-bottom: env(safe-area-inset-bottom, 0px); }
      </style>
      <header part="header">
        <slot name="title"><span class="title" part="title"></span></slot>
        <slot name="controls"></slot>
        <button class="close" part="close" type="button" aria-label="Close">&times;</button>
      </header>
      <div class="content" part="content"><slot></slot></div>
      <div class="grip" part="grip" aria-hidden="true"></div>`;

    this.header = /** @type {HTMLElement} */ (this.root.querySelector('header'));
    this.titleElement = /** @type {HTMLElement} */ (this.root.querySelector('.title'));
    this.closeButton = /** @type {HTMLButtonElement} */ (this.root.querySelector('.close'));
    this.content = /** @type {HTMLElement} */ (this.root.querySelector('.content'));
    this.grip = /** @type {HTMLElement} */ (this.root.querySelector('.grip'));

    this.closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.requestClose('button');
    });
    this.header.addEventListener('pointerdown', (event) => this.beginDrag(event));
    this.header.addEventListener('pointermove', (event) => this.moveDrag(event));
    this.header.addEventListener('pointerup', (event) => this.endDrag(event));
    this.header.addEventListener('pointercancel', (event) => this.endDrag(event));
    this.grip.addEventListener('pointerdown', (event) => this.beginResize(event));
    this.grip.addEventListener('pointermove', (event) => this.moveResize(event));
    this.grip.addEventListener('pointerup', (event) => this.endResize(event));
    this.grip.addEventListener('pointercancel', (event) => this.endResize(event));
    this.addEventListener('pointerdown', () => this.raise());
    this.addEventListener('focusin', () => this.raise());
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
    this.setAttribute('role', 'dialog');
    this.readAttributes();
    this.refresh();
    window.addEventListener('resize', this.handleViewportResize);
    if (this.hasAttribute('open')) this.raise();
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.handleViewportResize);
  }

  /** @param {string} name */
  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    this.readAttributes();
    if (name === 'open' && this.hasAttribute('open')) {
      this.raise();
      this.dispatchEvent(new CustomEvent('window-open', { bubbles: true, composed: true }));
    }
    this.refresh();
  }

  readAttributes() {
    this.minWidth = Math.max(0, numberAttr(this, 'min-width', 200));
    this.minHeight = Math.max(0, numberAttr(this, 'min-height', 120));
    this.maxWidth = numberAttr(this, 'max-width', Infinity);
    this.maxHeight = numberAttr(this, 'max-height', Infinity);
    this.aspectRatio = parseAspectRatio(this.getAttribute('aspect-ratio'));
  }

  get open() {
    return this.hasAttribute('open');
  }

  set open(value) {
    this.toggleAttribute('open', Boolean(value));
  }

  get heading() {
    return this.getAttribute('heading') ?? '';
  }

  set heading(value) {
    this.setAttribute('heading', String(value ?? ''));
  }

  get resizable() {
    const value = this.getAttribute('resizable');
    return value === 'horizontal' || value === 'vertical' || value === 'none' ? value : 'both';
  }

  /** Pixels the frame adds around the content: the header, and any border. */
  chromeSize() {
    return {
      width: Math.max(0, this.offsetWidth - this.content.clientWidth),
      height: Math.max(0, this.offsetHeight - this.content.clientHeight),
    };
  }

  /** The content box's size, in CSS pixels. */
  get contentSize() {
    return { width: this.content.clientWidth, height: this.content.clientHeight };
  }

  // ---- Geometry -----------------------------------------------------------

  /** Sizes the content box, keeping the frame inside the viewport and the bounds. */
  /** @param {number} width @param {number} height @param {{emit?: boolean}} [options] */
  setContentSize(width, height, { emit = false } = {}) {
    const chrome = this.chromeSize();
    const size = constrainedSize({
      width, height, current: this.contentSize,
      minWidth: this.minWidth, minHeight: this.minHeight,
      maxWidth: Math.min(this.maxWidth, window.innerWidth - chrome.width),
      maxHeight: Math.min(this.maxHeight, window.innerHeight - chrome.height),
      aspectRatio: this.aspectRatio, axis: 'both',
    });
    this.style.width = `${size.width + chrome.width}px`;
    this.style.height = `${size.height + chrome.height}px`;
    if (String(size.width) !== this.getAttribute('width')) this.setAttribute('width', String(size.width));
    if (String(size.height) !== this.getAttribute('height')) this.setAttribute('height', String(size.height));
    this.keepInView();
    if (emit) {
      this.dispatchEvent(new CustomEvent('window-resize', {
        bubbles: true, composed: true, detail: { width: size.width, height: size.height, resizing: false },
      }));
    }
    return size;
  }

  /** Moves the frame, bounded to the viewport. */
  /** @param {number} x @param {number} y @param {{emit?: boolean}} [options] */
  moveTo(x, y, { emit = false } = {}) {
    const position = boundedPosition({
      x, y, width: this.offsetWidth || 200, height: this.offsetHeight || 120,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    });
    this.style.left = `${position.x}px`;
    this.style.top = `${position.y}px`;
    if (String(position.x) !== this.getAttribute('x')) this.setAttribute('x', String(position.x));
    if (String(position.y) !== this.getAttribute('y')) this.setAttribute('y', String(position.y));
    if (emit) {
      this.dispatchEvent(new CustomEvent('window-move', {
        bubbles: true, composed: true, detail: { x: position.x, y: position.y },
      }));
    }
    return position;
  }

  /** Where the frame is, or is asked to be before it has been placed. */
  currentPosition() {
    return {
      x: this.style.left ? parseFloat(this.style.left) : numberAttr(this, 'x', 0),
      y: this.style.top ? parseFloat(this.style.top) : numberAttr(this, 'y', 0),
    };
  }

  keepInView() {
    if (!this.open || this.hasAttribute('fullscreen') || this.hasAttribute('sheet')) return;
    const position = this.currentPosition();
    this.moveTo(position.x, position.y);
  }

  handleViewportResize() {
    if (!this.open || this.hasAttribute('fullscreen') || this.hasAttribute('sheet')) return;
    // shrinking the viewport must not strand a window outside it, or make it larger than the screen
    const size = this.contentSize;
    this.setContentSize(size.width, size.height);
  }

  /** Brings the window above every other compost-window. */
  raise() {
    topZIndex += 1;
    this.style.zIndex = String(900 + topZIndex);
    if (!this.hasAttribute('data-raised')) this.setAttribute('data-raised', '');
    this.dispatchEvent(new CustomEvent('window-focus', { bubbles: true, composed: true }));
  }

  /** @param {string} reason */
  requestClose(reason) {
    const event = new CustomEvent('window-close', {
      bubbles: true, composed: true, cancelable: true, detail: { reason },
    });
    if (this.dispatchEvent(event)) this.removeAttribute('open');
  }

  close() {
    this.requestClose('close');
  }

  refresh() {
    if (!this.header) return;
    this.titleElement.textContent = this.heading;
    this.setAttribute('aria-label', this.heading || 'Window');
    this.closeButton.setAttribute('aria-label', this.heading ? `Close ${this.heading}` : 'Close');
    this.closeButton.title = 'close';
    if (!this.open) return;
    const width = numberAttr(this, 'width', NaN);
    const height = numberAttr(this, 'height', NaN);
    if (this.hasAttribute('sheet')) { this.style.width = ''; this.style.height = ''; }
    else if (Number.isFinite(width) && Number.isFinite(height)) {
      const current = this.contentSize;
      if (Math.abs(current.width - width) > 0.5 || Math.abs(current.height - height) > 0.5
        || !this.style.width) this.setContentSize(width, height);
    }
    if (!this.hasAttribute('fullscreen') && !this.hasAttribute('sheet')) {
      const position = this.currentPosition();
      this.moveTo(numberAttr(this, 'x', position.x), numberAttr(this, 'y', position.y));
    }
  }

  // ---- Dragging -----------------------------------------------------------

  /** @param {PointerEvent} event */
  beginDrag(event) {
    if (event.button !== 0 || this.hasAttribute('static') || this.hasAttribute('fullscreen')
      || this.hasAttribute('sheet')) return;
    // controls in the bar own their own press
    if (event.composedPath().some((node) => node instanceof Element && node !== this.header
      && (node === this.closeButton || node.closest?.('[slot="controls"]')
        || (node instanceof HTMLElement && node.tagName.includes('-') && node !== this)))) return;
    event.preventDefault();
    this.drag = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      left: this.offsetLeft, top: this.offsetTop,
    };
    this.header.setPointerCapture(event.pointerId);
  }

  /** @param {PointerEvent} event */
  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.moveTo(this.drag.left + event.clientX - this.drag.x, this.drag.top + event.clientY - this.drag.y);
  }

  /** @param {PointerEvent} event */
  endDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.moveTo(this.offsetLeft, this.offsetTop, { emit: true });
  }

  // ---- Resizing -----------------------------------------------------------

  /** @param {PointerEvent} event */
  beginResize(event) {
    if (event.button !== 0 || this.resizable === 'none') return;
    event.preventDefault();
    event.stopPropagation();
    const size = this.contentSize;
    this.resize = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      width: size.width, height: size.height,
    };
    this.grip.setPointerCapture(event.pointerId);
    this.setAttribute('data-resizing', '');
  }

  /** @param {PointerEvent} event */
  moveResize(event) {
    if (!this.resize || event.pointerId !== this.resize.pointerId) return;
    const chrome = this.chromeSize();
    const size = constrainedSize({
      width: this.resize.width + event.clientX - this.resize.x,
      height: this.resize.height + event.clientY - this.resize.y,
      current: this.contentSize,
      minWidth: this.minWidth, minHeight: this.minHeight,
      maxWidth: Math.min(this.maxWidth, window.innerWidth - this.offsetLeft - chrome.width),
      maxHeight: Math.min(this.maxHeight, window.innerHeight - this.offsetTop - chrome.height),
      aspectRatio: this.aspectRatio, axis: this.resizable,
    });
    this.style.width = `${size.width + chrome.width}px`;
    this.style.height = `${size.height + chrome.height}px`;
    this.dispatchEvent(new CustomEvent('window-resize', {
      bubbles: true, composed: true, detail: { ...size, resizing: true },
    }));
  }

  /** @param {PointerEvent} event */
  endResize(event) {
    if (!this.resize || event.pointerId !== this.resize.pointerId) return;
    this.resize = null;
    this.removeAttribute('data-resizing');
    const size = this.contentSize;
    this.setContentSize(size.width, size.height, { emit: true });
  }
}

defineElement('compost-window', CompostWindow);
