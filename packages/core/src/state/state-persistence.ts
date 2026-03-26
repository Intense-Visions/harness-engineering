// packages/core/src/state/state-persistence.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { HarnessStateSchema, DEFAULT_STATE, type HarnessState } from './types';
import { getStateDir, STATE_FILE } from './state-shared';

export async function loadState(
  projectPath: string,
  stream?: string
): Promise<Result<HarnessState, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult as Result<HarnessState, Error>;
    const stateDir = dirResult.value;
    const statePath = path.join(stateDir, STATE_FILE);

    if (!fs.existsSync(statePath)) {
      return Ok({ ...DEFAULT_STATE });
    }

    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = HarnessStateSchema.safeParse(parsed);

    if (!result.success) {
      return Err(new Error(`Invalid state file ${statePath}: ${result.error.message}`));
    }

    return Ok(result.data);
  } catch (error) {
    return Err(
      new Error(`Failed to load state: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

export async function saveState(
  projectPath: string,
  state: HarnessState,
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const statePath = path.join(stateDir, STATE_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(`Failed to save state: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}
