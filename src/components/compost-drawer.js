import { clamp, defineElement, numberAttr } from '../utils.js';

export class CompostDrawer extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'edge', 'orientation', 'min-size', 'max-size', 'label'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-drawer-bg: #eeeeec;
          --compost-drawer-border: #8f8f8b;
          --compost-drawer-text: #111111;
          --compost-drawer-title-bg: #d5d5d2;
          --compost-drawer-title-hover-bg: #dfdfdc;
          --compost-drawer-focus: #0066cc;
          --compost-drawer-radius: 0;
          --compost-drawer-title-padding: 7px 10px;
          --compost-drawer-title-size: 40px;
          --compost-drawer-content-padding: 12px;
          --compost-drawer-size: auto;
          display: block;
          color: var(--compost-drawer-text);
          font: inherit;
        }
        :host([open][resizable][data-axis="vertical"]) {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          height: var(--compost-drawer-size);
        }
        :host([open][resizable][edge="top"]) {
          grid-template-rows: minmax(0, 1fr) auto;
        }
        :host([open][resizable][data-axis="horizontal"]) {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          width: var(--compost-drawer-size);
          height: 100%;
        }
        :host(:not([open])[data-axis="vertical"]) {
          width: 100%;
        }
        :host(:not([open])[data-axis="horizontal"]) {
          width: var(--compost-drawer-title-size);
          min-width: var(--compost-drawer-title-size);
          height: 100%;
        }
        .resize-handle {
          position: relative;
          z-index: 2;
          display: none;
          height: 5px;
          background-color: var(--compost-drawer-border);
          opacity: 1;
          cursor: row-resize;
          touch-action: none;
          pointer-events: auto;
        }
        :host([open][resizable]) .resize-handle {
          display: block;
        }
        :host([data-axis="horizontal"]) .resize-handle {
          grid-column: 2;
          grid-row: 1;
          width: 5px;
          height: auto;
          cursor: col-resize;
        }
        :host([open][resizable][edge="top"]) .resize-handle {
          grid-row: 2;
        }
        :host([open][resizable][edge="top"]) details {
          grid-row: 1;
        }
        :host([open][resizable][edge="right"]) {
          grid-template-columns: auto minmax(0, 1fr);
        }
        :host([open][resizable][edge="right"]) .resize-handle {
          grid-column: 1;
        }
        :host([open][resizable][edge="right"]) details {
          grid-column: 2;
        }
        .resize-handle:hover,
        .resize-handle:focus-visible {
          background: var(--compost-drawer-focus);
          outline: none;
        }
        details {
          box-sizing: border-box;
          overflow: hidden;
          border: 1px solid var(--compost-drawer-border);
          border-radius: var(--compost-drawer-radius);
          background: var(--compost-drawer-bg);
          color: inherit;
        }
        :host([data-axis="horizontal"]) details,
        :host([data-axis="horizontal"]) summary {
          box-sizing: border-box;
          height: 100%;
        }
        :host([data-axis="horizontal"]) summary {
          width: 100%;
          min-width: 0;
          writing-mode: vertical-rl;
        }
        :host([data-axis="vertical"]) summary {
          min-height: calc(var(--compost-drawer-title-size) - 2px);
        }
        :host([open][data-axis="vertical"]) details {
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          min-height: 0;
        }
        :host([open][data-axis="vertical"]) summary {
          grid-row: 2;
        }
        :host([open][data-axis="vertical"]) .content {
          grid-row: 1;
          border-top: 0;
          border-bottom: 1px solid var(--compost-drawer-border);
        }
        :host([open][resizable][data-axis="vertical"]) details {
          border-top-left-radius: 0;
          border-top-right-radius: 0;
        }
        :host([open][edge="top"]) details {
          grid-template-rows: auto minmax(0, 1fr);
        }
        :host([open][edge="top"]) summary {
          grid-row: 1;
        }
        :host([open][edge="top"]) .content {
          grid-row: 2;
          border-top: 1px solid var(--compost-drawer-border);
          border-bottom: 0;
        }
        :host([open][resizable][edge="top"]) details {
          border-radius: var(--compost-drawer-radius) var(--compost-drawer-radius) 0 0;
        }
        :host([open][data-axis="horizontal"]) details {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
          min-width: 0;
        }
        :host([open][data-axis="horizontal"]) summary {
          grid-column: 1;
          grid-row: 1;
        }
        :host([open][data-axis="horizontal"]) .content {
          grid-column: 2;
          grid-row: 1;
          border-top: 0;
          border-left: 1px solid var(--compost-drawer-border);
        }
        :host([open][resizable][data-axis="horizontal"]) details {
          grid-column: 1;
          grid-row: 1;
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
          border-top-left-radius: var(--compost-drawer-radius);
        }
        :host([open][edge="right"]) details {
          grid-template-columns: minmax(0, 1fr) auto;
        }
        :host([open][edge="right"]) summary {
          grid-column: 2;
        }
        :host([open][edge="right"]) .content {
          grid-column: 1;
          border-right: 1px solid var(--compost-drawer-border);
          border-left: 0;
        }
        :host([open][resizable][edge="right"]) details {
          border-radius: 0 var(--compost-drawer-radius) var(--compost-drawer-radius) 0;
        }
        summary {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 18px;
          padding: var(--compost-drawer-title-padding);
          background-color: var(--compost-drawer-title-bg);
          opacity: 1;
          cursor: pointer;
          font: inherit;
          font-weight: 600;
          list-style: none;
          user-select: none;
          -webkit-user-select: none;
          pointer-events: auto;
        }
        summary::-webkit-details-marker {
          display: none;
        }
        summary:hover {
          background: var(--compost-drawer-title-hover-bg);
        }
        summary:focus-visible {
          outline: 2px solid var(--compost-drawer-focus);
          outline-offset: -2px;
        }
        .marker {
          width: 0;
          height: 0;
          flex: none;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          border-left: 7px solid currentColor;
          transform-origin: 35% 50%;
          transition: transform 120ms ease;
        }
        :host([edge="top"]) .marker,
        :host([edge="bottom"]) .marker { transform: rotate(0deg); }
        :host([edge="top"]) details[open] .marker { transform: rotate(90deg); }
        :host([edge="bottom"]) details[open] .marker { transform: rotate(-90deg); }
        :host([edge="left"]) .marker,
        :host([edge="right"]) .marker { transform: rotate(90deg); }
        :host([edge="left"]) details[open] .marker { transform: rotate(0deg); }
        :host([edge="right"]) details[open] .marker { transform: rotate(180deg); }
        .content {
          box-sizing: border-box;
          min-width: 0;
          min-height: 0;
          overflow: auto;
          border-top: 1px solid var(--compost-drawer-border);
          padding: var(--compost-drawer-content-padding);
        }
        @media (prefers-reduced-motion: reduce) {
          .marker {
            transition: none;
          }
        }
      </style>
      <div class="resize-handle" part="resize-handle" role="separator"
        aria-label="Resize drawer" aria-orientation="horizontal" tabindex="0"></div>
      <details part="drawer">
        <summary part="title">
          <span class="marker" part="marker" aria-hidden="true"></span>
          <slot name="title">Drawer</slot>
        </summary>
        <div class="content" part="content"><slot></slot></div>
      </details>`;

    this.details = this.root.querySelector('details');
    this.titleBar = this.root.querySelector('summary');
    this.titleSlot = this.root.querySelector('slot[name="title"]');
    this.resizeHandle = this.root.querySelector('.resize-handle');
    this.resizeState = null;
    this.details.addEventListener('toggle', () => {
      this.toggleAttribute('open', this.details.open);
      this.dispatchEvent(new Event('toggle'));
    });
    this.titleBar.addEventListener('click', (event) => {
      event.preventDefault();
      this.open = !this.open;
    });
    this.resizeHandle.addEventListener('pointerdown', (event) => this.startResize(event));
    this.resizeHandle.addEventListener('pointermove', (event) => this.continueResize(event));
    this.resizeHandle.addEventListener('pointerup', (event) => this.endResize(event));
    this.resizeHandle.addEventListener('pointercancel', (event) => this.endResize(event));
    this.resizeHandle.addEventListener('keydown', (event) => this.handleResizeKey(event));
    this.titleSlot.addEventListener('slotchange', () => this.refreshLabel());
  }

  connectedCallback() {
    if (!this.hasAttribute('edge')) {
      this.setAttribute(
        'edge', this.getAttribute('orientation') === 'horizontal' ? 'left' : 'bottom');
    }
    this.refresh();
  }

  attributeChangedCallback() {
    this.refresh();
  }

  get open() {
    return this.hasAttribute('open');
  }

  set open(value) {
    this.toggleAttribute('open', Boolean(value));
  }

  get resizable() {
    return this.hasAttribute('resizable');
  }

  set resizable(value) {
    this.toggleAttribute('resizable', Boolean(value));
  }

  get edge() {
    const edge = this.getAttribute('edge');
    return ['top', 'right', 'bottom', 'left'].includes(edge) ? edge : 'bottom';
  }

  set edge(value) {
    this.setAttribute('edge', value);
  }

  get orientation() {
    return this.edge === 'left' || this.edge === 'right' ? 'horizontal' : 'vertical';
  }

  get size() {
    const style = this.ownerDocument?.defaultView?.getComputedStyle(this) ?? this.style;
    const declared = Number.parseFloat(style.getPropertyValue('--compost-drawer-size'));
    const bounds = this.getBoundingClientRect();
    const rendered = this.orientation === 'horizontal' ? bounds.width : bounds.height;
    return Number.isFinite(declared) ? declared : rendered;
  }

  set size(value) {
    this.setSize(value);
  }

  get minSize() {
    return numberAttr(this, 'min-size', 80);
  }

  get maxSize() {
    return Math.max(this.minSize, numberAttr(this, 'max-size', Number.MAX_SAFE_INTEGER));
  }

  setSize(value, shouldEmit = false) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;

    const size = clamp(number, this.minSize, this.maxSize);
    this.style.setProperty('--compost-drawer-size', `${size}px`);
    this.resizeHandle?.setAttribute('aria-valuenow', String(Math.round(size)));
    this.resizeHandle?.setAttribute('aria-valuetext', `${Math.round(size)} pixels`);
    if (shouldEmit) {
      this.dispatchEvent(new CustomEvent('drawer-resize', {
        bubbles: true,
        composed: true,
        detail: { size },
      }));
    }
  }

  startResize(event) {
    if (!this.open || !this.resizable || event.button !== 0) return;

    event.preventDefault();
    this.resizeState = {
      pointerID: event.pointerId,
      startSize: this.size,
      startPosition: this.resizePosition(event),
    };
    this.resizeHandle.setPointerCapture(event.pointerId);
  }

  continueResize(event) {
    if (event.pointerId !== this.resizeState?.pointerID) return;
    this.setSize(
      this.resizeState.startSize
        + this.resizePosition(event)
        - this.resizeState.startPosition,
      true,
    );
  }

  resizePosition(event) {
    return {
      top: event.clientY,
      right: -event.clientX,
      bottom: -event.clientY,
      left: event.clientX,
    }[this.edge];
  }

  endResize(event) {
    if (event.pointerId === this.resizeState?.pointerID) this.resizeState = null;
  }

  handleResizeKey(event) {
    const change = {
      top: { ArrowUp: -16, ArrowDown: 16 },
      right: { ArrowLeft: 16, ArrowRight: -16 },
      bottom: { ArrowUp: 16, ArrowDown: -16 },
      left: { ArrowLeft: -16, ArrowRight: 16 },
    }[this.edge][event.key];
    if (!change) return;

    event.preventDefault();
    this.setSize(this.size + change, true);
  }

  refresh() {
    if (!this.details) return;
    this.dataset.axis = this.orientation;
    this.details.open = this.open;
    if (this.open && this.resizable) this.setSize(this.size);
    this.resizeHandle.setAttribute(
      'aria-orientation', this.orientation === 'horizontal' ? 'vertical' : 'horizontal');
    this.resizeHandle.setAttribute('aria-valuemin', String(this.minSize));
    this.resizeHandle.setAttribute('aria-valuemax', String(this.maxSize));
    this.resizeHandle.setAttribute('aria-valuenow', String(Math.round(this.size)));
    this.resizeHandle.setAttribute('aria-valuetext', `${Math.round(this.size)} pixels`);
    this.refreshLabel();
  }

  refreshLabel() {
    const label = this.getAttribute('label');
    const assignedText = this.titleSlot.assignedNodes({ flatten: true })
      .map((node) => node.textContent || '')
      .join('')
      .trim();
    const drawerName = label?.trim() || assignedText || 'Drawer';
    const resizeLabel = /\bdrawer$/iu.test(drawerName)
      ? `Resize ${drawerName}`
      : `Resize ${drawerName} drawer`;

    this.resizeHandle?.setAttribute('aria-label', resizeLabel);

    if (label !== null || !assignedText) {
      this.titleBar.setAttribute('aria-label', label || 'Toggle drawer');
    } else {
      this.titleBar.removeAttribute('aria-label');
    }
  }
}

defineElement('compost-drawer', CompostDrawer);
