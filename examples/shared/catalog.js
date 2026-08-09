import { demos } from '../component-demos/catalog.js';

const componentExamples = demos.map((demo) => ({
  ...demo,
  href: `./component-demos/${demo.id}/`,
}));

export const examples = [
  { id: 'signal-generator', href: './signal-generator/', title: 'Signal Generator', summary: 'Integrated AudioWorklet synth with a MIDI drawer, live scope, and real MIDI mapping.', components: ['compost-audio', 'compost-button', 'compost-drawer', 'compost-knob', 'compost-midi', 'compost-midi-mappings', 'compost-midi-monitor', 'compost-number-box', 'compost-piano', 'compost-scope', 'compost-select', 'compost-slider'], utilities: ['ParameterController', 'MIDIMappings'], runtime: 'JavaScript AudioWorklet.' },
  { id: 'midi-controller', href: './midi-controller/', title: 'MIDI Controller', summary: 'Output-only MIDI controller.', components: ['compost-midi', 'compost-button', 'compost-knob', 'compost-piano'], utilities: ['MIDI helpers'], runtime: 'Web MIDI output.' },
  ...componentExamples,
  { id: 'parameter-sync', href: './parameter-sync/', title: 'Parameter Sync', summary: 'Two controls share one parameter and reflect authoritative host updates.', components: ['compost-knob', 'compost-slider'], utilities: ['ParameterController'], runtime: 'DOM only.' },
];

export function getExample(id) { return examples.find((example) => example.id === id); }
