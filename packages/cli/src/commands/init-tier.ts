import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Tiers reachable via `--tier` (ADR 0101), lowest first. `minimal` is the
 * load-bearing floor mapped to the field's 5-item Minimum Viable Harness; every
 * other tier delegates to the existing adoption-level scaffold so the ladder's
 * upgrade wording ("`harness init --tier intermediate`") resolves to a real
 * command. The order IS the ladder: a re-run may only move up it.
 */
export const TIER_LEVELS = ['minimal', 'basic', 'intermediate', 'load-bearing-minimum', 'advanced'];

/** What a re-run of init over an existing `harness.config.json` should do. */
export type ReinitDecision =
  | { kind: 'upgrade'; from: string; to: string }
  | { kind: 'refuse'; message: string };

const FORCE_HINT = 'Use --force to overwrite.';

function tierRank(tier: string | undefined): number {
  return tier === undefined ? -1 : TIER_LEVELS.indexOf(tier);
}

/** The tier init recorded at `template.level`, or undefined when absent/unreadable. */
export function readRecordedTier(configPath: string): string | undefined {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      template?: { level?: unknown };
    };
    const level = config.template?.level;
    return typeof level === 'string' ? level : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Decide a re-run over an already-initialized project (#2630). Only an
 * explicitly requested tier strictly above the recorded one layers on top;
 * the same tier, a lower tier, an unknown recorded tier, or no requested tier
 * is refused — init never downgrades and never guesses.
 */
export function decideReinit(configPath: string, requested: string | undefined): ReinitDecision {
  const recorded = readRecordedTier(configPath);
  const recordedRank = tierRank(recorded);
  const requestedRank = tierRank(requested);
  if (recordedRank < 0 || requestedRank < 0) {
    return { kind: 'refuse', message: `Project already initialized. ${FORCE_HINT}` };
  }
  if (requestedRank > recordedRank) {
    return { kind: 'upgrade', from: recorded!, to: requested! };
  }
  if (requestedRank === recordedRank) {
    return {
      kind: 'refuse',
      message: `Project already initialized at tier "${recorded}"; nothing to add. ${FORCE_HINT}`,
    };
  }
  return {
    kind: 'refuse',
    message:
      `Project already initialized at tier "${recorded}", which is higher than the requested ` +
      `"${requested}"; init never downgrades. ${FORCE_HINT}`,
  };
}

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `incoming` under `existing`: every key already present in
 * `existing` keeps its value (arrays and scalars are taken whole), nested
 * objects merge recursively, and keys only `incoming` has are added.
 */
export function mergeExistingWins(existing: Json, incoming: Json): Json {
  const merged: Json = { ...incoming };
  for (const [key, value] of Object.entries(existing)) {
    const other = incoming[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(other) ? mergeExistingWins(value, other) : value;
  }
  return merged;
}

/** Drop declared entry points that are not on disk (an absent entry fails dead-code analysis, #2275). */
function pruneMissingEntryPoints(config: Json, cwd: string): Json {
  const entropy = config.entropy;
  if (!isPlainObject(entropy) || !Array.isArray(entropy.entryPoints)) return config;
  const present = entropy.entryPoints.filter(
    (e): e is string => typeof e === 'string' && fs.existsSync(path.join(cwd, e))
  );
  const nextEntropy: Json = { ...entropy };
  if (present.length > 0) nextEntropy.entryPoints = present;
  else delete nextEntropy.entryPoints;
  return { ...config, entropy: nextEntropy };
}

/**
 * Write the upgraded `harness.config.json` (#2630): the adopter's original
 * config wins every key it set, the current on-disk config (post-write
 * tooling patches) fills in next, and the higher tier's rendered config adds
 * whatever is still missing. Only `template.level` moves — to the new tier —
 * so a re-run at the same tier is refused.
 */
export function writeUpgradedConfig(opts: {
  cwd: string;
  original: Json;
  rendered: Json;
  tier: string;
}): void {
  const configPath = path.join(opts.cwd, 'harness.config.json');
  const current = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Json;
  const additions = mergeExistingWins(current, pruneMissingEntryPoints(opts.rendered, opts.cwd));
  const merged = mergeExistingWins(opts.original, additions);
  const template = isPlainObject(merged.template) ? merged.template : {};
  merged.template = { ...template, level: opts.tier };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
}
