/**
 * Gather the harness's REAL always-loaded context surface for the attribution
 * report (`harness mcp context-report`).
 *
 * The dominant contributors are the MCP tool schemas (measured per tier via the
 * tool-tiers allow-lists), plus AGENTS.md, the hook configuration, and the four
 * platform skill trees. Skill trees are classified invoked-only because Claude
 * Code defers skill bodies until a skill runs — and tool schemas are themselves
 * deferrable, so the per-tier measurement is the honest one.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ContextSurfaceEntry } from '@harness-engineering/core';
import { getToolDefinitions } from './index.js';
import type { ToolDefinition } from './tool-types.js';
import { CORE_TOOL_NAMES, STANDARD_TOOL_NAMES, type McpToolTier } from './tool-tiers.js';

/** Serialize a tool definition to the text an agent actually pays for. */
export function toolDefinitionText(def: ToolDefinition): string {
  return `${def.name}\n${def.description}\n${JSON.stringify(def.inputSchema)}`;
}

/** Names exposed at a tier (undefined filter = every tool). */
function tierFilter(tier: McpToolTier): ReadonlySet<string> | undefined {
  if (tier === 'core') return new Set(CORE_TOOL_NAMES);
  if (tier === 'standard') return new Set(STANDARD_TOOL_NAMES);
  return undefined;
}

/** MCP tool-schema entries for a given tier (always-loaded). */
export function mcpToolEntries(
  tier: McpToolTier,
  definitions: readonly ToolDefinition[] = getToolDefinitions()
): ContextSurfaceEntry[] {
  const filter = tierFilter(tier);
  const included = filter ? definitions.filter((d) => filter.has(d.name)) : definitions;
  return included.map((def) => ({
    id: `mcp:${def.name}`,
    label: `MCP tool schema: ${def.name}`,
    contextClass: 'always-loaded',
    text: toolDefinitionText(def),
  }));
}

const PLATFORM_SKILL_DIRS = ['claude-code', 'codex', 'cursor', 'gemini-cli'] as const;

/** Recursively collect SKILL.md paths under a directory. */
function collectSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSkillFiles(full));
    } else if (entry.name === 'SKILL.md') {
      out.push(full);
    }
  }
  return out;
}

/** One invoked-only entry per platform skill tree (aggregated bodies). */
function skillTreeEntries(projectRoot: string): ContextSurfaceEntry[] {
  const entries: ContextSurfaceEntry[] = [];
  for (const platform of PLATFORM_SKILL_DIRS) {
    const dir = join(projectRoot, 'agents', 'skills', platform);
    const files = collectSkillFiles(dir);
    if (files.length === 0) continue;
    let text = '';
    for (const file of files) {
      try {
        text += readFileSync(file, 'utf-8');
        text += '\n';
      } catch {
        // Skip unreadable files; report remains best-effort.
      }
    }
    entries.push({
      id: `skills:${platform}`,
      label: `Skill tree: ${platform} (${files.length} SKILL.md)`,
      contextClass: 'invoked-only',
      text,
    });
  }
  return entries;
}

/** AGENTS.md entry (always-loaded), when present. */
function agentsMdEntry(projectRoot: string): ContextSurfaceEntry | null {
  const path = join(projectRoot, 'AGENTS.md');
  if (!existsSync(path)) return null;
  try {
    return {
      id: 'agents-md',
      label: 'AGENTS.md',
      contextClass: 'always-loaded',
      text: readFileSync(path, 'utf-8'),
    };
  } catch {
    return null;
  }
}

/** Hook-configuration entry from .claude/settings.json (always-loaded). */
function hooksEntry(projectRoot: string): ContextSurfaceEntry | null {
  const path = join(projectRoot, '.claude', 'settings.json');
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as { hooks?: unknown };
    if (!parsed.hooks) return null;
    return {
      id: 'hooks',
      label: 'Hook configuration (.claude/settings.json)',
      contextClass: 'always-loaded',
      text: JSON.stringify(parsed.hooks),
    };
  } catch {
    return null;
  }
}

export interface GatherContextSurfaceOptions {
  /** Tier whose MCP tool schemas to measure. Default `full`. */
  tier?: McpToolTier;
  /** Injectable definitions (tests). Defaults to the live registry. */
  definitions?: readonly ToolDefinition[];
  /** Include the platform skill trees. Default true. */
  includeSkills?: boolean;
}

/**
 * Gather the full context surface for a project root: MCP tool schemas at the
 * requested tier, AGENTS.md, hooks, and (optionally) the platform skill trees.
 */
export function gatherContextSurface(
  projectRoot: string,
  options: GatherContextSurfaceOptions = {}
): ContextSurfaceEntry[] {
  const tier = options.tier ?? 'full';
  const definitions = options.definitions ?? getToolDefinitions();
  const entries: ContextSurfaceEntry[] = [...mcpToolEntries(tier, definitions)];

  const agents = agentsMdEntry(projectRoot);
  if (agents) entries.push(agents);

  const hooks = hooksEntry(projectRoot);
  if (hooks) entries.push(hooks);

  if (options.includeSkills !== false) {
    entries.push(...skillTreeEntries(projectRoot));
  }

  return entries;
}