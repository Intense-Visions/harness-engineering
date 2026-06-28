import type {
  Roadmap,
  RoadmapFeature,
  RoadmapFrontmatter,
  AssignmentRecord,
  Result,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { parseRoadmap } from '../parse';
import { serializeRoadmap } from '../serialize';
import type { RoadmapStore, FeatureMutation, AddFeatureInput } from './roadmap-store';

/** Minimal injectable file IO so the store is unit-testable without node:fs. */
export interface FileIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
}

/** Default slug derivation: lowercase, non-alphanumerics collapsed to hyphens. */
export function slugifyFeatureName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface MonolithStoreOptions {
  roadmapPath: string;
  io: FileIO;
  /**
   * Resolve whether a feature corresponds to `slug`. The monolith has no slug
   * field today, so the default slugifies the feature name. Phase 4 refines the
   * slug identity model (D2).
   */
  matchSlug?: (slug: string, feature: RoadmapFeature) => boolean;
}

/**
 * Legacy single-file backend: wraps today's `roadmap.md` parse/serialize. A
 * whole-file rewrite is acceptable here — conflict-free single-row writes are the
 * shard backend's job. Implements `RoadmapStore` so callers are backend-agnostic.
 */
export class MonolithStore implements RoadmapStore {
  private readonly roadmapPath: string;
  private readonly io: FileIO;
  private readonly matchSlug: (slug: string, feature: RoadmapFeature) => boolean;

  constructor(options: MonolithStoreOptions) {
    this.roadmapPath = options.roadmapPath;
    this.io = options.io;
    this.matchSlug =
      options.matchSlug ?? ((slug, feature) => slugifyFeatureName(feature.name) === slug);
  }

  async load(): Promise<Result<Roadmap>> {
    let md: string;
    try {
      md = await this.io.readFile(this.roadmapPath);
    } catch (err) {
      return Err(
        new Error(`Failed to read roadmap at ${this.roadmapPath}: ${(err as Error).message}`)
      );
    }
    return parseRoadmap(md);
  }

  async patchFeature(slug: string, mutate: FeatureMutation): Promise<Result<void>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const roadmap = loaded.value;

    // Stop at the FIRST match (data-loss guard): two features whose names
    // slugify identically resolve to the same slug, so without breaking we would
    // overwrite every colliding row. Patch exactly one.
    let found = false;
    outer: for (const milestone of roadmap.milestones) {
      for (let i = 0; i < milestone.features.length; i++) {
        if (this.matchSlug(slug, milestone.features[i]!)) {
          milestone.features[i] = mutate(milestone.features[i]!);
          found = true;
          break outer;
        }
      }
    }
    if (!found) {
      return Err(new Error(`patchFeature: no feature resolves to slug "${slug}"`));
    }

    return this.write(roadmap);
  }

  async addFeature(input: AddFeatureInput): Promise<Result<void>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const roadmap = loaded.value;

    // Collision guard (prevent silent overwrite / data loss): refuse to add when an
    // existing feature already resolves to this slug.
    for (const milestone of roadmap.milestones) {
      for (const feature of milestone.features) {
        if (this.matchSlug(input.slug, feature)) {
          return Err(new Error(`addFeature: a feature already resolves to slug "${input.slug}"`));
        }
      }
    }

    const target = roadmap.milestones.find((m) => m.name === input.milestone);
    if (target) {
      target.features.push(input.feature);
    } else {
      roadmap.milestones.push({
        name: input.milestone,
        isBacklog: input.milestone === 'Backlog',
        features: [input.feature],
      });
    }

    return this.write(roadmap);
  }

  async removeFeature(slug: string): Promise<Result<void>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const roadmap = loaded.value;

    // Remove the FIRST match only (data-loss guard): two features whose names
    // slugify identically resolve to the same slug, so a blanket filter would
    // delete every colliding row. Splice exactly one.
    let removed = false;
    outer: for (const milestone of roadmap.milestones) {
      for (let i = 0; i < milestone.features.length; i++) {
        if (this.matchSlug(slug, milestone.features[i]!)) {
          milestone.features.splice(i, 1);
          removed = true;
          break outer;
        }
      }
    }
    if (!removed) {
      return Err(new Error(`removeFeature: no feature resolves to slug "${slug}"`));
    }

    return this.write(roadmap);
  }

  async patchFrontmatter(
    mutate: (frontmatter: RoadmapFrontmatter) => RoadmapFrontmatter
  ): Promise<Result<void>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const roadmap = loaded.value;
    roadmap.frontmatter = mutate(roadmap.frontmatter);
    return this.write(roadmap);
  }

  async patchAssignmentHistory(history: AssignmentRecord[]): Promise<Result<void>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const roadmap = loaded.value;
    roadmap.assignmentHistory = history;
    return this.write(roadmap);
  }

  private async write(roadmap: Roadmap): Promise<Result<void>> {
    try {
      await this.io.writeFile(this.roadmapPath, serializeRoadmap(roadmap));
    } catch (err) {
      return Err(
        new Error(`Failed to write roadmap at ${this.roadmapPath}: ${(err as Error).message}`)
      );
    }
    return Ok(undefined);
  }
}
