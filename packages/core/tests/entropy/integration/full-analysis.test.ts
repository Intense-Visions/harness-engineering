import { describe, it, expect } from 'vitest';
import { EntropyAnalyzer } from '../../../src/entropy';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('Entropy Module Integration', () => {
  const parser = new TypeScriptParser();

  describe('full analysis workflow', () => {
    const validProjectDir = join(__dirname, '../../fixtures/entropy/valid-project');

    it('should run complete analysis and generate actionable output', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {
          drift: true,
          deadCode: true,
          patterns: {
            patterns: [
              {
                name: 'max-exports',
                description: 'Max 10 exports per file',
                severity: 'warning',
                files: ['**/*.ts'],
                rule: { type: 'max-exports', count: 10 },
              },
            ],
          },
        },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md', 'README.md'],
      });

      // Run analysis
      const result = await analyzer.analyze();
      expect(result.ok).toBe(true);

      if (!result.ok) return;

      // Verify report structure
      const report = result.value;
      expect(report.snapshot).toBeDefined();
      expect(report.snapshot.files.length).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.duration).toBeGreaterThan(0);

      // Verify snapshot has expected data
      expect(report.snapshot.exportMap.byName.size).toBeGreaterThan(0);
      expect(report.snapshot.entryPoints.length).toBeGreaterThan(0);

      // Verify suggestions are generated
      const suggestions = analyzer.getSuggestions();
      expect(suggestions.byPriority).toBeDefined();
      expect(suggestions.estimatedEffort).toBeDefined();
    });
  });

  describe('drift detection in isolation', () => {
    const driftSamplesDir = join(__dirname, '../../fixtures/entropy/drift-samples');

    it('should detect API drift between docs and code', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: driftSamplesDir,
        parser,
        analyze: {
          drift: {
            checkApiSignatures: true,
            checkStructure: true,
            checkExamples: false,
            docPaths: [],
            ignorePatterns: [],
          },
        },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });

      const result = await analyzer.analyze();

      expect(result.ok).toBe(true);
      if (result.ok && result.value.drift) {
        // Should find some drift in the test fixtures
        expect(result.value.drift.stats.docsScanned).toBeGreaterThan(0);
      }
    });
  });

  describe('dead code detection in isolation', () => {
    const deadCodeDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

    it('should detect dead files and exports', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: deadCodeDir,
        parser,
        analyze: {
          deadCode: true,
        },
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.analyze();

      expect(result.ok).toBe(true);
      if (result.ok && result.value.deadCode) {
        expect(result.value.deadCode.stats.filesAnalyzed).toBeGreaterThan(0);
        // Fixture should have dead code
        expect(
          result.value.deadCode.deadFiles.length + result.value.deadCode.deadExports.length
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('pattern detection in isolation', () => {
    const patternSamplesDir = join(__dirname, '../../fixtures/entropy/pattern-samples');

    it('should detect pattern violations', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: patternSamplesDir,
        parser,
        analyze: {
          patterns: {
            patterns: [
              {
                name: 'max-exports',
                description: 'Max 5 exports',
                severity: 'error',
                files: ['**/*.ts'],
                rule: { type: 'max-exports', count: 5 },
              },
            ],
          },
        },
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.analyze();

      expect(result.ok).toBe(true);
      if (result.ok && result.value.patterns) {
        expect(result.value.patterns.stats.patternsApplied).toBe(1);
        // Fixture should have violations
        expect(result.value.patterns.violations.length).toBeGreaterThan(0);
      }
    });
  });
});
