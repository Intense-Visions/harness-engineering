// packages/core/src/state/state-manager.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { HarnessStateSchema, DEFAULT_STATE, type HarnessState } from './types';

const HARNESS_DIR = '.harness';
const STATE_FILE = 'state.json';
const LEARNINGS_FILE = 'learnings.md';

export async function loadState(projectPath: string): Promise<Result<HarnessState, Error>> {
  const statePath = path.join(projectPath, HARNESS_DIR, STATE_FILE);

  if (!fs.existsSync(statePath)) {
    return Ok({ ...DEFAULT_STATE });
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = HarnessStateSchema.safeParse(parsed);

    if (!result.success) {
      return Err(new Error(`Invalid state file ${statePath}: ${result.error.message}`));
    }

    return Ok(result.data);
  } catch (error) {
    return Err(new Error(`Failed to load state from ${statePath}: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function saveState(projectPath: string, state: HarnessState): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const statePath = path.join(harnessDir, STATE_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to save state: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function appendLearning(projectPath: string, learning: string): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const learningsPath = path.join(harnessDir, LEARNINGS_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- **${timestamp}:** ${learning}\n`;

    if (!fs.existsSync(learningsPath)) {
      fs.writeFileSync(learningsPath, `# Learnings\n${entry}`);
    } else {
      fs.appendFileSync(learningsPath, entry);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to append learning: ${error instanceof Error ? error.message : String(error)}`));
  }
}
