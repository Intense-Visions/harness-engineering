/**
 * The orchestrator wiring, asserted on the REAL rendered prompt.
 *
 * `collectCodeCraftPrompts` returns `pendingPrompts[].userPrompt`, which IS the
 * string a model would receive. That is what makes this feature's wiring
 * falsifiable with no schema change at all — and it is the substitute for the
 * deferred run-summary incidence field, so these cases are load-bearing rather
 * than confirmatory.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CloneClass, CloneIndex } from '@harness-engineering/core';
import { runCodeCraft, collectCodeCraftPrompts } from '../../src/code-craft';
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics';
import { buildCodeCraftCloneIndex } from '../../src/code-craft/extract/siblings';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

/** Delegating call recorder for core's index builder (see siblings.test.ts). */
const recorder = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    buildCloneIndex: (...args: Parameters<typeof actual.buildCloneIndex>) => {
      recorder.calls.push(args);
      return actual.buildCloneIndex(...args);
    },
  };
});

/** >= 40 normalized tokens and >= 3 body statements — both bars, both needed. */
const PLANTED_CLONE = `export function summarize(rows: number[]): string {
  let total = 0;
  for (const row of rows) {
    if (row > 0) {
      total += row * 2;
    }
  }
  const average = rows.length === 0 ? 0 : total / rows.length;
  const label = average > 10 ? 'high' : 'low';
  return label + ':' + String(total) + ':' + String(average);
}
`;

/** Structurally different, so it forms no class with the planted clone. */
const LONE_FUNCTION = `export function reconcile(names: string[]): string {
  const seen = new Set<string>();
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name.toUpperCase());
    }
  }
  const joined = [...seen].sort().join('|');
  return joined.length > 3 ? joined : 'short:' + joined;
}
`;

const RUBRICS_FOR_FUNCTION = SEED_RUBRICS.filter((r) => rubricApplies(r, 'function')).length;

describe('code-craft sibling wiring (integration)', () => {
  let tmp: string;

  beforeEach(() => {
    recorder.calls.length = 0;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sib-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function write(rel: string, content: string): void {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  function plantThreeCopies(): void {
    write('packages/p/src/a.ts', PLANTED_CLONE);
    write('packages/p/src/b.ts', PLANTED_CLONE);
    write('packages/p/src/c.ts', PLANTED_CLONE);
  }

  /** Prompts for one file, keyed by rubric id, from a real collect run. */
  async function promptsFor(
    fileSuffix: string,
    input: Parameters<typeof collectCodeCraftPrompts>[0]
  ): Promise<Map<string, string>> {
    const collected = await collectCodeCraftPrompts(input);
    expect(collected.status).toBe('collected');
    const runFile = collected.runFile;
    expect(runFile).toBeDefined();
    const meta = JSON.parse(fs.readFileSync(runFile!, 'utf-8')) as {
      meta: { prompts: Array<{ promptId: string; file: string; rubricId: string }> };
    };
    const byId = new Map(collected.pendingPrompts.map((p) => [p.promptId, p.userPrompt]));
    const out = new Map<string, string>();
    for (const rec of meta.meta.prompts) {
      if (!rec.file.endsWith(fileSuffix)) continue;
      out.set(rec.rubricId, byId.get(rec.promptId)!);
    }
    return out;
  }

  it("the CODE-R004 prompt carries the planted clone's sibling locations", async () => {
    plantThreeCopies();
    const prompts = await promptsFor('a.ts', { path: tmp });

    const r004 = prompts.get('CODE-R004');
    expect(r004).toBeDefined();
    // THE FEATURE'S LOAD-BEARING END-TO-END ASSERTION. Mutation: default
    // `input.siblings` to false — both locations absent.
    expect(r004!).toContain('packages/p/src/b.ts:1');
    expect(r004!).toContain('packages/p/src/c.ts:1');
    expect(r004!).toContain('MECHANICAL DUPLICATION EVIDENCE');
    expect(r004!).not.toContain('packages/p/src/a.ts:1');
  });

  it("the other six rubrics' prompts for the SAME unit are byte-identical", async () => {
    plantThreeCopies();
    const withSiblings = await promptsFor('a.ts', { path: tmp });
    const without = await promptsFor('a.ts', { path: tmp, siblings: false });

    // Reachable because the planted unit genuinely HAS siblings (asserted by
    // the case above), so the rubric gate is the only thing keeping these six
    // unchanged. Mutation: drop the rubric gate — all six differ.
    expect(withSiblings.size).toBe(RUBRICS_FOR_FUNCTION);
    expect(RUBRICS_FOR_FUNCTION).toBeGreaterThan(1);
    let identical = 0;
    for (const [rubricId, prompt] of withSiblings) {
      if (rubricId === 'CODE-R004') {
        expect(prompt).not.toBe(without.get(rubricId));
        continue;
      }
      expect(prompt).toBe(without.get(rubricId));
      identical++;
    }
    expect(identical).toBe(RUBRICS_FOR_FUNCTION - 1);
  });

  it('a unit with no siblings renders every prompt byte-identically', async () => {
    plantThreeCopies();
    write('packages/p/src/lone.ts', LONE_FUNCTION);

    const withSiblings = await promptsFor('lone.ts', { path: tmp });
    const without = await promptsFor('lone.ts', { path: tmp, siblings: false });

    // Mutation: attach the nearest class instead of undefined — CODE-R004
    // differs. Reachable because the index DID build (three other copies form
    // a real class) and this unit simply is not in it.
    expect(withSiblings.size).toBe(RUBRICS_FOR_FUNCTION);
    for (const [rubricId, prompt] of withSiblings) {
      expect(prompt, `${rubricId} drifted for a unit with no siblings`).toBe(without.get(rubricId));
    }
  });

  it('siblings: false builds no index at all', async () => {
    plantThreeCopies();
    await collectCodeCraftPrompts({ path: tmp, siblings: false });
    // Mutation: drop the `input.siblings === false` guard — one call.
    expect(recorder.calls).toHaveLength(0);
  });

  it('builds the index exactly ONCE per run (the NFR target)', async () => {
    plantThreeCopies();
    await collectCodeCraftPrompts({ path: tmp });
    // Three files, one build. Mutation: move resolveSiblingContext inside the
    // file loop — three calls.
    expect(recorder.calls).toHaveLength(1);
    // And it was given the FULL discovery, not one file.
    expect((recorder.calls[0]![0] as string[]).length).toBe(3);
  });

  it('prefers an injected index and looks a unit up once per UNIT, not per rubric', async () => {
    plantThreeCopies();
    const real = await buildCodeCraftCloneIndex(tmp);
    expect(real).toBeDefined();
    recorder.calls.length = 0;

    const requested: string[] = [];
    const counting: CloneIndex = {
      ...real!,
      byMember: {
        get: (key: string): CloneClass | undefined => {
          requested.push(key);
          return real!.byMember.get(key);
        },
        has: (key: string) => real!.byMember.has(key),
        size: real!.byMember.size,
      } as unknown as CloneIndex['byMember'],
    };

    await collectCodeCraftPrompts({ path: tmp, __testCloneIndex: counting });

    // The injected index is preferred, so nothing was built.
    expect(recorder.calls).toHaveLength(0);
    // The exact key for a.ts's one unit must be requested EXACTLY ONCE.
    // Mutation: move the resolveUnitSiblings call inside the rubric loop — this
    // rises from 1 to RUBRICS_FOR_FUNCTION (7). Reachable because the unit has
    // more than one applicable rubric, asserted here so a kind-filter change
    // cannot make the case vacuous.
    expect(RUBRICS_FOR_FUNCTION).toBeGreaterThan(1);
    expect(requested.filter((k) => k === 'packages/p/src/a.ts:1')).toHaveLength(1);
    // Three units, one exact-hit lookup each, and no second probe offset is
    // needed because every hit is exact in this fixture.
    expect(requested).toHaveLength(3);
  });

  it('an Err from the index degrades the run instead of failing it', async () => {
    // A genuine Err, not the empty-discovery guard: `**/generated/**` is in
    // core's DEFAULT_IGNORE_PATTERNS but is NOT in code-craft's EXCLUDED_DIRS,
    // so discovery finds the file, every candidate is ineligible, and
    // buildCloneIndex takes its refuse-to-pass-over-zero-files path.
    write('packages/p/src/generated/a.ts', PLANTED_CLONE);
    write('packages/p/src/generated/b.ts', PLANTED_CLONE);

    const built = await buildCodeCraftCloneIndex(tmp);
    expect(recorder.calls).toHaveLength(1);
    expect(built).toBeUndefined();

    // Mutation: throw instead of returning undefined — the run rejects.
    const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });
    expect(out.summary.counts.filesScanned).toBe(2);
    expect(out.summary.counts.unitsDetected).toBe(2);
    expect(out.findings.length).toBeGreaterThan(0);
  });

  it('keeps the pre-change budget semantics exactly', async () => {
    plantThreeCopies();
    // Measured against unmodified src BEFORE the Task 7 refactor: the budget is
    // checked after EACH prompt and breaks MID-UNIT, so promptCount is always
    // budget + 1. Checking once per unit instead would report a whole extra
    // unit's worth of rubrics (14 for a budget of 8, not 9).
    for (const [budget, expected] of [
      [0, 1],
      [1, 2],
      [5, 6],
      [8, 9],
      [13, 14],
    ] as const) {
      const r = await collectCodeCraftPrompts({ path: tmp, promptBudget: budget });
      expect(r.status, `budget ${budget}`).toBe('budget-exceeded');
      expect(r.projection.promptCount, `budget ${budget}`).toBe(expected);
    }
    const full = await collectCodeCraftPrompts({ path: tmp, promptBudget: 100 });
    expect(full.status).toBe('collected');
    expect(full.projection.promptCount).toBe(3 * RUBRICS_FOR_FUNCTION);
  });
});
