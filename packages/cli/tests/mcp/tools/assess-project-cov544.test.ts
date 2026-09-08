import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock every sub-tool the composite delegates to, so we can drive the
// populated / error / detailed branches of each check deterministically.
vi.mock('../../../src/mcp/tools/validate', () => ({ handleValidateProject: vi.fn() }));
vi.mock('../../../src/mcp/tools/architecture', () => ({ handleCheckDependencies: vi.fn() }));
vi.mock('../../../src/mcp/tools/docs', () => ({ handleCheckDocs: vi.fn() }));
vi.mock('../../../src/mcp/tools/entropy', () => ({ handleDetectEntropy: vi.fn() }));
vi.mock('../../../src/mcp/tools/security', () => ({ handleRunSecurityScan: vi.fn() }));
vi.mock('../../../src/mcp/tools/performance', () => ({ handleCheckPerformance: vi.fn() }));
vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

import { handleAssessProject, parseToolResponse } from '../../../src/mcp/tools/assess-project';
import { handleValidateProject } from '../../../src/mcp/tools/validate';
import { handleCheckDependencies } from '../../../src/mcp/tools/architecture';
import { handleCheckDocs } from '../../../src/mcp/tools/docs';
import { handleDetectEntropy } from '../../../src/mcp/tools/entropy';
import { handleRunSecurityScan } from '../../../src/mcp/tools/security';
import { handleCheckPerformance } from '../../../src/mcp/tools/performance';
import { execFileSync } from 'child_process';

function tool(obj: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj) }],
    ...(isError ? { isError } : {}),
  };
}
function rawTool(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError } : {}) };
}

const PATH = '/tmp/assess-cov544-proj';

function parse(r: { content: Array<{ text: string }> }) {
  return JSON.parse(r.content[0].text);
}
function check(r: { content: Array<{ text: string }> }, name: string) {
  return parse(r).checks.find((c: { name: string }) => c.name === name);
}

describe('parseToolResponse branches (cov544)', () => {
  it('isError response → error CheckResult using first content text', () => {
    const out = parseToolResponse(rawTool('boom', true), 'validate');
    expect('error' in out && out.error.topIssue).toBe('boom');
  });
  it('isError response with no content text → default message', () => {
    const out = parseToolResponse({ content: [], isError: true } as never, 'deps');
    expect('error' in out && out.error.topIssue).toBe('deps check failed');
  });
  it('valid JSON → parsed', () => {
    const out = parseToolResponse(tool({ a: 1 }), 'docs');
    expect('parsed' in out && out.parsed).toEqual({ a: 1 });
  });
  it('empty content → parsed {}', () => {
    const out = parseToolResponse({ content: [] } as never, 'docs');
    expect('parsed' in out && out.parsed).toEqual({});
  });
  it('non-JSON text → error CheckResult', () => {
    const out = parseToolResponse(rawTool('not json'), 'entropy');
    expect('error' in out && out.error.topIssue).toBe('not json');
  });
});

describe('handleAssessProject check branches (cov544)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizePath throw (root) → isError', async () => {
    const r = await handleAssessProject({ path: '/' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('filesystem root');
  });

  it('validate: populated errors set passed=false + topIssue; detailed included', async () => {
    vi.mocked(handleValidateProject).mockResolvedValue(
      tool({ valid: false, errors: ['first err', 'second err'] })
    );
    const r = await handleAssessProject({ path: PATH, checks: ['validate'], mode: 'detailed' });
    const c = check(r, 'validate');
    expect(c.passed).toBe(false);
    expect(c.issueCount).toBe(2);
    expect(c.topIssue).toBe('first err');
    expect(c).toHaveProperty('detailed');
  });

  it('validate: valid true with no errors → passed, no topIssue', async () => {
    vi.mocked(handleValidateProject).mockResolvedValue(tool({ valid: true, errors: [] }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['validate'] }), 'validate');
    expect(c.passed).toBe(true);
    expect(c.issueCount).toBe(0);
    expect(c.topIssue).toBeUndefined();
  });

  it('validate: sub-tool isError → parseToolResponse error path', async () => {
    vi.mocked(handleValidateProject).mockResolvedValue(rawTool('validate blew up', true));
    const c = check(await handleAssessProject({ path: PATH, checks: ['validate'] }), 'validate');
    expect(c.passed).toBe(false);
    expect(c.topIssue).toBe('validate blew up');
  });

  it('validate: thrown import error → catch branch', async () => {
    vi.mocked(handleValidateProject).mockRejectedValue(new Error('kaboom'));
    const c = check(await handleAssessProject({ path: PATH, checks: ['validate'] }), 'validate');
    expect(c.passed).toBe(false);
    expect(c.topIssue).toBe('kaboom');
  });

  it('deps: violations with + without message field', async () => {
    vi.mocked(handleCheckDependencies).mockResolvedValue(
      tool({ violations: [{ message: 'bad dep' }, { code: 'X' }] })
    );
    const c = check(
      await handleAssessProject({ path: PATH, checks: ['deps'], mode: 'detailed' }),
      'deps'
    );
    expect(c.passed).toBe(false);
    expect(c.issueCount).toBe(2);
    expect(c.topIssue).toBe('bad dep');
    expect(c).toHaveProperty('detailed');
  });

  it('deps: no violations → passed', async () => {
    vi.mocked(handleCheckDependencies).mockResolvedValue(tool({ violations: [] }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['deps'] }), 'deps');
    expect(c.passed).toBe(true);
  });

  it('deps: thrown → catch', async () => {
    vi.mocked(handleCheckDependencies).mockRejectedValue('str error');
    const c = check(await handleAssessProject({ path: PATH, checks: ['deps'] }), 'deps');
    expect(c.passed).toBe(false);
    expect(c.topIssue).toBe('str error');
  });

  it('docs: top-level undocumented list', async () => {
    vi.mocked(handleCheckDocs).mockResolvedValue(tool({ undocumented: ['a.ts', 'b.ts'] }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['docs'] }), 'docs');
    expect(c.passed).toBe(true);
    expect(c.issueCount).toBe(2);
    expect(c.topIssue).toContain('a.ts');
  });

  it('docs: nested files.undocumented fallback', async () => {
    vi.mocked(handleCheckDocs).mockResolvedValue(tool({ files: { undocumented: ['x.ts'] } }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['docs'] }), 'docs');
    expect(c.issueCount).toBe(1);
  });

  it('docs: no undocumented data → issueCount 0', async () => {
    vi.mocked(handleCheckDocs).mockResolvedValue(tool({}));
    const c = check(await handleAssessProject({ path: PATH, checks: ['docs'] }), 'docs');
    expect(c.issueCount).toBe(0);
    expect(c.topIssue).toBeUndefined();
  });

  it('docs: thrown → catch', async () => {
    vi.mocked(handleCheckDocs).mockRejectedValue(new Error('docs err'));
    const c = check(await handleAssessProject({ path: PATH, checks: ['docs'] }), 'docs');
    expect(c.passed).toBe(false);
  });

  it('entropy: aggregates issue counts across drift/deadCode/patterns', async () => {
    vi.mocked(handleDetectEntropy).mockResolvedValue(
      tool({
        drift: { staleReferences: [1], missingTargets: [1, 2] },
        deadCode: { unusedImports: [1], unusedExports: [] },
        patterns: { violations: [1, 2, 3] },
      })
    );
    const c = check(await handleAssessProject({ path: PATH, checks: ['entropy'] }), 'entropy');
    expect(c.issueCount).toBe(7);
    expect(c.passed).toBe(false);
    expect(c.topIssue).toContain('Entropy detected');
  });

  it('entropy: clean → passed with no topIssue', async () => {
    vi.mocked(handleDetectEntropy).mockResolvedValue(tool({}));
    const c = check(await handleAssessProject({ path: PATH, checks: ['entropy'] }), 'entropy');
    expect(c.issueCount).toBe(0);
    expect(c.passed).toBe(true);
  });

  it('entropy: thrown → catch', async () => {
    vi.mocked(handleDetectEntropy).mockRejectedValue(new Error('entropy err'));
    const c = check(await handleAssessProject({ path: PATH, checks: ['entropy'] }), 'entropy');
    expect(c.passed).toBe(false);
  });

  it('security: error-severity finding → failed; topIssue uses rule', async () => {
    vi.mocked(handleRunSecurityScan).mockResolvedValue(
      tool({ findings: [{ severity: 'error', rule: 'SEC-1', message: 'leak' }] })
    );
    const c = check(await handleAssessProject({ path: PATH, checks: ['security'] }), 'security');
    expect(c.passed).toBe(false);
    expect(c.issueCount).toBe(1);
    expect(c.topIssue).toContain('SEC-1');
  });

  it('security: warning-only findings → passed; topIssue falls back to type', async () => {
    vi.mocked(handleRunSecurityScan).mockResolvedValue(
      tool({ findings: [{ severity: 'warning', type: 'T1' }] })
    );
    const c = check(await handleAssessProject({ path: PATH, checks: ['security'] }), 'security');
    expect(c.passed).toBe(true);
    expect(c.topIssue).toContain('T1');
  });

  it('security: no findings → passed, no topIssue', async () => {
    vi.mocked(handleRunSecurityScan).mockResolvedValue(tool({ findings: [] }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['security'] }), 'security');
    expect(c.passed).toBe(true);
    expect(c.topIssue).toBeUndefined();
  });

  it('security: thrown → catch', async () => {
    vi.mocked(handleRunSecurityScan).mockRejectedValue(new Error('sec err'));
    const c = check(await handleAssessProject({ path: PATH, checks: ['security'] }), 'security');
    expect(c.passed).toBe(false);
  });

  it('perf: violations length used', async () => {
    vi.mocked(handleCheckPerformance).mockResolvedValue(tool({ violations: [1, 2] }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['perf'] }), 'perf');
    expect(c.issueCount).toBe(2);
    expect(c.passed).toBe(false);
    expect(c.topIssue).toContain('Performance issues');
  });

  it('perf: issues fallback when no violations key', async () => {
    vi.mocked(handleCheckPerformance).mockResolvedValue(tool({ issues: [1] }));
    const c = check(await handleAssessProject({ path: PATH, checks: ['perf'] }), 'perf');
    expect(c.issueCount).toBe(1);
  });

  it('perf: sub-tool isError branch', async () => {
    vi.mocked(handleCheckPerformance).mockResolvedValue(rawTool('perf broke', true));
    const c = check(await handleAssessProject({ path: PATH, checks: ['perf'] }), 'perf');
    expect(c.passed).toBe(false);
    expect(c.topIssue).toBe('perf broke');
  });

  it('perf: invalid JSON output branch', async () => {
    vi.mocked(handleCheckPerformance).mockResolvedValue(rawTool('<<not json>>'));
    const c = check(await handleAssessProject({ path: PATH, checks: ['perf'] }), 'perf');
    expect(c.passed).toBe(false);
    expect(c.topIssue).toBe('<<not json>>');
  });

  it('perf: clean, detailed included', async () => {
    vi.mocked(handleCheckPerformance).mockResolvedValue(tool({ violations: [] }));
    const c = check(
      await handleAssessProject({ path: PATH, checks: ['perf'], mode: 'detailed' }),
      'perf'
    );
    expect(c.passed).toBe(true);
    expect(c).toHaveProperty('detailed');
  });

  it('perf: thrown → catch', async () => {
    vi.mocked(handleCheckPerformance).mockRejectedValue(new Error('perf err'));
    const c = check(await handleAssessProject({ path: PATH, checks: ['perf'] }), 'perf');
    expect(c.passed).toBe(false);
  });

  it('lint: success path → passed, detailed carries output', async () => {
    vi.mocked(execFileSync).mockReturnValue('lint ok output' as never);
    const c = check(
      await handleAssessProject({ path: PATH, checks: ['lint'], mode: 'detailed' }),
      'lint'
    );
    expect(c.passed).toBe(true);
    expect(c.issueCount).toBe(0);
    expect(c.detailed).toBe('lint ok output');
  });

  it('lint: failure with "N error" count + first-error extraction', async () => {
    const err = Object.assign(new Error('cmd failed'), {
      stderr: 'problem in file\nsummary line\n3 errors found',
      stdout: '',
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw err;
    });
    const c = check(
      await handleAssessProject({ path: PATH, checks: ['lint'], mode: 'detailed' }),
      'lint'
    );
    expect(c.passed).toBe(false);
    expect(c.issueCount).toBe(3);
    expect(c.topIssue).toContain('error');
    expect(c).toHaveProperty('detailed');
  });

  it('lint: failure with no error-count and no stderr → issueCount 1 + message topIssue', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    const c = check(await handleAssessProject({ path: PATH, checks: ['lint'] }), 'lint');
    expect(c.passed).toBe(false);
    expect(c.issueCount).toBe(1);
    expect(c.topIssue).toBe('spawn ENOENT');
  });

  it('healthy=true when every requested check passes', async () => {
    vi.mocked(handleValidateProject).mockResolvedValue(tool({ valid: true, errors: [] }));
    vi.mocked(handleCheckDependencies).mockResolvedValue(tool({ violations: [] }));
    const parsed = parse(await handleAssessProject({ path: PATH, checks: ['validate', 'deps'] }));
    expect(parsed.healthy).toBe(true);
    // summary mode strips detailed
    expect(parsed.checks[0]).not.toHaveProperty('detailed');
  });
});
