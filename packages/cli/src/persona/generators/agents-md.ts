import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona, PersonaTrigger, CommandStep, SkillStep } from '../schema';

function formatTrigger(trigger: PersonaTrigger): string {
  switch (trigger.event) {
    case 'on_pr': {
      const paths = trigger.conditions?.paths?.join(', ') ?? 'all files';
      return `On PR (${paths})`;
    }
    case 'on_commit': {
      const branches = trigger.conditions?.branches?.join(', ') ?? 'all branches';
      return `On commit (${branches})`;
    }
    case 'scheduled':
      return `Scheduled (cron: ${trigger.cron})`;
    case 'manual':
      return 'Manual';
  }
}

export function generateAgentsMd(persona: Persona): Result<string, Error> {
  try {
    const triggers = persona.triggers.map(formatTrigger).join(', ');
    const skills = persona.skills.join(', ');

    // Extract unique commands from steps
    const commands = persona.steps
      .filter((s): s is CommandStep => 'command' in s)
      .map((s) => `\`harness ${s.command}\``)
      .join(', ');

    // Extract skill names from steps
    const stepSkills = persona.steps
      .filter((s): s is SkillStep => 'skill' in s)
      .map((s) => `\`harness skill run ${s.skill}\``)
      .join(', ');

    const allCommands = [commands, stepSkills].filter(Boolean).join(', ');

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
