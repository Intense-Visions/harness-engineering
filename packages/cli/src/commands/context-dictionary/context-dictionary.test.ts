import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readComprehensionCorpus } from './corpus';
import { loadReport, renderReport } from './index';

/** Write a fake comprehension unit with the given invariant + import lines. */
function writeUnit(cwd: string, module: string, invariants: string[], imports: string[]): void {
  const dir = join(cwd, '.harness', 'comprehension', module);
  mkdirSync(dir, { recursive: true });
  const body = [
    '---',
    'schemaVersion: 1',
    `module: "${module}"`,
    '---',
    '',
    '## Summary',
    '',
    'A module.',
    '',
    '## Invariants',
    '',
    ...invariants.map((i) => `- ${i}`),
    '',
    '## Interface Contract',
    '',
    '```ts',
    '```',
    '',
    '## Dependency Slice',
    '',
    '```',
    ...imports,
    '```',
    '',
  ].join('\n');
  writeFileSync(join(dir, '_module.md'), body, 'utf8');
}

describe('readComprehensionCorpus', () => {
  it('returns [] when there is no comprehension directory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ctx-dict-empty-'));
    expect(await readComprehensionCorpus(cwd)).toEqual([]);
  });

  it('parses invariant and import spans, one document per unit', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ctx-dict-parse-'));
    writeUnit(
      cwd,
      'a',
      ['always build the CLI before committing'],
      ["import { describe, expect, it } from 'vitest'"]
    );
    const corpus = await readComprehensionCorpus(cwd);
    expect(corpus).toHaveLength(1);
    const labels = corpus[0]!.spans.map((s) => s.label);
    expect(labels).toContain('invariant:always build the CLI before committing');
    expect(labels).toContain("import:import { describe, expect, it } from 'vitest'");
  });
});

describe('loadReport over a synthetic corpus', () => {
  it('mines a span recurring across many units into the codebook with projected savings', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ctx-dict-report-'));
    // The vitest import recurs across 8 modules — a genuine recurring span.
    const sharedImport = "import { describe, expect, it, beforeEach, afterEach } from 'vitest'";
    for (let i = 0; i < 8; i++) {
      writeUnit(cwd, `mod${i}`, [`invariant unique to module ${i} only`], [sharedImport]);
    }
    const report = await loadReport(cwd);
    expect(report.corpusSize).toBe(8);
    expect(report.codebook.entries.length).toBeGreaterThan(0);
    // The recurring import term is admitted.
    const admitted = report.codebook.entries.some((e) => e.definition.includes("from 'vitest'"));
    expect(admitted).toBe(true);
    expect(report.savings.savedChars).toBeGreaterThan(0);

    // The renderer produces a headline and a savings block.
    const text = renderReport(report).join('\n');
    expect(text).toContain('trained context dictionary');
    expect(text).toContain('projected savings');
    expect(text).toContain('codebook terms');
  });
});
