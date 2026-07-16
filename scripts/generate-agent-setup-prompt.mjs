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

/**
 * Load the prompt inputs by running the tsx emitter (mjs cannot import .ts).
 * Returns `{ clients, requiredNodeVersion }` sourced from clients.ts and
 * node-version.ts, so the generated prompt cannot drift from the CLI.
 */
function loadInputs() {
  const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
  if (!existsSync(tsx)) {
    console.error(`Missing tsx at ${tsx}. Run \`pnpm install\` first.`);
    process.exit(1);
  }
  const emitter = join(ROOT, 'packages', 'cli', 'src', 'setup', 'print-clients.ts');
  const json = execFileSync(tsx, [emitter], { cwd: ROOT, encoding: 'utf-8' });
  return JSON.parse(json);
}

function renderPrompt({ clients, requiredNodeVersion }) {
  const pluginClients = clients.filter((c) => c.install.kind === 'plugin');

  // Derive the nvm hint's major from the required version so it can't drift
  // (e.g. ">=22.0.0" -> "22"). Fall back to the raw string if unparseable.
  const nodeMajor = (requiredNodeVersion.match(/(\d+)/) || [, requiredNodeVersion])[1];

  const lines = [];
  lines.push(HEADER);
  lines.push('# Set up Harness Engineering\n\n');
  lines.push(
    'Official instructions to install and initialize harness in this project. ' +
      'Complete every step yourself by running the commands directly. Do not ask ' +
      'the user to run them. These instructions are published at ' +
      `<${RAW_URL}>.\n\n`
  );

  lines.push('## Prerequisites (check these first)\n\n');
  lines.push('Verify these yourself before installing:\n\n');
  lines.push(
    `- **Node.js ${requiredNodeVersion}** — run \`node --version\`. This is a hard ` +
      'requirement: `harness setup` / `harness doctor` fail below it. If it is older ' +
      '(or Node is missing), install or switch first, e.g. via nvm: ' +
      `\`nvm install ${nodeMajor} && nvm use ${nodeMajor}\`.\n`
  );
  lines.push(
    '- **npm** — bundled with Node; needed for ' +
      '`npm install -g @harness-engineering/cli`.\n'
  );
  lines.push(
    '- **A git repository at the project root** — harness is git-centric (roadmap ' +
      "merge-driver, worktrees). If this directory isn't a git repo yet, run " +
      '`git init` first.\n'
  );
  lines.push('- **Run every command from the project root.**\n\n');

  lines.push('## 1. Install harness (recommended — universal, one command)\n\n');
  lines.push('```bash\n');
  lines.push('npm install -g @harness-engineering/cli && harness setup\n');
  lines.push('```\n\n');
  lines.push(
    '`harness setup` auto-detects every AI client on this machine (' +
      clients.map((c) => c.name).join(', ') +
      ') and lays down skills, slash commands, agent personas, MCP, and hooks. ' +
      'Prefer this path: it is a single shell command you can run yourself, and it ' +
      'covers every client — including ones with no marketplace plugin.\n\n'
  );

  lines.push(
    `### Optional: marketplace plugin (${pluginClients.map((c) => c.name).join(' / ')})\n\n`
  );
  lines.push(
    'For auto-update via `/plugin update` (and, on Cursor, curated project rules), ' +
      'the user can also install the marketplace plugin for their client. These are ' +
      'interactive client slash-commands, not shell commands, so ask the user to run ' +
      'the pair matching their client:\n\n'
  );
  for (const c of pluginClients) {
    lines.push(`**${c.name}**\n\n`);
    lines.push('```\n');
    lines.push(`/plugin marketplace add ${c.install.marketplace}\n`);
    lines.push(`/plugin install ${c.install.plugin}\n`);
    lines.push('```\n\n');
  }
  lines.push(
    'If you cannot identify the client, or it has no plugin above, the npm + ' +
      '`harness setup` path already covers it — nothing more is needed.\n\n'
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
  const inputs = loadInputs();
  const content = renderPrompt(inputs);

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
