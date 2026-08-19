const ids = [
  'compost-audio', 'compost-midi', 'compost-device-selector', 'compost-drawer',
  'compost-knob', 'compost-slider', 'compost-gain', 'compost-number-box', 'compost-button',
  'compost-select', 'compost-piano', 'compost-scope', 'compost-midi-monitor',
  'compost-midi-mappings',
];

export const demos = ids.map((id) => ({
  id,
  title: id,
  summary: {
    'compost-audio': 'Start, suspend, and inspect one browser AudioContext.',
    'compost-midi': 'Select a real MIDI input or output and inspect messages.',
    'compost-device-selector': 'Exercise the host-backed audio and MIDI settings contract.',
    'compost-drawer': 'Collapsible content with native details behavior and docked resizing.',
    'compost-knob': 'Curve-aware drag, fine movement, editing, and reset behavior.',
    'compost-slider': 'Orientation, range, curve, midpoint, step, fine drag, editing, and reset behavior.',
    'compost-gain': 'A channel-strip fader with an independent live peak meter, peak hold, and clip.',
    'compost-number-box': 'Typed values plus normal and fine drag movement.',
    'compost-button': 'One square momentary trigger and one square latching switch.',
    'compost-select': 'A styled popup select with native-like keyboard and typeahead behavior.',
    'compost-scope': 'Lock a waveform to a phase-aligned sync channel and inspect analyser modes.',
    'compost-piano': 'Play notes with pointer or computer keyboard and inspect events.',
    'compost-midi-monitor': 'Log incoming messages from a selected real MIDI input.',
    'compost-midi-mappings': 'Learn, edit, and clear compact MIDI mappings.',
  }[id] || `Interactive ${id} component demo.`,
  css: '',
  controls: [],
}));

export function getDemo(id) { return demos.find((demo) => demo.id === id); }
