import { defineElement } from '../utils.js';

let nextListboxID = 0;

export class CompostSelect extends HTMLElement {
  static get observedAttributes() {
    return [
      'value',
      'disabled',
      'label',
      'aria-label',
      'aria-labelledby',
      'aria-description',
      'aria-describedby',
      'placeholder',
    ];
  }

  constructor() {
    super();

    this.activeIndex = -1;
    this.typeahead = '';
    this.typeaheadTimer = 0;
    this.listboxID = `compost-select-listbox-${nextListboxID += 1}`;
    this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);

    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>
        :host {
          --compost-select-bg: #ffffff;
          --compost-select-border: #111111;
          --compost-select-text: #111111;
          --compost-select-active-bg: #111111;
          --compost-select-active-text: #ffffff;
          --compost-select-hover-bg: #e8e8e8;
          --compost-select-height: 38px;
          --compost-select-popup-offset: 0px;
          --compost-select-focus: #111111;
          position: relative;
          display: inline-block;
          min-width: 0;
          color: var(--compost-select-text);
          font: inherit;
          -webkit-user-select: none;
          user-select: none;
        }
        button {
          box-sizing: border-box;
          width: 100%;
          height: var(--compost-select-height);
          min-width: 0;
          padding: 0 12px;
          border: 1px solid var(--compost-select-border);
          border-radius: 0;
          background: var(--compost-select-bg);
          color: var(--compost-select-text);
          cursor: pointer;
          font: inherit;
          text-align: left;
        }
        button:focus-visible {
          position: relative;
          z-index: 2;
          outline: 2px solid var(--compost-select-focus);
          outline-offset: -3px;
        }
        button:disabled {
          cursor: default;
          opacity: 0.45;
        }
        .trigger {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
        }
        .label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .marker {
          width: 0;
          height: 0;
          flex: none;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          border-left: 7px solid currentColor;
          transform: rotate(90deg);
          transform-origin: 35% 50%;
          transition: transform 120ms ease;
        }
        :host([open]) .marker {
          transform: rotate(-90deg);
        }
        .listbox {
          position: absolute;
          top: calc(100% + var(--compost-select-popup-offset));
          right: 0;
          z-index: 100;
          box-sizing: border-box;
          width: max-content;
          min-width: 100%;
          max-width: min(360px, calc(100vw - 16px));
          max-height: min(320px, calc(100vh - 70px));
          overflow: auto;
          border: 1px solid var(--compost-select-border);
          border-top: 0;
          background: var(--compost-select-bg);
          color: var(--compost-select-text);
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
        }
        .option {
          min-width: 100%;
          padding: 9px 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .option[data-active],
        .option:hover {
          background: var(--compost-select-hover-bg);
        }
        .option[aria-selected="true"] {
          background: var(--compost-select-active-bg);
          color: var(--compost-select-active-text);
        }
        .option[aria-disabled="true"] {
          cursor: default;
          opacity: 0.45;
        }
        slot {
          display: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .marker { transition: none; }
        }
      </style>
      <button class="trigger" part="button" type="button" role="combobox"
        aria-haspopup="listbox" aria-expanded="false">
        <span class="label" part="label"></span>
        <span class="marker" part="marker" aria-hidden="true"></span>
      </button>
      <div class="listbox" part="listbox" role="listbox" hidden></div>
      <slot></slot>`;

    this.trigger = this.root.querySelector('.trigger');
    this.labelElement = this.root.querySelector('.label');
    this.listbox = this.root.querySelector('.listbox');
    this.listbox.id = this.listboxID;
    this.trigger.setAttribute('aria-controls', this.listboxID);

    this.trigger.addEventListener('click', () => this.toggle());
    this.trigger.addEventListener('keydown', (event) => this.handleKeyDown(event));
    this.listbox.addEventListener('click', (event) => {
      const option = event.target.closest('.option');
      if (option) this.selectIndex(Number(option.dataset.index), true);
    });

    this.observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => this.refresh())
      : null;
  }

  connectedCallback() {
    this.observer?.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'label', 'selected', 'value'],
    });
    document.addEventListener('pointerdown', this.handleDocumentPointerDown);
    this.refresh();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
    clearTimeout(this.typeaheadTimer);
  }

  attributeChangedCallback() {
    this.refresh();
  }

  get value() {
    return this.getAttribute('value') ?? '';
  }

  set value(value) {
    this.setAttribute('value', String(value ?? ''));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  get open() {
    return this.hasAttribute('open');
  }

  set open(value) {
    const next = Boolean(value) && !this.disabled;
    this.toggleAttribute('open', next);
    this.listbox.hidden = !next;
    this.trigger.setAttribute('aria-expanded', String(next));

    if (next) {
      this.activeIndex = Math.max(0, this.selectedIndex());
      this.refreshActiveOption();
    } else {
      this.trigger.removeAttribute('aria-activedescendant');
    }
  }

  optionElements() {
    return [...this.children].filter((child) => child.tagName === 'OPTION');
  }

  selectedIndex() {
    return this.optionElements().findIndex((option) => option.value === this.value);
  }

  refresh() {
    if (!this.trigger) return;

    const options = this.optionElements();
    if (!this.hasAttribute('value')) {
      const initial = options.find((option) => option.selected && !option.disabled)
        || options.find((option) => !option.disabled);
      if (initial) this.setAttribute('value', initial.value);
    }

    const selectedIndex = this.selectedIndex();
    const selected = options[selectedIndex];
    this.labelElement.textContent = selected
      ? this.optionLabel(selected)
      : this.getAttribute('placeholder') || 'Select';
    this.trigger.disabled = this.disabled;
    this.trigger.setAttribute('aria-label', this.accessibleLabel());
    const description = this.getAttribute('aria-description')
      || this.referencedText('aria-describedby');
    if (description) this.trigger.setAttribute('aria-description', description);
    else this.trigger.removeAttribute('aria-description');

    this.listbox.replaceChildren(...options.map((option, index) => {
      const item = document.createElement('div');
      item.className = 'option';
      item.id = `${this.listboxID}-option-${index}`;
      item.dataset.index = String(index);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === selectedIndex));
      item.setAttribute('aria-disabled', String(option.disabled));
      item.textContent = this.optionLabel(option);
      return item;
    }));

    if (this.disabled) this.open = false;
    else this.refreshActiveOption();
  }

  optionLabel(option) {
    return option.getAttribute('label') || option.textContent.trim();
  }

  accessibleLabel() {
    return this.referencedText('aria-labelledby')
      || this.getAttribute('aria-label')
      || this.getAttribute('label')
      || this.associatedLabelText()
      || 'Select';
  }

  referencedText(attribute) {
    const root = this.getRootNode();
    return (this.getAttribute(attribute) || '')
      .split(/\s+/u)
      .map((id) => root.getElementById?.(id)?.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ');
  }

  associatedLabelText() {
    const root = this.getRootNode();
    const labels = [...(root.querySelectorAll?.('label') || [])];
    const label = labels.find((candidate) =>
      (this.id && candidate.htmlFor === this.id) || candidate.contains(this));
    if (!label) return '';

    return [...label.childNodes]
      .filter((node) => node !== this)
      .map((node) => node.textContent || '')
      .join(' ')
      .trim();
  }

  toggle() {
    this.open = !this.open;
  }

  selectIndex(index, notify = false) {
    const option = this.optionElements()[index];
    if (!option || option.disabled) return false;

    const changed = option.value !== this.value;
    this.value = option.value;
    this.open = false;
    this.trigger.focus();
    if (changed && notify) this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return true;
  }

  moveActive(direction) {
    const options = this.optionElements();
    if (!options.length) return;

    let index = this.activeIndex;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) {
        this.activeIndex = index;
        this.refreshActiveOption();
        return;
      }
    }
  }

  refreshActiveOption() {
    const items = [...this.listbox.children];
    items.forEach((item, index) => item.toggleAttribute('data-active', this.open && index === this.activeIndex));
    const active = items[this.activeIndex];
    if (this.open && active) {
      this.trigger.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (this.open) event.preventDefault();
      this.open = false;
      return;
    }

    if (event.key === 'Tab') {
      this.open = false;
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open) this.open = true;
      else this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.open = true;
      this.activeIndex = event.key === 'Home' ? -1 : 0;
      this.moveActive(event.key === 'Home' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (this.open) this.selectIndex(this.activeIndex, true);
      else this.open = true;
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.typeahead += event.key.toLocaleLowerCase();
      clearTimeout(this.typeaheadTimer);
      this.typeaheadTimer = setTimeout(() => { this.typeahead = ''; }, 600);
      const index = this.optionElements().findIndex((option) => {
        const labels = this.optionLabel(option)
          .toLocaleLowerCase()
          .split(/:\s*/u);
        return !option.disabled && labels.some((label) => label.startsWith(this.typeahead));
      });
      if (index >= 0) {
        if (this.open) {
          this.activeIndex = index;
          this.refreshActiveOption();
        } else {
          this.selectIndex(index, true);
        }
      }
    }
  }

  handleDocumentPointerDown(event) {
    if (this.open && !event.composedPath().includes(this)) this.open = false;
  }
}

defineElement('compost-select', CompostSelect);
