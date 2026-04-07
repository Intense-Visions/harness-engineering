#!/usr/bin/env node

/**
 * Auto-generate barrel export registrations for CLI commands.
 *
 * Scans packages/cli/src/commands/ for files exporting createXXXCommand()
 * functions and generates a command registry module that createProgram()
 * can import. This eliminates manual import/addCommand churn in index.ts.
 *
 * Convention:
 *   - Top-level .ts files → scanned for createXXXCommand exports
 *   - Directories with index.ts → index.ts scanned for createXXXCommand
 *   - EXTRA_TOP_LEVEL_COMMANDS → sub-directory files promoted to top-level
 *
 * Usage:
 *   node scripts/generate-barrel-exports.mjs           # generate
 *   node scripts/generate-barrel-exports.mjs --check   # verify freshness (CI)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CLI_COMMANDS_DIR = join(ROOT, 'packages', 'cli', 'src', 'commands');
const REGISTRY_PATH = join(ROOT, 'packages', 'cli', 'src', 'commands', '_registry.ts');
const HEADER = '// AUTO-GENERATED — do not edit. Run `pnpm run generate-barrel-exports` to regenerate.\n';

/**
 * Sub-directory files that are registered as top-level CLI commands.
 * These are exceptions to the "index.ts only" rule for directories.
 * Format: relative path from commands/ → file to scan.
 */
const EXTRA_TOP_LEVEL_COMMANDS = [
  'graph/scan.ts',
  'graph/ingest.ts',
  'graph/query.ts',
];

/**
 * Extract createXXXCommand exports from a single file.
 */
function extractCommands(filePath, commandsDir) {
  const content = readFileSync(filePath, 'utf-8');
  // Match both `export function createXXXCommand(` and `export const createXXXCommand = (`
  const matches = [
    ...content.matchAll(/export\s+function\s+(create\w+Command)\s*\(/g),
    ...content.matchAll(/export\s+const\s+(create\w+Command)\s*=/g),
  ];
  return matches.map((match) => {
    let importPath = './' + relative(commandsDir, filePath)
      .replace(/\.ts$/, '')
      .replace(/\/index$/, '');
    importPath = importPath.replace(/\\/g, '/');
    return { importPath, functionName: match[1] };
  });
}

/**
 * Discover all command creator functions from the commands directory.
 */
function discoverCommands(dir) {
  const commands = [];

  // 1. Scan top-level files and directory index files
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    let filePath;
    if (stat.isDirectory()) {
      filePath = join(fullPath, 'index.ts');
      if (!existsSync(filePath)) continue;
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      filePath = fullPath;
    } else {
      continue;
    }

    commands.push(...extractCommands(filePath, dir));
  }

  // 2. Scan extra top-level commands from sub-directories
  for (const relPath of EXTRA_TOP_LEVEL_COMMANDS) {
    const filePath = join(dir, relPath);
    if (existsSync(filePath)) {
      commands.push(...extractCommands(filePath, dir));
    }
  }

  // Deduplicate by function name (in case index.ts re-exports)
  const seen = new Set();
  const unique = commands.filter((c) => {
    if (seen.has(c.functionName)) return false;
    seen.add(c.functionName);
    return true;
  });

  return unique.sort((a, b) => a.functionName.localeCompare(b.functionName));
}

function generateRegistry(commands) {
  const imports = commands
    .map((c) => `import { ${c.functionName} } from '${c.importPath}';`)
    .join('\n');

  const registrations = commands
    .map((c) => `  ${c.functionName},`)
    .join('\n');

  return `${HEADER}
import type { Command } from 'commander';

${imports}

/**
 * All discovered command creators, sorted alphabetically.
 * Used by createProgram() to register commands without manual imports.
 */
export const commandCreators: Array<() => Command> = [
${registrations}
];
`;
}

// --- Main ---

const commands = discoverCommands(CLI_COMMANDS_DIR);
const content = generateRegistry(commands);

if (process.argv.includes('--check')) {
  if (!existsSync(REGISTRY_PATH)) {
    console.error('Command registry not found. Run: pnpm run generate-barrel-exports');
    process.exit(1);
  }
  const existing = readFileSync(REGISTRY_PATH, 'utf-8');
  if (existing !== content) {
    console.error('Command registry is stale. Run: pnpm run generate-barrel-exports');
    process.exit(1);
  }
  console.log('Command registry is up to date.');
} else {
  writeFileSync(REGISTRY_PATH, content);
  console.log(`Generated ${REGISTRY_PATH} with ${commands.length} commands.`);
}
