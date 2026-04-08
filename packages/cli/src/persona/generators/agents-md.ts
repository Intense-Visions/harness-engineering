import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona, PersonaTrigger, CommandStep, SkillStep } from '../schema';

function formatPrTrigger(trigger: Extract<PersonaTrigger, { event: 'on_pr' }>): string {
  const paths = trigger.conditions?.paths?.join(', ') ?? 'all files';
  return `On PR (${paths})`;
}

function formatCommitTrigger(trigger: Extract<PersonaTrigger, { event: 'on_commit' }>): string {
  const branches = trigger.conditions?.branches?.join(', ') ?? 'all branches';
  return `On commit (${branches})`;
}

function formatTrigger(trigger: PersonaTrigger): string {
  switch (trigger.event) {
    case 'on_pr':
      return formatPrTrigger(trigger);
    case 'on_commit':
      return formatCommitTrigger(trigger);
    case 'scheduled':
      return `Scheduled (cron: ${trigger.cron})`;
    case 'manual':
      return 'Manual';
  }
}

function buildCommandList(persona: Persona): string {
  const commands = persona.steps
    .filter((s): s is CommandStep => 'command' in s)
    .map((s) => `\`harness ${s.command}\``);
  const stepSkills = persona.steps
    .filter((s): s is SkillStep => 'skill' in s)
    .map((s) => `\`harness skill run ${s.skill}\``);
  return [...commands, ...stepSkills].join(', ');
}

export function generateAgentsMd(persona: Persona): Result<string, Error> {
  try {
    const triggers = persona.triggers.map(formatTrigger).join(', ');
    const skills = persona.skills.join(', ');
    const allCommands = buildCommandList(persona);

    const fragment = `## ${persona.name} Agent\n\n**Role:** ${persona.role}\n\n**Triggers:** ${triggers}\n\n**Skills:** ${skills}\n\n**When this agent flags an issue:** Fix violations before merging. Run ${allCommands} locally to validate.\n`;
    return Ok(fragment);
  } catch (error) {
    return Err(
      new Error(
        `Failed to generate AGENTS.md fragment: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
