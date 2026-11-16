/**
 * The clone-index build OUTCOME, carried to every surface an operator reads.
 *
 * Before this, `buildCodeCraftCloneIndex` answered `undefined` on an `Err` and
 * on an empty discovery and DROPPED the reason, so "this codebase has no
 * duplication" and "the clone index never built" produced byte-identical run
 * output. These cases pin that the two now differ on the run summary (inline
 * and finalize), on the in-session collect response, and on the `code_craft`
 * MCP response — and that a failed build still never fails the run (craft is
 * advisory and never blocking).
 *
 * Source: docs/roadmap.d/code-craft-sibling-evidence-incidence.md
 *   (deferred follow-up of docs/changes/duplication-detection/proposal.md Phase 5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCodeCraft, collectCodeCraftPrompts, finalizeCodeCraft } from '../../src/code-craft';
import { buildCodeCraftCloneIndexOutcome } from '../../src/code-craft/extract/siblings';
import { handleCodeCraft } from '../../src/mcp/tools/code-craft';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

/**
 * Delegating recorder for core's index builder, with a per-test override.
 *
 * `override` lets a case FORCE an `Err` or a throw from the real call site
 * (rather than fabricating the outcome), which is the only way to prove the
 * reason that reaches the summary is the one core produced.
 */
const ctl = vi.hoisted(() => ({
  calls: 0,
  override: undefined as undefined | (() => unknown),
}));

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    buildCloneIndex: (...args: Parameters<typeof actual.buildCloneIndex>) => {
      ctl.calls += 1;
      if (ctl.override !== undefined) return ctl.override();
      return actual.buildCloneIndex(...args);
    },
  };
});

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

const FORCED_MESSAGE = 'forced clone-index failure for the acceptance test';

describe('code-craft sibling-index outcome', () => {
  let tmp: string;
  const savedEnv = process.env.HARNESS_CRAFT_LLM;

  beforeEach(() => {
    ctl.calls = 0;
    ctl.override = undefined;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sib-outcome-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  function write(rel: string, content: string): void {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  function plantThreeCopiesAndALoner(): void {
    write('packages/p/src/a.ts', PLANTED_CLONE);
    write('packages/p/src/b.ts', PLANTED_CLONE);
    write('packages/p/src/c.ts', PLANTED_CLONE);
    write('packages/p/src/lone.ts', LONE_FUNCTION);
  }

  function forceErr(): void {
    ctl.override = () =>
      Promise.resolve({
        ok: false,
        error: {
          code: 'INVALID_CONFIG',
          message: FORCED_MESSAGE,
          details: { reason: 'invalid-ignore-pattern' },
          suggestions: [],
        },
      });
  }

  describe('built', () => {
    it('reports the class count and the critiqued units that resolved siblings', async () => {
      plantThreeCopiesAndALoner();
      const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });

      // Three copies form ONE class; the loner is critiqued but has no
      // siblings, so it must not be counted. Mutation: count every critiqued
      // unit — 4, not 3.
      expect(out.summary.counts.unitsDetected).toBe(4);
      expect(out.summary.siblingIndex).toEqual({
        status: 'built',
        classes: 1,
        unitsWithSiblings: 3,
      });
    });

    it('counts only units in the CRITIQUED scope, not the whole index', async () => {
      plantThreeCopiesAndALoner();
      const out = await runCodeCraft({
        path: tmp,
        files: [path.join(tmp, 'packages/p/src/a.ts')],
        __testProvider: new MockLlmProvider(),
      });
      // The index is built over the full discovery (so the class still forms),
      // but only a.ts was critiqued. Mutation: report index membership — 3.
      expect(out.summary.siblingIndex).toEqual({
        status: 'built',
        classes: 1,
        unitsWithSiblings: 1,
      });
    });

    it('reports built with zero incidence when the index built but nothing is duplicated', async () => {
      write('packages/p/src/lone.ts', LONE_FUNCTION);
      const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });
      // This is "no duplication", and it must stay distinguishable from
      // "the index did not build" below.
      expect(out.summary.siblingIndex).toEqual({
        status: 'built',
        classes: 0,
        unitsWithSiblings: 0,
      });
    });

    it('survives the in-session collect -> finalize round trip', async () => {
      plantThreeCopiesAndALoner();
      const collected = await collectCodeCraftPrompts({ path: tmp });
      expect(collected.status).toBe('collected');
      expect(collected.siblingIndex).toEqual({
        status: 'built',
        classes: 1,
        unitsWithSiblings: 3,
      });

      const final = await finalizeCodeCraft({ path: tmp, runId: collected.runId, responses: [] });
      // Mutation: not persisting it in run-state — undefined here.
      expect(final.summary.siblingIndex).toEqual(collected.siblingIndex);
    });
  });

  describe('failed', () => {
    it('reports a forced Err with its reason, and the run still completes', async () => {
      plantThreeCopiesAndALoner();
      forceErr();

      const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });

      expect(ctl.calls).toBe(1);
      expect(out.summary.siblingIndex?.status).toBe('failed');
      const outcome = out.summary.siblingIndex as { status: 'failed'; reason: string };
      expect(outcome.reason).toContain(FORCED_MESSAGE);
      expect(outcome.reason).toContain('invalid-ignore-pattern');
      // Advisory, never blocking: the critique ran in full.
      expect(out.summary.counts.unitsDetected).toBe(4);
      expect(out.findings.length).toBeGreaterThan(0);
    });

    it('reports a THROWN build as failed instead of rejecting the run', async () => {
      plantThreeCopiesAndALoner();
      ctl.override = () => Promise.reject(new Error('index builder exploded'));

      const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });

      expect(out.summary.siblingIndex).toEqual({
        status: 'failed',
        reason: 'index builder exploded',
      });
      expect(out.summary.counts.unitsDetected).toBe(4);
    });

    it('reports core’s real refuse-to-pass-over-zero-files Err', async () => {
      // Every discovered file is under core's default-ignored `**/generated/**`.
      write('packages/p/src/generated/a.ts', PLANTED_CLONE);
      write('packages/p/src/generated/b.ts', PLANTED_CLONE);

      const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });

      expect(out.summary.siblingIndex?.status).toBe('failed');
      expect((out.summary.siblingIndex as { reason: string }).reason).toContain(
        'zero-files-discovered'
      );
      expect(out.summary.counts.unitsDetected).toBe(2);
    });

    it('carries the failure on the in-session collect response and through finalize', async () => {
      plantThreeCopiesAndALoner();
      forceErr();
      const collected = await collectCodeCraftPrompts({ path: tmp });
      expect(collected.siblingIndex?.status).toBe('failed');
      expect(collected.pendingPrompts.length).toBeGreaterThan(0);
      const final = await finalizeCodeCraft({ path: tmp, runId: collected.runId, responses: [] });
      expect(final.summary.siblingIndex).toEqual(collected.siblingIndex);
    });
  });

  describe('empty', () => {
    it('reports an empty discovery with its reason, without calling the builder', async () => {
      const outcome = await buildCodeCraftCloneIndexOutcome(tmp);
      expect(outcome.index).toBeUndefined();
      expect(outcome.outcome.status).toBe('empty');
      expect((outcome.outcome as { reason: string }).reason).toMatch(/no source files/i);
      expect(ctl.calls).toBe(0);
    });

    it('reaches the run summary of a run over an empty discovery', async () => {
      const out = await runCodeCraft({ path: tmp, __testProvider: new MockLlmProvider() });
      expect(out.summary.siblingIndex?.status).toBe('empty');
      expect(out.summary.counts.filesScanned).toBe(0);
    });
  });

  describe('disabled', () => {
    it('says so when the caller opted out, instead of looking like no duplication', async () => {
      plantThreeCopiesAndALoner();
      const out = await runCodeCraft({
        path: tmp,
        siblings: false,
        __testProvider: new MockLlmProvider(),
      });
      expect(ctl.calls).toBe(0);
      expect(out.summary.siblingIndex?.status).toBe('disabled');
    });
  });

  describe('code_craft MCP response', () => {
    it('carries the outcome on the inline response (HARNESS_CRAFT_LLM=mock)', async () => {
      process.env.HARNESS_CRAFT_LLM = 'mock';
      plantThreeCopiesAndALoner();
      forceErr();

      const res = await handleCodeCraft({ path: tmp, mode: 'inline' });

      expect(res.isError).toBeUndefined();
      const body = JSON.parse(res.content[0]!.text) as {
        summary: { siblingIndex: { status: string; reason: string } };
      };
      expect(body.summary.siblingIndex.status).toBe('failed');
      expect(body.summary.siblingIndex.reason).toContain(FORCED_MESSAGE);
    });

    it('carries the outcome on the in-session collect response', async () => {
      plantThreeCopiesAndALoner();
      const res = await handleCodeCraft({ path: tmp, mode: 'in-session' });
      const body = JSON.parse(res.content[0]!.text) as {
        siblingIndex: { status: string; unitsWithSiblings: number };
      };
      expect(body.siblingIndex).toEqual({ status: 'built', classes: 1, unitsWithSiblings: 3 });
    });
  });
});
