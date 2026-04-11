import { loadOrRebuildIndex } from '../../skill/index-builder.js';
import { loadOrGenerateProfile } from '../../skill/stack-profile.js';
import { scoreSkill } from '../../skill/dispatcher.js';
import { loadCachedSnapshot, isSnapshotFresh } from '../../skill/health-snapshot.js';
import { resolveConfig } from '../../config/loader.js';

export const searchSkillsDefinition = {
  name: 'search_skills',
  description:
    'Search the skill catalog for domain-specific skills. Returns ranked results based on keyword, name, description, and stack-signal matching. Use this to discover catalog skills that are not loaded as slash commands.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language or keyword query to search for skills',
      },
      path: {
        type: 'string',
        description: 'Project root path (defaults to cwd)',
      },
      platform: {
        type: 'string',
        enum: ['claude-code', 'gemini-cli'],
        description: 'Target platform (defaults to claude-code)',
      },
    },
    required: ['query'],
  },
};

export async function handleSearchSkills(
  input: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const query = input.query as string;
  const projectRoot = (input.path as string) || process.cwd();
  const platform = (input.platform as string) || 'claude-code';

  // Load config for tier overrides
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;

  const index = loadOrRebuildIndex(platform, projectRoot, tierOverrides);
  const profile = loadOrGenerateProfile(projectRoot);

  // Load cached health snapshot for passive search boost
  const snapshot = loadCachedSnapshot(projectRoot);
  const freshSnapshot = snapshot && isSnapshotFresh(snapshot, projectRoot) ? snapshot : undefined;

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  // Minimum score to surface a result — filters noise from incidental substring matches.
  // The suggest() dispatcher uses 0.4; search uses a lower floor since it's exploratory.
  const MIN_SCORE = 0.25;

  const results: Array<{
    name: string;
    description: string;
    keywords: string[];
    phases: string[];
    score: number;
    source: string;
  }> = [];

  for (const [name, entry] of Object.entries(index.skills)) {
    // Delegate scoring to shared scoreSkill — no recency context in search
    const score = scoreSkill(entry, queryTerms, profile, [], name, freshSnapshot);

    if (score >= MIN_SCORE || queryTerms.length === 0) {
      results.push({
        name,
        description: entry.description,
        keywords: entry.keywords,
        phases: entry.phases,
        score: Math.round(score * 100) / 100,
        source: entry.source,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top5 = results.slice(0, 5);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ results: top5 }, null, 2),
      },
    ],
  };
}
