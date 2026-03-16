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
    return Ok(result.data);
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
