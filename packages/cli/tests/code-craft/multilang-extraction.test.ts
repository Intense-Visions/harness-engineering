/**
 * code-craft extracts units from every language harness supports.
 *
 * The phase's headline law, restated per language against the REAL fixture
 * corpus on disk rather than inline strings, so the files the skill would meet
 * in a repository are the files under test.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractCodeUnits } from '../../src/code-craft/extract/units';

function fixture(file: string): string {
  return path.join(__dirname, '..', 'fixtures', 'craft-languages', file);
}

/**
 * The POSITIVE CONTROL for every `it.each` below: a regression to TS-only turns
 * four cases red, not zero. A loop over an accidentally-empty table would
 * report a confident green, so the table's length is asserted first.
 */
const LANGUAGES = [
  { file: 'cart.py', language: 'python', fn: 'compute_total', method: 'add' },
  { file: 'cart.go', language: 'go', fn: 'computeTotal', method: 'Add' },
  { file: 'cart.rs', language: 'rust', fn: 'compute_total', method: 'add' },
  { file: 'Cart.java', language: 'java', fn: 'computeTotal', method: 'add' },
] as const;

describe('multi-language unit extraction', () => {
  it('covers every non-TS language harness supports', () => {
    expect(LANGUAGES).toHaveLength(4);
  });

  it.each(LANGUAGES)('$language: a named function yields a unit', async ({ file, fn }) => {
    const source = fs.readFileSync(fixture(file), 'utf-8');
    const units = await extractCodeUnits(source, fixture(file));
    expect(units.map((u) => u.name)).toContain(fn);
  });

  it.each(LANGUAGES)('$language: a named method yields a unit', async ({ file, method }) => {
    const source = fs.readFileSync(fixture(file), 'utf-8');
    const units = await extractCodeUnits(source, fixture(file));
    expect(units.map((u) => u.name)).toContain(method);
  });

  it('typescript control: the existing extractor is untouched', async () => {
    const file = fixture('cart.ts');
    const units = await extractCodeUnits(fs.readFileSync(file, 'utf-8'), file);
    expect(units.map((u) => u.name)).toContain('computeTotal');
  });

  it('parses the whole corpus well inside budget', async () => {
    const started = Date.now();
    for (const { file } of LANGUAGES) {
      await extractCodeUnits(fs.readFileSync(fixture(file), 'utf-8'), fixture(file));
    }
    // Measured during planning: ~20ms cold for all four (grammar load dominates),
    // ~0.6ms warm. 2000ms is a regression tripwire (e.g. a lost parser cache),
    // not a performance target.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
