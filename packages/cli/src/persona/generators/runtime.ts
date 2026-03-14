import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona } from '../schema';

// TODO: Extract to shared utility — duplicated in runtime.ts, ci-workflow.ts, generate.ts
function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function generateRuntime(persona: Persona): Result<string, Error> {
  try {
    const config = {
      name: toKebabCase(persona.name),
      skills: persona.skills,
      commands: persona.commands,
      timeout: persona.config.timeout,
      severity: persona.config.severity,
    };
    return Ok(JSON.stringify(config, null, 2));
  } catch (error) {
    return Err(new Error(`Failed to generate runtime config: ${error instanceof Error ? error.message : String(error)}`));
  }
}
