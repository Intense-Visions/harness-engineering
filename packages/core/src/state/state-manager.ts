// packages/core/src/state/state-manager.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  HarnessStateSchema,
  DEFAULT_STATE,
  type HarnessState,
  HandoffSchema,
  type Handoff,
  GateConfigSchema,
  type GateResult,
} from './types';
import { resolveStreamPath } from './stream-resolver';

const HARNESS_DIR = '.harness';
const STATE_FILE = 'state.json';
const LEARNINGS_FILE = 'learnings.md';
const FAILURES_FILE = 'failures.md';
const HANDOFF_FILE = 'handoff.json';
const GATE_CONFIG_FILE = 'gate.json';
const INDEX_FILE = 'index.json';

/**
 * Resolves the directory where state files live.
 *
 * - If `stream` is provided, resolves to that stream's directory.
 * - If streams have been set up (index.json exists), resolves via branch/active stream.
 * - Otherwise, falls back to the legacy `.harness/` directory.
 *
 * Does NOT auto-migrate. Migration must be triggered explicitly via `migrateToStreams()`.
 */
async function getStateDir(projectPath: string, stream?: string): Promise<Result<string, Error>> {
  const streamsIndexPath = path.join(projectPath, HARNESS_DIR, 'streams', INDEX_FILE);
  const hasStreams = fs.existsSync(streamsIndexPath);

  if (stream || hasStreams) {
    const result = await resolveStreamPath(projectPath, stream ? { stream } : undefined);
    if (result.ok) {
      return result;
    }
    // If stream was explicitly requested but not found, propagate the error
    if (stream) {
      return result;
    }
    // Implicit resolution failed — fall back to legacy
  }

  return Ok(path.join(projectPath, HARNESS_DIR));
}

// ── State persistence ────────────────────────────────────────────────

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

// ── Learnings ────────────────────────────────────────────────────────

export async function appendLearning(
  projectPath: string,
  learning: string,
  skillName?: string,
  outcome?: string,
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];

    let entry: string;
    if (skillName && outcome) {
      entry = `\n- **${timestamp} [skill:${skillName}] [outcome:${outcome}]:** ${learning}\n`;
    } else if (skillName) {
      entry = `\n- **${timestamp} [skill:${skillName}]:** ${learning}\n`;
    } else {
      entry = `\n- **${timestamp}:** ${learning}\n`;
    }

    if (!fs.existsSync(learningsPath)) {
      fs.writeFileSync(learningsPath, `# Learnings\n${entry}`);
    } else {
      fs.appendFileSync(learningsPath, entry);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to append learning: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function loadRelevantLearnings(
  projectPath: string,
  skillName?: string,
  stream?: string
): Promise<Result<string[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok([]);
    }

    const content = fs.readFileSync(learningsPath, 'utf-8');
    const lines = content.split('\n');
    const entries: string[] = [];
    let currentBlock: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) continue;

      const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
      const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

      if (isDatedBullet || isHeading) {
        if (currentBlock.length > 0) {
          entries.push(currentBlock.join('\n'));
        }
        currentBlock = [line];
      } else if (line.trim() !== '' && currentBlock.length > 0) {
        currentBlock.push(line);
      }
    }

    if (currentBlock.length > 0) {
      entries.push(currentBlock.join('\n'));
    }

    if (!skillName) {
      return Ok(entries);
    }

    const filtered = entries.filter((entry) => entry.includes(`[skill:${skillName}]`));
    return Ok(filtered);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// ── Failures ─────────────────────────────────────────────────────────

const FAILURE_LINE_REGEX =
  /^- \*\*(\d{4}-\d{2}-\d{2}) \[skill:([^\]]+)\] \[type:([^\]]+)\]:\*\* (.+)$/;

export async function appendFailure(
  projectPath: string,
  description: string,
  skillName: string,
  type: string,
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    fs.mkdirSync(stateDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- **${timestamp} [skill:${skillName}] [type:${type}]:** ${description}\n`;

    if (!fs.existsSync(failuresPath)) {
      fs.writeFileSync(failuresPath, `# Failures\n${entry}`);
    } else {
      fs.appendFileSync(failuresPath, entry);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to append failure: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function loadFailures(
  projectPath: string,
  stream?: string
): Promise<
  Result<Array<{ date: string; skill: string; type: string; description: string }>, Error>
> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    if (!fs.existsSync(failuresPath)) {
      return Ok([]);
    }

    const content = fs.readFileSync(failuresPath, 'utf-8');
    const entries: Array<{ date: string; skill: string; type: string; description: string }> = [];

    for (const line of content.split('\n')) {
      const match = line.match(FAILURE_LINE_REGEX);
      if (match) {
        entries.push({
          date: match[1] ?? '',
          skill: match[2] ?? '',
          type: match[3] ?? '',
          description: match[4] ?? '',
        });
      }
    }

    return Ok(entries);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load failures: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

export async function archiveFailures(
  projectPath: string,
  stream?: string
): Promise<Result<void, Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    if (!fs.existsSync(failuresPath)) {
      return Ok(undefined);
    }

    const archiveDir = path.join(stateDir, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    let archiveName = `failures-${date}.md`;
    let counter = 2;

    while (fs.existsSync(path.join(archiveDir, archiveName))) {
      archiveName = `failures-${date}-${counter}.md`;
      counter++;
    }

    fs.renameSync(failuresPath, path.join(archiveDir, archiveName));
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to archive failures: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// ── Handoff ──────────────────────────────────────────────────────────

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

// ── Mechanical Gate ──────────────────────────────────────────────────

export async function runMechanicalGate(projectPath: string): Promise<Result<GateResult, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const gateConfigPath = path.join(harnessDir, GATE_CONFIG_FILE);

  try {
    let checks: Array<{ name: string; command: string }> = [];

    if (fs.existsSync(gateConfigPath)) {
      const raw = JSON.parse(fs.readFileSync(gateConfigPath, 'utf-8'));
      const config = GateConfigSchema.safeParse(raw);
      if (config.success && config.data.checks) {
        checks = config.data.checks;
      }
    }

    if (checks.length === 0) {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        if (scripts.test) checks.push({ name: 'test', command: 'npm test' });
        if (scripts.lint) checks.push({ name: 'lint', command: 'npm run lint' });
        if (scripts.typecheck) checks.push({ name: 'typecheck', command: 'npm run typecheck' });
        if (scripts.build) checks.push({ name: 'build', command: 'npm run build' });
      }

      if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
        checks.push({ name: 'test', command: 'go test ./...' });
        checks.push({ name: 'build', command: 'go build ./...' });
      }

      if (
        fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
        fs.existsSync(path.join(projectPath, 'setup.py'))
      ) {
        checks.push({ name: 'test', command: 'python -m pytest' });
      }
    }

    const results: GateResult['checks'] = [];

    // Gate commands from gate.json must match a safe pattern to prevent
    // arbitrary code execution from untrusted repo configs (CWE-78).
    // npx is excluded because it can auto-install and execute arbitrary packages.
    // python -c is excluded via the subcommand pattern (no single-letter flags allowed).
    const SAFE_GATE_COMMAND =
      /^(?:npm|pnpm|yarn)\s+(?:test|run\s+[\w.-]+|run-script\s+[\w.-]+)$|^go\s+(?:test|build|vet|fmt)\s+[\w./ -]+$|^(?:python|python3)\s+-m\s+[\w.-]+$|^make\s+[\w.-]+$|^cargo\s+(?:test|build|check|clippy)(?:\s+[\w./ -]+)?$|^(?:gradle|mvn)\s+[\w:.-]+$/;

    for (const check of checks) {
      if (!SAFE_GATE_COMMAND.test(check.command)) {
        results.push({
          name: check.name,
          passed: false,
          command: check.command,
          output: `Blocked: command does not match safe gate pattern. Allowed prefixes: npm, npx, pnpm, yarn, go, python, python3, make, cargo, gradle, mvn`,
          duration: 0,
        });
        continue;
      }

      const start = Date.now();
      try {
        execSync(check.command, {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 120_000,
        });
        results.push({
          name: check.name,
          passed: true,
          command: check.command,
          duration: Date.now() - start,
        });
      } catch (error) {
        const output =
          error instanceof Error
            ? (error as Error & { stderr?: { toString(): string } }).stderr?.toString() ||
              error.message
            : String(error);
        results.push({
          name: check.name,
          passed: false,
          command: check.command,
          output: output.slice(0, 2000),
          duration: Date.now() - start,
        });
      }
    }

    return Ok({
      passed: results.length === 0 || results.every((r) => r.passed),
      checks: results,
    });
  } catch (error) {
    return Err(
      new Error(
        `Failed to run mechanical gate: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
