/**
 * Tests for assess-project.ts error handling: isError guards and JSON.parse resilience.
 *
 * Separate file because vi.mock is hoisted and would affect all tests in a shared file.
 * Each sub-handler is mocked so we can inject isError responses and invalid JSON.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all sub-handlers used by handleAssessProject
const mockValidate = vi.fn();
const mockDeps = vi.fn();
const mockDocs = vi.fn();
const mockEntropy = vi.fn();
const mockSecurity = vi.fn();
const mockPerf = vi.fn();

vi.mock('../../../src/mcp/tools/validate.js', () => ({
  handleValidateProject: (...args: unknown[]) => mockValidate(...args),
}));
vi.mock('../../../src/mcp/tools/architecture.js', () => ({
  handleCheckDependencies: (...args: unknown[]) => mockDeps(...args),
}));
vi.mock('../../../src/mcp/tools/docs.js', () => ({
  handleCheckDocs: (...args: unknown[]) => mockDocs(...args),
}));
vi.mock('../../../src/mcp/tools/entropy.js', () => ({
  handleDetectEntropy: (...args: unknown[]) => mockEntropy(...args),
}));
vi.mock('../../../src/mcp/tools/security.js', () => ({
  handleRunSecurityScan: (...args: unknown[]) => mockSecurity(...args),
}));
vi.mock('../../../src/mcp/tools/performance.js', () => ({
  handleCheckPerformance: (...args: unknown[]) => mockPerf(...args),
}));

import { handleAssessProject } from '../../../src/mcp/tools/assess-project';

function okJson(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true };
}
function badJson(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

describe('assess_project error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all handlers return valid JSON
    mockValidate.mockResolvedValue(okJson({ valid: true }));
    mockDeps.mockResolvedValue(okJson({ valid: true, violations: [] }));
    mockDocs.mockResolvedValue(okJson({ undocumented: [] }));
    mockEntropy.mockResolvedValue(okJson({ drift: {}, deadCode: {}, patterns: {} }));
    mockSecurity.mockResolvedValue(okJson({ findings: [] }));
    mockPerf.mockResolvedValue(okJson({ violations: [] }));
  });

  describe('isError guard — sub-handler returns error response', () => {
    it('validate: captures error message instead of crashing on JSON.parse', async () => {
      mockValidate.mockResolvedValue(errResponse('Error: config not found'));
      const res = await handleAssessProject({ path: '/tmp/test-err', checks: ['validate'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].name).toBe('validate');
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('Error: config not found');
    });

    it('deps: captures error message from isError response', async () => {
      mockDeps.mockResolvedValue(errResponse('Error: could not resolve dependencies'));
      const res = await handleAssessProject({ path: '/tmp/test-err', checks: ['deps'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('Error: could not resolve dependencies');
    });

    it('docs: captures error message from isError response', async () => {
      mockDocs.mockResolvedValue(errResponse('Error: docs check failed'));
      const res = await handleAssessProject({ path: '/tmp/test-err', checks: ['docs'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('Error: docs check failed');
    });

    it('entropy: captures error message from isError response', async () => {
      mockEntropy.mockResolvedValue(errResponse('Error: Could not detect entropy'));
      const res = await handleAssessProject({ path: '/tmp/test-err', checks: ['entropy'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('Error: Could not detect entropy');
    });

    it('security: captures error message from isError response', async () => {
      mockSecurity.mockResolvedValue(errResponse('Error: scanner unavailable'));
      const res = await handleAssessProject({ path: '/tmp/test-err', checks: ['security'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('Error: scanner unavailable');
    });
  });

  describe('JSON.parse try/catch — sub-handler returns non-JSON text', () => {
    it('validate: returns topIssue with raw text instead of SyntaxError', async () => {
      mockValidate.mockResolvedValue(badJson('not json {{{'));
      const res = await handleAssessProject({ path: '/tmp/test-bad', checks: ['validate'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('not json {{{');
    });

    it('deps: returns topIssue with raw text instead of SyntaxError', async () => {
      mockDeps.mockResolvedValue(badJson('broken output'));
      const res = await handleAssessProject({ path: '/tmp/test-bad', checks: ['deps'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('broken output');
    });

    it('docs: returns topIssue with raw text instead of SyntaxError', async () => {
      mockDocs.mockResolvedValue(badJson('malformed'));
      const res = await handleAssessProject({ path: '/tmp/test-bad', checks: ['docs'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('malformed');
    });

    it('entropy: returns topIssue with raw text instead of SyntaxError', async () => {
      mockEntropy.mockResolvedValue(badJson('Could not parse config'));
      const res = await handleAssessProject({ path: '/tmp/test-bad', checks: ['entropy'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('Could not parse config');
    });

    it('security: returns topIssue with raw text instead of SyntaxError', async () => {
      mockSecurity.mockResolvedValue(badJson('scan crashed'));
      const res = await handleAssessProject({ path: '/tmp/test-bad', checks: ['security'] });
      const data = JSON.parse(res.content[0].text);
      expect(data.checks[0].passed).toBe(false);
      expect(data.checks[0].topIssue).toBe('scan crashed');
    });
  });

  describe('healthy flag reflects check results', () => {
    it('healthy=true when all checks pass', async () => {
      const res = await handleAssessProject({
        path: '/tmp/test-ok',
        checks: ['validate', 'deps'],
      });
      const data = JSON.parse(res.content[0].text);
      expect(data.healthy).toBe(true);
    });

    it('healthy=false when any check has isError', async () => {
      mockEntropy.mockResolvedValue(errResponse('Error: broken'));
      const res = await handleAssessProject({
        path: '/tmp/test-mixed',
        checks: ['validate', 'entropy'],
      });
      const data = JSON.parse(res.content[0].text);
      expect(data.healthy).toBe(false);
    });
  });
});
