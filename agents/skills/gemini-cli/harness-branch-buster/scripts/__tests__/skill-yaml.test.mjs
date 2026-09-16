import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const yamlPath = join(here, '..', '..', 'skill.yaml');

test('skill.yaml declares required top-level keys', () => {
  const text = readFileSync(yamlPath, 'utf8');
  for (const key of ['name:', 'version:', 'description:', 'type:', 'tier:', 'phases:', 'tools:']) {
    assert.ok(text.includes(key), `missing ${key}`);
  }
  assert.match(text, /name:\s*harness-branch-buster/);
});

test('skill.yaml lists all nine phases, including the delegating fan-out', () => {
  const text = readFileSync(yamlPath, 'utf8');
  for (const phase of [
    'intake',
    'sync',
    'mechanical',
    'scope-calibrate',
    'fan-out',
    'validate-dedup',
    'classify-report',
    'fix',
    'verify-finalize',
  ]) {
    assert.ok(text.includes(`name: ${phase}`), `missing phase ${phase}`);
  }
});
