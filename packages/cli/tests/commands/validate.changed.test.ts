import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    validateAgentsMap: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    validateKnowledgeMap: vi.fn().mockResolvedValue({ ok: true, value: { brokenLinks: [] } }),
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', agentsMapPath: './AGENTS.md', docsDir: './docs' },
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
  }),
}));
vi.mock('../../src/mcp/tools/instruction-density', () => ({
  runInstructionDensityAudit: vi.fn().mockResolvedValue({ findings: [] }),
}));

// Controlled changed-surface + design-surface filter: no real git or config needed.
const { deriveChangedSurfaceMock, filterToDesignSurfaceMock } = vi.hoisted(() => ({
  deriveChangedSurfaceMock: vi.fn(),
  filterToDesignSurfaceMock: vi.fn(),
}));
vi.mock('../../src/commands/validate-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/validate-scope')>();
  return {
    ...actual,
    deriveChangedSurface: deriveChangedSurfaceMock,
    filterToDesignSurface: filterToDesignSurfaceMock,
  };
});

import { runValidate } from '../../src/commands/validate';
import { runDetectDrift } from '../../src/mcp/tools/detect-drift';
import { runAuditBrand } from '../../src/mcp/tools/audit-brand';
import { runAudit as runComponentAnatomyAudit } from '../../src/mcp/tools/audit-anatomy';

const DESIGN_SURFACE = ['packages/cli/src/foo.ts', 'packages/cli/src/bar.tsx'];

describe('validate --changed / affected scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deriveChangedSurfaceMock.mockReturnValue({
      ok: true,
      ref: 'abc123',
      files: ['packages/cli/src/foo.ts', 'packages/cli/src/bar.tsx', 'docs/readme.md'],
    });
    // The real filter drops docs/*.md; return the design subset deterministically.
    filterToDesignSurfaceMock.mockReturnValue([...DESIGN_SURFACE]);
  });

  it('defaults to a full sweep and passes no files to the walkers', async () => {
    const result = await runValidate({ cwd: '/tmp/repo' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scope.mode).toBe('full');
    expect(deriveChangedSurfaceMock).not.toHaveBeenCalled();
    // Full sweep: walkers invoked without an explicit `files` list.
    expect((runDetectDrift as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].files).toBe(
      undefined
    );
    expect((runAuditBrand as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].files).toBe(
      undefined
    );
  });

  it('scopes drift + brand to the design surface in affected mode (anatomy left full)', async () => {
    const result = await runValidate({ cwd: '/tmp/repo', changed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deriveChangedSurfaceMock).toHaveBeenCalledOnce();
    expect(filterToDesignSurfaceMock).toHaveBeenCalledOnce();
    expect(result.value.scope.mode).toBe('affected');
    expect(result.value.scope.ref).toBe('abc123');
    expect(result.value.scope.changedFileCount).toBe(2);
    expect(result.value.scope.scopedChecks).toEqual(['driftDetection', 'brandCompliance']);
    // drift + brand receive the filtered design surface...
    for (const audit of [runDetectDrift, runAuditBrand]) {
      const call = (audit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.files).toEqual(DESIGN_SURFACE);
    }
    // ...but component-anatomy is deliberately NOT scoped (no files → parity with full).
    expect(
      (runComponentAnatomyAudit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].files
    ).toBe(undefined);
  });

  it('--since implies affected mode', async () => {
    const result = await runValidate({ cwd: '/tmp/repo', since: 'HEAD~3' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deriveChangedSurfaceMock).toHaveBeenCalledWith('/tmp/repo', { since: 'HEAD~3' });
    expect(result.value.scope.mode).toBe('affected');
  });

  it('falls back to a full sweep (with reason) when git derivation fails', async () => {
    deriveChangedSurfaceMock.mockReturnValue({
      ok: false,
      files: [],
      reason: 'not a git repository',
    });
    const result = await runValidate({ cwd: '/tmp/repo', changed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scope.mode).toBe('full');
    expect(result.value.scope.fallbackReason).toBe('not a git repository');
    // On fallback the walkers run a full sweep (no explicit files).
    expect((runDetectDrift as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].files).toBe(
      undefined
    );
  });
});
