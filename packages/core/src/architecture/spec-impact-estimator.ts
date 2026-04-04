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
