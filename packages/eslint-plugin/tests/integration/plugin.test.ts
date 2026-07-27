// tests/integration/plugin.test.ts
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import plugin from '../../src/index';

const rulesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'rules');

/** Every rule file in src/rules/ (a file's basename IS its rule name). */
const ruleFileNames = readdirSync(rulesDir)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.test.ts'))
  .map((f) => f.slice(0, -3))
  .sort();

describe('plugin exports', () => {
  // Invariant, not a hardcoded roster: the auto-generated barrel must register
  // EXACTLY the rule files on disk — every file, nothing phantom. A new rule
  // file therefore needs no edit here (or to the barrel); dropping the file in
  // src/rules/ is the whole registration. Guards both a missing registration and
  // a stale/dangling one.
  it('registers exactly the rule files in src/rules/', () => {
    expect(Object.keys(plugin.rules).sort()).toEqual(ruleFileNames);
    expect(ruleFileNames.length).toBeGreaterThan(0);
  });

  it('exports recommended config', () => {
    expect(plugin.configs.recommended).toBeDefined();
    expect(plugin.configs.recommended.rules).toBeDefined();
  });

  it('exports strict config', () => {
    expect(plugin.configs.strict).toBeDefined();
    expect(plugin.configs.strict.rules).toBeDefined();
  });

  it('configs reference the plugin', () => {
    const recommended = plugin.configs.recommended;
    expect(recommended.plugins?.['@harness-engineering']).toBe(plugin);
  });
});
