import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona, PersonaTrigger } from '../schema';

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
  }
}

export function generateAgentsMd(persona: Persona): Result<string, Error> {
  try {
    const triggers = persona.triggers.map(formatTrigger).join(', ');
    const skills = persona.skills.join(', ');
    const commands = persona.commands.map((c) => `\`harness ${c}\``).join(', ');
    const fragment = `## ${persona.name} Agent\n\n**Role:** ${persona.role}\n\n**Triggers:** ${triggers}\n\n**Skills:** ${skills}\n\n**When this agent flags an issue:** Fix violations before merging. Run ${commands} locally to validate.\n`;
    return Ok(fragment);
  } catch (error) {
    return Err(new Error(`Failed to generate AGENTS.md fragment: ${error instanceof Error ? error.message : String(error)}`));
  }
}
