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
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const cliEntry = join(repoRoot, 'packages', 'cli', 'src', 'bin', 'harness.ts');

const isCheck = process.argv.includes('--check');
// This repo dogfoods the workspace runner (builds the CLI from source) and wires
// the persona jobs non-blocking first — adopters get the npx/blocking default.
const args = [cliEntry, 'persona', 'sync-workflows', '--runner', 'workspace', '--advisory'];
if (isCheck) args.push('--check');

try {
  // `node --import tsx`, not `node_modules/.bin/tsx` -- Windows cannot execute
  // the extensionless POSIX shim pnpm writes there, and the `existsSync` guard
  // that used to sit above found it anyway. See generate-agent-setup-prompt.mjs.
  execFileSync(process.execPath, ['--import', 'tsx', ...args], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
} catch {
  process.exit(1);
}
