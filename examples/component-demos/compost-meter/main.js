const meter = document.querySelector('compost-meter');
const left = document.querySelector('[data-level="left"]');
const right = document.querySelector('[data-level="right"]');
const clipped = document.querySelector('[data-clipped]');

function update() {
  const leftLevel = Number(left.value);
  const rightLevel = Number(right.value);
  meter.setState({
    primaryLabel: 'Peak',
    secondaryLabel: 'Average',
    holdLabel: 'Hold',
    unit: 'dBFS',
    channels: [
      { label: 'L', primary: leftLevel, secondary: leftLevel - 9, peak: leftLevel + 3 },
      {
        label: 'R', primary: rightLevel, secondary: rightLevel - 9,
        peak: rightLevel + 3, over: rightLevel, clipped: clipped.checked,
      },
    ],
  });
}

left.addEventListener('input', update);
right.addEventListener('input', update);
clipped.addEventListener('change', update);
update();
