#!/usr/bin/env node
// Regenerates `.claude-plugin/hooks.json` from the standard hook profile.
// Mirror of packages/cli/src/hooks/profiles.ts — keep this list in sync
// (`pnpm generate:plugin:check` will fail in CI if they drift). The plugin
// ships the standard profile; users who want minimal/strict install via npm
// + `harness setup` instead.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const outFile = join(repoRoot, '.claude-plugin', 'hooks.json');

// Source of truth: packages/cli/src/hooks/profiles.ts HOOK_SCRIPTS.
// Filtered to the `standard` profile (default).
const STANDARD_HOOKS = [
  { name: 'block-no-verify', event: 'PreToolUse', matcher: 'Bash' },
  { name: 'protect-config', event: 'PreToolUse', matcher: 'Write|Edit' },
  { name: 'quality-gate', event: 'PostToolUse', matcher: 'Edit|Write' },
  { name: 'pre-compact-state', event: 'PreCompact', matcher: '*' },
  { name: 'adoption-tracker', event: 'Stop', matcher: '*' },
  { name: 'telemetry-reporter', event: 'Stop', matcher: '*' },
];

const config = { hooks: {} };
for (const script of STANDARD_HOOKS) {
  if (!config.hooks[script.event]) config.hooks[script.event] = [];
  config.hooks[script.event].push({
    matcher: script.matcher,
    hooks: [
      {
        type: 'command',
        command: `node "\${CLAUDE_PLUGIN_ROOT}/.harness/hooks/${script.name}.js"`,
      },
    ],
  });
}

const rendered = JSON.stringify(config, null, 2) + '\n';
const isCheck = process.argv.includes('--check');

if (isCheck) {
  if (!existsSync(outFile)) {
    console.error(`Missing ${outFile}. Run \`pnpm generate:plugin-hooks\`.`);
    process.exit(1);
  }
  const current = readFileSync(outFile, 'utf-8');
  if (current !== rendered) {
    console.error(`Drift detected in ${outFile}. Run \`pnpm generate:plugin-hooks\` to update.`);
    process.exit(1);
  }
  console.log(`OK ${outFile}`);
  process.exit(0);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, rendered);
console.log(`Wrote ${STANDARD_HOOKS.length} hook entries to ${outFile}`);
