import { describe, it, expect } from 'vitest';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';

describe('EntropyAnalyzer', () => {
  const parser = new TypeScriptParser();
  const validProjectDir = join(__dirname, '../fixtures/entropy/valid-project');
  const driftSamplesDir = join(__dirname, '../fixtures/entropy/drift-samples');

  it('should analyze codebase and produce report', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: validProjectDir,
      parser,
      analyze: {
        drift: true,
        deadCode: true,
      },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md', 'README.md'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshot).toBeDefined();
      expect(result.value.drift).toBeDefined();
      expect(result.value.deadCode).toBeDefined();
      expect(result.value.summary).toBeDefined();
      expect(result.value.timestamp).toBeDefined();
    }
  });

  it('should only run requested analyzers', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: validProjectDir,
      parser,
      analyze: {
        drift: false,
        deadCode: true,
        patterns: false,
      },
      include: ['src/**/*.ts'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.drift).toBeUndefined();
      expect(result.value.deadCode).toBeDefined();
      expect(result.value.patterns).toBeUndefined();
    }
  });

  it('should calculate summary stats', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: driftSamplesDir,
      parser,
      analyze: {
        drift: true,
        deadCode: true,
      },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.totalIssues).toBeGreaterThanOrEqual(0);
      expect(typeof result.value.summary.errors).toBe('number');
      expect(typeof result.value.summary.warnings).toBe('number');
      expect(typeof result.value.duration).toBe('number');
    }
  });

  it('should generate suggestions when requested', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: driftSamplesDir,
      parser,
      analyze: {
        drift: true,
        deadCode: true,
      },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const suggestions = analyzer.getSuggestions();
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions.suggestions)).toBe(true);
    }
  });

  it('should build snapshot without running analysis', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: validProjectDir,
      parser,
      analyze: {},
      include: ['src/**/*.ts'],
    });

    const result = await analyzer.buildSnapshot();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files.length).toBeGreaterThan(0);
      expect(result.value.rootDir).toBe(validProjectDir);
    }

    // getSnapshot should return it
    expect(analyzer.getSnapshot()).toBeDefined();
  });

  it('should return empty suggestions when no analysis run', () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: validProjectDir,
      parser,
      analyze: {},
    });

    const suggestions = analyzer.getSuggestions();
    expect(suggestions.suggestions).toEqual([]);
    expect(suggestions.estimatedEffort).toBe('trivial');
  });
});
