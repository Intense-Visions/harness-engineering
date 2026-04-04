import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SpecImpactEstimator } from '../../src/architecture/spec-impact-estimator';
import { SpecImpactEstimateSchema } from '../../src/architecture/prediction-types';

/** Create a temp directory with optional files on disk */
function makeTempProject(files: string[] = []): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-impact-'));
  for (const f of files) {
    const fullPath = path.join(dir, f);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '// stub');
  }
  return dir;
}

/** Minimal harness.config.json with layers */
function writeConfig(dir: string, layers: Array<{ name: string }> = []): void {
  const config = {
    version: 1,
    name: 'test-project',
    layers:
      layers.length > 0
        ? layers
        : [
            { name: 'types', pattern: 'packages/types/src/**', allowedDependencies: [] },
            { name: 'core', pattern: 'packages/core/src/**', allowedDependencies: ['types'] },
            { name: 'cli', pattern: 'packages/cli/src/**', allowedDependencies: ['types', 'core'] },
          ],
  };
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(config, null, 2));
}

/** Write a spec file at the given relative path */
function writeSpec(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return relPath;
}

describe('SpecImpactEstimator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempProject();
    writeConfig(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('estimate() - new file signal', () => {
    it('counts file paths in Technical Design sections not on disk', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature X',
          '',
          '## Technical Design',
          '',
          '### 1. New Module',
          '',
          '```',
          'packages/core/src/new-module.ts',
          'packages/core/src/new-module.test.ts',
          'packages/cli/src/commands/new-cmd.ts',
          '```',
          '',
          'Some description.',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      // 3 new files (none exist on disk)
      expect(result.signals.newFileCount).toBe(3);
      // module-size += 3 * 0.3 = 0.9
      expect(result.deltas?.['module-size']).toBeCloseTo(0.9);
      // complexity += 3 * 1.5 = 4.5
      expect(result.deltas?.complexity).toBeCloseTo(4.5);
    });

    it('excludes files that already exist on disk', () => {
      // Pre-create one file
      const existingFile = 'packages/core/src/existing.ts';
      fs.mkdirSync(path.join(tmpDir, 'packages/core/src'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, existingFile), '// exists');

      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '',
          '## Technical Design',
          '',
          '```',
          'packages/core/src/existing.ts',
          'packages/core/src/brand-new.ts',
          '```',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      // Only 1 new file (existing.ts is already on disk)
      expect(result.signals.newFileCount).toBe(1);
    });
  });

  describe('estimate() - affected layers signal', () => {
    it('matches layer names from harness.config.json in spec', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '',
          '## Technical Design',
          '',
          'This feature modifies the core layer and adds a new CLI command in the cli layer.',
          'The types layer gets a new interface.',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      expect(result.signals.affectedLayers).toContain('core');
      expect(result.signals.affectedLayers).toContain('cli');
      expect(result.signals.affectedLayers).toContain('types');
      expect(result.signals.affectedLayers.length).toBe(3);
      // Cross-layer count = 3, layer-violations += 3 * 0.5 = 1.5
      expect(result.deltas?.['layer-violations']).toBeCloseTo(1.5);
    });

    it('deduplicates layer mentions', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '',
          '## Technical Design',
          '',
          'The core module handles this. Also in core. And core again.',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      expect(result.signals.affectedLayers).toEqual(['core']);
    });
  });

  describe('estimate() - new dependencies signal', () => {
    it('counts dependency-related keywords in context', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '',
          '## Technical Design',
          '',
          'We need to import the new validation package.',
          'Add a dependency on zod for schema validation.',
          'The module depends on the graph package for queries.',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      // 5 dependency mentions: "import"(1), "dependency"(1), "depends"(1), "package"(2)
      expect(result.signals.newDependencies).toBe(5);
      // coupling += 5 * 0.2 = 1.0
      expect(result.deltas?.coupling).toBeCloseTo(1.0);
      // dependency-depth += 5 * 0.3 = 1.5
      expect(result.deltas?.['dependency-depth']).toBeCloseTo(1.5);
    });
  });

  describe('estimate() - phase count signal', () => {
    it('counts H3/H4 headings under Implementation', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '',
          '## Implementation Order',
          '',
          '### Phase 1: Foundation',
          '',
          'Do the types.',
          '',
          '### Phase 2: Core Logic',
          '',
          'Build the engine.',
          '',
          '### Phase 3: Integration',
          '',
          'Wire it up.',
          '',
          '#### Sub-phase 3a: CLI',
          '',
          'CLI command.',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      // 4 headings (3 H3 + 1 H4 under Implementation)
      expect(result.signals.phaseCount).toBe(4);
      // complexity += (4 - 1) * 2.0 = 6.0
      expect(result.deltas?.complexity).toBeCloseTo(6.0);
    });

    it('returns phaseCount 0 when no Implementation section', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        ['# Feature', '', '## Technical Design', '', 'Just a design, no implementation plan.'].join(
          '\n'
        )
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      expect(result.signals.phaseCount).toBe(0);
    });
  });

  describe('estimate() - combined signals', () => {
    it('accumulates deltas from multiple signals into same category', () => {
      // Both newFileCount and phaseCount contribute to complexity
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '',
          '## Technical Design',
          '',
          '```',
          'src/new-file.ts',
          'src/another-file.ts',
          '```',
          '',
          '## Implementation Order',
          '',
          '### Phase 1: Do it',
          '',
          '### Phase 2: Test it',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);

      // complexity = newFiles(2 * 1.5) + phases((2-1) * 2.0) = 3.0 + 2.0 = 5.0
      expect(result.deltas?.complexity).toBeCloseTo(5.0);
    });

    it('produces valid SpecImpactEstimate (Zod parse)', () => {
      const spec = writeSpec(tmpDir, 'docs/spec.md', '# Empty Spec\n');
      const estimator = new SpecImpactEstimator(tmpDir);
      const result = estimator.estimate(spec);
      expect(() => SpecImpactEstimateSchema.parse(result)).not.toThrow();
    });

    it('is deterministic - same spec produces same result', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        [
          '# Feature',
          '## Technical Design',
          '```',
          'src/a.ts',
          '```',
          '## Implementation Order',
          '### Phase 1',
        ].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const r1 = estimator.estimate(spec);
      const r2 = estimator.estimate(spec);
      expect(r1).toEqual(r2);
    });
  });

  describe('estimate() - custom coefficients', () => {
    it('uses custom coefficients when provided', () => {
      const spec = writeSpec(
        tmpDir,
        'docs/spec.md',
        ['# Feature', '## Technical Design', '```', 'src/new.ts', '```'].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir, {
        newFileModuleSize: 1.0,
        newFileComplexity: 2.0,
      });
      const result = estimator.estimate(spec);

      expect(result.deltas?.['module-size']).toBeCloseTo(1.0); // 1 * 1.0
      expect(result.deltas?.complexity).toBeCloseTo(2.0); // 1 * 2.0
    });
  });

  describe('estimateAll()', () => {
    it('returns estimates for features with non-null specs', () => {
      writeSpec(
        tmpDir,
        'docs/spec-a.md',
        ['# Feature A', '## Technical Design', '```', 'src/a.ts', '```'].join('\n')
      );

      writeSpec(
        tmpDir,
        'docs/spec-b.md',
        ['# Feature B', '## Technical Design', '```', 'src/b.ts', 'src/c.ts', '```'].join('\n')
      );

      const estimator = new SpecImpactEstimator(tmpDir);
      const results = estimator.estimateAll([
        { name: 'Feature A', spec: 'docs/spec-a.md' },
        { name: 'Feature B', spec: 'docs/spec-b.md' },
        { name: 'Feature C', spec: null },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.featureName).toBe('Feature A');
      expect(results[1]!.featureName).toBe('Feature B');
    });

    it('returns empty array when no features have specs', () => {
      const estimator = new SpecImpactEstimator(tmpDir);
      const results = estimator.estimateAll([{ name: 'X', spec: null }]);
      expect(results).toEqual([]);
    });

    it('skips specs that do not exist on disk', () => {
      const estimator = new SpecImpactEstimator(tmpDir);
      const results = estimator.estimateAll([{ name: 'Missing', spec: 'docs/nonexistent.md' }]);
      expect(results).toEqual([]);
    });
  });
});
