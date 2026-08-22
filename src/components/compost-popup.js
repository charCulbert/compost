import { clamp, defineElement } from '../utils.js';
import { popupPlacement } from './compost-select.js';

let nextPopupID = 1;

// Where a popup opened from a point (a context menu) lands: beside the pointer,
// pulled back inside the viewport when it would run off an edge.
export function pointPlacement({
  x, y, viewportWidth, viewportHeight, contentWidth, contentHeight, margin = 4,
}) {
  const width = Math.min(contentWidth, Math.max(0, viewportWidth - margin * 2));
  const height = Math.min(contentHeight, Math.max(0, viewportHeight - margin * 2));
  return {
    left: clamp(x, margin, Math.max(margin, viewportWidth - width - margin)),
    top: clamp(y, margin, Math.max(margin, viewportHeight - height - margin)),
    width,
    height,
  };
}

/**
 * A small menu anchored to a control or opened at a point: a list of
 * <option> children (and <hr> separators) that reports a pick and closes.
 * Placement is measured, and the list is kept on screen whichever way it has
 * to go. Purely UI: the host decides what a pick means.
 */
export class CompostPopup extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'heading', 'value', 'label', 'sheet'];
  }

  constructor() {
    super();

    this.listID = `compost-popup-${nextPopupID++}`;
    this.activeIndex = -1;
    /** @type {{anchor?: Element|DOMRect|null, x?: number, y?: number}|null} */
    this.anchorRequest = null;
    this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
    this.handleDocumentKeyDown = this.handleDocumentKeyDown.bind(this);
    this.position = this.position.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-popup-bg: #ffffff;
          --compost-popup-text: #111111;
          --compost-popup-muted: #6a6a6a;
          --compost-popup-border: rgba(17, 17, 17, 0.24);
          --compost-popup-hover-bg: rgba(17, 17, 17, 0.07);
          --compost-popup-active-text: #005fc0;
          --compost-popup-heading-text: #6a6a6a;
          --compost-popup-font-size: 1em;
          --compost-popup-item-padding: 0.27em 1.1em;
          --compost-popup-min-width: 12em;
          --compost-popup-z-index: 1000;
          --compost-popup-color-scheme: light;
          --compost-popup-swatch-columns: 4;
          color-scheme: var(--compost-popup-color-scheme);
          display: contents;
          font: inherit;
        }
        .menu {
          position: fixed;
          inset: auto;
          z-index: var(--compost-popup-z-index);
          box-sizing: border-box;
          min-width: var(--compost-popup-min-width);
          max-width: min(24em, calc(100vw - 16px));
          margin: 0;
          padding: 0.35em 0;
          border: 0;
          overflow: auto;
          background: var(--compost-popup-bg);
          color: var(--compost-popup-text);
          box-shadow: 0 0 0 1px var(--compost-popup-border);
          font: inherit;
          font-size: var(--compost-popup-font-size);
          line-height: 1.4;
          -webkit-user-select: none;
          user-select: none;
          scrollbar-width: none;
        }
        .menu::-webkit-scrollbar { display: none; }
        .menu:popover-open { display: block; }
        .menu:focus { outline: none; }
        .heading {
          padding: 0 1.1em 0.45em;
          color: var(--compost-popup-heading-text);
          font-size: 0.9em;
        }
        .item {
          display: flex;
          align-items: center;
          gap: 0.55em;
          padding: var(--compost-popup-item-padding);
          cursor: pointer;
          white-space: nowrap;
        }
        .item[aria-disabled="true"] { cursor: default; opacity: 0.45; }
        .item[data-active] { background: var(--compost-popup-hover-bg); }
        .item[aria-checked="true"] { color: var(--compost-popup-active-text); }
        /* the picked entry carries a mark beside it, in its own colour */
        .item::before {
          content: "";
          flex: none;
          width: 0.36em;
          height: 0.36em;
          border-radius: 50%;
          background: currentColor;
          opacity: 0;
        }
        .menu[data-marks] .item::before { opacity: 0; }
        .menu[data-marks] .item[aria-checked="true"]::before { opacity: 1; }
        .item[data-color]::before {
          background: var(--compost-popup-item-color);
          opacity: 1;
        }
        .item[data-color][aria-checked="true"]::before {
          box-shadow: 0 0 0 1px currentColor;
        }
        .menu:not([data-marks]) .item::before { display: none; }
        .menu:not([data-marks]) .item[data-color]::before { display: block; }
        .item .label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .item .detail { margin-left: auto; color: var(--compost-popup-muted); font-style: normal; }
        .item[aria-checked="true"] .detail { color: var(--compost-popup-active-text); }
        .separator { height: 1px; margin: 0.35em 0; background: var(--compost-popup-border); }
        /* colour choices are a grid of squares, not a list of words */
        .swatches {
          display: grid;
          grid-template-columns: repeat(var(--compost-popup-swatch-columns, 4), max-content);
          justify-content: start;
          gap: 0.45em;
          padding: 0.35em 1.1em;
        }
        .item.swatch {
          padding: 0; width: 1.35em; height: 1.35em; border-radius: 2px; gap: 0;
          background: var(--compost-popup-item-color, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent);
        }
        .item.swatch::before { display: none !important; }
        .item.swatch .label { display: none; }
        .item.swatch:not([data-color]) {
          background: linear-gradient(135deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%);
        }
        .item.swatch[aria-checked="true"] { box-shadow: 0 0 0 1px var(--compost-popup-bg), 0 0 0 2px currentColor; }
        .item.swatch[data-active] { outline: 1px solid var(--compost-popup-active-text); outline-offset: 2px; }
        /* on a small screen the list is a sheet along the bottom edge */
        :host([sheet]) .menu {
          left: 0 !important;
          right: 0;
          top: auto !important;
          bottom: 0;
          width: auto !important;
          max-width: none;
          max-height: 82vh !important;
        }
        :host([sheet]) .item { padding: 0.8em 1.2em; }
        @media (prefers-reduced-motion: reduce) { .menu { transition: none; } }
      </style>
      <div class="menu" part="menu" role="menu" popover="manual" tabindex="-1"></div>`;

    this.menu = /** @type {HTMLElement} */ (this.root.querySelector('.menu'));
    this.menu.id = this.listID;
    this.menu.addEventListener('pointerdown', (event) => {
      // keep focus where it was; the pick happens on the click
      event.preventDefault();
    });
    this.menu.addEventListener('click', (event) => this.handleClick(event));
    this.menu.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.menu.addEventListener('keydown', (event) => this.handleKeyDown(event));
  }

  connectedCallback() {
    this.refresh();
    if (this.hasAttribute('open') && !this.isOpen) this.open(this.anchorRequest || {});
  }

  disconnectedCallback() {
    this.teardownListeners();
  }

  attributeChangedCallback(name) {
    if (name === 'open') {
      if (this.hasAttribute('open') && !this.isOpen) this.open(this.anchorRequest || {});
      else if (!this.hasAttribute('open') && this.isOpen) this.close();
      return;
    }
    this.refresh();
  }

  get isOpen() {
    return this.menu?.matches(':popover-open') ?? false;
  }

  get value() {
    return this.getAttribute('value') ?? '';
  }

  set value(value) {
    if (value === null || value === undefined) this.removeAttribute('value');
    else this.setAttribute('value', String(value));
  }

  // ---- Items ------------------------------------------------------------

  /** The option and separator children, in order. */
  entries() {
    return [...this.children].filter((child) =>
      child.tagName === 'OPTION' || child.tagName === 'HR');
  }

  /** @returns {HTMLOptionElement[]} */
  optionElements() {
    return /** @type {HTMLOptionElement[]} */ ([...this.children]
      .filter((child) => child.tagName === 'OPTION'));
  }

  /** Replaces the options from plain data: [{value, label, detail, color, disabled, selected}] or '-'. */
  /** @param {Array<{value?: string, label?: string, detail?: string, color?: string, disabled?: boolean, selected?: boolean}|string>} items */
  setItems(items) {
    this.replaceChildren(...items.map((item) => {
      if (item === '-' || item === null) return document.createElement('hr');
      const option = document.createElement('option');
      const entry = /** @type {{value?: string, label?: string, detail?: string, color?: string, swatch?: boolean, disabled?: boolean, selected?: boolean}} */ (item);
      option.value = String(entry.value ?? entry.label ?? '');
      option.textContent = String(entry.label ?? entry.value ?? '');
      if (entry.detail !== undefined) option.dataset.detail = String(entry.detail);
      if (entry.color !== undefined) option.dataset.color = String(entry.color);
      if (entry.swatch) option.dataset.swatch = '';
      if (entry.disabled) option.disabled = true;
      if (entry.selected) option.setAttribute('selected', '');
      return option;
    }));
    this.refresh();
  }

  refresh() {
    if (!this.menu) return;
    const heading = this.getAttribute('heading');
    const options = this.optionElements();
    const value = this.hasAttribute('value') ? this.value : null;
    const marks = options.some((option) => option.hasAttribute('selected')) || value !== null;
    this.menu.toggleAttribute('data-marks', marks);
    this.menu.setAttribute('aria-label', this.getAttribute('label') || heading || 'Menu');
    const nodes = [];
    if (heading) {
      const title = document.createElement('div');
      title.className = 'heading';
      title.part.add('heading');
      title.textContent = heading;
      nodes.push(title);
    }
    let index = 0;
    for (const entry of this.entries()) {
      if (entry.tagName === 'HR') {
        const separator = document.createElement('div');
        separator.className = 'separator';
        separator.setAttribute('role', 'separator');
        nodes.push(separator);
        continue;
      }
      const option = /** @type {HTMLOptionElement} */ (entry);
      const item = document.createElement('div');
      item.className = option.dataset.swatch !== undefined ? 'item swatch' : 'item';
      item.part.add('item');
      item.id = `${this.listID}-item-${index}`;
      item.dataset.index = String(index);
      item.setAttribute('role', 'menuitemradio');
      const checked = value !== null ? option.value === value : option.hasAttribute('selected');
      item.setAttribute('aria-checked', String(checked));
      item.setAttribute('aria-disabled', String(option.disabled));
      if (option.dataset.color !== undefined) {
        item.dataset.color = option.dataset.color;
        item.style.setProperty('--compost-popup-item-color', option.dataset.color);
      }
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = option.label || option.textContent || option.value;
      item.append(label);
      if (option.dataset.swatch !== undefined) {
        // the square is the whole entry; its name stays for assistive tech
        item.setAttribute('aria-label', label.textContent ?? '');
        item.title = label.textContent ?? '';
        const previous = nodes[nodes.length - 1];
        const grid = previous instanceof HTMLElement && previous.classList.contains('swatches')
          ? previous : Object.assign(document.createElement('div'), { className: 'swatches' });
        if (grid !== previous) { grid.setAttribute('role', 'group'); nodes.push(grid); }
        grid.append(item);
        index += 1;
        continue;
      }
      if (option.dataset.detail !== undefined) {
        const detail = document.createElement('em');
        detail.className = 'detail';
        detail.textContent = option.dataset.detail;
        item.append(detail);
      }
      nodes.push(item);
      index += 1;
    }
    this.menu.replaceChildren(...nodes);
    this.setActive(this.activeIndex, false);
  }

  itemElements() {
    return /** @type {HTMLElement[]} */ ([...this.menu.querySelectorAll('.item')]);
  }

  // ---- Open / close -----------------------------------------------------

  /**
   * Opens beside an anchor (an element or a DOMRect) or at a point. Without
   * either, it opens where it last did, or at the top left of the viewport.
   * @param {{anchor?: Element|DOMRect|null, x?: number, y?: number}} [request]
   */
  open(request = {}) {
    if (!this.isConnected) return;
    this.refresh();
    this.anchorRequest = request;
    if (!this.isOpen) {
      try { this.menu.showPopover(); } catch { this.menu.hidden = false; }
      document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
      document.addEventListener('keydown', this.handleDocumentKeyDown, true);
      window.addEventListener('resize', this.position);
      window.addEventListener('scroll', this.position, true);
    }
    if (!this.hasAttribute('open')) this.setAttribute('open', '');
    this.position();
    const options = this.optionElements();
    const selected = options.findIndex((option) => option.hasAttribute('selected')
      || (this.hasAttribute('value') && option.value === this.value));
    this.setActive(selected, false);
    this.menu.focus({ preventScroll: true });
    this.dispatchEvent(new CustomEvent('popup-open', { bubbles: true, composed: true }));
  }

  /** @param {number} x @param {number} y */
  openAt(x, y) {
    this.open({ x, y });
  }

  /** @param {string} [reason] */
  close(reason = 'close') {
    if (!this.isOpen) {
      if (this.hasAttribute('open')) this.removeAttribute('open');
      return;
    }
    try { this.menu.hidePopover(); } catch { this.menu.hidden = true; }
    this.teardownListeners();
    if (this.hasAttribute('open')) this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('popup-close', {
      bubbles: true, composed: true, detail: { reason },
    }));
  }

  teardownListeners() {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.removeEventListener('keydown', this.handleDocumentKeyDown, true);
    window.removeEventListener('resize', this.position);
    window.removeEventListener('scroll', this.position, true);
  }

  /** Lays the menu out for the current anchor request and viewport. */
  position() {
    if (!this.isOpen) return;
    const request = this.anchorRequest || {};
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const contentWidth = this.menu.scrollWidth;
    const contentHeight = this.menu.scrollHeight;
    const anchor = request.anchor instanceof Element
      ? request.anchor.getBoundingClientRect()
      : request.anchor instanceof DOMRect ? request.anchor : null;
    if (anchor) {
      const placement = popupPlacement({
        trigger: anchor, viewportWidth, viewportHeight, contentWidth, contentHeight,
      });
      // popupPlacement lines the list up with the trigger's right edge, as a
      // select does; a menu hanging from a text control reads from its left
      const left = clamp(anchor.left, 8, Math.max(8, viewportWidth - placement.width - 8));
      Object.assign(this.menu.style, {
        left: `${left}px`,
        top: `${placement.top}px`,
        width: `${Math.max(placement.width, contentWidth)}px`,
        maxHeight: `${placement.maxHeight}px`,
      });
      return;
    }
    const placement = pointPlacement({
      x: Number(request.x) || 0, y: Number(request.y) || 0,
      viewportWidth, viewportHeight, contentWidth, contentHeight,
    });
    Object.assign(this.menu.style, {
      left: `${placement.left}px`,
      top: `${placement.top}px`,
      width: '',
      maxHeight: `${Math.max(60, viewportHeight - 8)}px`,
    });
  }

  // ---- Interaction ------------------------------------------------------

  /** @param {number} index @param {boolean} [scroll] */
  setActive(index, scroll = true) {
    const items = this.itemElements();
    this.activeIndex = index >= 0 && index < items.length ? index : -1;
    items.forEach((item, position) => {
      item.toggleAttribute('data-active', position === this.activeIndex);
    });
    const active = items[this.activeIndex];
    if (active) {
      this.menu.setAttribute('aria-activedescendant', active.id);
      if (scroll) active.scrollIntoView({ block: 'nearest' });
    } else {
      this.menu.removeAttribute('aria-activedescendant');
    }
  }

  /** @param {number} direction */
  moveActive(direction) {
    const items = this.itemElements();
    if (!items.length) return;
    let index = this.activeIndex;
    for (let step = 0; step < items.length; step += 1) {
      index = (index + direction + items.length) % items.length;
      if (items[index].getAttribute('aria-disabled') !== 'true') break;
    }
    this.setActive(index);
  }

  /** @param {number} index */
  pick(index) {
    const options = this.optionElements();
    const option = options[index];
    if (!option || option.disabled) return;
    this.close('select');
    this.dispatchEvent(new CustomEvent('popup-select', {
      bubbles: true,
      composed: true,
      detail: { value: option.value, index, label: option.label || option.textContent || '' },
    }));
  }

  /** @param {Event} event */
  itemIndexFrom(event) {
    const item = event.composedPath().find((node) =>
      node instanceof HTMLElement && node.classList.contains('item'));
    return item instanceof HTMLElement ? Number(item.dataset.index) : -1;
  }

  /** @param {MouseEvent} event */
  handleClick(event) {
    const index = this.itemIndexFrom(event);
    if (index >= 0) this.pick(index);
  }

  /** @param {PointerEvent} event */
  handlePointerMove(event) {
    const index = this.itemIndexFrom(event);
    if (index >= 0 && index !== this.activeIndex) this.setActive(index, false);
  }

  /** @param {KeyboardEvent} event */
  handleKeyDown(event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); this.moveActive(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); this.moveActive(-1); }
    else if (event.key === 'Home') { event.preventDefault(); this.setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); this.setActive(this.itemElements().length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (this.activeIndex >= 0) this.pick(this.activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close('escape');
    }
  }

  /** @param {KeyboardEvent} event */
  handleDocumentKeyDown(event) {
    if (event.key !== 'Escape' || !this.isOpen) return;
    // closing is this menu's business; nothing behind it should also react
    event.preventDefault();
    event.stopPropagation();
    this.close('escape');
  }

  /** @param {PointerEvent} event */
  handleDocumentPointerDown(event) {
    if (!this.isOpen) return;
    const path = event.composedPath();
    if (path.includes(this.menu) || path.includes(this)) return;
    const anchor = this.anchorRequest?.anchor;
    if (anchor instanceof Element && path.includes(anchor)) return;
    this.close('outside');
  }
}

defineElement('compost-popup', CompostPopup);
