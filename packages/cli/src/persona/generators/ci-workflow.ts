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

export function generateCIWorkflow(
  persona: Persona,
  platform: 'github' | 'gitlab'
): Result<string, Error> {
  try {
    if (platform === 'gitlab') return Err(new Error('GitLab CI generation is not yet supported'));

    const severity = persona.config.severity;
    const steps: Record<string, unknown>[] = [
      { uses: 'actions/checkout@v4' },
      { uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
      { uses: 'pnpm/action-setup@v4', with: { run_install: 'frozen' } },
    ];

    // Only emit command steps in CI (skill steps require AI agent runtime)
    const commandSteps = persona.steps.filter((s): s is CommandStep => 'command' in s);

    for (const step of commandSteps) {
      const severityFlag = severity ? ` --severity ${severity}` : '';
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
