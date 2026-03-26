// scripts/sync-lockfile.mjs — Cross-platform replacement for sync-lockfile.sh
// Syncs the pnpm lockfile without accepting additional arguments from lint-staged
import { execSync } from 'node:child_process';

execSync('pnpm install --lockfile-only -w', { stdio: 'inherit' });
