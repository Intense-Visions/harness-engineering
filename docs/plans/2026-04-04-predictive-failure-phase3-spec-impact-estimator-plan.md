# Plan: Predictive Architecture Failure -- Phase 3: SpecImpactEstimator & Roadmap Integration

**Date:** 2026-04-04
**Spec:** docs/changes/predictive-architecture-failure/proposal.md
**Estimated tasks:** 7
**Estimated time:** 28 minutes

## Goal

Implement SpecImpactEstimator for mechanical structural signal extraction from spec files and integrate it into PredictionEngine so that roadmap-aware adjusted forecasts differ from baseline when planned features have specs.

## Observable Truths (Acceptance Criteria)

1. When `SpecImpactEstimator.estimate(specPath)` is called with a spec containing known structure, the system shall return a `SpecImpactEstimate` with correct signal counts (newFileCount, affectedLayers, newDependencies, phaseCount) and correct metric deltas per the coefficient rules in the spec.
2. The system shall produce deterministic estimates -- same spec always produces same `SpecImpactEstimate`.
3. When `SpecImpactEstimator.estimateAll(features)` is called with features that have specs, the system shall return estimates only for features with non-null spec paths.
4. When `PredictionEngine.predict({ includeRoadmap: true })` is called with a non-null estimator, the system shall produce adjusted forecasts that differ from baseline when planned features have specs with structural signals.
5. When `PredictionEngine.predict({ includeRoadmap: true })` is called, `contributingFeatures` in `AdjustedForecast` shall be populated with feature name, specPath, and per-category delta.
6. When `PredictionEngine.predict({ includeRoadmap: false })` is called or estimator is null, adjusted shall equal baseline (backward compatible with Phase 2).
7. All 21 existing prediction-engine tests continue to pass (no regressions).
8. `cd packages/core && npx vitest run tests/architecture/spec-impact-estimator.test.ts` passes with 10+ tests.
9. `harness validate` passes after all changes.

## File Map

```
CREATE  packages/core/src/architecture/spec-impact-estimator.ts
CREATE  packages/core/tests/architecture/spec-impact-estimator.test.ts
MODIFY  packages/core/src/architecture/prediction-engine.ts
MODIFY  packages/core/tests/architecture/prediction-engine.test.ts
MODIFY  packages/core/src/architecture/index.ts
```

## Tasks

### Task 1: Create SpecImpactEstimator test suite (TDD red step)

**Depends on:** none
**Files:** `packages/core/tests/architecture/spec-impact-estimator.test.ts`

1. Create test file `packages/core/tests/architecture/spec-impact-estimator.test.ts`:

````typescript
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

      // 3 dependency mentions: "import", "dependency", "depends"
      expect(result.signals.newDependencies).toBe(3);
      // coupling += 3 * 0.2 = 0.6
      expect(result.deltas?.coupling).toBeCloseTo(0.6);
      // dependency-depth += 3 * 0.3 = 0.9
      expect(result.deltas?.['dependency-depth']).toBeCloseTo(0.9);
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
````

2. Run test: `cd packages/core && npx vitest run tests/architecture/spec-impact-estimator.test.ts`
3. Observe failure: `Cannot find module '../../src/architecture/spec-impact-estimator'`
4. Run: `harness validate`
5. Commit: `test(prediction): add SpecImpactEstimator test suite (TDD red step)`

---

### Task 2: Implement SpecImpactEstimator

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/spec-impact-estimator.ts`

1. Create `packages/core/src/architecture/spec-impact-estimator.ts`:

````typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArchMetricCategory } from './types';
import type { SpecImpactEstimate } from './prediction-types';

/** Configurable coefficients for signal-to-delta mapping */
export interface EstimatorCoefficients {
  newFileModuleSize?: number; // default 0.3
  newFileComplexity?: number; // default 1.5
  layerViolation?: number; // default 0.5
  depCoupling?: number; // default 0.2
  depDepth?: number; // default 0.3
  phaseComplexity?: number; // default 2.0
}

const DEFAULT_COEFFICIENTS: Required<EstimatorCoefficients> = {
  newFileModuleSize: 0.3,
  newFileComplexity: 1.5,
  layerViolation: 0.5,
  depCoupling: 0.2,
  depDepth: 0.3,
  phaseComplexity: 2.0,
};

interface HarnessConfigLayers {
  layers?: Array<{ name: string }>;
}

/**
 * SpecImpactEstimator: mechanical extraction of structural signals from spec files.
 * Applies configurable coefficients to produce per-category metric deltas.
 *
 * No LLM dependency -- deterministic, auditable extraction.
 */
export class SpecImpactEstimator {
  private readonly coefficients: Required<EstimatorCoefficients>;
  private readonly layerNames: string[];

  constructor(
    private readonly rootDir: string,
    coefficients?: EstimatorCoefficients
  ) {
    this.coefficients = { ...DEFAULT_COEFFICIENTS, ...coefficients };
    this.layerNames = this.loadLayerNames();
  }

  /**
   * Estimate impact of a single spec file.
   * @param specPath - Relative path from rootDir to the spec file.
   */
  estimate(specPath: string): SpecImpactEstimate {
    const absolutePath = path.join(this.rootDir, specPath);
    const content = fs.readFileSync(absolutePath, 'utf-8');

    const newFileCount = this.extractNewFileCount(content);
    const affectedLayers = this.extractAffectedLayers(content);
    const newDependencies = this.extractNewDependencies(content);
    const phaseCount = this.extractPhaseCount(content);

    const deltas = this.computeDeltas(
      newFileCount,
      affectedLayers.length,
      newDependencies,
      phaseCount
    );

    // Derive feature name from first H1 heading, fallback to filename
    const h1Match = content.match(/^#\s+(.+)$/m);
    const featureName = h1Match ? h1Match[1]!.trim() : path.basename(specPath, '.md');

    return {
      specPath,
      featureName,
      signals: {
        newFileCount,
        affectedLayers,
        newDependencies,
        phaseCount,
      },
      deltas,
    };
  }

  /**
   * Estimate impact for all planned features that have specs.
   * Skips features with null specs or specs that don't exist on disk.
   */
  estimateAll(features: Array<{ name: string; spec: string | null }>): SpecImpactEstimate[] {
    const results: SpecImpactEstimate[] = [];

    for (const feature of features) {
      if (!feature.spec) continue;

      const absolutePath = path.join(this.rootDir, feature.spec);
      if (!fs.existsSync(absolutePath)) continue;

      const estimate = this.estimate(feature.spec);
      // Override featureName with the roadmap feature name
      results.push({ ...estimate, featureName: feature.name });
    }

    return results;
  }

  // --- Private: Signal Extraction ---

  /**
   * Count file paths in Technical Design sections that don't exist on disk.
   * Looks for paths in code blocks (```) under ## Technical Design.
   */
  private extractNewFileCount(content: string): number {
    const techDesignMatch = content.match(/## Technical Design\b[\s\S]*?(?=\n## |\n# |$)/i);
    if (!techDesignMatch) return 0;

    const section = techDesignMatch[0];
    // Extract file paths from code blocks
    const codeBlocks = section.match(/```[\s\S]*?```/g) ?? [];
    const filePaths: string[] = [];

    for (const block of codeBlocks) {
      // Remove the ``` delimiters
      const inner = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      for (const line of inner.split('\n')) {
        const trimmed = line.trim();
        // Match lines that look like file paths (contain / and end with common extensions)
        if (trimmed.match(/^[\w@.-]+\/[\w./-]+\.\w+$/)) {
          filePaths.push(trimmed);
        }
      }
    }

    // Count only files not already on disk
    let count = 0;
    for (const fp of filePaths) {
      const absolute = path.join(this.rootDir, fp);
      if (!fs.existsSync(absolute)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Match layer names from harness.config.json mentioned in the spec.
   * Returns deduplicated array of matched layer names.
   */
  private extractAffectedLayers(content: string): string[] {
    if (this.layerNames.length === 0) return [];

    const matched = new Set<string>();
    const lowerContent = content.toLowerCase();

    for (const layer of this.layerNames) {
      // Match layer name as a whole word (case-insensitive)
      const pattern = new RegExp(`\\b${this.escapeRegex(layer)}\\b`, 'i');
      if (pattern.test(content)) {
        matched.add(layer);
      }
    }

    return [...matched].sort();
  }

  /**
   * Count dependency-related keywords: "import", "depend" (covers depends/dependency),
   * "package" in dependency context.
   */
  private extractNewDependencies(content: string): number {
    // Match "import", "depend" (dependency, depends, dependent), "package" near dependency context
    const patterns = [/\bimport\b/gi, /\bdepend\w*\b/gi, /\bpackage\b/gi];

    let count = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) count += matches.length;
    }

    return count;
  }

  /**
   * Count H3/H4 headings under "Implementation" or "Implementation Order" sections.
   */
  private extractPhaseCount(content: string): number {
    const implMatch = content.match(/## Implementation\b[\s\S]*?(?=\n## |\n# |$)/i);
    if (!implMatch) return 0;

    const section = implMatch[0];
    // Count ### and #### headings
    const headings = section.match(/^#{3,4}\s+.+$/gm);
    return headings ? headings.length : 0;
  }

  // --- Private: Delta Computation ---

  private computeDeltas(
    newFileCount: number,
    crossLayerCount: number,
    newDependencies: number,
    phaseCount: number
  ): Partial<Record<ArchMetricCategory, number>> {
    const deltas: Partial<Record<ArchMetricCategory, number>> = {};
    const c = this.coefficients;

    const addDelta = (category: ArchMetricCategory, value: number): void => {
      deltas[category] = (deltas[category] ?? 0) + value;
    };

    // New files signal
    if (newFileCount > 0) {
      addDelta('module-size', newFileCount * c.newFileModuleSize);
      addDelta('complexity', newFileCount * c.newFileComplexity);
    }

    // Affected layers signal
    if (crossLayerCount > 0) {
      addDelta('layer-violations', crossLayerCount * c.layerViolation);
    }

    // New dependencies signal
    if (newDependencies > 0) {
      addDelta('coupling', newDependencies * c.depCoupling);
      addDelta('dependency-depth', newDependencies * c.depDepth);
    }

    // Phase count signal
    if (phaseCount > 1) {
      addDelta('complexity', (phaseCount - 1) * c.phaseComplexity);
    }

    return deltas;
  }

  // --- Private: Config Loading ---

  private loadLayerNames(): string[] {
    try {
      const configPath = path.join(this.rootDir, 'harness.config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config: HarnessConfigLayers = JSON.parse(raw);
      return (config.layers ?? []).map((l) => l.name);
    } catch {
      return [];
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
````

2. Run tests: `cd packages/core && npx vitest run tests/architecture/spec-impact-estimator.test.ts`
3. Observe: all tests pass (TDD green step)
4. Run: `harness validate`
5. Commit: `feat(prediction): implement SpecImpactEstimator with structural signal extraction`

---

### Task 3: Update barrel exports for SpecImpactEstimator

**Depends on:** Task 2
**Files:** `packages/core/src/architecture/index.ts`

1. Add the following exports to `packages/core/src/architecture/index.ts`, after the existing `PredictionEngine` export:

```typescript
export { SpecImpactEstimator } from './spec-impact-estimator';
export type { EstimatorCoefficients } from './spec-impact-estimator';
```

2. Run: `cd packages/core && npx vitest run tests/architecture/spec-impact-estimator.test.ts`
3. Observe: tests still pass
4. Run: `harness validate`
5. Commit: `chore(prediction): export SpecImpactEstimator from architecture barrel`

---

### Task 4: Add PredictionEngine integration tests (TDD red step)

**Depends on:** Task 3
**Files:** `packages/core/tests/architecture/prediction-engine.test.ts`

1. Add the following test block at the end of the `describe('PredictionEngine', ...)` block in `packages/core/tests/architecture/prediction-engine.test.ts`. Add the following imports at the top of the file:

```typescript
import { SpecImpactEstimator } from '../../src/architecture/spec-impact-estimator';
```

Add after the existing `describe('options', ...)` block (before the closing `});` of the outer describe):

````typescript
describe('roadmap integration with SpecImpactEstimator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-engine-'));
    // Write harness.config.json
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'test',
        layers: [
          { name: 'core', pattern: 'src/core/**', allowedDependencies: [] },
          { name: 'cli', pattern: 'src/cli/**', allowedDependencies: ['core'] },
        ],
      })
    );
    // Write a roadmap.md
    fs.writeFileSync(
      path.join(tmpDir, 'roadmap.md'),
      [
        '---',
        'project: test',
        'version: 1',
        'last_synced: 2026-01-01',
        'last_manual_edit: 2026-01-01',
        '---',
        '',
        '## Milestone: MVP',
        '',
        '### Feature A',
        '',
        '- **Status:** planned',
        '- **Spec:** docs/spec-a.md',
        '- **Plans:** —',
        '- **Blocked by:** —',
        '- **Summary:** A feature',
        '',
        '### Feature B',
        '',
        '- **Status:** planned',
        '- **Spec:** —',
        '- **Plans:** —',
        '- **Blocked by:** —',
        '- **Summary:** No spec',
      ].join('\n')
    );
    // Write spec-a.md with known signals
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'docs/spec-a.md'),
      [
        '# Feature A',
        '',
        '## Technical Design',
        '',
        '```',
        'src/core/new-service.ts',
        'src/core/new-service.test.ts',
        '```',
        '',
        '## Implementation Order',
        '',
        '### Phase 1: Foundation',
        '',
        '### Phase 2: Integration',
      ].join('\n')
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adjusted differs from baseline when estimator is provided and includeRoadmap is true', () => {
    const snapshots = [
      makeSnapshot(0, { complexity: 40 }),
      makeSnapshot(1, { complexity: 45 }),
      makeSnapshot(2, { complexity: 50 }),
      makeSnapshot(3, { complexity: 55 }),
      makeSnapshot(4, { complexity: 60 }),
    ];
    const tm = mockTimelineManager({ version: 1, snapshots });
    const estimator = new SpecImpactEstimator(tmpDir);
    const engine = new PredictionEngine(tmpDir, tm, estimator);
    const result = engine.predict({ includeRoadmap: true });

    // Complexity adjusted should be higher than baseline (spec adds files + phases)
    const complexityAF = result.categories['complexity']!;
    expect(complexityAF.adjusted.projectedValue4w).toBeGreaterThan(
      complexityAF.baseline.projectedValue4w
    );
  });

  it('contributingFeatures is populated for affected categories', () => {
    const snapshots = [
      makeSnapshot(0, { complexity: 40 }),
      makeSnapshot(1, { complexity: 45 }),
      makeSnapshot(2, { complexity: 50 }),
      makeSnapshot(3, { complexity: 55 }),
      makeSnapshot(4, { complexity: 60 }),
    ];
    const tm = mockTimelineManager({ version: 1, snapshots });
    const estimator = new SpecImpactEstimator(tmpDir);
    const engine = new PredictionEngine(tmpDir, tm, estimator);
    const result = engine.predict({ includeRoadmap: true });

    const complexityAF = result.categories['complexity']!;
    expect(complexityAF.contributingFeatures.length).toBeGreaterThan(0);
    expect(complexityAF.contributingFeatures[0]!.name).toBe('Feature A');
    expect(complexityAF.contributingFeatures[0]!.delta).toBeGreaterThan(0);
  });

  it('adjusted equals baseline when includeRoadmap is false', () => {
    const snapshots = [
      makeSnapshot(0, { complexity: 40 }),
      makeSnapshot(1, { complexity: 45 }),
      makeSnapshot(2, { complexity: 50 }),
      makeSnapshot(3, { complexity: 55 }),
      makeSnapshot(4, { complexity: 60 }),
    ];
    const tm = mockTimelineManager({ version: 1, snapshots });
    const estimator = new SpecImpactEstimator(tmpDir);
    const engine = new PredictionEngine(tmpDir, tm, estimator);
    const result = engine.predict({ includeRoadmap: false });

    for (const cat of ALL_CATEGORIES) {
      const af = result.categories[cat]!;
      expect(af.adjusted).toEqual(af.baseline);
      expect(af.contributingFeatures).toEqual([]);
    }
  });

  it('adjusted equals baseline when estimator is null', () => {
    const snapshots = [
      makeSnapshot(0, { complexity: 40 }),
      makeSnapshot(1, { complexity: 45 }),
      makeSnapshot(2, { complexity: 50 }),
      makeSnapshot(3, { complexity: 55 }),
      makeSnapshot(4, { complexity: 60 }),
    ];
    const tm = mockTimelineManager({ version: 1, snapshots });
    const engine = new PredictionEngine(tmpDir, tm, null);
    const result = engine.predict({ includeRoadmap: true });

    for (const cat of ALL_CATEGORIES) {
      const af = result.categories[cat]!;
      expect(af.adjusted).toEqual(af.baseline);
    }
  });

  it('warnings use adjusted forecast for severity calculation', () => {
    // Complexity close to threshold -- spec impact should push it into warning range
    const snapshots = [
      makeSnapshot(0, { complexity: 70 }),
      makeSnapshot(1, { complexity: 75 }),
      makeSnapshot(2, { complexity: 80 }),
      makeSnapshot(3, { complexity: 85 }),
      makeSnapshot(4, { complexity: 90 }),
    ];
    const tm = mockTimelineManager({ version: 1, snapshots });
    const estimator = new SpecImpactEstimator(tmpDir);
    const engine = new PredictionEngine(tmpDir, tm, estimator);
    const result = engine.predict({ includeRoadmap: true });

    // Should have a warning for complexity
    const complexityWarning = result.warnings.find((w) => w.category === 'complexity');
    expect(complexityWarning).toBeDefined();
    // Contributing features should be populated on the warning
    expect(complexityWarning!.contributingFeatures.length).toBeGreaterThan(0);
  });

  it('result still validates against Zod schema with roadmap integration', () => {
    const snapshots = [
      makeSnapshot(0, { complexity: 40 }),
      makeSnapshot(1, { complexity: 45 }),
      makeSnapshot(2, { complexity: 50 }),
      makeSnapshot(3, { complexity: 55 }),
      makeSnapshot(4, { complexity: 60 }),
    ];
    const tm = mockTimelineManager({ version: 1, snapshots });
    const estimator = new SpecImpactEstimator(tmpDir);
    const engine = new PredictionEngine(tmpDir, tm, estimator);
    const result = engine.predict({ includeRoadmap: true });

    expect(() => PredictionResultSchema.parse(result)).not.toThrow();
  });
});
````

Also add these imports at the top of the file (alongside the existing imports):

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
```

2. Run tests: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts`
3. Observe: new roadmap integration tests fail (PredictionEngine still ignores estimator)
4. Verify: existing 21 tests still pass
5. Run: `harness validate`
6. Commit: `test(prediction): add PredictionEngine roadmap integration tests (TDD red step)`

---

### Task 5: Integrate SpecImpactEstimator into PredictionEngine

**Depends on:** Task 4
**Files:** `packages/core/src/architecture/prediction-engine.ts`

1. Modify `packages/core/src/architecture/prediction-engine.ts`:

   a. Change the import to include SpecImpactEstimator:

   ```typescript
   import type { SpecImpactEstimator } from './spec-impact-estimator';
   ```

   b. Add import for roadmap parsing at top of file:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { parseRoadmap } from '../roadmap/parse';
   ```

   c. Add import for SpecImpactEstimate type:

   ```typescript
   import type { SpecImpactEstimate } from './prediction-types';
   ```

   (SpecImpactEstimate is likely already imported; verify and add if missing)

   d. Change the constructor `estimator` parameter type from `unknown | null` to `SpecImpactEstimator | null`:

   ```typescript
   private readonly estimator: SpecImpactEstimator | null
   ```

   e. Remove the Phase 2 comment `// Phase 3: SpecImpactEstimator` from the constructor parameter.

   f. Replace the per-category loop body (lines 86-91, the `// Phase 2: adjusted = baseline` block) with roadmap-aware logic. The full replacement for the loop body after `forecastCategory()` call:

   Replace:

   ```typescript
   // Phase 2: adjusted = baseline (no estimator)
   categories[category] = {
     baseline: forecast,
     adjusted: forecast,
     contributingFeatures: [],
   };
   ```

   With just storing the baseline -- the adjusted computation will happen after the loop. Actually, restructure the predict() method as follows:

   After the per-category loop that builds baselines, add roadmap integration logic. The cleanest approach:
   - First pass: compute baselines for all categories (keep existing loop but store as baselines).
   - After the loop: if `estimator` is non-null and `opts.includeRoadmap` is true, compute spec impacts and build adjusted forecasts.
   - Otherwise: adjusted = baseline.

   The specific code changes to `predict()`:

   Replace the section from `for (const category of ALL_CATEGORIES)` through to `warnings` generation with:

   ```typescript
   // First pass: compute baselines for all categories
   const baselines: Record<string, CategoryForecast> = {};

   for (const category of ALL_CATEGORIES) {
     const threshold = thresholds[category];
     const shouldProcess = categoriesToProcess.includes(category);

     if (!shouldProcess) {
       baselines[category] = this.zeroForecast(category, threshold);
       continue;
     }

     const timeSeries = this.extractTimeSeries(snapshots, category, firstDate);
     baselines[category] = this.forecastCategory(category, timeSeries, currentT, threshold);
   }

   // Second pass: compute adjusted forecasts with roadmap impact
   const specImpacts = this.computeSpecImpacts(opts);
   const categories: Record<string, AdjustedForecast> = {};

   for (const category of ALL_CATEGORIES) {
     const baseline = baselines[category]!;
     const threshold = thresholds[category];

     if (!specImpacts || specImpacts.length === 0) {
       categories[category] = {
         baseline,
         adjusted: baseline,
         contributingFeatures: [],
       };
       continue;
     }

     // Sum deltas for this category across all spec impacts
     let totalDelta = 0;
     const contributing: Array<{ name: string; specPath: string; delta: number }> = [];

     for (const impact of specImpacts) {
       const delta = impact.deltas?.[category as ArchMetricCategory] ?? 0;
       if (delta !== 0) {
         totalDelta += delta;
         contributing.push({
           name: impact.featureName,
           specPath: impact.specPath,
           delta,
         });
       }
     }

     if (totalDelta === 0) {
       categories[category] = {
         baseline,
         adjusted: baseline,
         contributingFeatures: [],
       };
       continue;
     }

     // Create adjusted forecast by shifting projected values by totalDelta
     const adjusted: CategoryForecast = {
       ...baseline,
       projectedValue4w: baseline.projectedValue4w + totalDelta,
       projectedValue8w: baseline.projectedValue8w + totalDelta,
       projectedValue12w: baseline.projectedValue12w + totalDelta,
     };

     // Recompute threshold crossing with adjusted values
     // Create a virtual regression fit shifted by totalDelta
     const adjustedFit: import('./regression').RegressionFit = {
       slope: baseline.regression.slope,
       intercept: baseline.regression.intercept + totalDelta,
       rSquared: baseline.regression.rSquared,
       dataPoints: baseline.regression.dataPoints,
     };
     adjusted.thresholdCrossingWeeks = weeksUntilThreshold(adjustedFit, currentT, threshold);
     adjusted.regression = {
       slope: adjustedFit.slope,
       intercept: adjustedFit.intercept,
       rSquared: adjustedFit.rSquared,
       dataPoints: adjustedFit.dataPoints,
     };

     categories[category] = {
       baseline,
       adjusted,
       contributingFeatures: contributing,
     };
   }
   ```

   g. Add the `computeSpecImpacts` private method:

   ```typescript
   /**
   * Load roadmap features, estimate spec impacts via the estimator.
   * Returns null if estimator is null or includeRoadmap is false.
   */
   private computeSpecImpacts(opts: PredictionOptions): SpecImpactEstimate[] | null {
    if (!this.estimator || !opts.includeRoadmap) {
      return null;
    }

    try {
      const roadmapPath = path.join(this.rootDir, 'roadmap.md');
      const raw = fs.readFileSync(roadmapPath, 'utf-8');
      const parseResult = parseRoadmap(raw);

      if (!parseResult.ok) return null;

      // Collect all features with specs across all milestones
      const features: Array<{ name: string; spec: string | null }> = [];
      for (const milestone of parseResult.value.milestones) {
        for (const feature of milestone.features) {
          if (feature.status === 'planned' || feature.status === 'in-progress') {
            features.push({ name: feature.name, spec: feature.spec });
          }
        }
      }

      if (features.length === 0) return null;

      return this.estimator.estimateAll(features);
    } catch {
      // If roadmap doesn't exist or can't be parsed, proceed without it
      return null;
    }
   }
   ```

   h. Update the `import type` for `RegressionFit` -- it is already imported at line 13. Good.

2. Run tests: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts`
3. Observe: all tests pass (both existing 21 and new roadmap integration tests)
4. Run: `cd packages/core && npx vitest run tests/architecture/spec-impact-estimator.test.ts`
5. Observe: all spec-impact-estimator tests still pass
6. Run: `harness validate`
7. Commit: `feat(prediction): integrate SpecImpactEstimator into PredictionEngine for roadmap-aware forecasts`

---

### Task 6: Run full test suite and verify no regressions

[checkpoint:human-verify]

**Depends on:** Task 5
**Files:** none (verification only)

1. Run full architecture test suite: `cd packages/core && npx vitest run tests/architecture/`
2. Observe: all tests pass across all architecture test files
3. Run: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts --reporter=verbose`
4. Verify: all 21 original tests plus 6 new roadmap integration tests pass (27+ total)
5. Run: `cd packages/core && npx vitest run tests/architecture/spec-impact-estimator.test.ts --reporter=verbose`
6. Verify: 14+ tests pass
7. Run: `harness validate`
8. Confirm all observable truths from this plan are met:
   - SpecImpactEstimator.estimate() returns correct signals and deltas
   - SpecImpactEstimator.estimateAll() filters by non-null spec
   - PredictionEngine adjusted differs from baseline with estimator + includeRoadmap
   - contributingFeatures populated
   - Backward compatible (null estimator or includeRoadmap:false => adjusted=baseline)
   - Zod schema validation passes
   - Deterministic results

---

### Task 7: Verify Zod schema compliance and write final commit

**Depends on:** Task 6
**Files:** none (verification only)

1. Run: `harness validate`
2. Run: `harness check-deps`
3. Verify both pass
4. Commit: none (Task 6 checkpoint covers final verification)

## Dependency Graph

```
Task 1 (tests) --> Task 2 (implementation) --> Task 3 (exports)
                                                    |
                                                    v
                                    Task 4 (integration tests) --> Task 5 (integration impl)
                                                                        |
                                                                        v
                                                              Task 6 (verification) --> Task 7 (final check)
```

## Traceability

| Observable Truth                                           | Delivered By |
| ---------------------------------------------------------- | ------------ |
| 1. estimate() returns correct signals/deltas               | Tasks 1, 2   |
| 2. Deterministic estimates                                 | Tasks 1, 2   |
| 3. estimateAll() returns estimates for features with specs | Tasks 1, 2   |
| 4. Adjusted differs from baseline with estimator           | Tasks 4, 5   |
| 5. contributingFeatures populated                          | Tasks 4, 5   |
| 6. Backward compatible (null/false)                        | Tasks 4, 5   |
| 7. No regressions (21 existing tests)                      | Task 6       |
| 8. spec-impact-estimator.test.ts passes 10+ tests          | Task 6       |
| 9. harness validate passes                                 | Task 7       |
