import { describe, it, expect } from 'vitest';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';

/**
 * Behavior-characterization tests for EntropyAnalyzer.
 *
 * These assert CURRENT behavior as-is: return shapes of the standalone
 * detectX methods, the getReport/getSnapshot accessors, the graph-enhanced
 * path (which skips snapshot building), and the object-config forms of the
 * pattern/complexity/coupling/sizeBudget analyzers.
 */
describe('EntropyAnalyzer (behavior)', () => {
  const parser = new TypeScriptParser();
  const validProjectDir = join(__dirname, '../fixtures/entropy/valid-project');
  const driftSamplesDir = join(__dirname, '../fixtures/entropy/drift-samples');

  describe('getReport / getSnapshot accessors', () => {
    it('returns undefined before analyze is run', () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {},
      });

      expect(analyzer.getReport()).toBeUndefined();
      expect(analyzer.getSnapshot()).toBeUndefined();
    });

    it('returns the same report object that analyze() resolved with', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: { drift: true, deadCode: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md', 'README.md'],
      });

      const result = await analyzer.analyze();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(analyzer.getReport()).toBe(result.value);
        expect(analyzer.getSnapshot()).toBe(result.value.snapshot);
      }
    });
  });

  describe('object-form analyzer configs', () => {
    it('runs pattern / complexity / coupling / sizeBudget when enabled and attaches their reports', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {
          patterns: { patterns: [] },
          complexity: {},
          coupling: {},
          sizeBudget: {},
        },
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.analyze();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const report = result.value;
        // Enabled reports are attached.
        expect(report.patterns).toBeDefined();
        expect(report.complexity).toBeDefined();
        expect(report.coupling).toBeDefined();
        expect(report.sizeBudget).toBeDefined();
        // Disabled ones remain absent.
        expect(report.drift).toBeUndefined();
        expect(report.deadCode).toBeUndefined();
        // Pattern report has its expected shape.
        expect(Array.isArray(report.patterns?.violations)).toBe(true);
        expect(typeof report.patterns?.stats.filesChecked).toBe('number');
        // Summary aggregates numeric fields.
        expect(typeof report.summary.totalIssues).toBe('number');
        expect(typeof report.summary.errors).toBe('number');
        expect(typeof report.summary.warnings).toBe('number');
      }
    });

    it('accepts boolean-true analyzer flags (default config branch)', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {
          patterns: true,
          complexity: true,
          coupling: true,
        },
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.analyze();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.patterns).toBeDefined();
        expect(result.value.complexity).toBeDefined();
        expect(result.value.coupling).toBeDefined();
      }
    });
  });

  describe('graph-enhanced path (snapshot building skipped)', () => {
    it('uses a minimal empty snapshot when both graph drift and dead-code data are supplied', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: { drift: true, deadCode: true },
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.analyze({
        graphDriftData: { staleEdges: [], missingTargets: [] },
        graphDeadCodeData: { reachableNodeIds: [], unreachableNodes: [] },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Snapshot was NOT built from disk: it is the minimal empty stand-in.
        expect(result.value.snapshot.files).toEqual([]);
        expect(result.value.snapshot.buildTime).toBe(0);
        expect(result.value.snapshot.rootDir).toBe(validProjectDir);
        // Graph-fed detectors still produce reports.
        expect(result.value.drift).toBeDefined();
        expect(result.value.deadCode).toBeDefined();
      }
    });

    it('still builds a real snapshot when only one of the two graph inputs is present', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: { drift: true, deadCode: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md', 'README.md'],
      });

      const result = await analyzer.analyze({
        graphDriftData: { staleEdges: [], missingTargets: [] },
        // graphDeadCodeData intentionally omitted -> needsSnapshot === true
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.snapshot.files.length).toBeGreaterThan(0);
      }
    });
  });

  describe('standalone detector methods', () => {
    it('detectDrift builds a snapshot on demand and returns a DriftReport', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: driftSamplesDir,
        parser,
        analyze: {},
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });

      // No snapshot yet.
      expect(analyzer.getSnapshot()).toBeUndefined();

      const result = await analyzer.detectDrift({ docPaths: ['docs/**/*.md'] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value.drifts)).toBe(true);
        expect(typeof result.value.stats.docsScanned).toBe('number');
        expect(['high', 'medium', 'low', 'none']).toContain(result.value.severity);
      }
      // ensureSnapshot populated the snapshot as a side effect.
      expect(analyzer.getSnapshot()).toBeDefined();
    });

    it('detectDeadCode returns a DeadCodeReport with reachability stats', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {},
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.detectDeadCode();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value.deadExports)).toBe(true);
        expect(Array.isArray(result.value.deadFiles)).toBe(true);
        expect(Array.isArray(result.value.unusedImports)).toBe(true);
        expect(typeof result.value.stats.filesAnalyzed).toBe('number');
      }
    });

    it('detectPatterns returns a PatternReport for the given config', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {},
        include: ['src/**/*.ts'],
      });

      const result = await analyzer.detectPatterns({ patterns: [] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value.violations)).toBe(true);
        expect(typeof result.value.stats.patternsApplied).toBe('number');
        expect(typeof result.value.passRate).toBe('number');
      }
    });

    it('reuses an already-built snapshot across detector calls (ensureSnapshot short-circuit)', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {},
        include: ['src/**/*.ts'],
      });

      const built = await analyzer.buildSnapshot();
      expect(built.ok).toBe(true);
      const firstSnapshot = analyzer.getSnapshot();
      expect(firstSnapshot).toBeDefined();

      const drift = await analyzer.detectDrift();
      expect(drift.ok).toBe(true);
      // Same snapshot instance is reused rather than rebuilt.
      expect(analyzer.getSnapshot()).toBe(firstSnapshot);
    });
  });

  describe('getSuggestions after a graph-enhanced analyze', () => {
    it('derives suggestions from the last report', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: driftSamplesDir,
        parser,
        analyze: { drift: true, deadCode: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });

      await analyzer.analyze();
      const suggestions = analyzer.getSuggestions();
      expect(Array.isArray(suggestions.suggestions)).toBe(true);
      expect(suggestions.byPriority).toBeDefined();
      expect(Array.isArray(suggestions.byPriority.high)).toBe(true);
      expect(['trivial', 'small', 'medium', 'large']).toContain(suggestions.estimatedEffort);
    });
  });
});
