import type { Roadmap, RoadmapFeature, Result } from '@harness-engineering/types';
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

    let found = false;
    for (const milestone of roadmap.milestones) {
      for (let i = 0; i < milestone.features.length; i++) {
        if (this.matchSlug(slug, milestone.features[i]!)) {
          milestone.features[i] = mutate(milestone.features[i]!);
          found = true;
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
