// packages/core/src/state/mechanical-gate.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { GateConfigSchema, type GateResult } from './types';
import { HARNESS_DIR, GATE_CONFIG_FILE } from './state-shared';

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
