/**
 * design-pipeline: a verifier that could not run must not read as a pass (#2273).
 *
 * The same defect `harness ci check` carried as #2071 and fixed in #2207: a
 * summary field computed independently of the thing it summarises. REPORT
 * derived the verdict from the finding severities alone, so `verifiersFailed`
 * — the record of a verifier that examined nothing — could not influence it.
 * The orchestrator therefore reported `verdict: 'pass'` over a run in which one
 * of its four verifiers abstained, and `harness design-pipeline` exits on the
 * verdict, so that false pass is a gate that cannot fail.
 *
 * Every assertion here is POSITIVE about the abstaining verifier: it must be
 * named in `degradedBy`, which is the array the verdict is derived from. An
 * `expect(verdict).not.toBe('pass')` would pass for a fix that simply made the
 * verdict always fail, which is why the clean-run direction is pinned too.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// audit-brand is one of the two registry verifiers the AUDIT phase drives. A
// rejecting runner is exactly how #2210 made abstention reachable: the verifier
// throws rather than returning a clean result over zero files. The message is
// inlined because `vi.mock` factories are hoisted above every top-level const.
vi.mock('../../src/mcp/tools/audit-brand', () => ({
  runAuditBrand: vi
    .fn()
    .mockRejectedValue(new Error('audit-brand could not resolve a design surface')),
}));

const BRAND_BOOM = 'audit-brand could not resolve a design surface';

// design-craft is mocked to keep the pipeline hermetic (no LLM provider), the
// same way the end-to-end integration suite does it.
vi.mock('../../src/mcp/tools/design-craft', () => ({
  runDesignCraft: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      findings: [],
      scores: [],
      summary: {
        phaseRun: ['critique'],
        mode: 'fast',
        durationMs: 0,
        llmCalls: { provider: 'mock', model: 'mock', count: 0, costUsd: 0 },
        catalog: { rubricsApplied: [], patternsApplied: [], exemplarsCited: [] },
        preconditions: {
          aestheticIntentDeclared: false,
          designMdExists: false,
          tokensExist: false,
        },
        deferralsToHarnessDesign: 0,
        runId: 'mock-run',
      },
    },
  }),
}));

import { runDesignPipeline } from '../../src/design-pipeline';
import { runReport } from '../../src/design-pipeline/phases/report';
import { newContext } from '../../src/design-pipeline/context';
import { runAudit } from '../../src/design-pipeline/phases/audit';
import { VerifierRegistry } from '../../src/design-pipeline/registry';

describe('design-pipeline verdict vs verifiersFailed (#2273)', () => {
  describe('REPORT derives the verdict from the abstention set', () => {
    it('names the abstaining verifier in degradedBy and refuses to pass', () => {
      const ctx = newContext();
      // No findings at all: under the old derivation this is the textbook
      // `pass`, because bySeverity is all zeroes.
      ctx.verifiersFailed.push({ name: 'audit-brand', error: BRAND_BOOM });

      runReport({ context: ctx });

      expect(ctx.degradedBy).toEqual(['audit-brand']);
      expect(ctx.verdict).toBe('fail');
    });

    it('names every abstaining verifier, not just the first', () => {
      const ctx = newContext();
      ctx.verifiersFailed.push(
        { name: 'detect-drift', error: 'depth cap' },
        { name: 'audit-anatomy', error: 'no candidates' }
      );

      runReport({ context: ctx });

      expect(ctx.degradedBy).toEqual(['detect-drift', 'audit-anatomy']);
      expect(ctx.verdict).toBe('fail');
    });

    it('still names the abstention when error findings would fail the run anyway', () => {
      const ctx = newContext();
      ctx.driftFindings.push({
        code: 'DRIFT-T001' as never,
        severity: 'error',
        file: 'a.ts',
        line: 1,
        message: 'msg',
        evidence: { snippet: '' },
        rule: { id: 'T001', category: 'token-bypass' },
        fix: { kind: 'manual', description: '' },
      } as never);
      ctx.verifiersFailed.push({ name: 'audit-brand', error: BRAND_BOOM });

      runReport({ context: ctx });

      // degradedBy is a projection of verifiersFailed, so it is populated
      // whatever else the run found — a reader can always tell a degraded run
      // from a clean findings-driven failure.
      expect(ctx.degradedBy).toEqual(['audit-brand']);
      expect(ctx.verdict).toBe('fail');
    });

    it('records the SAME verifier twice when it abstained twice', () => {
      // detect-drift runs in DETECT and again inside the FIX loop, so it can
      // land in verifiersFailed more than once (and can appear in verifiersRun
      // as well). The verdict must come from the failure list itself, not from
      // comparing verifiersRun against the registry.
      const ctx = newContext();
      ctx.verifiersRun.push('detect-drift');
      ctx.verifiersFailed.push(
        { name: 'detect-drift', error: 'first' },
        { name: 'detect-drift', error: 'second' }
      );

      runReport({ context: ctx });

      expect(ctx.degradedBy).toEqual(['detect-drift', 'detect-drift']);
      expect(ctx.verdict).toBe('fail');
    });

    it('a genuinely clean run still passes with an empty degradedBy', () => {
      const ctx = newContext();

      runReport({ context: ctx });

      expect(ctx.degradedBy).toEqual([]);
      expect(ctx.verdict).toBe('pass');
    });

    it('a warn-only run still warns rather than failing', () => {
      const ctx = newContext();
      ctx.bootstrapped.designMd = true;

      runReport({ context: ctx });

      expect(ctx.degradedBy).toEqual([]);
      expect(ctx.verdict).toBe('warn');
    });
  });

  describe('runDesignPipeline end to end', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3g-verdict-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports a failing verdict naming audit-brand when that verifier throws', async () => {
      // A design surface that is otherwise clean: inputs present (so FILL
      // bootstraps nothing and cannot contribute a warn) and no drift.
      fs.mkdirSync(path.join(tmpDir, 'design-system'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'design-system', 'DESIGN.md'),
        '# Design\n\n## Component Registry\n\n| Type | File |\n|---|---|\n\n' +
          '## Brand Rules\n\n### Voice\n\nforbidden_phrases: []\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'design-system', 'tokens.json'),
        JSON.stringify({ color: {} })
      );

      const out = await runDesignPipeline({ path: tmpDir });

      // The abstention is recorded — this is the state the issue describes.
      expect(out.verifiersFailed.map((f) => f.name)).toContain('audit-brand');
      expect(out.summary.bySeverity.error).toBe(0);
      // ...and the verdict is derived from it rather than alongside it.
      expect(out.degradedBy).toContain('audit-brand');
      expect(out.verdict).toBe('fail');
    });
  });
});

describe('newContext (#2273)', () => {
  it('does not start life asserting a pass', () => {
    // The initial verdict is an assertion made before any verifier has run.
    // `pass` there is the same failure mode one step earlier: a green reading
    // over zero evidence. REPORT overwrites it on every real run, so the
    // default only has to be fail-closed. Asserted as exactly `fail`, not
    // `not.toBe('pass')`: `warn` also exits 0, so a `warn` default would
    // be just as green and survive the weaker assertion.
    expect(newContext().verdict).toBe('fail');
    expect(newContext().degradedBy).toEqual([]);
  });
});

describe('AUDIT: a verifier whose findings have no bucket (#2273)', () => {
  it('abstains and names the verifier instead of recording a silent success', async () => {
    // The registry is generic, but AUDIT only routes two names. A third one
    // used to have its findings dropped while `verifiersRun` claimed it
    // contributed — the verdict class, one layer down.
    const ctx = newContext();
    const registry = new VerifierRegistry();
    registry.register(
      'audit-future',
      async () =>
        ({
          findings: [{ severity: 'error' }, { severity: 'error' }],
          summary: {},
        }) as never
    );

    await runAudit({ projectRoot: '/tmp', context: ctx, registry, mode: 'fast' });
    runReport({ context: ctx });

    expect(ctx.verifiersRun).not.toContain('audit-future');
    expect(ctx.degradedBy).toEqual(['audit-future']);
    expect(ctx.verifiersFailed[0]?.error).toContain('no findings bucket');
    expect(ctx.verdict).toBe('fail');
  });

  it('a registered, routable verifier still records a plain success', async () => {
    const ctx = newContext();
    const registry = new VerifierRegistry();
    registry.register('audit-anatomy', async () => ({ findings: [], summary: {} }) as never);

    await runAudit({ projectRoot: '/tmp', context: ctx, registry, mode: 'fast' });
    runReport({ context: ctx });

    expect(ctx.verifiersRun).toEqual(['audit-anatomy']);
    expect(ctx.degradedBy).toEqual([]);
    expect(ctx.verdict).toBe('pass');
  });
});
