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

export function generateCIWorkflow(
  persona: Persona,
  platform: 'github' | 'gitlab'
): Result<string, Error> {
  try {
    const severity = persona.config.severity;
    const severityFlag = severity ? ` --severity ${severity}` : '';
    // Only emit command steps in CI (skill steps require AI agent runtime).
    const commandSteps = persona.steps.filter((s): s is CommandStep => 'command' in s);

    if (platform === 'gitlab') {
      const script = commandSteps.map((step) => `npx harness ${step.command}${severityFlag}`);
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

    const steps: Record<string, unknown>[] = [
      { uses: 'actions/checkout@v4' },
      { uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
      { uses: 'pnpm/action-setup@v4', with: { run_install: 'frozen' } },
    ];
    for (const step of commandSteps) {
      steps.push({ run: `npx harness ${step.command}${severityFlag}` });
    }

    const workflow = {
      name: persona.name,
      on: buildGitHubTriggers(persona.triggers),
      jobs: {
        enforce: {
          'runs-on': 'ubuntu-latest',
          steps,
        },
      },
    };

    return Ok(YAML.stringify(workflow, { lineWidth: 0 }));
  } catch (error) {
    return Err(
      new Error(
        `Failed to generate CI workflow: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
