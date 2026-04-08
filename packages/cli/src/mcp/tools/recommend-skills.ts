import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../../skill/health-snapshot.js';
import type { HealthSnapshot } from '../../skill/health-snapshot.js';
import { recommend } from '../../skill/recommendation-engine.js';
import { loadOrRebuildIndex } from '../../skill/index-builder.js';
import { suggest } from '../../skill/dispatcher.js';
import { resolveConfig } from '../../config/loader.js';

export const recommendSkillsDefinition = {
  name: 'recommend_skills',
  description:
    'Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path (defaults to cwd)',
      },
      noCache: {
        type: 'boolean',
        description: 'Force fresh health snapshot even if cache is fresh',
      },
      top: {
        type: 'number',
        description: 'Max recommendations to return (default 5)',
      },
      recentFiles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Recently edited files for knowledge skill path-matching',
      },
    },
    required: [] as string[],
  },
};

export async function handleRecommendSkills(
  input: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectRoot = (input.path as string) || process.cwd();
  const noCache = (input.noCache as boolean) || false;
  const top = (input.top as number) || 5;
  const recentFiles = (input.recentFiles as string[]) || [];

  // Resolve snapshot
  let snapshot: HealthSnapshot | null = null;
  let usedCache = false;

  if (!noCache) {
    const cached = loadCachedSnapshot(projectRoot);
    if (cached && isSnapshotFresh(cached, projectRoot)) {
      snapshot = cached;
      usedCache = true;
    }
  }

  if (!snapshot) {
    snapshot = await captureHealthSnapshot(projectRoot);
  }

  // Load skill index
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', projectRoot, tierOverrides);

  // Build skills record
  const skills: Record<
    string,
    { addresses: (typeof index.skills)[string]['addresses']; dependsOn: string[] }
  > = {};
  for (const [name, entry] of Object.entries(index.skills)) {
    skills[name] = { addresses: entry.addresses, dependsOn: entry.dependsOn };
  }

  const result = recommend(snapshot, skills, { top });

  // Wire suggest() to surface knowledge skills based on recently edited files
  const suggestResult = suggest(index, '', null, recentFiles);
  const output = {
    ...result,
    autoInjectKnowledge: suggestResult.autoInjectKnowledge,
    snapshotAge: usedCache ? 'cached' : 'fresh',
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}
