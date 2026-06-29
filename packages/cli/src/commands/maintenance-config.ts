// packages/cli/src/commands/maintenance-config.ts
//
// Shared maintenance task-resolution helpers used by BOTH the `maintenance`
// command surface (`list`) and the on-demand `maintenance run` engine. Kept in
// a dependency-free leaf module so `maintenance.ts` and `maintenance-run.ts`
// can both consume it without forming an import cycle.

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  BUILT_IN_TASKS,
  WorkflowLoader,
  migrateAgentConfig,
  type TaskDefinition,
} from '@harness-engineering/orchestrator';
import type {
  AgentConfig,
  BackendDef,
  CustomTaskDefinition,
  MaintenanceConfig,
} from '@harness-engineering/types';
import { logger } from '../output/logger';

export async function loadMaintenanceConfig(cwd: string): Promise<MaintenanceConfig | null> {
  const workflowPath = path.join(cwd, 'harness.orchestrator.md');
  if (!fs.existsSync(workflowPath)) return null;
  const loader = new WorkflowLoader();
  const result = await loader.loadWorkflow(workflowPath);
  if (!result.ok) return null;
  // Spec B Phase 2 / S3: surface non-blocking routing warnings at startup.
  for (const w of result.value.warnings) logger.warn(w);
  return (result.value.config as { maintenance?: MaintenanceConfig }).maintenance ?? null;
}

/**
 * Load the named `agent.backends` map the on-demand `--fix` dispatcher resolves
 * against, mirroring how the cron orchestrator gets `this.getBackends()`.
 *
 * Reads the SAME `harness.orchestrator.md` the orchestrator boots from, then
 * applies `migrateAgentConfig` so legacy single-backend configs synthesize a
 * `backends` map exactly as the Orchestrator constructor does — without
 * constructing a full Orchestrator. Returns `null` when there is no orchestrator
 * config, the config fails to load, or no backends can be resolved (the common
 * plain-checkout case), so the CLI can degrade gracefully and honestly rather
 * than crash or pretend it dispatched.
 */
export async function loadAgentBackends(cwd: string): Promise<Record<string, BackendDef> | null> {
  const workflowPath = path.join(cwd, 'harness.orchestrator.md');
  if (!fs.existsSync(workflowPath)) return null;
  const loader = new WorkflowLoader();
  const result = await loader.loadWorkflow(workflowPath);
  if (!result.ok) return null;
  const agent = (result.value.config as { agent?: AgentConfig }).agent;
  if (!agent) return null;
  return synthesizeBackends(agent);
}

/** Resolve the effective `agent.backends` map for an `AgentConfig`, normalizing
 * an empty/absent map to `null`. Already-modern configs carry `backends`
 * directly; legacy single-backend configs synthesize it via `migrateAgentConfig`
 * (a no-op when `backends` is already set). Synthesis errors are swallowed the
 * same way the Orchestrator constructor does — fall back to whatever `backends`
 * is already present (possibly none). */
function synthesizeBackends(agent: AgentConfig): Record<string, BackendDef> | null {
  let backends: Record<string, BackendDef> | undefined;
  try {
    backends = migrateAgentConfig(agent).config.backends ?? agent.backends;
  } catch {
    backends = agent.backends;
  }
  return backends && Object.keys(backends).length > 0 ? backends : null;
}

export function mergeResolvedTasks(config: MaintenanceConfig | null): TaskDefinition[] {
  const overrides = config?.tasks ?? {};
  const tasks: TaskDefinition[] = [];
  appendBuiltIns(tasks, overrides);
  appendCustomTasks(tasks, config?.customTasks ?? {}, overrides);
  return tasks;
}

function appendBuiltIns(
  tasks: TaskDefinition[],
  overrides: NonNullable<MaintenanceConfig['tasks']>
): void {
  for (const t of BUILT_IN_TASKS) {
    const ov = overrides[t.id];
    if (ov?.enabled === false) continue;
    const next: TaskDefinition = { ...t };
    if (ov?.schedule !== undefined) next.schedule = ov.schedule;
    tasks.push(next);
  }
}

function appendCustomTasks(
  tasks: TaskDefinition[],
  customs: Record<string, CustomTaskDefinition>,
  overrides: NonNullable<MaintenanceConfig['tasks']>
): void {
  for (const [id, def] of Object.entries(customs)) {
    const ov = overrides[id];
    if (ov?.enabled === false) continue;
    tasks.push(buildCustomTaskDefinition(id, def, ov?.schedule));
  }
}

function buildCustomTaskDefinition(
  id: string,
  def: CustomTaskDefinition,
  scheduleOverride: string | undefined
): TaskDefinition {
  const out: TaskDefinition = {
    id,
    type: def.type,
    description: def.description,
    schedule: scheduleOverride ?? def.schedule,
    branch: def.branch,
    isCustom: true,
  };
  copyOptional(def, out as unknown as Record<string, unknown>, [
    'checkCommand',
    'checkScript',
    'fixSkill',
    'inlineSkills',
    'inlineSkillsBudgetTokens',
    'contextFrom',
    'contextFromMaxAgeMinutes',
    'outputRetention',
    'costCeiling',
  ]);
  return out;
}

function copyOptional(
  src: Record<string, unknown> | object,
  dst: Record<string, unknown>,
  keys: string[]
): void {
  const s = src as Record<string, unknown>;
  for (const k of keys) {
    const v = s[k];
    if (v !== undefined) dst[k] = v;
  }
}
