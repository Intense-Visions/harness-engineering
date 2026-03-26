// packages/core/src/state/handoff.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { HandoffSchema, type Handoff } from './types';
import { getStateDir, HANDOFF_FILE } from './state-shared';

export async function saveHandoff(
  projectPath: string,
  handoff: Handoff,
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const handoffPath = path.join(stateDir, HANDOFF_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(`Failed to save handoff: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

export async function loadHandoff(
  projectPath: string,
  stream?: string
): Promise<Result<Handoff | null, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const handoffPath = path.join(stateDir, HANDOFF_FILE);

    if (!fs.existsSync(handoffPath)) {
      return Ok(null);
    }

    const raw = fs.readFileSync(handoffPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = HandoffSchema.safeParse(parsed);

    if (!result.success) {
      return Err(new Error(`Invalid handoff file: ${result.error.message}`));
    }

    return Ok(result.data);
  } catch (error) {
    return Err(
      new Error(`Failed to load handoff: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}
