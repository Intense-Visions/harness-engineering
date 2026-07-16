#!/usr/bin/env node

/**
 * Agent-setup prompt generator — emits docs/agent-setup/prompt.md from the
 * shared SETUP_CLIENTS descriptor (packages/cli/src/setup/clients.ts), so a
 * fetchable "install + init harness" instruction file cannot drift from what
 * `harness setup` actually does. See ADR 0073 and
 * docs/changes/agent-setup-prompt/proposal.md.
 *
 * Usage:
 *   node scripts/generate-agent-setup-prompt.mjs           # write prompt.md
 *   node scripts/generate-agent-setup-prompt.mjs --check    # fail if stale
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'agent-setup');
const OUT_FILE = join(OUT_DIR, 'prompt.md');
const RAW_URL =
  'https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md';
const HEADER =
  '<!-- AUTO-GENERATED — do not edit. Run `pnpm run generate-docs` to regenerate. -->\n\n';

/** Load SETUP_CLIENTS by running the tsx emitter (mjs cannot import .ts). */
function loadClients() {
  const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
  if (!existsSync(tsx)) {
    console.error(`Missing tsx at ${tsx}. Run \`pnpm install\` first.`);
    process.exit(1);
  }
  const emitter = join(ROOT, 'packages', 'cli', 'src', 'setup', 'print-clients.ts');
  const json = execFileSync(tsx, [emitter], { cwd: ROOT, encoding: 'utf-8' });
  return JSON.parse(json);
}

function renderPrompt(clients) {
  const pluginClients = clients.filter((c) => c.install.kind === 'plugin');

  const lines = [];
  lines.push(HEADER);
  lines.push('# Set up Harness Engineering\n\n');
  lines.push(
    'Official instructions to install and initialize harness in this project. ' +
      'Complete every step yourself by running the commands directly. Do not ask ' +
      'the user to run them. These instructions are published at ' +
      `<${RAW_URL}>.\n\n`
  );

  lines.push('## 1. Install for your agent\n\n');
  for (const c of pluginClients) {
    lines.push(`### ${c.name}\n\n`);
    lines.push('```\n');
    lines.push(`/plugin marketplace add ${c.install.marketplace}\n`);
    lines.push(`/plugin install ${c.install.plugin}\n`);
    lines.push('```\n\n');
  }

  lines.push('### OpenCode / any other CLI\n\n');
  lines.push('```bash\n');
  lines.push('npm install -g @harness-engineering/cli && harness setup\n');
  lines.push('```\n\n');
  lines.push(
    'If the plugin marketplace is unavailable, fall back to the npm path above. ' +
      'If you cannot identify your client, use the npm + `harness setup` path — it ' +
      'auto-detects every supported client (' +
      clients.map((c) => c.name).join(', ') +
      ').\n\n'
  );

  lines.push('## 2. Initialize harness in the project\n\n');
  lines.push('```bash\n');
  lines.push('harness init\n');
  lines.push('```\n\n');
  lines.push(
    'Scaffolds harness into the project; skips cleanly if already initialized. ' +
      'This is the one place you may pause and ask the user — only if scaffolding ' +
      'needs a human decision.\n\n'
  );

  lines.push('## 3. Verify\n\n');
  lines.push('```bash\n');
  lines.push('harness validate\n');
  lines.push('harness doctor\n');
  lines.push('```\n\n');

  lines.push('## Success\n\n');
  lines.push(
    'Harness is installed and initialized. Try `/harness:onboarding` to get ' +
      'oriented. See the project README for full documentation.\n'
  );

  return lines.join('');
}

function main() {
  const isCheck = process.argv.includes('--check');
  const clients = loadClients();
  const content = renderPrompt(clients);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, content);

  // Normalize through prettier so the --check is stable across environments
  // (same contract as generate-docs.mjs). If prettier reformats generated
  // output, the committed file already reflects that, so --check stays green.
  try {
    execFileSync('npx', ['prettier', '--write', 'docs/agent-setup/prompt.md'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  } catch {
    // prettier unavailable — skip normalization
  }

  if (isCheck) {
    try {
      execFileSync('git', ['diff', '--exit-code', 'docs/agent-setup/prompt.md'], {
        cwd: ROOT,
        stdio: 'pipe',
      });
      console.log('✓ docs/agent-setup/prompt.md is fresh.');
    } catch {
      console.error(
        '✗ docs/agent-setup/prompt.md is stale. Run `pnpm run generate-docs` to update.'
      );
      process.exit(1);
    }
  } else {
    console.log('✓ Wrote docs/agent-setup/prompt.md');
  }
}

main();
