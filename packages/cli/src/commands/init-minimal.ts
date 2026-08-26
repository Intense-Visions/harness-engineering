import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { Result } from '@harness-engineering/core';
import { Ok, Err, generateAgentsMap, ArchBaselineManager } from '@harness-engineering/core';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { initHooks } from './hooks/init';

/**
 * The `minimal` init tier (ADR 0101): the documented floor of the adoption
 * ladder, mapped one-to-one to the field's 5-item Minimum Viable Harness. Unlike
 * the full `--level` scaffold (STRATEGY interview → framework → design system),
 * this fast path scaffolds exactly, and only, the five load-bearing artifacts and
 * prints an explicit, ordered upgrade path so nothing is lost — only sequenced.
 *
 * Re-running init at a higher tier is additive over a `minimal` install.
 */

export interface MinimalInitOptions {
  cwd?: string;
  name?: string;
  force?: boolean;
}

/** One scaffolded MVH artifact and the concrete file(s) that back it. */
export interface MinimalArtifact {
  /** The Minimum-Viable-Harness item this artifact fulfils (ADR 0101 Decision). */
  mvh: string;
  /** Project-relative file(s) written for this artifact (empty when degraded). */
  files: string[];
  /** True when the artifact was fully scaffolded; false when degraded gracefully. */
  scaffolded: boolean;
  /** Present only when degraded, explaining why. */
  note?: string;
}

export interface MinimalInitResult {
  artifacts: MinimalArtifact[];
  filesCreated: string[];
}

/** True if `cwd` looks like a git repository (`.git` present as dir or gitdir file). */
function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/** Resolve git's hooks dir, correct in linked worktrees; falls back to `.git/hooks`. */
function resolveGitHooksDir(cwd: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return path.isAbsolute(out) ? out : path.join(cwd, out);
  } catch {
    return path.join(cwd, '.git', 'hooks');
  }
}

/** The current commit hash, or an empty string outside a git checkout (or a repo with no commits). */
function currentCommitHash(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

// --- Artifact 2 + 3: the one runnable local check and the one hard arch rule ---

/**
 * The minimal `harness.config.json`: a single hard architectural rule — a
 * cyclomatic-complexity cap of 15 — enforced fail-closed by `harness check-arch`.
 * This is both the "one runnable local check" (the command wired into the
 * project) and the definition of the "one hard architectural rule". A complexity
 * cap is chosen deliberately: it is the field-standard maintainability floor, it
 * is adopter-portable (no assumptions about this repo's layer layout), and it is
 * enforced directly from source, so it genuinely bites in a standalone
 * `harness check-arch` run — the command the pre-commit loop invokes.
 */
function buildMinimalConfig(name: string): string {
  const config = {
    version: 1,
    name,
    architecture: {
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: { complexity: { max: 15 } },
    },
    agentsMapPath: './AGENTS.md',
    template: { level: 'minimal', version: 1 },
  };
  return JSON.stringify(config, null, 2) + '\n';
}

// --- Artifact 4: the one verification loop (git pre-commit) ---

const HOOK_BEGIN = '# >>> harness minimal tier (managed by `harness init --tier minimal`) >>>';
const HOOK_END = '# <<< harness minimal tier (managed by `harness init --tier minimal`) <<<';

/** The managed pre-commit block: run the arch gate, block the commit on failure. */
function buildPreCommitBlock(): string {
  return [
    HOOK_BEGIN,
    '# Verification loop: run the harness architecture gate before every commit so a',
    '# layer violation can never land. Managed by `harness init --tier minimal` — edits',
    '# inside this block are overwritten on the next run.',
    'if ! npx harness check-arch; then',
    '  echo "Commit blocked: harness check-arch failed; fix the violation before committing." >&2',
    '  exit 1',
    'fi',
    HOOK_END,
  ].join('\n');
}

/** Idempotently merge the managed `block` into an existing hook file's content. */
function mergeHook(existing: string | null, block: string): string {
  if (existing === null || existing.trim() === '') {
    return `#!/bin/sh\n${block}\n`;
  }
  const begin = existing.indexOf(HOOK_BEGIN);
  const end = existing.indexOf(HOOK_END);
  if (begin !== -1 && end !== -1 && end >= begin) {
    const endLineBreak = existing.indexOf('\n', end);
    const head = existing.slice(0, begin);
    const tail = endLineBreak === -1 ? '' : existing.slice(endLineBreak);
    return `${head}${block}${tail}`;
  }
  const separator = existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}\n${block}\n`;
}

/** Install (or refresh) the pre-commit verification loop. */
function installVerificationLoop(cwd: string): MinimalArtifact {
  const mvh = 'One verification loop — a pre-commit hook running the arch check';
  if (!isGitRepo(cwd)) {
    return {
      mvh,
      files: [],
      scaffolded: false,
      note: 'not a git repository — install a pre-commit hook that runs `harness check-arch` once the project is under git.',
    };
  }
  const hookPath = path.join(resolveGitHooksDir(cwd), 'pre-commit');
  const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf-8') : null;
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, mergeHook(existing, buildPreCommitBlock()));
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(hookPath, 0o755);
    } catch {
      // Non-POSIX filesystem — git for Windows honours the hook regardless.
    }
  }
  return { mvh, files: [path.relative(cwd, hookPath).replaceAll('\\', '/')], scaffolded: true };
}

// --- Artifact 1: the repo guide (AGENTS.md) ---

async function writeRepoGuide(cwd: string): Promise<MinimalArtifact> {
  const mvh = 'Repo guide — a generated AGENTS.md';
  const result = await generateAgentsMap({
    rootDir: cwd,
    includePaths: ['src/**/*', 'docs/**/*.md'],
    excludePaths: ['**/node_modules/**', '**/dist/**'],
  });
  const content = result.ok
    ? result.value
    : '# AI Agent Knowledge Map\n\n## Project Overview\n\n> Add a brief description of this project.\n';
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), content);
  return { mvh, files: ['AGENTS.md'], scaffolded: true };
}

// --- Artifact 5: the one permission boundary (block-no-verify) ---

function installPermissionBoundary(cwd: string, force: boolean): MinimalArtifact {
  const result = initHooks({ profile: 'minimal', projectDir: cwd, force });
  const files = [
    path.relative(cwd, result.settingsPath).replaceAll('\\', '/'),
    ...result.copiedScripts.map((s) => `.harness/hooks/${s}.js`),
  ];
  return { mvh: 'One permission boundary — block-no-verify', files, scaffolded: true };
}

/**
 * Scaffold the five Minimum-Viable-Harness artifacts (ADR 0101) and nothing more.
 */
export async function runMinimalInit(
  options: MinimalInitOptions
): Promise<Result<MinimalInitResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? path.basename(cwd);
  const force = options.force ?? false;

  const configPath = path.join(cwd, 'harness.config.json');
  if (!force && fs.existsSync(configPath)) {
    return Err(
      new CLIError('Project already initialized. Use --force to overwrite.', ExitCode.ERROR)
    );
  }

  // 1. Repo guide.
  const repoGuide = await writeRepoGuide(cwd);

  // 2 + 3. One runnable local check + one hard architectural rule.
  fs.writeFileSync(configPath, buildMinimalConfig(name));
  const runnableCheck: MinimalArtifact = {
    mvh: 'One runnable local check — `harness check-arch`, wired via harness.config.json',
    files: ['harness.config.json'],
    scaffolded: true,
  };

  // Seed an empty baseline so the arch gate is fail-closed: any new layer
  // violation is a regression against a clean floor.
  const baseline = new ArchBaselineManager(cwd);
  baseline.save(baseline.capture([], currentCommitHash(cwd)));
  const archRule: MinimalArtifact = {
    mvh: 'One hard architectural rule — check-arch fail-closed, baseline seeded',
    files: ['.harness/arch/baselines.json'],
    scaffolded: true,
  };

  // 4. Verification loop.
  const verificationLoop = installVerificationLoop(cwd);

  // 5. Permission boundary.
  const permissionBoundary = installPermissionBoundary(cwd, force);

  const artifacts = [repoGuide, runnableCheck, archRule, verificationLoop, permissionBoundary];
  const filesCreated = artifacts.flatMap((a) => a.files);

  return Ok({ artifacts, filesCreated });
}

/**
 * The explicit, ordered upgrade path printed after a `minimal` install (ADR 0101):
 * nothing is skipped, only sequenced. `minimal` is a genuine floor, not a dead end —
 * re-running init at a higher tier layers on top of it.
 */
export function buildUpgradePath(): string[] {
  return [
    'Upgrade path (each step is additive — re-running init at a higher tier layers on top):',
    `  1. Run ${chalk.cyan('/harness:strategy')} to capture strategic grounding (STRATEGY.md) — it anchors brainstorm, ideate, and roadmap-pilot.`,
    `  2. Run ${chalk.cyan('harness init --tier intermediate')} to add framework selection, a design system, and the fuller check set.`,
    `  3. Run ${chalk.cyan('harness init --tier advanced')} to add multi-persona review in CI and the outcome-eval ship gate.`,
  ];
}

/** Print the success summary + ordered upgrade path for a `minimal` install. */
export function printMinimalInitSuccess(result: MinimalInitResult): void {
  console.log('');
  logger.success('Minimal harness initialized (ADR 0101 — the 5-item Minimum Viable Harness).');
  console.log('');
  logger.info('Scaffolded artifacts:');
  for (const artifact of result.artifacts) {
    const marker = artifact.scaffolded ? chalk.green('+') : chalk.yellow('~');
    console.log(`  ${marker} ${artifact.mvh}`);
    for (const file of artifact.files) {
      console.log(`      ${chalk.dim(file)}`);
    }
    if (artifact.note) {
      console.log(`      ${chalk.yellow('deferred:')} ${artifact.note}`);
    }
  }
  console.log('');
  for (const line of buildUpgradePath()) {
    console.log(line);
  }
  console.log('');
}
