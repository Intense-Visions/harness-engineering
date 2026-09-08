import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// -----------------------------------------------------------------------------
// validate-cov544 — branch-coverage lift for src/commands/validate.ts. Targets
// the per-check failure branches (pulse/strategy/solutions/decisions/roadmapMode,
// drift/brand/instruction-density findings + graceful-degradation catches) and
// the output/action-handler rendering paths (verbose/quiet/json, scope summary,
// agent-config summary, cross-check, abstention → ZERO_DENOMINATOR exit) that the
// existing tests do not reach. Every collaborator is mocked for determinism.
// -----------------------------------------------------------------------------

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    Ok: actual.Ok,
    validateAgentsMap: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    validateKnowledgeMap: vi.fn().mockResolvedValue({ ok: true, value: { brokenLinks: [] } }),
    validatePulseConfig: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    validateStrategy: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    validateSolutionsDir: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    validateDecisionNumbers: vi.fn().mockResolvedValue({ ok: true, value: { grandfathered: [] } }),
    validateRoadmapMode: vi.fn().mockReturnValue({ ok: true, value: {} }),
    validateAgentConfigs: vi.fn().mockResolvedValue({
      engine: 'fallback',
      valid: true,
      fellBackBecause: 'binary-not-found',
      issues: [],
    }),
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: {
      version: 1,
      rootDir: '.',
      agentsMapPath: './AGENTS.md',
      docsDir: './docs',
    },
  }),
}));

vi.mock('../../src/mcp/tools/audit-anatomy', () => ({
  runAudit: vi.fn().mockResolvedValue({
    findings: [],
    summary: {
      totalFiles: 0,
      durationMs: 0,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { conventionsApplied: [], patternsApplied: [] },
    meta: { mode: 'fast', deferredToA11y: 0 },
  }),
}));
vi.mock('../../src/mcp/tools/detect-drift', () => ({
  runDetectDrift: vi.fn().mockResolvedValue({
    findings: [],
    summary: {
      totalFiles: 0,
      durationMs: 0,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { rulesApplied: [] },
    meta: { mode: 'fast', tokensLoaded: false, registryLoaded: false },
  }),
}));
vi.mock('../../src/mcp/tools/audit-brand', () => ({
  runAuditBrand: vi.fn().mockResolvedValue({
    findings: [],
    summary: {
      totalFiles: 0,
      durationMs: 0,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { rulesApplied: [] },
    meta: { mode: 'fast', designMdLoaded: false, brandTokensLoaded: false },
  }),
}));
vi.mock('../../src/mcp/tools/instruction-density', () => ({
  runInstructionDensityAudit: vi.fn().mockResolvedValue({ findings: [] }),
}));

vi.mock('../../src/commands/validate-scope', () => ({
  SCOPED_WALKERS: ['driftDetection', 'brandCompliance'],
  deriveChangedSurface: vi.fn(() => ({ ok: true, files: [], ref: 'origin/main' })),
  filterToDesignSurface: vi.fn(() => []),
}));

vi.mock('../../src/commands/validate-cross-check', () => ({
  runCrossCheck: vi.fn().mockResolvedValue({ ok: true, value: { warnings: 0 } }),
}));

import { runValidate, createValidateCommand } from '../../src/commands/validate';
import {
  validatePulseConfig,
  validateStrategy,
  validateSolutionsDir,
  validateDecisionNumbers,
  validateRoadmapMode,
  validateAgentConfigs,
} from '@harness-engineering/core';
import { runDetectDrift } from '../../src/mcp/tools/detect-drift';
import { runAuditBrand } from '../../src/mcp/tools/audit-brand';
import { runInstructionDensityAudit } from '../../src/mcp/tools/instruction-density';
import { deriveChangedSurface } from '../../src/commands/validate-scope';
import { runCrossCheck } from '../../src/commands/validate-cross-check';

describe('runValidate — per-check failure branches (cov544)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks invalid when the pulse config fails', async () => {
    vi.mocked(validatePulseConfig).mockResolvedValueOnce({
      ok: false,
      error: { message: 'bad pulse', suggestions: ['fix pulse'] },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toBe(false);
    expect(result.value.checks.pulseConfig).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'pulseConfig');
    expect(issue?.suggestion).toBe('fix pulse');
  });

  it('marks invalid when STRATEGY.md is malformed', async () => {
    vi.mocked(validateStrategy).mockResolvedValueOnce({
      ok: false,
      error: { message: 'bad strategy', suggestions: [] },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.strategyConfig).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'strategyConfig');
    expect(issue?.severity).toBe('error');
    expect(issue?.suggestion).toBeUndefined();
  });

  it('expands solutionsDir detail.issues into one issue per entry', async () => {
    vi.mocked(validateSolutionsDir).mockResolvedValueOnce({
      ok: false,
      error: {
        message: 'solutions broken',
        details: {
          issues: [
            { file: 'docs/solutions/a.md', message: 'missing frontmatter' },
            { file: 'docs/solutions/b.md', message: 'bad slug' },
          ],
        },
      },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.solutionsDir).toBe(false);
    const issues = result.value.issues.filter((i) => i.check === 'solutionsDir');
    expect(issues).toHaveLength(2);
    expect(issues[0].file).toBe('docs/solutions/a.md');
  });

  it('falls back to a single default solutions issue when detail carries none', async () => {
    vi.mocked(validateSolutionsDir).mockResolvedValueOnce({
      ok: false,
      error: { message: 'solutions dir unreadable', details: {} },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    const issues = result.value.issues.filter((i) => i.check === 'solutionsDir');
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('docs/solutions');
    expect(issues[0].message).toContain('solutions dir unreadable');
  });

  it('surfaces grandfathered ADR number collisions as a single warning (valid stays true)', async () => {
    vi.mocked(validateDecisionNumbers).mockResolvedValueOnce({
      ok: true,
      value: {
        grandfathered: [{ number: '0042', files: ['a.md', 'b.md'] }],
      },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.decisionNumbers).toBe(true);
    expect(result.value.valid).toBe(true);
    const issue = result.value.issues.find((i) => i.ruleId === 'ADR-NUM-DUP');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('0042');
  });

  it('reports NEW ADR number collisions as error-severity issues', async () => {
    vi.mocked(validateDecisionNumbers).mockResolvedValueOnce({
      ok: false,
      error: {
        message: 'collision',
        details: { validation: { newCollisions: [{ number: '0100', files: ['x.md', 'y.md'] }] } },
        suggestions: ['renumber'],
      },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.valid).toBe(false);
    expect(result.value.checks.decisionNumbers).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'decisionNumbers');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('0100');
    expect(issue?.suggestion).toBe('renumber');
  });

  it('reports a generic decisionNumbers error when there are no new collisions in the detail', async () => {
    vi.mocked(validateDecisionNumbers).mockResolvedValueOnce({
      ok: false,
      error: { message: 'decisions corpus unreadable', details: {}, suggestions: [] },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.decisionNumbers).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'decisionNumbers');
    expect(issue?.message).toContain('decisions corpus unreadable');
  });

  it('marks invalid when roadmap mode validation fails', async () => {
    vi.mocked(validateRoadmapMode).mockReturnValueOnce({
      ok: false,
      error: { code: 'RM-MODE-001', message: 'tracker missing', suggestions: ['add tracker'] },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.roadmapMode).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'roadmapMode');
    expect(issue?.ruleId).toBe('RM-MODE-001');
    expect(issue?.suggestion).toBe('add tracker');
  });

  it('surfaces drift error findings (flips valid) and maps warn→warning', async () => {
    vi.mocked(runDetectDrift).mockResolvedValueOnce({
      findings: [
        {
          code: 'DRIFT-T001',
          severity: 'error',
          file: 'src/A.tsx',
          line: 3,
          message: 'hardcoded hex',
          fix: { description: 'use token' },
        },
        {
          code: 'DRIFT-P001',
          severity: 'warn',
          file: 'src/B.tsx',
          line: null,
          message: 'native button',
          fix: { description: 'use primitive' },
        },
      ],
      summary: {
        totalFiles: 2,
        durationMs: 1,
        bySeverity: { error: 1, warn: 1, info: 0 },
        byCode: {},
      },
      catalog: { rulesApplied: [] },
      meta: { mode: 'fast', tokensLoaded: true, registryLoaded: true },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.driftDetection).toBe(true);
    expect(result.value.valid).toBe(false);
    const errorFinding = result.value.issues.find((i) => i.ruleId === 'DRIFT-T001');
    expect(errorFinding?.severity).toBe('error');
    expect(errorFinding?.line).toBe(3);
    const warnFinding = result.value.issues.find((i) => i.ruleId === 'DRIFT-P001');
    expect(warnFinding?.severity).toBe('warning');
    expect(warnFinding?.line).toBeUndefined();
  });

  it('degrades gracefully when drift detection throws', async () => {
    vi.mocked(runDetectDrift).mockRejectedValueOnce(new Error('drift boom'));
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.driftDetection).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'driftDetection');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('drift boom');
  });

  it('surfaces brand error findings and flips valid', async () => {
    vi.mocked(runAuditBrand).mockResolvedValueOnce({
      findings: [
        {
          code: 'BRAND-T001',
          severity: 'error',
          file: 'src/Hero.tsx',
          line: 5,
          message: 'forbidden token context',
          fix: { description: 'swap token' },
        },
      ],
      summary: {
        totalFiles: 1,
        durationMs: 1,
        bySeverity: { error: 1, warn: 0, info: 0 },
        byCode: {},
      },
      catalog: { rulesApplied: [] },
      meta: { mode: 'fast', designMdLoaded: true, brandTokensLoaded: true },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.brandCompliance).toBe(true);
    expect(result.value.valid).toBe(false);
    expect(result.value.issues.find((i) => i.ruleId === 'BRAND-T001')?.severity).toBe('error');
  });

  it('degrades gracefully when brand audit throws', async () => {
    vi.mocked(runAuditBrand).mockRejectedValueOnce(new Error('brand boom'));
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.brandCompliance).toBe(false);
    expect(result.value.issues.find((i) => i.check === 'brandCompliance')?.message).toContain(
      'brand boom'
    );
  });

  it('surfaces instruction-density findings as advisory warnings without flipping valid', async () => {
    vi.mocked(runInstructionDensityAudit).mockResolvedValueOnce({
      findings: [{ file: 'SKILL.md', message: 'too dense at level 2' }],
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.instructionDensity).toBe(true);
    expect(result.value.valid).toBe(true);
    const issue = result.value.issues.find((i) => i.check === 'instructionDensity');
    expect(issue?.ruleId).toBe('SKILL-DENSITY');
    expect(issue?.severity).toBe('warning');
  });

  it('degrades gracefully when the density audit throws', async () => {
    vi.mocked(runInstructionDensityAudit).mockRejectedValueOnce(new Error('density boom'));
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.instructionDensity).toBe(false);
    expect(result.value.issues.find((i) => i.check === 'instructionDensity')?.message).toContain(
      'density boom'
    );
  });

  it('honors design.audit.driftDetection.enabled:false and brandCompliance.enabled:false', async () => {
    const { resolveConfig } = await import('../../src/config/loader');
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: true,
      value: {
        version: 1,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        docsDir: './docs',
        design: {
          strictness: 'strict',
          audit: {
            driftDetection: { enabled: false },
            brandCompliance: { enabled: false },
          },
        },
      },
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope' });
    if (!result.ok) return;
    expect(result.value.checks.driftDetection).toBeUndefined();
    expect(result.value.checks.brandCompliance).toBeUndefined();
    expect(runDetectDrift).not.toHaveBeenCalled();
    expect(runAuditBrand).not.toHaveBeenCalled();
  });

  it('merges agentConfigs findings with line + suggestion into issues', async () => {
    vi.mocked(validateAgentConfigs).mockResolvedValueOnce({
      engine: 'agnix',
      valid: false,
      issues: [
        {
          file: 'CLAUDE.md',
          line: 7,
          ruleId: 'AC-010',
          severity: 'error',
          message: 'bad rule',
          suggestion: 'fix it',
        },
      ],
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope', agentConfigs: true });
    if (!result.ok) return;
    expect(result.value.valid).toBe(false);
    const issue = result.value.issues.find((i) => i.check === 'agentConfigs');
    expect(issue?.line).toBe(7);
    expect(issue?.suggestion).toBe('fix it');
    expect(result.value.agentConfigs?.engine).toBe('agnix');
  });

  // --- scope derivation branches -------------------------------------------

  it('records affected scope when the changed surface derives cleanly', async () => {
    vi.mocked(deriveChangedSurface).mockReturnValueOnce({
      ok: true,
      files: ['src/A.tsx'],
      ref: 'origin/main',
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope', changed: true });
    if (!result.ok) return;
    expect(result.value.scope.mode).toBe('affected');
    expect(result.value.scope.ref).toBe('origin/main');
    expect(result.value.scope.scopedChecks).toEqual(['driftDetection', 'brandCompliance']);
  });

  it('falls back to a full sweep with a recorded reason when derivation fails', async () => {
    vi.mocked(deriveChangedSurface).mockReturnValueOnce({
      ok: false,
      files: [],
      reason: 'detached HEAD',
    } as never);
    const result = await runValidate({ cwd: '/tmp/nope', since: 'HEAD~1' });
    if (!result.ok) return;
    expect(result.value.scope.mode).toBe('full');
    expect(result.value.scope.fallbackReason).toBe('detached HEAD');
  });
});

// -----------------------------------------------------------------------------
// Action-handler / output rendering
// -----------------------------------------------------------------------------

describe('validate action handler + output rendering (cov544)', () => {
  const EXIT = Symbol('exit');
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitCodes: number[];

  beforeEach(() => {
    vi.clearAllMocks();
    exitCodes = [];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCodes.push(code ?? 0);
      throw EXIT;
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  function makeProgram(): Command {
    const program = new Command();
    program.option('--json', 'JSON output');
    program.option('--quiet', 'Quiet output');
    program.option('--verbose', 'Verbose');
    program.option('-c, --config <path>', 'Config');
    program.exitOverride();
    program.addCommand(createValidateCommand());
    return program;
  }

  async function run(args: string[]): Promise<void> {
    const program = makeProgram();
    try {
      await program.parseAsync(args);
    } catch (e) {
      if (e !== EXIT && !(e instanceof Error && /exit|commander/i.test(String(e)))) {
        // Re-throw genuine errors; swallow commander's exitOverride throws.
        if (e !== EXIT) throw e;
      }
    }
  }

  it('renders JSON output and exits SUCCESS', async () => {
    await run(['node', 't', '--json', 'validate']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"valid"'));
    expect(exitCodes).toEqual([0]);
  });

  it('renders VERBOSE output', async () => {
    await run(['node', 't', '--verbose', 'validate']);
    expect(exitCodes).toEqual([0]);
    expect(logSpy).toHaveBeenCalled();
  });

  it('renders QUIET output', async () => {
    await run(['node', 't', '--quiet', 'validate']);
    expect(exitCodes).toEqual([0]);
  });

  it('prints the affected-scope summary in text mode', async () => {
    vi.mocked(deriveChangedSurface).mockReturnValueOnce({
      ok: true,
      files: ['src/A.tsx'],
      ref: 'origin/main',
    } as never);
    await run(['node', 't', 'validate', '--changed']);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Scope: affected');
    expect(exitCodes).toEqual([0]);
  });

  it('prints the fallback-scope caveat when affected mode falls back', async () => {
    vi.mocked(deriveChangedSurface).mockReturnValueOnce({
      ok: false,
      files: [],
      reason: 'no merge-base',
    } as never);
    await run(['node', 't', 'validate', '--affected']);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('fell back');
    expect(printed).toContain('no merge-base');
  });

  it('prints the agent-config summary (fallback binary-not-found hint)', async () => {
    await run(['node', 't', 'validate', '--agent-configs']);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('built-in fallback rules');
    expect(printed).toContain('Install agnix');
  });

  it('prints the agent-config summary for the agnix engine (no install hint)', async () => {
    vi.mocked(validateAgentConfigs).mockResolvedValueOnce({
      engine: 'agnix',
      valid: true,
      issues: [],
    } as never);
    await run(['node', 't', 'validate', '--agent-configs']);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('agnix');
    expect(printed).not.toContain('Install agnix');
  });

  it('prints cross-check warnings when --cross-check surfaces any', async () => {
    vi.mocked(runCrossCheck).mockResolvedValueOnce({
      ok: true,
      value: {
        warnings: 2,
        planToImpl: ['plan drift A'],
        staleness: ['stale B'],
      },
    } as never);
    await run(['node', 't', 'validate', '--cross-check']);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Cross-artifact validation');
    expect(printed).toContain('plan drift A');
    expect(printed).toContain('2 warnings');
  });

  it('rejects an invalid --severity value in the preAction hook (exit ERROR)', async () => {
    await run(['node', 't', 'validate', '--severity', 'bogus']);
    expect(exitCodes).toContain(2);
  });

  it('exits VALIDATION_FAILED when a hard check fails', async () => {
    const core = await import('@harness-engineering/core');
    vi.mocked(core.validatePulseConfig).mockResolvedValueOnce({
      ok: false,
      error: { message: 'bad pulse', suggestions: [] },
    } as never);
    await run(['node', 't', 'validate']);
    expect(exitCodes).toEqual([1]);
  });
});
