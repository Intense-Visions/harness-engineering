#!/usr/bin/env node
// Regenerates the `commands/` directory at the repo root for the Claude Code
// plugin marketplace entry. Wraps `harness generate-slash-commands` and
// flattens the output (Claude Code plugins surface commands as
// `/<plugin>:<file>` from `commands/<file>.md`, so we don't want a nested
// `harness/` subdir).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const cli = join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'harness.js');
const skillsDir = join(repoRoot, 'agents', 'skills', 'claude-code');
const stagingDir = join(repoRoot, '.tmp-plugin-commands');
const finalDir = join(repoRoot, 'commands');

if (!existsSync(cli)) {
  console.error(`Missing CLI build at ${cli}. Run \`pnpm build\` first.`);
  process.exit(1);
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

execFileSync(
  process.execPath,
  [
    cli,
    'generate-slash-commands',
    '--platforms',
    'claude-code',
    '--skills-dir',
    skillsDir,
    '--output',
    stagingDir,
    '--yes',
  ],
  { stdio: 'inherit' }
);

const generated = join(stagingDir, 'harness');
if (!existsSync(generated)) {
  console.error(`Generator produced no output at ${generated}.`);
  process.exit(1);
}

rmSync(finalDir, { recursive: true, force: true });
mkdirSync(finalDir, { recursive: true });
for (const file of readdirSync(generated)) {
  renameSync(join(generated, file), join(finalDir, file));
}
rmSync(stagingDir, { recursive: true, force: true });

// Normalize with prettier so re-runs are idempotent against lint-staged.
execFileSync('node', [join(repoRoot, 'node_modules/prettier/bin/prettier.cjs'), '--write', finalDir], {
  stdio: 'inherit',
  cwd: repoRoot,
});

console.log(`Wrote ${readdirSync(finalDir).length} commands to ${finalDir}`);
