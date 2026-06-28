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
  type TaskDefinition,
} from '@harness-engineering/orchestrator';
import type { CustomTaskDefinition, MaintenanceConfig } from '@harness-engineering/types';
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
