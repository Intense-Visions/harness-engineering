import { describe, it, expect } from 'vitest';
import { checkConfigPattern } from '../../../src/entropy/detectors/patterns';
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
