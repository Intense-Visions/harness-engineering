/**
 * code-craft extracts units from every language harness supports.
 *
 * The phase's headline law, restated per language against the REAL fixture
 * corpus on disk rather than inline strings, so the files the skill would meet
 * in a repository are the files under test.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { extractCodeUnits } from '../../src/code-craft/extract/units';
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics/index';
import { collectCodeCraftPrompts } from '../../src/code-craft';

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

  it.each(LANGUAGES)('$language: every unit selects at least one rubric', async ({ file }) => {
    const p = fixture(file);
    const units = await extractCodeUnits(fs.readFileSync(p, 'utf-8'), p);
    expect(units.length).toBeGreaterThan(0); // the loop below is vacuous without this
    for (const unit of units) {
      const selected = SEED_RUBRICS.filter((r) => rubricApplies(r, unit.kind));
      expect(
        selected.length,
        `${file} ${unit.kind}:${unit.name} (L${unit.line}) selected zero rubrics — ` +
          'extracted, counted, and critiqued by nothing'
      ).toBeGreaterThan(0);
    }
  });

  it.each(LANGUAGES)('$language: no unit kind escapes the closed union', async ({ file }) => {
    const p = fixture(file);
    const units = await extractCodeUnits(fs.readFileSync(p, 'utf-8'), p);
    for (const unit of units) {
      expect(['function', 'method', 'class']).toContain(unit.kind);
    }
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

/**
 * A unit count is not evidence of critique, and a rubric count is not evidence
 * of a prompt. This closes the chain to the artifact code-craft actually emits.
 */
describe('multi-language prompt production', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-multilang-'));
    const src = path.join(root, 'src');
    fs.mkdirSync(src, { recursive: true });
    for (const file of [...LANGUAGES.map((l) => l.file), 'cart.ts']) {
      fs.copyFileSync(fixture(file), path.join(src, file));
    }
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('produces prompts for every non-TS language', async () => {
    const out = await collectCodeCraftPrompts({ path: root, siblings: false });
    expect(out.status).toBe('collected');
    for (const { file } of LANGUAGES) {
      const forFile = out.pendingPrompts.filter((p) => p.userPrompt.includes(file));
      expect(forFile.length, `zero prompts for ${file}`).toBeGreaterThan(0);
    }
  });

  it('emits no duplicate (file, unit, rubric) prompt', async () => {
    const out = await collectCodeCraftPrompts({ path: root, siblings: false });
    const keys = out.pendingPrompts.map((p) => p.userPrompt);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * PLAN CORRECTION. The plan asserted `/\btiny\b/.test(userPrompt)` is never
   * true. Measured, that is wrong for a reason that is not a defect: a CLASS
   * unit's prompt carries the class's OWN source span, and in Java `tiny` is a
   * method inside `class Cart`, so the word appears in 4 legitimate prompts
   * (the 4 class-applicable rubrics x the one Java class). Asserting on the
   * word would have forced a fixture chosen to pass.
   *
   * What "bills nothing for `tiny`" actually means is that `tiny` is never the
   * UNIT under review — the `Unit:` line is the billing surface, one prompt per
   * (unit, rubric). That is what is asserted, with a positive control at the
   * same scope so an absence cannot pass because the regex shape never matches.
   */
  it('never bills the one-line `tiny` as a unit in any language', async () => {
    // Budget raised ON PURPOSE. Under the DEFAULT budget of 100 this law was
    // not falsifiable on its own terms: measured, any mutation that bills the
    // four `tiny` one-liners also pushes the corpus past 100 prompts, so the
    // run returns `budget-exceeded` with a truncated prompt list and the test
    // reddens through its POSITIVE CONTROL rather than through the assertion it
    // exists to make. Verified by M-SPAN-1 (MIN_UNIT_LINES = 1). The realistic
    // default-budget cost path is asserted by the first test in this block.
    const out = await collectCodeCraftPrompts({ path: root, siblings: false, promptBudget: 500 });
    const billedUnits = out.pendingPrompts.map(
      (p) => p.userPrompt.match(/Unit: kind=\w+, name=(\S+?), line=/)?.[1]
    );
    // POSITIVE CONTROL, same scope and same regex: a real unit IS billed, so a
    // green here cannot come from a regex that matches nothing.
    expect(billedUnits).toContain('add');
    expect(billedUnits.filter((n) => n === 'tiny')).toHaveLength(0);
  });

  it('bills exactly the three substantive units per language, TS included', async () => {
    // Raised for the same reason as above: a truncated prompt list would make
    // this count red for the wrong reason.
    const out = await collectCodeCraftPrompts({ path: root, siblings: false, promptBudget: 500 });
    for (const file of [...LANGUAGES.map((l) => l.file), 'cart.ts']) {
      const forFile = out.pendingPrompts.filter((p) => p.userPrompt.includes(`/${file}`));
      const units = new Set(
        forFile.map((p) => p.userPrompt.match(/Unit: kind=(\w+), name=(\S+?), line=/)![0])
      );
      expect(units.size, `${file} billed ${units.size} units, expected 3`).toBe(3);
    }
  });
});
