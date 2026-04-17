import type { AgentConfigFinding } from '../types';
import { runClaudeMdRules } from './rule-claude-md';
import { runAgentRules } from './rule-agents';
import { runHookRules } from './rule-hooks';
import { runSkillRules } from './rule-skills';
import { runMcpRules } from './rule-mcp';
import { runAgentsMdRules } from './rule-agents-md';
import { runCommandRules } from './rule-commands';
import { runSettingsJsonRules } from './rule-settings-json';
import { runPersonaRules } from './rule-personas';
import { runAgnixTomlRules } from './rule-agnix-toml';

/** Run every fallback rule against `cwd` and return the aggregated, deterministically-sorted findings. */
export async function runFallbackRules(cwd: string): Promise<AgentConfigFinding[]> {
  const [
    claudeMd,
    agents,
    hooks,
    skills,
    mcp,
    agentsMd,
    commands,
    settingsJson,
    personas,
    agnixToml,
  ] = await Promise.all([
    Promise.resolve(runClaudeMdRules(cwd)),
    runAgentRules(cwd),
    Promise.resolve(runHookRules(cwd)),
    runSkillRules(cwd),
    Promise.resolve(runMcpRules(cwd)),
    runAgentsMdRules(cwd),
    runCommandRules(cwd),
    Promise.resolve(runSettingsJsonRules(cwd)),
    runPersonaRules(cwd),
    Promise.resolve(runAgnixTomlRules(cwd)),
  ]);

  const merged = [
    ...claudeMd,
    ...agents,
    ...hooks,
    ...skills,
    ...mcp,
    ...agentsMd,
    ...commands,
    ...settingsJson,
    ...personas,
    ...agnixToml,
  ];

  return merged.sort(compareFindings);
}

function compareFindings(a: AgentConfigFinding, b: AgentConfigFinding): number {
  return (
    a.file.localeCompare(b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    a.ruleId.localeCompare(b.ruleId)
  );
}
