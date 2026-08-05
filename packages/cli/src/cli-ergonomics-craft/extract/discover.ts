/**
 * CLI command-definition discovery — walks the project's command source tree(s)
 * and collects the files that define CLI commands, EXCLUDING tests, barrels /
 * registries, and generated output that are not authored command surfaces.
 *
 * A project that ships a CLI keeps its command definitions somewhere
 * conventional; this walks the common roots (harness's own commands live under
 * `packages/cli/src/commands`, so the skill can critique itself). Callers can
 * override discovery entirely with `--files`, or point at a specific directory
 * with `--commands-dir`.
 *
 * Structural twin of docs-craft's documentation discovery.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandKind } from '../catalog/rubrics/types.js';

/**
 * Candidate roots that conventionally hold CLI command definitions, tried in
 * order. Every root that exists is walked (a monorepo can have more than one).
 */
export const COMMAND_ROOTS: ReadonlyArray<string> = [
  'packages/cli/src/commands',
  'src/commands',
  'src/cli/commands',
  'src/cli',
  'cli/commands',
  'cli',
  'cmd',
];

/** Directory names never walked (build output, deps, VCS, generated trees). */
export const DEFAULT_EXCLUDED_DIRS: ReadonlyArray<string> = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '__snapshots__',
  '__tests__',
  'tests',
  'test',
  'fixtures',
];

/** Source extensions that can define a command. */
const COMMAND_EXTENSIONS: ReadonlyArray<string> = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

export interface DiscoveredCommand {
  /** Absolute path to the command definition file. */
  file: string;
  /** Path relative to the project root (POSIX separators) for display. */
  relative: string;
  /** Coarse classification used to filter rubrics + shape the prompt. */
  kind: CommandKind;
}

/**
 * True when a file is a barrel / registry / index or a test/spec — not an
 * authored command surface. Cheap filename heuristics only.
 */
export function isNonCommandFile(relative: string): boolean {
  const base = path.basename(relative).toLowerCase();
  if (/\.(test|spec|d)\.[mc]?[tj]s$/.test(base)) return true;
  if (base.startsWith('_')) return true; // _registry.ts, _shared.ts, ...
  if (base === 'index.ts' || base === 'index.js' || base === 'index.mjs') return true;
  return false;
}

/**
 * Classify a command definition by its source. Cheap heuristics only — the LLM
 * does the real judgment; this just filters obviously-inapplicable rubrics (the
 * destructive-guard rubric should not fire on a pure namespace command). A
 * command that hosts subcommands and has no action handler of its own is a
 * `group`; everything else is a `leaf`.
 */
export function classifyCommand(_relative: string, content: string): CommandKind {
  const hasOwnAction = /\.action\s*\(/.test(content);
  const hostsSubcommands = /\.addCommand\s*\(|\.command\s*\(/.test(content);
  if (hostsSubcommands && !hasOwnAction) return 'group';
  return 'leaf';
}

export function discoverCommands(
  projectRoot: string,
  opts: { commandsDir?: string; extraExcludeDirs?: ReadonlyArray<string> } = {}
): DiscoveredCommand[] {
  const exclude = new Set<string>([...DEFAULT_EXCLUDED_DIRS, ...(opts.extraExcludeDirs ?? [])]);
  const out: DiscoveredCommand[] = [];
  const seen = new Set<string>();

  const roots =
    opts.commandsDir !== undefined
      ? [path.resolve(projectRoot, opts.commandsDir)]
      : COMMAND_ROOTS.map((r) => path.join(projectRoot, r));

  for (const root of roots) {
    if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
      walk(root, projectRoot, out, exclude, seen);
    }
  }
  return out;
}

function walk(
  dir: string,
  projectRoot: string,
  out: DiscoveredCommand[],
  exclude: Set<string>,
  seen: Set<string>
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (exclude.has(entry.name)) continue;
      walk(full, projectRoot, out, exclude, seen);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!COMMAND_EXTENSIONS.includes(path.extname(entry.name))) continue;
    if (seen.has(full)) continue;
    const relative = path.relative(projectRoot, full).replaceAll('\\', '/');
    if (isNonCommandFile(relative)) continue;
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    out.push({ file: full, relative, kind: classifyCommand(relative, content) });
    seen.add(full);
  }
}
