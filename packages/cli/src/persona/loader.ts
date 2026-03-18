import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { PersonaSchema, type Persona } from './schema';

export interface PersonaMetadata {
  name: string;
  description: string;
  filePath: string;
}

/**
 * Normalize a parsed persona to always have `steps`.
 * V1 personas with `commands` get each command converted to a step with `when: "always"`.
 */
function normalizePersona(raw: Record<string, unknown>): Persona {
  if (raw.version === 1 && Array.isArray(raw.commands)) {
    const { commands, ...rest } = raw as Record<string, unknown> & { commands: string[] };
    return {
      ...(rest as unknown as Omit<Persona, 'steps' | 'commands'>),
      steps: commands.map((cmd) => ({
        command: cmd,
        when: 'always' as const,
      })),
    } as Persona;
  }
  return raw as unknown as Persona;
}

export function loadPersona(filePath: string): Result<Persona, Error> {
  try {
    if (!fs.existsSync(filePath)) {
      return Err(new Error(`Persona file not found: ${filePath}`));
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = YAML.parse(raw);
    const result = PersonaSchema.safeParse(parsed);
    if (!result.success) {
      return Err(new Error(`Invalid persona ${filePath}: ${result.error.message}`));
    }
    return Ok(normalizePersona(result.data as Record<string, unknown>));
  } catch (error) {
    return Err(
      new Error(`Failed to load persona: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

export function listPersonas(dir: string): Result<PersonaMetadata[], Error> {
  try {
    if (!fs.existsSync(dir)) return Ok([]);
    const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    const personas: PersonaMetadata[] = [];
    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      const result = loadPersona(filePath);
      if (result.ok) {
        personas.push({ name: result.value.name, description: result.value.description, filePath });
      }
    }
    return Ok(personas);
  } catch (error) {
    return Err(
      new Error(
        `Failed to list personas: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
