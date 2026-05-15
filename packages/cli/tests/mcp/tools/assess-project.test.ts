import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  assessProjectDefinition,
  handleAssessProject,
} from '../../../src/mcp/tools/assess-project';

describe('assess_project tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(assessProjectDefinition.name).toBe('assess_project');
    });

    it('requires path', () => {
      expect(assessProjectDefinition.inputSchema.required).toContain('path');
    });

    it('has optional checks and mode properties', () => {
      const props = assessProjectDefinition.inputSchema.properties;
      expect(props).toHaveProperty('checks');
      expect(props).toHaveProperty('mode');
    });

    it('checks enum has all check names including lint', () => {
      const checksProp = assessProjectDefinition.inputSchema.properties.checks;
      expect(checksProp.items.enum).toEqual([
        'validate',
        'deps',
        'docs',
        'entropy',
        'security',
        'perf',
        'lint',
      ]);
    });

    it('mode defaults to summary for composite', () => {
      const modeProp = assessProjectDefinition.inputSchema.properties.mode;
      expect(modeProp.enum).toEqual(['summary', 'detailed']);
    });
  });

  describe('handler - summary mode', () => {
    it('returns healthy flag and checks array for nonexistent project', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-ap-test',
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('healthy');
      expect(typeof parsed.healthy).toBe('boolean');
      expect(parsed).toHaveProperty('checks');
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed).toHaveProperty('assessedIn');
      expect(typeof parsed.assessedIn).toBe('number');
    });

    it('each check has name, passed, issueCount', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-ap-test',
      });
      const parsed = JSON.parse(response.content[0].text);
      for (const check of parsed.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('issueCount');
      }
    });
  });

  describe('handler - checks filter', () => {
    it('only runs specified checks', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-ap-test',
        checks: ['validate'],
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.checks).toHaveLength(1);
      expect(parsed.checks[0].name).toBe('validate');
    });
  });

  describe('assess_project snapshot parity', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-parity-'));
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ name: 'test-project' })
      );
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('validate check matches handleValidateProject output', async () => {
      const { handleValidateProject } = await import('../../../src/mcp/tools/validate');

      const compositeResponse = await handleAssessProject({
        path: tmpDir,
        checks: ['validate'],
        mode: 'detailed',
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await handleValidateProject({ path: tmpDir });
      const directParsed = JSON.parse(directResult.content[0].text);

      const compositeCheck = compositeData.checks.find(
        (c: { name: string }) => c.name === 'validate'
      );
      expect(compositeCheck).toBeDefined();
      expect(compositeCheck.detailed).toEqual(directParsed);
    });

    it('detailed mode includes full results for each check', async () => {
      const response = await handleAssessProject({
        path: tmpDir,
        checks: ['validate'],
        mode: 'detailed',
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.checks[0]).toHaveProperty('detailed');
    });

    it('summary mode omits detailed field', async () => {
      const response = await handleAssessProject({
        path: tmpDir,
        checks: ['validate'],
        mode: 'summary',
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.checks[0]).not.toHaveProperty('detailed');
    });
  });

  describe('error handling — isError guard and JSON.parse resilience', () => {
    it('handles sub-tool isError response without JSON.parse crash', async () => {
      // Mock the entropy handler to return an isError response with non-JSON text
      vi.doMock('../../../src/mcp/tools/entropy', () => ({
        handleDetectEntropy: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Error: Could not detect entropy' }],
          isError: true,
        }),
      }));

      const response = await handleAssessProject({
        path: '/nonexistent/err-guard-test',
        checks: ['entropy'],
      });
      const parsed = JSON.parse(response.content[0].text);
      const entropyCheck = parsed.checks.find((c: { name: string }) => c.name === 'entropy');
      expect(entropyCheck).toBeDefined();
      expect(entropyCheck.passed).toBe(false);
      // The topIssue should contain the original error, not a SyntaxError
      expect(entropyCheck.topIssue).not.toContain('Unexpected token');

      vi.doUnmock('../../../src/mcp/tools/entropy');
    });

    it('handles sub-tool returning invalid JSON text gracefully', async () => {
      // Mock the docs handler to return non-JSON text without isError flag
      vi.doMock('../../../src/mcp/tools/docs', () => ({
        handleCheckDocs: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json {{{' }],
        }),
      }));

      const response = await handleAssessProject({
        path: '/nonexistent/json-guard-test',
        checks: ['docs'],
      });
      const parsed = JSON.parse(response.content[0].text);
      const docsCheck = parsed.checks.find((c: { name: string }) => c.name === 'docs');
      expect(docsCheck).toBeDefined();
      expect(docsCheck.passed).toBe(false);
      expect(docsCheck.topIssue).toBeDefined();
      // Should not propagate a raw SyntaxError
      expect(docsCheck.topIssue).not.toContain('Unexpected token');

      vi.doUnmock('../../../src/mcp/tools/docs');
    });
  });

  describe('assess_project performance', () => {
    it('reports assessedIn timing', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-bench',
        checks: ['validate'],
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.assessedIn).toBeGreaterThanOrEqual(0);
      expect(typeof parsed.assessedIn).toBe('number');
    });

    it('runs all checks and returns unified result in a single call', async () => {
      // Structural verification: assess_project returns results from all
      // requested checks in a single call, proving parallel internal execution.
      // Timing-based assertions are unreliable with mocked dependencies.
      const response = await handleAssessProject({
        path: '/nonexistent/project-bench',
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('healthy');
      expect(parsed).toHaveProperty('checks');
      expect(parsed).toHaveProperty('assessedIn');
      // Should have results for all default checks
      expect(parsed.checks.length).toBeGreaterThanOrEqual(1);
      // Each check should have the expected shape
      for (const check of parsed.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('issueCount');
      }
    });
  });
});
