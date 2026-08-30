if (!globalThis.CustomEvent) {
	globalThis.CustomEvent = class CustomEvent extends Event {
		constructor(type, options = {}) {
			super(type, options);
			this.detail = options.detail;
		}
	};
}

if (!globalThis.requestAnimationFrame) {
	globalThis.requestAnimationFrame = (callback) => {
		callback();
		return 1;
	};
}

if (!globalThis.cancelAnimationFrame) {
	globalThis.cancelAnimationFrame = () => {};
}

if (
	!globalThis.addEventListener ||
	!globalThis.removeEventListener ||
	!globalThis.dispatchEvent
) {
	const globalEvents = new EventTarget();
	globalThis.addEventListener =
		globalEvents.addEventListener.bind(globalEvents);
	globalThis.removeEventListener =
		globalEvents.removeEventListener.bind(globalEvents);
	globalThis.dispatchEvent = globalEvents.dispatchEvent.bind(globalEvents);
}

export class FakeStyle {
	constructor() {
		this.properties = new Map();
	}

	setProperty(name, value) {
		this.properties.set(name, value);
	}

	removeProperty(name) {
		this.properties.delete(name);
	}

	getPropertyValue(name) {
		return this.properties.get(name) || "";
	}
}

export class FakeControl extends EventTarget {
	constructor(attrs = {}, tagName = "compost-knob") {
		super();
		this.attrs = new Map(
			Object.entries(attrs).map(([key, value]) => [key, String(value)]),
		);
		this.tagName = tagName.toUpperCase();
		this.id = attrs.id || "";
		this.textContent = attrs.textContent || "";
		this.style = new FakeStyle();
		this.value = Number(attrs.value ?? attrs.init ?? 0);
	}

	getAttribute(name) {
		return this.attrs.has(name) ? this.attrs.get(name) : null;
	}

	setAttribute(name, value) {
		this.attrs.set(name, String(value));
	}

	removeAttribute(name) {
		this.attrs.delete(name);
	}

	hasAttribute(name) {
		return this.attrs.has(name);
	}

	matches(selector) {
		return selector.split(",").some((part) => this.matchesSingle(part.trim()));
	}

	matchesSingle(selector) {
		if (selector === "[parameter-id]") return this.hasAttribute("parameter-id");
		if (selector === "[midi-map-target]")
			return this.hasAttribute("midi-map-target");
		if (selector === "compost-knob" || selector === "compost-knob[name]") {
			return (
				["COMPOST-KNOB", "SYNTH-KNOB"].includes(this.tagName) &&
				(selector === "compost-knob" || this.hasAttribute("name"))
			);
		}
		if (selector === "compost-slider" || selector === "compost-slider[name]") {
			return (
				["COMPOST-SLIDER", "PARAMETER-SLIDER"].includes(this.tagName) &&
				(selector === "compost-slider" || this.hasAttribute("name"))
			);
		}
		if (selector === "compost-number-box[name]") {
			return this.tagName === "COMPOST-NUMBER-BOX" && this.hasAttribute("name");
		}
		if (selector === "compost-button[name]") {
			return this.tagName === "COMPOST-BUTTON" && this.hasAttribute("name");
		}
		return false;
	}

	closest(selector) {
		return this.matches(selector) ? this : null;
	}

	setValue(value) {
		this.value = Number(value);
		this.setAttribute("value", String(this.value));
	}

	getParameterValue() {
		return this.value;
	}
}

export class FakeRoot extends EventTarget {
	constructor(controls = []) {
		super();
		this.controls = controls;
	}

	matches() {
		return false;
	}

	querySelectorAll(selector) {
		return this.controls.filter((control) => control.matches(selector));
	}
}

export class FakeStorage {
	constructor() {
		this.items = new Map();
	}

	getItem(key) {
		return this.items.has(key) ? this.items.get(key) : null;
	}

	setItem(key, value) {
		this.items.set(key, String(value));
	}

	removeItem(key) {
		this.items.delete(key);
	}
}

export function keyEvent(key, target, modifiers = {}) {
	return {
		key,
		target,
		metaKey: Boolean(modifiers.metaKey),
		ctrlKey: Boolean(modifiers.ctrlKey),
		composedPath: () => [target],
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
	};
}

export function tick(ms = 0) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
