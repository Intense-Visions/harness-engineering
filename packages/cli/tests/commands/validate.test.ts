import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as path from 'path';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    Ok: actual.Ok,
    validateAgentsMap: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    validateKnowledgeMap: vi.fn().mockResolvedValue({
      ok: true,
      value: { brokenLinks: [] },
    }),
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

// Mock the audit-anatomy entry point. Default: returns no findings so existing
// tests stay unaffected. Per-test overrides via the imported handle below.
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

import { createValidateCommand, runValidate } from '../../src/commands/validate';
import {
  validateAgentsMap,
  validateKnowledgeMap,
  validateAgentConfigs,
} from '@harness-engineering/core';
import { resolveConfig } from '../../src/config/loader';
import { runAudit as runComponentAnatomyAudit } from '../../src/mcp/tools/audit-anatomy';

describe('validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runValidate', () => {
    it('returns success when all checks pass', async () => {
      const result = await runValidate({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.checks.agentsMap).toBe(true);
        expect(result.value.checks.knowledgeMap).toBe(true);
        expect(result.value.checks.fileStructure).toBe(true);
        expect(result.value.issues).toHaveLength(0);
      }
    });

    it('returns error when config loading fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const result = await runValidate({});
      expect(result.ok).toBe(false);
    });

    it('marks invalid when AGENTS.md validation fails', async () => {
      vi.mocked(validateAgentsMap).mockResolvedValueOnce({
        ok: false,
        error: { message: 'AGENTS.md not found', suggestions: ['Create AGENTS.md'] },
      } as never);

      const result = await runValidate({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.checks.agentsMap).toBe(false);
        expect(result.value.issues).toHaveLength(1);
        expect(result.value.issues[0].check).toBe('agentsMap');
        expect(result.value.issues[0].message).toContain('AGENTS.md not found');
        expect(result.value.issues[0].suggestion).toBe('Create AGENTS.md');
      }
    });

    it('marks invalid when AGENTS.md fails without suggestions', async () => {
      vi.mocked(validateAgentsMap).mockResolvedValueOnce({
        ok: false,
        error: { message: 'Invalid format', suggestions: [] },
      } as never);

      const result = await runValidate({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.issues[0].suggestion).toBeUndefined();
      }
    });

    it('marks invalid when knowledge map has broken links', async () => {
      vi.mocked(validateKnowledgeMap).mockResolvedValueOnce({
        ok: true,
        value: {
          brokenLinks: [
            { path: 'docs/missing.md', suggestion: 'Remove the link' },
            { path: 'docs/also-missing.md', suggestion: '' },
          ],
        },
      } as never);

      const result = await runValidate({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.checks.knowledgeMap).toBe(false);
        expect(result.value.issues).toHaveLength(2);
        expect(result.value.issues[0].check).toBe('knowledgeMap');
        expect(result.value.issues[0].message).toContain('Broken link');
        expect(result.value.issues[0].suggestion).toBe('Remove the link');
        expect(result.value.issues[1].suggestion).toBe('Remove or fix the broken link');
      }
    });

    it('marks invalid when knowledge map validation errors', async () => {
      vi.mocked(validateKnowledgeMap).mockResolvedValueOnce({
        ok: false,
        error: { message: 'Knowledge map parse error' },
      } as never);

      const result = await runValidate({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.checks.knowledgeMap).toBe(false);
        expect(result.value.issues).toHaveLength(1);
        expect(result.value.issues[0].check).toBe('knowledgeMap');
        expect(result.value.issues[0].message).toContain('Knowledge map parse error');
      }
    });

    it('derives cwd from configPath when cwd not provided', async () => {
      const configPath = path.join('/tmp', 'project', 'harness.config.json');
      const result = await runValidate({ configPath });
      expect(result.ok).toBe(true);
      // path.dirname + path.resolve produces OS-native separators, so match accordingly
      const expectedDir = path.dirname(path.resolve(configPath));
      expect(validateAgentsMap).toHaveBeenCalledWith(expect.stringContaining(expectedDir));
    });

    it('uses process.cwd() when neither cwd nor configPath provided', async () => {
      const result = await runValidate({});
      expect(result.ok).toBe(true);
      // Should not throw
    });

    it('always marks fileStructure as passed', async () => {
      const result = await runValidate({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.fileStructure).toBe(true);
      }
    });
  });

  describe('createValidateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createValidateCommand();
      expect(cmd.name()).toBe('validate');
    });

    it('has cross-check option', () => {
      const cmd = createValidateCommand();
      const opt = cmd.options.find((o) => o.long === '--cross-check');
      expect(opt).toBeDefined();
    });

    it('has --agent-configs, --strict, and --agnix-bin options', () => {
      const cmd = createValidateCommand();
      expect(cmd.options.find((o) => o.long === '--agent-configs')).toBeDefined();
      expect(cmd.options.find((o) => o.long === '--strict')).toBeDefined();
      expect(cmd.options.find((o) => o.long === '--agnix-bin')).toBeDefined();
    });
  });

  describe('--agent-configs', () => {
    it('does not invoke validateAgentConfigs unless the flag is set', async () => {
      await runValidate({ cwd: '/tmp/test' });
      expect(validateAgentConfigs).not.toHaveBeenCalled();
    });

    it('invokes validateAgentConfigs when agentConfigs is true and merges findings into issues', async () => {
      vi.mocked(validateAgentConfigs).mockResolvedValueOnce({
        engine: 'fallback',
        valid: false,
        fellBackBecause: 'binary-not-found',
        issues: [
          {
            file: 'CLAUDE.md',
            ruleId: 'HARNESS-AC-002',
            severity: 'error',
            message: 'CLAUDE.md is empty',
          },
        ],
      } as never);

      const result = await runValidate({ cwd: '/tmp/test', agentConfigs: true });
      expect(validateAgentConfigs).toHaveBeenCalledWith('/tmp/test', { strict: false });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
      expect(result.value.checks.agentConfigs).toBe(false);
      expect(result.value.agentConfigs?.engine).toBe('fallback');
      const issue = result.value.issues.find((i) => i.check === 'agentConfigs');
      expect(issue).toBeDefined();
      expect(issue?.ruleId).toBe('HARNESS-AC-002');
      expect(issue?.severity).toBe('error');
    });

    it('forwards --strict to validateAgentConfigs', async () => {
      await runValidate({ cwd: '/tmp/test', agentConfigs: true, strict: true });
      expect(validateAgentConfigs).toHaveBeenCalledWith('/tmp/test', { strict: true });
    });

    it('forwards --agnix-bin override to validateAgentConfigs', async () => {
      await runValidate({
        cwd: '/tmp/test',
        agentConfigs: true,
        agnixBin: '/opt/agnix',
      });
      expect(validateAgentConfigs).toHaveBeenCalledWith('/tmp/test', {
        strict: false,
        agnixBin: '/opt/agnix',
      });
    });

    it('keeps valid=true when fallback only emits warnings', async () => {
      vi.mocked(validateAgentConfigs).mockResolvedValueOnce({
        engine: 'fallback',
        valid: true,
        fellBackBecause: 'binary-not-found',
        issues: [
          {
            file: 'CLAUDE.md',
            ruleId: 'HARNESS-AC-003',
            severity: 'warning',
            message: 'missing h1',
          },
        ],
      } as never);

      const result = await runValidate({ cwd: '/tmp/test', agentConfigs: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.checks.agentConfigs).toBe(true);
      }
    });
  });

  describe('action handler', () => {
    const exitError = new Error('process.exit');
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        throw exitError;
      }) as never);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
    });

    async function safeParseAsync(program: Command, args: string[]) {
      try {
        await program.parseAsync(args);
      } catch (e) {
        if (e !== exitError) throw e;
      }
    }

    function makeProgram(): Command {
      const program = new Command();
      program.option('--json', 'JSON output');
      program.option('--quiet', 'Quiet output');
      program.option('--verbose', 'Verbose');
      program.option('-c, --config <path>', 'Config');
      program.addCommand(createValidateCommand());
      return program;
    }

    it('exits with SUCCESS when all checks pass', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'validate']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs JSON when --json is set', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '--json', 'validate']);

      // JSON mode outputs via formatter
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits with error when config fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'validate']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs JSON error when --json and config fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '--json', 'validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Config not found'));
    });

    it('exits with VALIDATION_FAILED when checks fail', async () => {
      vi.mocked(validateAgentsMap).mockResolvedValueOnce({
        ok: false,
        error: { message: 'AGENTS.md not found', suggestions: [] },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'validate']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('component-anatomy audit (design-pipeline #2)', () => {
    it('invokes the audit in fast mode by default and reports checks.componentAnatomy=true', async () => {
      const result = await runValidate({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.checks.componentAnatomy).toBe(true);
      expect(runComponentAnatomyAudit).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'fast' })
      );
    });

    it('surfaces error findings as validation issues and flips result.valid to false', async () => {
      vi.mocked(runComponentAnatomyAudit).mockResolvedValueOnce({
        findings: [
          {
            code: 'ANAT-D001',
            severity: 'error',
            file: 'src/Button.tsx',
            line: 14,
            componentType: 'Button',
            message: 'Button is missing required slot: content',
            evidence: { snippet: 'export const Button = ...' },
            rule: { id: 'ANAT-D001', source: 'APG/button' },
            fix: {
              kind: 'manual',
              description: 'Add a children/content prop',
            },
          },
        ],
        summary: {
          totalFiles: 1,
          durationMs: 5,
          bySeverity: { error: 1, warn: 0, info: 0 },
          byCode: { 'ANAT-D001': 1 },
        },
        catalog: { conventionsApplied: ['Button'], patternsApplied: [] },
        meta: { mode: 'fast', deferredToA11y: 0 },
      });

      const result = await runValidate({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
      const anatomyIssues = result.value.issues.filter((i) => i.check === 'componentAnatomy');
      expect(anatomyIssues).toHaveLength(1);
      expect(anatomyIssues[0]).toMatchObject({
        check: 'componentAnatomy',
        file: 'src/Button.tsx',
        line: 14,
        ruleId: 'ANAT-D001',
        severity: 'error',
        suggestion: 'Add a children/content prop',
      });
    });

    it('surfaces warn findings without flipping result.valid (other checks still pass)', async () => {
      vi.mocked(runComponentAnatomyAudit).mockResolvedValueOnce({
        findings: [
          {
            code: 'ANAT-D000',
            severity: 'warn',
            file: 'src/Tabs.tsx',
            line: null,
            componentType: 'Tabs',
            message: 'JSDoc anatomy declaration diverges from convention',
            evidence: { snippet: '' },
            rule: { id: 'ANAT-D000', source: 'convention/divergence' },
            fix: { kind: 'manual', description: 'Update JSDoc or convention' },
          },
        ],
        summary: {
          totalFiles: 1,
          durationMs: 5,
          bySeverity: { error: 0, warn: 1, info: 0 },
          byCode: { 'ANAT-D000': 1 },
        },
        catalog: { conventionsApplied: ['Tabs'], patternsApplied: [] },
        meta: { mode: 'fast', deferredToA11y: 0 },
      });

      const result = await runValidate({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      const anatomyIssue = result.value.issues.find((i) => i.check === 'componentAnatomy');
      expect(anatomyIssue?.severity).toBe('warning');
    });

    it('skips the audit when design.audit.componentAnatomy.enabled is false', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: true,
        value: {
          version: 1,
          rootDir: '.',
          agentsMapPath: './AGENTS.md',
          docsDir: './docs',
          design: {
            strictness: 'standard',
            platforms: [],
            audit: { componentAnatomy: { enabled: false } },
          },
        },
      } as never);

      const beforeCallCount = vi.mocked(runComponentAnatomyAudit).mock.calls.length;
      const result = await runValidate({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.checks.componentAnatomy).toBeUndefined();
      expect(vi.mocked(runComponentAnatomyAudit).mock.calls.length).toBe(beforeCallCount);
    });

    it('degrades gracefully when the audit throws (does not sink the whole validate)', async () => {
      vi.mocked(runComponentAnatomyAudit).mockRejectedValueOnce(new Error('boom: parser crashed'));

      const result = await runValidate({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.checks.componentAnatomy).toBe(false);
      const anatomyIssue = result.value.issues.find((i) => i.check === 'componentAnatomy');
      expect(anatomyIssue?.severity).toBe('warning');
      expect(anatomyIssue?.message).toContain('boom: parser crashed');
    });
  });
});
