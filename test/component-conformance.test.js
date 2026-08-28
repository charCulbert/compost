import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);

// Common boolean contracts. Components absent from a column do not promise it.
const componentContracts = [
  { id: 'compost-button', disabled: true },
  { id: 'compost-clip-grid', disabled: true },
  { id: 'compost-device-selector', disabled: true },
  { id: 'compost-envelope-editor', disabled: true, readonly: true },
  { id: 'compost-knob', disabled: true },
  { id: 'compost-midi-mappings', disabled: true },
  { id: 'compost-note-editor', disabled: true, readonly: true },
  { id: 'compost-number-box', disabled: true },
  { id: 'compost-select', disabled: true },
  { id: 'compost-slider', disabled: true },
  { id: 'compost-timeline', disabled: true, readonly: true },
];

test('common boolean attributes have reflected properties', () => {
  for (const contract of componentContracts) {
    const source = fs.readFileSync(path.join(root, `src/components/${contract.id}.js`), 'utf8');
    const declaration = fs.readFileSync(path.join(root, `src/components/${contract.id}.d.ts`), 'utf8');
    for (const name of ['disabled', 'readonly']) {
      if (!contract[name]) continue;
      assert.match(source, new RegExp(`['\"]${name}['\"]`, 'u'), `${contract.id} observes ${name}`);
      assert.match(source, new RegExp(`get ${name}\\s*\\(`, 'u'), `${contract.id}.${name} getter`);
      assert.match(source, new RegExp(`set ${name}\\s*\\(`, 'u'), `${contract.id}.${name} setter`);
      assert.match(declaration, new RegExp(`get ${name}\\(\\): boolean`, 'u'), `${contract.id}.${name} declared getter`);
      assert.match(declaration, new RegExp(`set ${name}\\(value: boolean\\)`, 'u'), `${contract.id}.${name} declared setter`);
    }
  }
});

test('every public JavaScript export has a declaration', () => {
  const packageJSON = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const target of new Set(Object.values(packageJSON.exports))) {
    assert.equal(target.endsWith('.js'), true, target);
    assert.equal(fs.existsSync(path.join(root, target.replace(/\.js$/u, '.d.ts'))), true, target);
  }
});

test('every timeline intent is present in its public detail map', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/compost-timeline.js'), 'utf8');
  const declaration = fs.readFileSync(path.join(root, 'src/components/compost-timeline.d.ts'), 'utf8');
  const emitted = [...source.matchAll(/eventOf\('([^']+)'/gu)].map((match) => match[1]);
  for (const name of new Set(emitted)) {
    assert.match(declaration, new RegExp(`['\"]?${name}['\"]?:`, 'u'), name);
  }
  assert.match(declaration, /'locator-prev':/u);
  assert.match(declaration, /'locator-next':/u);
});
