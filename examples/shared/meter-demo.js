const MIN_LEVEL = -90;
const PEAK_HOLD_SECONDS = 1.5;
const PEAK_FALL_DB_PER_SECOND = 18;

function decibels(value) {
  return value > 0 ? 20 * Math.log10(value) : MIN_LEVEL;
}

export function nextPeakHold(state, peak, elapsed) {
  if (peak >= state.level) return { level: peak, remaining: PEAK_HOLD_SECONDS };
  if (state.remaining > 0) {
    return { level: state.level, remaining: Math.max(0, state.remaining - elapsed) };
  }
  return {
    level: Math.max(peak, state.level - elapsed * PEAK_FALL_DB_PER_SECOND),
    remaining: 0,
  };
}

export function connectMeters(audio, meters) {
  let context;
  let analysers;
  let samples;
  let frame = 0;
  let previousTime = 0;
  const hold = [
    { level: MIN_LEVEL, remaining: 0 },
    { level: MIN_LEVEL, remaining: 0 },
  ];
  const clippedUntil = [0, 0];

  const setState = (state) => meters.forEach((meter) => meter.setState(state));
  setState({
    primaryLabel: 'Peak',
    secondaryLabel: 'Average',
    holdLabel: 'Hold',
    unit: 'dB',
    channels: [
      { label: 'L', primary: MIN_LEVEL },
      { label: 'R', primary: MIN_LEVEL },
    ],
  });

  const update = (time) => {
    const elapsed = previousTime ? (time - previousTime) / 1000 : 0;
    previousTime = time;

    const channels = analysers.map((analyser, index) => {
      analyser.getFloatTimeDomainData(samples[index]);
      let peak = 0;
      let energy = 0;
      for (const sample of samples[index]) {
        const magnitude = Math.abs(sample);
        peak = Math.max(peak, magnitude);
        energy += sample * sample;
      }

      const peakLevel = decibels(peak);
      hold[index] = nextPeakHold(hold[index], peakLevel, elapsed);
      if (peak >= 1) clippedUntil[index] = time + 1000;
      return {
        label: index ? 'R' : 'L',
        primary: peakLevel,
        secondary: decibels(Math.sqrt(energy / samples[index].length)),
        peak: hold[index].level,
        over: peakLevel > 0 ? peakLevel : null,
        clipped: clippedUntil[index] > time,
      };
    });

    setState({ channels });
    if (!audio.paused && !audio.ended) frame = requestAnimationFrame(update);
  };

  audio.addEventListener('play', async () => {
    if (!context) {
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const splitter = context.createChannelSplitter(2);
      analysers = [context.createAnalyser(), context.createAnalyser()];
      for (const analyser of analysers) analyser.fftSize = 2048;
      samples = analysers.map((analyser) => new Float32Array(analyser.fftSize));
      source.connect(splitter);
      splitter.connect(analysers[0], 0);
      splitter.connect(analysers[1], 1);
      source.connect(context.destination);
    }

    await context.resume();
    cancelAnimationFrame(frame);
    previousTime = 0;
    frame = requestAnimationFrame(update);
  });

  audio.addEventListener('pause', () => cancelAnimationFrame(frame));
}
