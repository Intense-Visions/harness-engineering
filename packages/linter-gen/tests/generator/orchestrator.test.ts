// tests/generator/orchestrator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generate, validate, type GenerateOptions } from '../../src/generator/orchestrator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('orchestrator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linter-gen-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validate', () => {
    it('returns success for valid config', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      await fs.writeFile(
        configPath,
        `version: 1
output: ./generated
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: ["react"]
      message: "No React"
`
      );

      const result = await validate({ configPath });
      expect(result.success).toBe(true);
    });

    it('returns error for invalid config', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      await fs.writeFile(configPath, 'version: 2\nrules: []');

      const result = await validate({ configPath });
      expect(result.success).toBe(false);
    });
  });

  describe('generate', () => {
    it('generates rule files to output directory', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      const outputDir = path.join(tempDir, 'generated');

      await fs.writeFile(
        configPath,
        `version: 1
output: ${outputDir}
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: ["react"]
      message: "No React"
`
      );

      const result = await generate({ configPath });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.rulesGenerated).toContain('test-rule');
        expect(result.outputDir).toBe(outputDir);

        // Verify files were created
        const ruleExists = await fs
          .access(path.join(outputDir, 'test-rule.ts'))
          .then(() => true)
          .catch(() => false);
        const indexExists = await fs
          .access(path.join(outputDir, 'index.ts'))
          .then(() => true)
          .catch(() => false);
        expect(ruleExists).toBe(true);
        expect(indexExists).toBe(true);
      }
    });

    it('respects outputDir override', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      const customOutput = path.join(tempDir, 'custom-output');

      await fs.writeFile(
        configPath,
        `version: 1
output: ./default-output
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: []
      message: "Test"
`
      );

      const result = await generate({ configPath, outputDir: customOutput });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputDir).toBe(customOutput);
      }
    });

    it('dryRun does not write files', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      const outputDir = path.join(tempDir, 'generated');

      await fs.writeFile(
        configPath,
        `version: 1
output: ${outputDir}
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: []
      message: "Test"
`
      );

      const result = await generate({ configPath, dryRun: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.rulesGenerated).toContain('test-rule');
        // Directory should not exist
        const dirExists = await fs
          .access(outputDir)
          .then(() => true)
          .catch(() => false);
        expect(dirExists).toBe(false);
      }
    });
  });
});
