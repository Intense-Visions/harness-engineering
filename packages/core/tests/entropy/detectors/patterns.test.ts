import { describe, it, expect } from 'vitest';
import { checkConfigPattern, detectPatternViolations } from '../../../src/entropy/detectors/patterns';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';
import type { ConfigPattern, SourceFile } from '../../../src/entropy/types';

describe('checkConfigPattern', () => {
  it('should detect max-exports violation', () => {
    const pattern: ConfigPattern = {
      name: 'max-exports',
      description: 'Max 5 exports per file',
      severity: 'error',
      files: ['**/*.ts'],
      rule: { type: 'max-exports', count: 5 },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/utils/too-many.ts',
      exports: [
        { name: 'a', type: 'named', location: { file: '', line: 1, column: 0 }, isReExport: false },
        { name: 'b', type: 'named', location: { file: '', line: 2, column: 0 }, isReExport: false },
        { name: 'c', type: 'named', location: { file: '', line: 3, column: 0 }, isReExport: false },
        { name: 'd', type: 'named', location: { file: '', line: 4, column: 0 }, isReExport: false },
        { name: 'e', type: 'named', location: { file: '', line: 5, column: 0 }, isReExport: false },
        { name: 'f', type: 'named', location: { file: '', line: 6, column: 0 }, isReExport: false },
        { name: 'g', type: 'named', location: { file: '', line: 7, column: 0 }, isReExport: false },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('7 exports');
  });

  it('should detect must-export-default violation', () => {
    const pattern: ConfigPattern = {
      name: 'must-export-default-class',
      description: 'Services must export default class',
      severity: 'error',
      files: ['src/services/**/*.ts'],
      rule: { type: 'must-export-default', kind: 'class' },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/services/bad-service.ts',
      exports: [
        { name: 'BadService', type: 'named', location: { file: '', line: 1, column: 0 }, isReExport: false },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('default');
  });

  it('should pass when pattern is satisfied', () => {
    const pattern: ConfigPattern = {
      name: 'max-exports',
      description: 'Max 5 exports per file',
      severity: 'error',
      files: ['**/*.ts'],
      rule: { type: 'max-exports', count: 5 },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/valid.ts',
      exports: [
        { name: 'a', type: 'named', location: { file: '', line: 1, column: 0 }, isReExport: false },
        { name: 'b', type: 'named', location: { file: '', line: 2, column: 0 }, isReExport: false },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(0);
  });

  it('should detect no-import violation', () => {
    const pattern: ConfigPattern = {
      name: 'no-lodash',
      description: 'Do not import lodash',
      severity: 'warning',
      files: ['**/*.ts'],
      rule: { type: 'no-import', from: 'lodash' },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/utils.ts',
      exports: [],
      imports: [
        { source: 'lodash', specifiers: ['map'], location: { file: '', line: 5, column: 0 }, kind: 'value' },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('lodash');
  });
});

describe('detectPatternViolations', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/pattern-samples');

  it('should detect pattern violations across codebase', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: {
        patterns: {
          patterns: [
            {
              name: 'max-exports',
              description: 'Max 5 exports per file',
              severity: 'error' as const,
              files: ['**/*.ts'],
              rule: { type: 'max-exports' as const, count: 5 },
            },
          ],
        },
      },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectPatternViolations(snapshotResult.value, {
      patterns: [
        {
          name: 'max-exports',
          description: 'Max 5 exports per file',
          severity: 'error',
          files: ['**/*.ts'],
          rule: { type: 'max-exports', count: 5 },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // too-many-exports.ts has 7 exports, should be flagged
    const tooManyViolation = result.value.violations.find(v =>
      v.file.includes('too-many-exports.ts')
    );
    expect(tooManyViolation).toBeDefined();
    expect(tooManyViolation?.message).toContain('7 exports');
  });

  it('should detect must-export-default violations', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { patterns: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectPatternViolations(snapshotResult.value, {
      patterns: [
        {
          name: 'services-default-export',
          description: 'Services must export default',
          severity: 'error',
          files: ['src/services/**/*.ts'],
          rule: { type: 'must-export-default' },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // bad-service.ts doesn't have default export
    const badServiceViolation = result.value.violations.find(v =>
      v.file.includes('bad-service.ts')
    );
    expect(badServiceViolation).toBeDefined();

    // user-service.ts has default export, should not be flagged
    const userServiceViolation = result.value.violations.find(v =>
      v.file.includes('user-service.ts')
    );
    expect(userServiceViolation).toBeUndefined();
  });

  it('should calculate pass rate correctly', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { patterns: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectPatternViolations(snapshotResult.value, {
      patterns: [
        {
          name: 'max-exports',
          description: 'Max 5 exports per file',
          severity: 'error',
          files: ['**/*.ts'],
          rule: { type: 'max-exports', count: 5 },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Pass rate should be between 0 and 1
    expect(result.value.passRate).toBeGreaterThanOrEqual(0);
    expect(result.value.passRate).toBeLessThanOrEqual(1);

    // Stats should be populated
    expect(result.value.stats.filesChecked).toBeGreaterThan(0);
    expect(result.value.stats.patternsApplied).toBe(1);
  });
});
