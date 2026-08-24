/**
 * Give touch users the same double-click gesture without letting Safari use
 * the second tap to zoom the page. Single taps and multi-touch stay native.
 */
export function installTouchDoubleClick(element, { dispatch = true } = {}) {
  const maxDelay = 350;
  const maxDistance = 24;
  const maxTapMovement = 12;
  const syntheticEvents = new WeakSet();
  let start = null;
  let previous = null;
  let suppressUntil = 0;

  const changedTouch = (event, identifier = null) => Array.from(event.changedTouches ?? [])
    .find((touch) => identifier === null || touch.identifier === identifier) ?? null;

  element.addEventListener('touchstart', (event) => {
    if (event.touches?.length !== 1) {
      start = null;
      previous = null;
      return;
    }
    const touch = changedTouch(event);
    if (!touch) return;
    start = {
      identifier: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      target: event.composedPath()[0],
    };
  }, { passive: true });

  element.addEventListener('touchmove', (event) => {
    if (!start) return;
    const touch = changedTouch(event, start.identifier);
    if (touch && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > maxTapMovement) {
      start = null;
    }
  }, { passive: true });

  element.addEventListener('touchcancel', () => {
    start = null;
    previous = null;
  }, { passive: true });

  element.addEventListener('touchend', (event) => {
    const touch = start && changedTouch(event, start.identifier);
    const target = event.composedPath()[0];
    if (!touch || event.defaultPrevented
        || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > maxTapMovement) {
      start = null;
      previous = null;
      return;
    }

    const now = performance.now();
    const doubleTap = previous && now - previous.time <= maxDelay
      && previous.target === target
      && Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) <= maxDistance;
    start = null;
    if (!doubleTap) {
      previous = { time: now, x: touch.clientX, y: touch.clientY, target };
      return;
    }

    previous = null;
    suppressUntil = now + maxDelay;
    event.preventDefault();
    if (!dispatch || !(target instanceof EventTarget)) return;

    const doubleClick = new MouseEvent('dblclick', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: 2,
      clientX: touch.clientX,
      clientY: touch.clientY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      view: window,
    });
    syntheticEvents.add(doubleClick);
    target.dispatchEvent(doubleClick);
  }, { passive: false });

  element.addEventListener('dblclick', (event) => {
    if (performance.now() >= suppressUntil || syntheticEvents.has(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}
