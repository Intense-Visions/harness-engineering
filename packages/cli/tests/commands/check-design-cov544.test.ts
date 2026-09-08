import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// -----------------------------------------------------------------------------
// check-design-cov544 — branch-coverage lift for src/commands/check-design.ts.
// The existing suite exercises runCheckDesign; this one drives the command action
// and the output renderers (printCheckDesignResult / per-verifier printers in
// verbose + non-verbose modes, quiet/json short-circuits, tier→severity mapping,
// line-present vs line-absent formatting, verifiersFailed section, and all three
// exit codes). All four verifiers are mocked for determinism.
// -----------------------------------------------------------------------------

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
        runId: 'mock',
      },
    },
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

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', agentsMapPath: './AGENTS.md', docsDir: './docs' },
  }),
}));

import { createCheckDesignCommand } from '../../src/commands/check-design';
import { runAudit as runAnatomyAudit } from '../../src/mcp/tools/audit-anatomy';
import { runDesignCraft } from '../../src/mcp/tools/design-craft';
import { runDetectDrift } from '../../src/mcp/tools/detect-drift';
import { runAuditBrand } from '../../src/mcp/tools/audit-brand';
import { resolveConfig } from '../../src/config/loader';

const anatomyFinding = (over: Record<string, unknown> = {}) => ({
  code: 'ANAT-D001',
  severity: 'error',
  file: 'src/Button.tsx',
  line: 14,
  componentType: 'Button',
  message: 'missing slot',
  evidence: { snippet: '<Button />' },
  rule: { id: 'ANAT-D001', source: 'APG/button' },
  fix: { kind: 'manual', description: 'add children' },
  ...over,
});

const craftFinding = (over: Record<string, unknown> = {}) => ({
  code: 'CRAFT-C001',
  phase: 'critique',
  tier: 'polish',
  impact: 'medium',
  confidence: 'high',
  target: { file: 'src/Page.tsx', line: 88 },
  message: 'hierarchy muddy',
  cite: { rubricOrPatternId: 'hierarchy', source: 'huashu' },
  derived: { priority: 0.5 },
  after: 'a cleaner hierarchy',
  ...over,
});

const driftFinding = (over: Record<string, unknown> = {}) => ({
  code: 'DRIFT-T001',
  severity: 'warn',
  file: 'src/Card.tsx',
  line: 12,
  message: 'hardcoded hex',
  evidence: { snippet: '#fff' },
  rule: { id: 'DRIFT-T001', category: 'token-bypass' },
  fix: { kind: 'manual', description: 'use token' },
  ...over,
});

const brandFinding = (over: Record<string, unknown> = {}) => ({
  code: 'BRAND-V001',
  severity: 'info',
  file: 'src/Hero.tsx',
  line: null,
  message: 'forbidden phrase',
  evidence: { snippet: 'click here' },
  rule: { id: 'BRAND-V001', category: 'voice' },
  fix: { kind: 'manual', description: 'rewrite' },
  ...over,
});

function anatomyOut(findings: unknown[]) {
  return {
    findings,
    summary: {
      totalFiles: 1,
      durationMs: 1,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { conventionsApplied: [], patternsApplied: [] },
    meta: { mode: 'fast', deferredToA11y: 0 },
  };
}
function driftOut(findings: unknown[]) {
  return {
    findings,
    summary: {
      totalFiles: 1,
      durationMs: 1,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { rulesApplied: [] },
    meta: { mode: 'fast', tokensLoaded: true, registryLoaded: true },
  };
}
function brandOut(findings: unknown[]) {
  return {
    findings,
    summary: {
      totalFiles: 1,
      durationMs: 1,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { rulesApplied: [] },
    meta: { mode: 'fast', designMdLoaded: true, brandTokensLoaded: true },
  };
}
function craftOk(findings: unknown[]) {
  return {
    ok: true,
    value: {
      findings,
      scores: [],
      summary: {
        phaseRun: ['critique'],
        mode: 'fast',
        durationMs: 1,
        llmCalls: { provider: 'mock', model: 'mock', count: 1, costUsd: 0 },
        catalog: { rubricsApplied: [], patternsApplied: [], exemplarsCited: [] },
        preconditions: {
          aestheticIntentDeclared: false,
          designMdExists: false,
          tokensExist: false,
        },
        deferralsToHarnessDesign: 0,
        runId: 'mock',
      },
    },
  };
}

describe('check-design command action + output rendering (cov544)', () => {
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
    program.option('--json', 'JSON');
    program.option('--quiet', 'Quiet');
    program.option('--verbose', 'Verbose');
    program.option('-c, --config <path>', 'Config');
    program.addCommand(createCheckDesignCommand());
    return program;
  }

  async function run(args: string[]): Promise<void> {
    const program = makeProgram();
    try {
      await program.parseAsync(args);
    } catch (e) {
      if (e !== EXIT) throw e;
    }
  }

  function printed(): string {
    return logSpy.mock.calls.map((c) => String(c[0])).join('\n');
  }

  it('renders all four verifier sections in text mode and exits VALIDATION_FAILED on an error finding', async () => {
    vi.mocked(runAnatomyAudit).mockResolvedValueOnce(anatomyOut([anatomyFinding()]) as never);
    vi.mocked(runDesignCraft).mockResolvedValueOnce(craftOk([craftFinding()]) as never);
    vi.mocked(runDetectDrift).mockResolvedValueOnce(driftOut([driftFinding()]) as never);
    vi.mocked(runAuditBrand).mockResolvedValueOnce(brandOut([brandFinding()]) as never);

    await run(['node', 't', 'check-design']);

    const out = printed();
    expect(out).toContain('audit-anatomy (1 finding)');
    expect(out).toContain('design-craft critique (1 finding)');
    expect(out).toContain('detect-drift (1 finding)');
    expect(out).toContain('audit-brand (1 finding)');
    expect(out).toContain('src/Button.tsx');
    expect(out).toContain('ANAT-D001');
    expect(out).toContain('Graph:');
    // anatomy error finding ⇒ VALIDATION_FAILED
    expect(exitCodes).toEqual([1]);
  });

  it('renders verbose extras (fix description + craft after) in verbose mode', async () => {
    vi.mocked(runAnatomyAudit).mockResolvedValueOnce(anatomyOut([anatomyFinding()]) as never);
    vi.mocked(runDesignCraft).mockResolvedValueOnce(craftOk([craftFinding()]) as never);
    vi.mocked(runDetectDrift).mockResolvedValueOnce(driftOut([driftFinding()]) as never);
    vi.mocked(runAuditBrand).mockResolvedValueOnce(brandOut([brandFinding()]) as never);

    await run(['node', 't', '--verbose', 'check-design']);

    const out = printed();
    expect(out).toContain('fix: add children');
    expect(out).toContain('after: a cleaner hierarchy');
  });

  it('handles findings with absent line numbers (anatomy null, craft undefined line)', async () => {
    vi.mocked(runAnatomyAudit).mockResolvedValueOnce(
      anatomyOut([anatomyFinding({ line: null, severity: 'warn' })]) as never
    );
    vi.mocked(runDesignCraft).mockResolvedValueOnce(
      craftOk([craftFinding({ target: { file: 'src/X.tsx' }, tier: 'aspirational' })]) as never
    );

    await run(['node', 't', 'check-design']);

    const out = printed();
    expect(out).toContain('src/Button.tsx');
    expect(out).toContain('src/X.tsx');
    // no error-severity findings and all verifiers ran ⇒ SUCCESS
    expect(exitCodes).toEqual([0]);
  });

  it('maps craft tier polish→warn and aspirational→info in the summary counts', async () => {
    vi.mocked(runDesignCraft).mockResolvedValueOnce(
      craftOk([
        craftFinding({ code: 'CRAFT-P', tier: 'polish', target: { file: 'a.tsx', line: 1 } }),
        craftFinding({ code: 'CRAFT-A', tier: 'aspirational', target: { file: 'b.tsx', line: 2 } }),
      ]) as never
    );

    await run(['node', 't', 'check-design']);
    const out = printed();
    expect(out).toContain('0 error, 1 warn, 1 info');
    expect(exitCodes).toEqual([0]);
  });

  it('prints the verifiersFailed section and exits ERROR (degraded) when a verifier throws', async () => {
    vi.mocked(runDetectDrift).mockRejectedValueOnce(new Error('drift crashed'));

    await run(['node', 't', 'check-design']);

    const out = printed();
    expect(out).toContain('Verifiers that failed:');
    expect(out).toContain('detect-drift: drift crashed');
    // no error findings, but a verifier failed ⇒ degraded ⇒ ERROR (2)
    expect(exitCodes).toEqual([2]);
  });

  it('short-circuits rendering in quiet mode (summary line only) and exits SUCCESS', async () => {
    await run(['node', 't', '--quiet', 'check-design']);
    const out = printed();
    expect(out).not.toContain('audit-anatomy (');
    expect(out).not.toContain('Graph:');
    expect(exitCodes).toEqual([0]);
  });

  it('emits JSON and skips the human renderer in json mode', async () => {
    vi.mocked(runAnatomyAudit).mockResolvedValueOnce(anatomyOut([anatomyFinding()]) as never);
    await run(['node', 't', '--json', 'check-design']);
    const out = printed();
    expect(out).toContain('"findingsByVerifier"');
    expect(out).not.toContain('audit-anatomy (1 finding)');
    expect(exitCodes).toEqual([1]);
  });

  it('reports a config-load failure via the human path and exits with the config exit code', async () => {
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: false,
      error: { message: 'Config not found', exitCode: 2 },
    } as never);
    await run(['node', 't', 'check-design']);
    expect(errSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Config not found')
    );
    expect(exitCodes).toEqual([2]);
  });

  it('reports a config-load failure as JSON in json mode', async () => {
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: false,
      error: { message: 'Config broken', exitCode: 2 },
    } as never);
    await run(['node', 't', '--json', 'check-design']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Config broken'));
    expect(exitCodes).toEqual([2]);
  });

  it('passes --mode and --files through to the verifiers', async () => {
    await run(['node', 't', 'check-design', '--mode', 'fast', '--files', 'src/A.tsx', 'src/B.tsx']);
    expect(runAnatomyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'fast', files: ['src/A.tsx', 'src/B.tsx'] })
    );
    expect(exitCodes).toEqual([0]);
  });
});
