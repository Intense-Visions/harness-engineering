import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateAgentsMap } from '../../../context/agents-map';
import type { AgentConfigFinding } from '../types';
import { makeFinding } from './shared';

/**
 * Run AGENTS.md structural rule:
 *   HARNESS-AC-050 agents-md-sections  (delegates to validateAgentsMap — missing required sections)
 *
 * Re-uses the existing `validateAgentsMap` so we stay consistent with `harness validate` without
 * introducing a second opinion on AGENTS.md structure.
 */
export async function runAgentsMdRules(cwd: string): Promise<AgentConfigFinding[]> {
  const abs = join(cwd, 'AGENTS.md');
  if (!existsSync(abs)) return [];
  const result = await validateAgentsMap(abs);
  if (result.ok) return [];

  return [
    makeFinding({
      file: 'AGENTS.md',
      ruleId: 'HARNESS-AC-050',
      severity: 'error',
      message: result.error.message,
      suggestion: result.error.suggestions?.[0] ?? 'Run `harness init` to regenerate AGENTS.md',
    }),
  ];
}
