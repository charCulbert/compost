export function defineElement(name, constructor) {
  if (!customElements.get(name)) {
    customElements.define(name, constructor);
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function numberAttr(element, name, fallback) {
  const raw = element.getAttribute(name);
  if (raw === null || raw === '') return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function snap(value, step) {
  if (!step) {
    return value;
  }

  return Math.round(value / step) * step;
}

export function rangeDragIncrement(min, max, pixels = 180) {
  const range = Math.abs(Number(max) - Number(min));
  const dragPixels = Number(pixels);
  const usableRange = Number.isFinite(range) && range > 0 ? range : 1;
  const usablePixels = Number.isFinite(dragPixels) && dragPixels > 0 ? dragPixels : 180;
  return usableRange / usablePixels;
}

export function splitValueTextOptions(text = '') {
  const source = String(text ?? '').trim();
  if (!source) return [];

  const separator = source.includes('|') ? '|' : ',';
  return source.split(separator).map((option) => option.trim());
}

export function valueTextOption(value, text = '') {
  const options = Array.isArray(text) ? text : splitValueTextOptions(text);
  if (!options.length) return null;

  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  const index = Math.round(number);
  if (Math.abs(number - index) > 0.000001) return null;

  const option = options[index];
  return option ? String(option) : null;
}

export function fractionDigitsForStep(step, displayFractionDigits = null) {
  const explicit = Number(displayFractionDigits);
  if (displayFractionDigits !== null
      && displayFractionDigits !== ''
      && Number.isFinite(explicit)) {
    return Math.min(12, Math.max(0, Math.round(explicit)));
  }

  const numericStep = Number(step);
  if (!(numericStep > 0) || !Number.isFinite(numericStep)) {
    return 2;
  }

  for (let digits = 0; digits <= 12; digits += 1) {
    const scaled = numericStep * (10 ** digits);
    const tolerance = Math.max(1e-7, Math.abs(scaled) * 1e-7);
    if (Math.abs(scaled - Math.round(scaled)) <= tolerance) {
      return digits;
    }
  }

  return 12;
}

export function formatNumber(value, step, displayFractionDigits = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toFixed(
    fractionDigitsForStep(step, displayFractionDigits));
}

export function formatValue(
  value,
  step,
  unit = '',
  text = '',
  displayFractionDigits = null,
) {
  const option = valueTextOption(value, text);
  if (option !== null) return option;

  return `${formatNumber(value, step, displayFractionDigits)}${unit}`;
}

export function parameterEventDetail(control, value, extra = {}) {
  return {
    parameterID: control.parameterID || control.getAttribute?.('parameter-id') || '',
    value,
    kind: control.parameterKind || control.getAttribute?.('parameter-kind') || 'continuous',
    source: extra.source ?? 'control',
    cancelled: false,
    ...extra,
  };
}

export function beginParameterGesture(control, value = control.value, extra = {}) {
  if (control._parameterGestureActive) return;
  control._parameterGestureActive = true;
  control.dispatchEvent(new CustomEvent('parameter-begin', {
    bubbles: true,
    composed: true,
    detail: parameterEventDetail(control, value, extra),
  }));
}

export function editParameterGesture(control, value = control.value, extra = {}) {
  beginParameterGesture(control, value, extra);
  control.dispatchEvent(new CustomEvent('parameter-edit', {
    bubbles: true,
    composed: true,
    detail: parameterEventDetail(control, value, extra),
  }));
}

export function endParameterGesture(control, value = control.value, extra = {}) {
  if (!control._parameterGestureActive) return;
  control._parameterGestureActive = false;
  control.dispatchEvent(new CustomEvent('parameter-end', {
    bubbles: true,
    composed: true,
    detail: parameterEventDetail(control, value, extra),
  }));
}
