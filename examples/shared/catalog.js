const elementIDs = [
  'compost-audio', 'compost-midi', 'compost-device-selector', 'compost-drawer',
  'compost-knob', 'compost-slider', 'compost-meter', 'compost-number-box', 'compost-button',
  'compost-select', 'compost-piano', 'compost-scope', 'compost-midi-monitor',
  'compost-midi-mappings', 'compost-clip-grid', 'compost-envelope-editor',
  'compost-note-editor', 'compost-timeline', 'compost-window', 'compost-popup',
];

const elementExamples = elementIDs.map((id) => ({
  id,
  href: `./${id}/`,
  title: id,
  summary: `One ${id} scenario with defaults and visible markup.`,
}));

export const examples = [
  { id: 'monosynth', href: './monosynth/', title: 'Mono Synth', summary: 'Editable notes, ADSR controls, and a pitch envelope drive a small monophonic JavaScript AudioWorklet with live scope, meter, piano, and MIDI mapping.', components: ['compost-audio', 'compost-button', 'compost-drawer', 'compost-envelope-editor', 'compost-knob', 'compost-meter', 'compost-midi', 'compost-midi-mappings', 'compost-midi-monitor', 'compost-note-editor', 'compost-number-box', 'compost-piano', 'compost-scope', 'compost-select', 'compost-slider'], utilities: ['ParameterController', 'MIDIMappings'], runtime: 'JavaScript AudioWorklet.' },
  { id: 'midi-controller', href: './midi-controller/', title: 'MIDI Controller', summary: 'Output-only MIDI controller.', components: ['compost-midi', 'compost-button', 'compost-knob', 'compost-piano'], utilities: ['MIDI helpers'], runtime: 'Web MIDI output.' },
  ...elementExamples,
  { id: 'parameter-sync', href: './parameter-sync/', title: 'Parameter Sync', summary: 'Two controls share one parameter and reflect authoritative host updates.', components: ['compost-knob', 'compost-slider'], utilities: ['ParameterController'], runtime: 'DOM only.' },
];

export function getExample(id) { return examples.find((example) => example.id === id); }
