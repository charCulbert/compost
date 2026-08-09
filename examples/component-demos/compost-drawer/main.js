const drawers = new Map(
  [...document.querySelectorAll('[data-drawer-id]')]
    .map((drawer) => [drawer.dataset.drawerId, drawer]));
const targetOption = document.querySelector('[data-option="target"]');
const openOption = document.querySelector('[data-option="open"]');
const titleOption = document.querySelector('[data-option="title"]');
const sizeOption = document.querySelector('[data-option="size"]');
const minSizeOption = document.querySelector('[data-option="min-size"]');
const maxSizeOption = document.querySelector('[data-option="max-size"]');
const state = document.querySelector('[data-drawer-state]');

function selectedDrawer() {
  return drawers.get(targetOption.value);
}

function selectedTitle() {
  return selectedDrawer().querySelector('[data-drawer-title]');
}

function refreshOptions() {
  const drawer = selectedDrawer();
  openOption.checked = drawer.open;
  titleOption.value = selectedTitle().textContent;
  sizeOption.value = String(Math.round(drawer.size));
  minSizeOption.value = drawer.getAttribute('min-size') || '80';
  maxSizeOption.value = drawer.getAttribute('max-size') || '1200';
  sizeOption.min = String(Math.round(drawer.minSize));
  sizeOption.max = String(Math.round(drawer.maxSize));
  state.value = `${drawer.open ? 'Open' : 'Closed'} · ${drawer.edge} · ${Math.round(drawer.size)}px`;
}

targetOption.addEventListener('change', refreshOptions);
openOption.addEventListener('change', () => { selectedDrawer().open = openOption.checked; });
titleOption.addEventListener('input', () => {
  const drawer = selectedDrawer();
  selectedTitle().textContent = titleOption.value;
  if (titleOption.value) drawer.removeAttribute('label');
  else drawer.setAttribute('label', `${drawer.dataset.drawerId} drawer`);
});
sizeOption.addEventListener('input', () => {
  const drawer = selectedDrawer();
  drawer.size = sizeOption.value;
  refreshOptions();
});
function applyBounds() {
  const drawer = selectedDrawer();
  const min = Number(minSizeOption.value);
  const max = Number(maxSizeOption.value);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  const safeMin = Math.max(0, min);
  const safeMax = Math.max(safeMin, max);
  drawer.setAttribute('min-size', String(safeMin));
  drawer.setAttribute('max-size', String(safeMax));
  refreshOptions();
}
minSizeOption.addEventListener('change', applyBounds);
maxSizeOption.addEventListener('change', applyBounds);
for (const drawer of drawers.values()) {
  drawer.addEventListener('toggle', () => {
    if (drawer === selectedDrawer()) refreshOptions();
  });
  drawer.addEventListener('drawer-resize', ({ detail }) => {
    if (drawer !== selectedDrawer()) return;
    sizeOption.value = String(Math.round(detail.size));
    refreshOptions();
  });
}
refreshOptions();
