import YAML from 'yaml';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona, PersonaTrigger, CommandStep } from '../schema';

function buildGitHubTriggers(triggers: PersonaTrigger[]): Record<string, unknown> {
  const on: Record<string, unknown> = {};
  for (const trigger of triggers) {
    switch (trigger.event) {
      case 'on_pr': {
        const prConfig: Record<string, unknown> = {};
        if (trigger.conditions?.paths) prConfig.paths = trigger.conditions.paths;
        on.pull_request = prConfig;
        break;
      }
      case 'on_commit': {
        const pushConfig: Record<string, unknown> = {};
        if (trigger.conditions?.branches) pushConfig.branches = trigger.conditions.branches;
        on.push = pushConfig;
        break;
      }
      case 'scheduled':
        on.schedule = [{ cron: trigger.cron }];
        break;
    }
  }
  return on;
}

/**
 * Translate persona triggers into GitLab CI `rules:` entries.
 *
 * GitLab has no `on:` block — pipeline filtering lives on each job's `rules`,
 * gated by predefined variables:
 *  - `on_pr`      -> merge-request pipelines (`CI_PIPELINE_SOURCE`), with the
 *                    persona's path globs mapped to `changes:`.
 *  - `on_commit`  -> branch pipelines; one rule per configured branch (matched on
 *                    `CI_COMMIT_BRANCH`), or any push when no branches are given.
 *  - `scheduled`  -> schedule pipelines. GitLab cron lives in the project's
 *                    pipeline-schedule settings (UI/API), not the YAML, so the
 *                    rule only gates on the schedule source; the cron is dropped
 *                    intentionally (there is nowhere valid to put it in the file).
 */
function buildGitLabRules(triggers: PersonaTrigger[]): Record<string, unknown>[] {
  const rules: Record<string, unknown>[] = [];
  for (const trigger of triggers) {
    switch (trigger.event) {
      case 'on_pr': {
        const rule: Record<string, unknown> = {
          if: '$CI_PIPELINE_SOURCE == "merge_request_event"',
        };
        if (trigger.conditions?.paths) rule.changes = trigger.conditions.paths;
        rules.push(rule);
        break;
      }
      case 'on_commit': {
        const branches = trigger.conditions?.branches;
        if (branches?.length) {
          for (const branch of branches) rules.push({ if: `$CI_COMMIT_BRANCH == "${branch}"` });
        } else {
          rules.push({ if: '$CI_PIPELINE_SOURCE == "push"' });
        }
        break;
      }
      case 'scheduled':
        rules.push({ if: '$CI_PIPELINE_SOURCE == "schedule"' });
        break;
    }
  }
  return rules;
}

/**
 * Options controlling how the GitHub Actions workflow is shaped.
 *
 * The defaults reproduce the adopter-facing shape (a published `harness` CLI
 * invoked via `npx`, no build step, blocking on findings). The `workspace`
 * runner and `advisory` flag exist for repos that build the CLI from source and
 * want the persona jobs wired non-blocking first — matching how this repo
 * dogfoods `required-review.yml` / `pr-advisory-checks.yml`.
 *
 * These options only affect the GitHub platform; GitLab output is unchanged.
 */
export interface CIWorkflowOptions {
  /**
   * How the harness CLI is invoked in each command step.
   *  - `npx` (default): `npx harness <command>` — for adopters who install the
   *    published `@harness-engineering/cli`.
   *  - `workspace`: `node packages/cli/dist/bin/harness.js <command>`, preceded
   *    by `pnpm install` + `pnpm build`, node 22, full git history. For repos
   *    where the CLI IS the source (dogfooding).
   */
  runner?: 'npx' | 'workspace';
  /**
   * When true, the job runs under `continue-on-error: true` so a finding is
   * surfaced in the log without failing the check. Mirrors how blocking gates
   * are introduced non-blocking first.
   */
  advisory?: boolean;
}

/**
 * The only `harness` subcommands that accept a `--severity` flag. Appending it
 * to any other command hard-errors under commander (`unknown option`), which —
 * with job-level `continue-on-error` — silently skips every subsequent step. So
 * the flag must be added per-command, not blanket-appended to the whole list.
 */
const SEVERITY_AWARE_COMMANDS = new Set(['validate', 'check-perf', 'check-security']);

/** The `--severity <level>` suffix for `command`, or '' when it takes no such flag. */
function severityFlagFor(command: string, severity: string | undefined): string {
  if (!severity) return '';
  const leading = command.trim().split(/\s+/)[0];
  return SEVERITY_AWARE_COMMANDS.has(leading ?? '') ? ` --severity ${severity}` : '';
}

export function generateCIWorkflow(
  persona: Persona,
  platform: 'github' | 'gitlab',
  options: CIWorkflowOptions = {}
): Result<string, Error> {
  try {
    const runner = options.runner ?? 'npx';
    const severity = persona.config.severity;
    // Only emit command steps in CI (skill steps require AI agent runtime).
    const commandSteps = persona.steps.filter((s): s is CommandStep => 'command' in s);

    if (platform === 'gitlab') {
      const script = commandSteps.map(
        (step) => `npx harness ${step.command}${severityFlagFor(step.command, severity)}`
      );
      const rules = buildGitLabRules(persona.triggers);
      const enforce: Record<string, unknown> = {
        image: 'node:20',
        ...(rules.length ? { rules } : {}),
        before_script: ['corepack enable', 'pnpm install --frozen-lockfile'],
        // GitLab requires a non-empty `script`; fall back to a no-op when a
        // persona has only skill steps (which CI cannot run).
        script: script.length ? script : ['echo "No command steps to run in CI"'],
      };
      const pipeline = {
        workflow: { name: persona.name },
        enforce,
      };
      return Ok(YAML.stringify(pipeline, { lineWidth: 0 }));
    }

    const steps: Record<string, unknown>[] =
      runner === 'workspace'
        ? [
            // Full history so git-history-driven commands (hotspots, churn,
            // graph scan) have the data they need.
            { uses: 'actions/checkout@v6', with: { 'fetch-depth': 0 } },
            { uses: 'pnpm/action-setup@v5' },
            { uses: 'actions/setup-node@v6', with: { 'node-version': 22, cache: 'pnpm' } },
            { run: 'pnpm install --frozen-lockfile' },
            // The CLI IS this repo's source; build the workspace bin before use.
            { run: 'pnpm build' },
          ]
        : [
            { uses: 'actions/checkout@v4' },
            { uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
            { uses: 'pnpm/action-setup@v4', with: { run_install: 'frozen' } },
          ];

    const invoke = runner === 'workspace' ? 'node packages/cli/dist/bin/harness.js' : 'npx harness';
    for (const step of commandSteps) {
      steps.push({ run: `${invoke} ${step.command}${severityFlagFor(step.command, severity)}` });
    }

    const job: Record<string, unknown> = { 'runs-on': 'ubuntu-latest' };
    // Non-blocking: a finding is reported in the log but never flips the check.
    if (options.advisory) job['continue-on-error'] = true;
    job.steps = steps;

    const workflow: Record<string, unknown> = {
      name: persona.name,
      on: buildGitHubTriggers(persona.triggers),
    };
    if (runner === 'workspace') {
      // Cancel superseded runs on rapid pushes so advisory jobs don't pile up
      // (matches harness.yml / pr-advisory-checks.yml).
      workflow.concurrency = {
        group: '${{ github.workflow }}-${{ github.ref }}',
        'cancel-in-progress': true,
      };
    }
    // These jobs only read the tree; least-privilege token.
    workflow.permissions = { contents: 'read' };
    workflow.jobs = { enforce: job };

    return Ok(YAML.stringify(workflow, { lineWidth: 0 }));
  } catch (error) {
    return Err(
      new Error(
        `Failed to generate CI workflow: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
