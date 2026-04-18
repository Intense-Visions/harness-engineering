/**
 * Profile persistence — load/save specialization profiles to disk.
 *
 * Profiles are stored at `.harness/specialization-profiles.json` and survive
 * across sessions so agents retain their accumulated expertise.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GraphStore } from '@harness-engineering/graph';
import type { SpecializationProfile } from './types.js';
import type { SpecializationOptions } from './scorer.js';
import { buildSpecializationProfile } from './scorer.js';

const PROFILE_FILE = 'specialization-profiles.json';
const HARNESS_DIR = '.harness';

/** Persisted store of specialization profiles. */
export interface ProfileStore {
  profiles: Record<string, SpecializationProfile>;
  computedAt: string;
  version: 1;
}

function profilePath(projectRoot: string): string {
  return path.join(projectRoot, HARNESS_DIR, PROFILE_FILE);
}

/** Load profiles from disk. Returns empty store if file doesn't exist. */
export function loadProfiles(projectRoot: string): ProfileStore {
  const filePath = profilePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { profiles: {}, computedAt: new Date().toISOString(), version: 1 };
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.version !== 1 || typeof parsed.profiles !== 'object' || parsed.profiles === null) {
    return { profiles: {}, computedAt: new Date().toISOString(), version: 1 };
  }
  return parsed as unknown as ProfileStore;
}

/** Save profiles to disk at .harness/specialization-profiles.json. */
export function saveProfiles(projectRoot: string, store: ProfileStore): void {
  const dirPath = path.join(projectRoot, HARNESS_DIR);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(profilePath(projectRoot), JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Recompute and persist profiles for all personas with outcomes.
 *
 * Discovers all persona names from execution_outcome nodes in the graph,
 * builds a specialization profile for each, and saves the result.
 */
export function refreshProfiles(
  projectRoot: string,
  graphStore: GraphStore,
  opts?: Omit<SpecializationOptions, 'persona'>
): ProfileStore {
  // Discover all personas with outcomes
  const nodes = graphStore.findNodes({ type: 'execution_outcome' });
  const personas = new Set<string>();
  for (const node of nodes) {
    const persona = node.metadata.agentPersona;
    if (typeof persona === 'string' && persona.length > 0) {
      personas.add(persona);
    }
  }

  const profiles: Record<string, SpecializationProfile> = {};
  for (const persona of personas) {
    profiles[persona] = buildSpecializationProfile(graphStore, persona, opts);
  }

  const store: ProfileStore = {
    profiles,
    computedAt: new Date().toISOString(),
    version: 1,
  };

  saveProfiles(projectRoot, store);
  return store;
}
