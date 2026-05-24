import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock both verifiers BEFORE importing runCheckDesign so the mocks bind cleanly.
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
        runId: 'mock-run-id',
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

import { runCheckDesign, createCheckDesignCommand } from '../../src/commands/check-design';
import { runAudit as runAnatomyAudit } from '../../src/mcp/tools/audit-anatomy';
import { runDesignCraft } from '../../src/mcp/tools/design-craft';
import { runDetectDrift } from '../../src/mcp/tools/detect-drift';

describe('check-design command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runCheckDesign', () => {
    it('returns valid=true with empty findings when both verifiers report none', async () => {
      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.findingsByVerifier.anatomy).toHaveLength(0);
      expect(result.value.findingsByVerifier.craft).toHaveLength(0);
      expect(result.value.findingsByVerifier.drift).toHaveLength(0);
      expect(result.value.summary.totalFindings).toBe(0);
      expect(result.value.summary.verifiersRun).toEqual([
        'audit-anatomy',
        'design-craft-critique',
        'detect-drift',
      ]);
      expect(result.value.summary.verifiersFailed).toEqual([]);
      expect(result.value.graphPersisted.constraintsAdded).toBe(0);
      expect(result.value.graphPersisted.edgesAdded).toBe(0);
    });

    it('flips valid=false when an error-severity anatomy finding is present', async () => {
      vi.mocked(runAnatomyAudit).mockResolvedValueOnce({
        findings: [
          {
            code: 'ANAT-D001',
            severity: 'error',
            file: 'src/Button.tsx',
            line: 14,
            componentType: 'Button',
            message: 'Button missing required slot: content',
            evidence: { snippet: '<Button />' },
            rule: { id: 'ANAT-D001', source: 'APG/button' },
            fix: { kind: 'manual', description: 'Add a children prop' },
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

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
      expect(result.value.summary.bySeverity.error).toBe(1);
      expect(result.value.summary.byCode['ANAT-D001']).toBe(1);
      expect(result.value.findingsByVerifier.anatomy).toHaveLength(1);
      expect(result.value.graphPersisted.constraintsAdded).toBe(1);
      expect(result.value.graphPersisted.edgesAdded).toBe(1);
    });

    it('keeps valid=true when only warn/info severities present', async () => {
      vi.mocked(runAnatomyAudit).mockResolvedValueOnce({
        findings: [
          {
            code: 'ANAT-D000',
            severity: 'warn',
            file: 'src/Tabs.tsx',
            line: null,
            componentType: 'Tabs',
            message: 'JSDoc divergence',
            evidence: { snippet: '' },
            rule: { id: 'ANAT-D000', source: 'convention/divergence' },
            fix: { kind: 'manual', description: 'Reconcile JSDoc' },
          },
        ],
        summary: {
          totalFiles: 1,
          durationMs: 3,
          bySeverity: { error: 0, warn: 1, info: 0 },
          byCode: { 'ANAT-D000': 1 },
        },
        catalog: { conventionsApplied: ['Tabs'], patternsApplied: [] },
        meta: { mode: 'fast', deferredToA11y: 0 },
      });

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.summary.bySeverity.warn).toBe(1);
      expect(result.value.summary.bySeverity.error).toBe(0);
    });

    it('aggregates findings from both verifiers (anatomy first, then craft)', async () => {
      vi.mocked(runAnatomyAudit).mockResolvedValueOnce({
        findings: [
          {
            code: 'ANAT-P001',
            severity: 'warn',
            file: 'src/List.tsx',
            line: 42,
            componentType: null,
            message: 'map() over data with no empty branch',
            evidence: { snippet: 'items.map(...)' },
            rule: { id: 'ANAT-P001', source: 'pattern' },
            fix: { kind: 'manual', description: 'Add empty-state branch' },
          },
        ],
        summary: {
          totalFiles: 1,
          durationMs: 4,
          bySeverity: { error: 0, warn: 1, info: 0 },
          byCode: { 'ANAT-P001': 1 },
        },
        catalog: { conventionsApplied: [], patternsApplied: ['ANAT-P001'] },
        meta: { mode: 'fast', deferredToA11y: 0 },
      });

      vi.mocked(runDesignCraft).mockResolvedValueOnce({
        ok: true,
        value: {
          findings: [
            {
              code: 'CRAFT-C001',
              phase: 'critique',
              tier: 'foundational',
              impact: 'medium',
              confidence: 'high',
              target: { file: 'src/Page.tsx', line: 88 },
              message: 'Hierarchy muddy',
              cite: { rubricOrPatternId: 'hierarchy-clarity', source: 'huashu' },
              derived: { priority: 0.78 },
            },
          ],
          scores: [],
          summary: {
            phaseRun: ['critique'],
            mode: 'fast',
            durationMs: 10,
            llmCalls: { provider: 'mock', model: 'mock', count: 1, costUsd: 0 },
            catalog: {
              rubricsApplied: ['hierarchy-clarity'],
              patternsApplied: [],
              exemplarsCited: [],
            },
            preconditions: {
              aestheticIntentDeclared: false,
              designMdExists: false,
              tokensExist: false,
            },
            deferralsToHarnessDesign: 0,
            runId: 'mock-run',
          },
        },
      });

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.summary.totalFindings).toBe(2);
      expect(result.value.findingsByVerifier.anatomy).toHaveLength(1);
      expect(result.value.findingsByVerifier.craft).toHaveLength(1);
      // tier='foundational' maps to 'error' severity (per ADR 0019)
      expect(result.value.summary.bySeverity.error).toBe(1);
      expect(result.value.summary.bySeverity.warn).toBe(1);
      expect(result.value.valid).toBe(false); // tier=foundational → error → invalid
      expect(result.value.graphPersisted.edgesAdded).toBe(2);
    });

    it('degrades gracefully when audit-anatomy throws', async () => {
      vi.mocked(runAnatomyAudit).mockRejectedValueOnce(new Error('parser crashed'));

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.summary.verifiersRun).toEqual(['design-craft-critique', 'detect-drift']);
      expect(result.value.summary.verifiersFailed).toEqual([
        { name: 'audit-anatomy', error: 'parser crashed' },
      ]);
      // valid is false when ANY verifier failed (degraded run is not a pass)
      expect(result.value.valid).toBe(false);
    });

    it('degrades gracefully when design-craft returns Err', async () => {
      vi.mocked(runDesignCraft).mockResolvedValueOnce({
        ok: false,
        error: { message: 'LLM provider not configured' },
      });

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.summary.verifiersRun).toEqual(['audit-anatomy', 'detect-drift']);
      expect(result.value.summary.verifiersFailed[0]).toMatchObject({
        name: 'design-craft-critique',
        error: 'LLM provider not configured',
      });
    });

    it('degrades gracefully when design-craft throws', async () => {
      vi.mocked(runDesignCraft).mockRejectedValueOnce(new Error('boom'));

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.summary.verifiersRun).toEqual(['audit-anatomy', 'detect-drift']);
      expect(result.value.summary.verifiersFailed[0]).toMatchObject({
        name: 'design-craft-critique',
        error: 'boom',
      });
    });

    it('degrades gracefully when detect-drift throws', async () => {
      vi.mocked(runDetectDrift).mockRejectedValueOnce(new Error('drift parse failed'));

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.summary.verifiersRun).toEqual(['audit-anatomy', 'design-craft-critique']);
      expect(result.value.summary.verifiersFailed[0]).toMatchObject({
        name: 'detect-drift',
        error: 'drift parse failed',
      });
      expect(result.value.valid).toBe(false);
    });

    it('aggregates drift findings into bySeverity and byCode', async () => {
      vi.mocked(runDetectDrift).mockResolvedValueOnce({
        findings: [
          {
            code: 'DRIFT-T001',
            severity: 'error',
            file: 'src/Card.tsx',
            line: 12,
            message: 'Hex color "#ff0000" outside token system',
            evidence: { snippet: 'color: "#ff0000"' },
            rule: { id: 'DRIFT-T001', category: 'token-bypass' },
            fix: { kind: 'manual', description: 'Replace with token reference' },
          },
          {
            code: 'DRIFT-P001',
            severity: 'warn',
            file: 'src/Form.tsx',
            line: 5,
            message: 'Native <button> used instead of <Button> primitive',
            evidence: { snippet: '<button>' },
            rule: { id: 'DRIFT-P001', category: 'primitive-adoption' },
            fix: { kind: 'manual', description: 'Use registered Button primitive' },
          },
        ],
        summary: {
          totalFiles: 2,
          durationMs: 4,
          bySeverity: { error: 1, warn: 1, info: 0 },
          byCode: { 'DRIFT-T001': 1, 'DRIFT-P001': 1 },
        },
        catalog: { rulesApplied: ['token-bypass', 'primitive-adoption'] },
        meta: { mode: 'fast', tokensLoaded: true, registryLoaded: true },
      });

      const result = await runCheckDesign({ cwd: '/tmp/test' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.findingsByVerifier.drift).toHaveLength(2);
      expect(result.value.summary.bySeverity.error).toBe(1);
      expect(result.value.summary.bySeverity.warn).toBe(1);
      expect(result.value.summary.byCode['DRIFT-T001']).toBe(1);
      expect(result.value.summary.byCode['DRIFT-P001']).toBe(1);
      expect(result.value.valid).toBe(false); // error-severity drift → invalid
    });

    it('idempotently persists findings to the graph (no duplicate edges on re-run)', async () => {
      const finding = {
        code: 'ANAT-D001',
        severity: 'error' as const,
        file: 'src/Button.tsx',
        line: 14,
        componentType: 'Button',
        message: 'Button missing required slot: content',
        evidence: { snippet: '' },
        rule: { id: 'ANAT-D001', source: 'APG/button' },
        fix: { kind: 'manual' as const, description: 'Add children' },
      };
      vi.mocked(runAnatomyAudit).mockResolvedValue({
        findings: [finding],
        summary: {
          totalFiles: 1,
          durationMs: 5,
          bySeverity: { error: 1, warn: 0, info: 0 },
          byCode: { 'ANAT-D001': 1 },
        },
        catalog: { conventionsApplied: ['Button'], patternsApplied: [] },
        meta: { mode: 'fast', deferredToA11y: 0 },
      });

      // Each runCheckDesign call uses its own in-memory GraphStore — both runs
      // see "first write" semantics. The idempotency contract from
      // DesignConstraintAdapter.recordFindings is exercised at the adapter
      // level (covered by adapter tests); here we verify the
      // command produces consistent counts across runs.
      const first = await runCheckDesign({ cwd: '/tmp/test' });
      const second = await runCheckDesign({ cwd: '/tmp/test' });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.value.graphPersisted).toEqual(second.value.graphPersisted);
    });

    it('returns config-load error verbatim if resolveConfig fails', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const result = await runCheckDesign({});

      expect(result.ok).toBe(false);
    });

    it('passes the files option through to both verifiers', async () => {
      await runCheckDesign({ cwd: '/tmp/test', files: ['src/Foo.tsx', 'src/Bar.tsx'] });

      expect(runAnatomyAudit).toHaveBeenCalledWith(
        expect.objectContaining({ files: ['src/Foo.tsx', 'src/Bar.tsx'] })
      );
      expect(runDesignCraft).toHaveBeenCalledWith(
        expect.objectContaining({ files: ['src/Foo.tsx', 'src/Bar.tsx'] })
      );
      expect(runDetectDrift).toHaveBeenCalledWith(
        expect.objectContaining({ files: ['src/Foo.tsx', 'src/Bar.tsx'] })
      );
    });
  });

  describe('createCheckDesignCommand', () => {
    it('creates a Command with name "check-design"', () => {
      const cmd = createCheckDesignCommand();
      expect(cmd.name()).toBe('check-design');
    });

    it('has --mode and --files options', () => {
      const cmd = createCheckDesignCommand();
      expect(cmd.options.find((o) => o.long === '--mode')).toBeDefined();
      expect(cmd.options.find((o) => o.long === '--files')).toBeDefined();
    });
  });
});
