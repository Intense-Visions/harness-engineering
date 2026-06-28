// packages/cli/src/commands/maintenance-run.ts
//
// On-demand maintenance pipeline (Phase 3) — the `harness maintenance run`
// engine. Builds an infra-free TaskRunner (no orchestrator/gateway/ClaimManager),
// selects overdue/named/all sweep-eligible tasks via `selectTasks`, runs them in
// report mode (parallel) or fix mode (sequential), writes a consolidated
// `.harness/maintenance/last-run-summary.json`, and returns CI-friendly exit
// codes. See ADR 0050 (report-first on-demand) and the spec's Decisions D2/D4.

import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  TaskRunner,
  TaskOutputStore,
  MaintenanceReporter,
  CheckScriptRunner,
  type CheckCommandRunner,
  type AgentDispatcher,
  type CommandExecutor,
  type RunResult,
  type RunMode,
} from '@harness-engineering/orchestrator';
import type { MaintenanceConfig } from '@harness-engineering/types';

const execFileAsync = promisify(execFile);

/** Real check runner — pure child_process, no orchestrator infra. Mirrors
 * Orchestrator.createMaintenanceTaskRunner's checkRunner (orchestrator.ts:662). */
function createCheckRunner(): CheckCommandRunner {
  return {
    run: async (command, cwd) => {
      const [cmd, ...args] = command;
      if (!cmd) return { passed: true, findings: 0, output: '' };
      try {
        const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
        const m = stdout.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
        const findings = m ? parseInt(m[1]!, 10) : 0;
        return { passed: findings === 0, findings, output: stdout };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
        const m = output.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
        return { passed: false, findings: m ? parseInt(m[1]!, 10) : 1, output };
      }
    },
  };
}

function createCommandExecutor(): CommandExecutor {
  return {
    exec: async (command, cwd) => {
      const [cmd, ...args] = command;
      if (!cmd) return { stdout: '' };
      const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
      return { stdout: String(stdout) };
    },
  };
}

/** Report-mode dispatcher: must never be called (report takes the no-dispatch
 * branch). Throws to make any accidental invocation loud in tests. */
function reportDispatcher(): AgentDispatcher {
  return {
    dispatch: async () => {
      throw new Error('report mode must not dispatch agents');
    },
  };
}

/** Fix-mode dispatcher: parity with the orchestrator's STUB (orchestrator.ts:686).
 * Real fix-agent dispatch does not exist anywhere in the repo yet (D-P3-1). */
function fixStubDispatcher(): AgentDispatcher {
  return { dispatch: async () => ({ producedCommits: false, fixed: 0 }) };
}

/** Construct a TaskRunner with no orchestrator/gateway/ClaimManager.
 * No prManager is wired in either mode → no git mutation, no PRs (D-P3-1). */
export function buildTaskRunner(cwd: string, config: MaintenanceConfig, mode: RunMode): TaskRunner {
  const outputStore = new TaskOutputStore({
    rootDir: path.join(cwd, '.harness', 'maintenance'),
  });
  return new TaskRunner({
    config,
    checkRunner: createCheckRunner(),
    commandExecutor: createCommandExecutor(),
    agentDispatcher: mode === 'report' ? reportDispatcher() : fixStubDispatcher(),
    cwd,
    checkScriptRunner: new CheckScriptRunner(cwd),
    outputStore,
    // prManager intentionally omitted; contextResolver omitted (composePromptContext returns '').
  });
}

/** Read maintenance run history (RunResult[]) via MaintenanceReporter — the
 * same on-disk history.json the cron scheduler writes. */
export async function loadRunHistory(cwd: string): Promise<RunResult[]> {
  const reporter = new MaintenanceReporter({
    persistDir: path.join(cwd, '.harness', 'maintenance'),
  });
  await reporter.load();
  return reporter.getHistory(500, 0);
}
