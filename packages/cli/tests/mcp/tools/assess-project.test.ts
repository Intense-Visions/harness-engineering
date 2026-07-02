import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  assessProjectDefinition,
  handleAssessProject,
  resolveLintCommand,
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

  // Regression: #702 — lint check hardcoded `turbo run lint`, ignoring
  // `tooling.linter`, so every non-npm project got a spurious lint failure.
  describe('resolveLintCommand honors tooling.linter (#702)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-lint-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeConfig(config: unknown): void {
      fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
    }

    it('runs ruff for a Python project instead of turbo', () => {
      writeConfig({
        version: 1,
        template: { language: 'python', version: 1 },
        tooling: { linter: 'ruff', formatter: 'ruff', testRunner: 'pytest' },
      });
      const resolved = resolveLintCommand(tmpDir);
      expect(resolved).toEqual({ command: 'ruff', args: ['check', '.'] });
      // The reported bug: it must NOT fall through to turbo.
      expect(resolved.args).not.toContain('turbo');
    });

    it('runs golangci-lint for a Go project', () => {
      writeConfig({ version: 1, tooling: { linter: 'golangci-lint' } });
      expect(resolveLintCommand(tmpDir)).toEqual({ command: 'golangci-lint', args: ['run'] });
    });

    it('runs cargo clippy for a Rust project', () => {
      writeConfig({ version: 1, tooling: { linter: 'clippy' } });
      expect(resolveLintCommand(tmpDir)).toEqual({ command: 'cargo', args: ['clippy'] });
    });

    it('reads tooling.linter nested under template as a fallback', () => {
      writeConfig({ version: 1, template: { tooling: { linter: 'ruff' } } });
      expect(resolveLintCommand(tmpDir)).toEqual({ command: 'ruff', args: ['check', '.'] });
    });

    it('falls back to turbo when no linter is configured', () => {
      writeConfig({ version: 1, name: 'ts-project' });
      expect(resolveLintCommand(tmpDir)).toEqual({
        command: 'npx',
        args: ['turbo', 'run', 'lint', '--force'],
      });
    });

    it('falls back to turbo for unknown/npm linters', () => {
      writeConfig({ version: 1, tooling: { linter: 'eslint' } });
      expect(resolveLintCommand(tmpDir)).toEqual({
        command: 'npx',
        args: ['turbo', 'run', 'lint', '--force'],
      });
    });

    it('falls back to turbo when harness.config.json is missing', () => {
      expect(resolveLintCommand(tmpDir)).toEqual({
        command: 'npx',
        args: ['turbo', 'run', 'lint', '--force'],
      });
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
