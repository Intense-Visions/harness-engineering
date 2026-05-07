#!/usr/bin/env node
// Regenerates `.claude-plugin/agents/` for the Claude Code plugin marketplace
// entry. Wraps `harness generate-agent-definitions --platforms claude-code`,
// which renders 12 personas (architecture-enforcer, code-reviewer, …) as
// Claude Code subagent markdown. The plugin manifest's `agents` field points
// at this directory so all plugin distribution artifacts live under
// `.claude-plugin/`.
//
// `--check` mode (used in CI) generates into a staging dir and diffs against
// the committed `.claude-plugin/agents/` tree. Drift fails the check.
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');
const prettier = join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
const cliEntry = join(repoRoot, 'packages', 'cli', 'src', 'bin', 'harness.ts');
// Staging dir intentionally does NOT start with `.` — prettier's default
// ignore list excludes dotted dirs, which would skip formatting and cause
// false-positive drift in `--check` mode. Cleaned up after each run.
const stagingDir = join(repoRoot, 'tmp-plugin-agents');
const finalDir = join(repoRoot, '.claude-plugin', 'agents');
const isCheck = process.argv.includes('--check');

if (!existsSync(tsx)) {
  console.error(`Missing tsx at ${tsx}. Run \`pnpm install\` first.`);
  process.exit(1);
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

execFileSync(
  tsx,
  [cliEntry, 'generate-agent-definitions', '--platforms', 'claude-code', '--output', stagingDir],
  { stdio: 'inherit' }
);

const generated = join(stagingDir, 'claude-code');
if (!existsSync(generated)) {
  console.error(`Generator produced no output at ${generated}.`);
  process.exit(1);
}

// `--ignore-path` defaults to .gitignore + .prettierignore; we ignore the
// staging dir in .gitignore to keep it out of commits, which would otherwise
// make prettier skip these files. Point at .prettierignore only.
execFileSync(
  'node',
  [prettier, '--write', '--ignore-path', '.prettierignore', generated],
  { stdio: 'inherit', cwd: repoRoot }
);

if (isCheck) {
  const expected = readdirSync(generated).filter((f) => f.endsWith('.md')).sort();
  const actual = existsSync(finalDir)
    ? readdirSync(finalDir).filter((f) => f.endsWith('.md')).sort()
    : [];
  let drift = false;
  if (expected.join('|') !== actual.join('|')) {
    drift = true;
    console.error(
      `File set drift in ${finalDir}:\n  expected: ${expected.join(', ')}\n  actual:   ${actual.join(', ')}`
    );
  }
  for (const file of expected) {
    if (!actual.includes(file)) continue;
    const exp = readFileSync(join(generated, file), 'utf-8');
    const act = readFileSync(join(finalDir, file), 'utf-8');
    if (exp !== act) {
      drift = true;
      console.error(`Content drift in ${finalDir}/${file}.`);
    }
  }
  rmSync(stagingDir, { recursive: true, force: true });
  if (drift) {
    console.error(`\nRun \`pnpm generate:plugin-agents\` to update.`);
    process.exit(1);
  }
  console.log(`OK ${finalDir} (${expected.length} agents match)`);
  process.exit(0);
}

mkdirSync(finalDir, { recursive: true });
for (const file of readdirSync(finalDir)) {
  if (file.endsWith('.md')) rmSync(join(finalDir, file));
}
for (const file of readdirSync(generated)) {
  renameSync(join(generated, file), join(finalDir, file));
}
rmSync(stagingDir, { recursive: true, force: true });

console.log(
  `Wrote ${readdirSync(finalDir).filter((f) => f.endsWith('.md')).length} agents to ${finalDir}`
);
