// packages/cli/src/shared/craft/llm/orchestrator-md.ts
//
// Synchronous reader for agent.backends declared in harness.orchestrator.md.
// Used as a migration-bridge fallback by the craft LLM selector when
// harness.config.json doesn't declare agent.backends yet.
//
// The orchestrator package owns the async, fully-validated loader. This
// helper does the minimum needed to surface `agent.backends` to the craft
// selector — it walks up from a starting directory, reads the YAML
// frontmatter, and returns the backends map. Bad input → returns null
// (callers fall through to the built-in default).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';

const FILENAME = 'harness.orchestrator.md';

export function findOrchestratorMd(startDir: string): string | null {
  let cur = path.resolve(startDir);
  const root = path.parse(cur).root;
  while (cur !== root) {
    const candidate = path.join(cur, FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    cur = path.dirname(cur);
  }
  return null;
}

export function readBackendsFromOrchestratorMd(startDir: string): Record<string, unknown> | null {
  const file = findOrchestratorMd(startDir);
  if (file === null) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }

  const parts = raw.split('---');
  if (parts.length < 3) return null;
  const yamlContent = parts[1]!.trim();

  let parsed: unknown;
  try {
    parsed = parse(yamlContent);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;

  const agent = (parsed as { agent?: unknown }).agent;
  if (agent === null || typeof agent !== 'object') return null;
  const backends = (agent as { backends?: unknown }).backends;
  if (backends === null || typeof backends !== 'object') return null;
  return backends as Record<string, unknown>;
}
