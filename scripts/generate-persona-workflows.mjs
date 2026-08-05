#!/usr/bin/env node
// Regenerates (or, with --check, verifies) the committed .github/workflows/
// files that honor persona-declared triggers (#663).
//
//   pnpm generate:persona-workflows          # write
//   pnpm generate:persona-workflows:check     # drift guard (CI)
//
// Thin wrapper around `harness persona sync-workflows`, run from source via tsx
// (mirrors scripts/generate-plugin.mjs). The real logic lives in
// packages/cli/src/persona/generators/repo-workflows.ts so it is unit-tested.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');
const cliEntry = join(repoRoot, 'packages', 'cli', 'src', 'bin', 'harness.ts');

if (!existsSync(tsx)) {
  console.error(`Missing tsx at ${tsx}. Run \`pnpm install\` first.`);
  process.exit(1);
}

const isCheck = process.argv.includes('--check');
const args = [cliEntry, 'persona', 'sync-workflows'];
if (isCheck) args.push('--check');

try {
  execFileSync(tsx, args, { stdio: 'inherit', cwd: repoRoot });
} catch {
  process.exit(1);
}
