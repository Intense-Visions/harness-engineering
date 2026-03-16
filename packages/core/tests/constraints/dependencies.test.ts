import { describe, it, expect, vi } from 'vitest';
import { buildDependencyGraph, validateDependencies } from '../../src/constraints/dependencies';
import { defineLayer } from '../../src/constraints/layers';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';
import { Ok } from '../../src/shared/result';
import type { LanguageParser } from '../../src/shared/parsers';

describe('buildDependencyGraph', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../fixtures/valid-layers');

  it('should build graph from files', async () => {
    const files = [
      join(fixturesDir, 'domain/user.ts'),
      join(fixturesDir, 'services/user-service.ts'),
      join(fixturesDir, 'api/user-handler.ts'),
    ];

    const result = await buildDependencyGraph(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(3);
      expect(result.value.edges.length).toBeGreaterThan(0);
    }
  });

  it('should track import types', async () => {
    const files = [
      join(fixturesDir, 'domain/user.ts'),
      join(fixturesDir, 'services/user-service.ts'),
    ];

    const result = await buildDependencyGraph(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const edge = result.value.edges.find((e) => e.to.includes('domain/user'));
      expect(edge).toBeDefined();
      expect(edge?.importType).toBe('static');
    }
  });
});

describe('validateDependencies', () => {
  const parser = new TypeScriptParser();

  it('should pass for valid layer dependencies', async () => {
    const fixturesDir = join(__dirname, '../fixtures/valid-layers');
    const result = await validateDependencies({
      layers: [
        defineLayer('domain', ['domain/**'], []),
        defineLayer('services', ['services/**'], ['domain']),
        defineLayer('api', ['api/**'], ['services', 'domain']),
      ],
      rootDir: fixturesDir,
      parser,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.violations).toHaveLength(0);
    }
  });

  it('should detect layer violations', async () => {
    const fixturesDir = join(__dirname, '../fixtures/layer-violations');
    const result = await validateDependencies({
      layers: [
        defineLayer('domain', ['domain/**'], []),
        defineLayer('services', ['services/**'], ['domain']),
        defineLayer('api', ['api/**'], ['services', 'domain']),
      ],
      rootDir: fixturesDir,
      parser,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.violations.length).toBeGreaterThan(0);

      const violation = result.value.violations[0];
      expect(violation.reason).toBe('WRONG_LAYER');
      expect(violation.fromLayer).toBe('domain');
      expect(violation.toLayer).toBe('services');
    }
  });

  it('should skip validation when parser unavailable and fallbackBehavior is skip', async () => {
    const mockParser = {
      name: 'mock',
      extensions: ['.ts'],
      parseFile: async () => Ok({ type: 'Program', body: {}, language: 'mock' }),
      extractImports: () => Ok([]),
      extractExports: () => Ok([]),
      health: async () => Ok({ available: false, message: 'Not installed' }),
    } as unknown as LanguageParser;

    const result = await validateDependencies({
      layers: [],
      rootDir: '.',
      parser: mockParser,
      fallbackBehavior: 'skip',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(true);
    }
  });

  it('should warn and skip validation when parser unavailable and fallbackBehavior is warn', async () => {
    const mockParser = {
      name: 'mock',
      extensions: ['.ts'],
      parseFile: async () => Ok({ type: 'Program', body: {}, language: 'mock' }),
      extractImports: () => Ok([]),
      extractExports: () => Ok([]),
      health: async () => Ok({ available: false, message: 'Not installed' }),
    } as unknown as LanguageParser;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await validateDependencies({
      layers: [],
      rootDir: '.',
      parser: mockParser,
      fallbackBehavior: 'warn',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(true);
      expect(result.value.reason).toBe('Parser unavailable');
    }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should error when parser unavailable and fallbackBehavior is error', async () => {
    const mockParser = {
      name: 'mock',
      extensions: ['.ts'],
      parseFile: async () => Ok({ type: 'Program', body: {}, language: 'mock' }),
      extractImports: () => Ok([]),
      extractExports: () => Ok([]),
      health: async () => Ok({ available: false, message: 'Not installed' }),
    } as unknown as LanguageParser;

    const result = await validateDependencies({
      layers: [],
      rootDir: '.',
      parser: mockParser,
      fallbackBehavior: 'error',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSER_UNAVAILABLE');
    }
  });
});
