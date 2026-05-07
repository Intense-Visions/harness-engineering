#!/usr/bin/env node
// Regenerates marketplace plugin artifacts for a given target tool.
//
//   pnpm generate:plugin --target claude
//   pnpm generate:plugin --target cursor [--check]
//
// Generates three artifacts under <target>'s plugin dir:
//   - <pluginDir>/commands/   (slash command wrappers)
//   - <pluginDir>/agents/     (persona subagents)
//   - <pluginDir>/hooks.json  (lifecycle hook config)
//
// `--check` mode runs each artifact's generator into a staging dir,
// formats with prettier (--ignore-path .prettierignore so the staging
// dirs aren't skipped via .gitignore), and diffs against the committed
// tree. Non-zero exit on drift. Used by CI to block silent drift.
//
// Replaces the per-artifact scripts that existed before PR-B.
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, STANDARD_HOOKS } from './lib/plugin-config.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');
const prettier = join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
const cliEntry = join(repoRoot, 'packages', 'cli', 'src', 'bin', 'harness.ts');

function parseArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const target = parseArg('--target');
if (!target) {
  console.error('Usage: generate-plugin.mjs --target <claude|cursor> [--check]');
  process.exit(1);
}

const config = getConfig(target);
const isCheck = process.argv.includes('--check');

if (!existsSync(tsx)) {
  console.error(`Missing tsx at ${tsx}. Run \`pnpm install\` first.`);
  process.exit(1);
}

const pluginRoot = join(repoRoot, config.pluginDir);

function runCli(args) {
  execFileSync(tsx, [cliEntry, ...args], { stdio: 'inherit', cwd: repoRoot });
}

function prettierWrite(targetPath) {
  execFileSync(
    'node',
    [prettier, '--write', '--ignore-path', '.prettierignore', targetPath],
    { stdio: 'inherit', cwd: repoRoot }
  );
}

function diffDirs(expectedDir, actualDir, extension = '.md') {
  const filter = (f) => f.endsWith(extension);
  const expected = existsSync(expectedDir)
    ? readdirSync(expectedDir).filter(filter).sort()
    : [];
  const actual = existsSync(actualDir) ? readdirSync(actualDir).filter(filter).sort() : [];
  let drift = false;
  if (expected.join('|') !== actual.join('|')) {
    drift = true;
    console.error(
      `File set drift in ${actualDir}:\n  expected: ${expected.join(', ')}\n  actual:   ${actual.join(', ')}`
    );
  }
  for (const file of expected) {
    if (!actual.includes(file)) continue;
    const exp = readFileSync(join(expectedDir, file), 'utf-8');
    const act = readFileSync(join(actualDir, file), 'utf-8');
    if (exp !== act) {
      drift = true;
      console.error(`Content drift in ${actualDir}/${file}.`);
    }
  }
  return drift;
}

// --- commands ---

function generateCommands() {
  const stagingDir = join(repoRoot, `tmp-plugin-${target}-commands`);
  const finalDir = join(pluginRoot, 'commands');

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  const cliArgs = [
    'generate-slash-commands',
    '--platforms',
    config.slashCommandsPlatform,
    '--skills-dir',
    config.skillsDir,
    '--output',
    stagingDir,
    '--yes',
  ];
  if (config.cursorMode) {
    cliArgs.push('--cursor-mode', config.cursorMode);
  }
  runCli(cliArgs);

  const generated = join(stagingDir, 'harness');
  if (!existsSync(generated)) {
    console.error(`Generator produced no command output at ${generated}.`);
    process.exit(1);
  }

  prettierWrite(generated);

  if (isCheck) {
    const drift = diffDirs(generated, finalDir);
    rmSync(stagingDir, { recursive: true, force: true });
    if (drift) {
      console.error(
        `\nRun \`pnpm generate:plugin --target ${target}\` to update commands.`
      );
      process.exit(1);
    }
    console.log(`OK ${finalDir}`);
    return;
  }

  rmSync(finalDir, { recursive: true, force: true });
  mkdirSync(finalDir, { recursive: true });
  for (const file of readdirSync(generated)) {
    renameSync(join(generated, file), join(finalDir, file));
  }
  rmSync(stagingDir, { recursive: true, force: true });
  console.log(`Wrote ${readdirSync(finalDir).length} commands to ${finalDir}`);
}

// --- agents (persona subagents) ---

function generateAgents() {
  const stagingDir = join(repoRoot, `tmp-plugin-${target}-agents`);
  const finalDir = join(pluginRoot, 'agents');

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  runCli([
    'generate-agent-definitions',
    '--platforms',
    config.agentPlatform,
    '--output',
    stagingDir,
  ]);

  const generated = join(stagingDir, config.agentPlatform);
  if (!existsSync(generated)) {
    console.error(`Generator produced no agent output at ${generated}.`);
    process.exit(1);
  }

  prettierWrite(generated);

  if (isCheck) {
    const drift = diffDirs(generated, finalDir);
    rmSync(stagingDir, { recursive: true, force: true });
    if (drift) {
      console.error(`\nRun \`pnpm generate:plugin --target ${target}\` to update agents.`);
      process.exit(1);
    }
    console.log(`OK ${finalDir}`);
    return;
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
}

// --- hooks ---

function generateHooks() {
  const outFile = join(pluginRoot, 'hooks.json');
  const hookConfig = { hooks: {} };
  for (const script of STANDARD_HOOKS) {
    if (!hookConfig.hooks[script.event]) hookConfig.hooks[script.event] = [];
    hookConfig.hooks[script.event].push({
      matcher: script.matcher,
      hooks: [{ type: 'command', command: config.hooksCommandTemplate(script.name) }],
    });
  }
  const rendered = JSON.stringify(hookConfig, null, 2) + '\n';

  if (isCheck) {
    if (!existsSync(outFile)) {
      console.error(`Missing ${outFile}. Run \`pnpm generate:plugin --target ${target}\`.`);
      process.exit(1);
    }
    const current = readFileSync(outFile, 'utf-8');
    if (current !== rendered) {
      console.error(
        `Drift in ${outFile}. Run \`pnpm generate:plugin --target ${target}\` to update.`
      );
      process.exit(1);
    }
    console.log(`OK ${outFile}`);
    return;
  }

  mkdirSync(pluginRoot, { recursive: true });
  writeFileSync(outFile, rendered);
  console.log(`Wrote ${STANDARD_HOOKS.length} hook entries to ${outFile}`);
}

// --- main ---

console.log(`[${config.label}] Generating plugin artifacts (mode: ${isCheck ? 'check' : 'write'})…`);
generateCommands();
generateAgents();
generateHooks();
console.log(`[${config.label}] Done.`);
