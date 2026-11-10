// packages/cli/src/commands/mcp-guard.ts
// Hermes Phase 2 — Pre-launch OSV malware guard for MCP/npx packages.
//
// Reads `.mcp.json`-style configuration, extracts each `npx`-launched
// package + pinned version, and queries OSV.dev for `MAL-*` advisories.
// Exits non-zero when any malicious match is found so it can be used as
// a `pre-mcp-launch` hook from host plugin manifests.

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createOsvClient, type OsvAdvisory, type OsvCheckResult } from '@harness-engineering/core';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface McpServerEntry {
  command?: string;
  args?: string[];
  [key: string]: unknown;
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

interface PackageDescriptor {
  serverName: string;
  npmName: string;
  version?: string;
}

/**
 * Extract npm package descriptors from an `.mcp.json`-shaped object.
 *
 * Recognizes the typosquatting-prone `npx -y <pkg>@<version>` form and
 * the literal `npx <pkg>` form. Local commands (`harness`, absolute paths,
 * relative paths) are skipped since they're not subject to the OSV query.
 */
export function extractNpmPackages(config: McpConfig): PackageDescriptor[] {
  const out: PackageDescriptor[] = [];
  for (const [name, entry] of Object.entries(config.mcpServers ?? {})) {
    const descriptor = describeServer(name, entry);
    if (descriptor) out.push(descriptor);
  }
  return out;
}

function describeServer(name: string, entry: McpServerEntry | undefined): PackageDescriptor | null {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.command !== 'npx') return null;
  const spec = (entry.args ?? []).find((a) => typeof a === 'string' && !a.startsWith('-'));
  if (!spec) return null;
  const parsed = parseNpmSpec(spec);
  return parsed ? { serverName: name, ...parsed } : null;
}

/**
 * Parse `<name>@<version>` / `<name>` / `@scope/name@version` / `@scope/name`.
 */
export function parseNpmSpec(spec: string): { npmName: string; version?: string } | null {
  if (!spec) return null;
  const scoped = spec.startsWith('@');
  const lastAt = spec.lastIndexOf('@');
  if (!scoped) {
    if (lastAt > 0) {
      return { npmName: spec.slice(0, lastAt), version: spec.slice(lastAt + 1) };
    }
    return { npmName: spec };
  }
  // scoped: '@scope/name' or '@scope/name@version'
  const firstAtAfterScope = spec.indexOf('@', 1);
  if (firstAtAfterScope > 0) {
    return {
      npmName: spec.slice(0, firstAtAfterScope),
      version: spec.slice(firstAtAfterScope + 1),
    };
  }
  return { npmName: spec };
}

interface MaintenanceLikeLogger {
  warn: (m: string, ctx?: Record<string, unknown>) => void;
}

export interface GuardCheckOptions {
  cwd?: string;
  configPath?: string;
  strict?: boolean;
  json?: boolean;
  fetchFn?: typeof fetch;
}

export interface GuardCheckResult {
  ok: boolean;
  checked: Array<{
    serverName: string;
    npmName: string;
    version?: string;
    source: OsvCheckResult['source'];
    malicious: OsvAdvisory[];
    other: OsvAdvisory[];
  }>;
  /**
   * Set when `.mcp.json` exists but could not be verified at all (unparseable
   * JSON, or a top level that is not an object). An abstention is NOT a clean
   * pass: `ok` is `false` and `checked` is empty because nothing was examined.
   * Absent when the file is missing (nothing to check) or was parsed.
   */
  abstained?: { reason: string };
}

/**
 * Programmatic entry point behind `harness mcp-guard check`.
 *
 * A missing `.mcp.json` is a legitimate "nothing to check" (`ok: true`). A
 * present-but-unreadable one is an abstention (`ok: false`, `abstained` set):
 * the guard verified nothing and must not report that as clean (#2074).
 */
export async function runMcpGuardCheck(options: GuardCheckOptions = {}): Promise<GuardCheckResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? path.join(cwd, '.mcp.json');

  if (!fs.existsSync(configPath)) {
    return { ok: true, checked: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    return abstain(`${configPath} exists but could not be parsed (${describeParseError(err)})`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return abstain(`${configPath} exists but its top level is not a JSON object`);
  }
  const config = parsed as McpConfig;

  const pkgs = extractNpmPackages(config);
  const cacheDir = path.join(cwd, '.harness', 'cache', 'osv');
  const warnLogger: MaintenanceLikeLogger = {
    warn: (m, ctx) => logger.warn(ctx ? `${m} ${JSON.stringify(ctx)}` : m),
  };
  const fetchOpts: Parameters<typeof createOsvClient>[0] = {
    cacheDir,
    strict: options.strict ?? false,
    logger: warnLogger,
  };
  if (options.fetchFn !== undefined) {
    fetchOpts.fetchFn = options.fetchFn;
  }
  const client = createOsvClient(fetchOpts);

  const checked: GuardCheckResult['checked'] = [];
  let ok = true;
  for (const pkg of pkgs) {
    const result = await client.check({
      ecosystem: 'npm',
      name: pkg.npmName,
      ...(pkg.version !== undefined ? { version: pkg.version } : {}),
    });
    const entry: GuardCheckResult['checked'][number] = {
      serverName: pkg.serverName,
      npmName: pkg.npmName,
      source: result.source,
      malicious: result.malicious,
      other: result.other,
    };
    if (pkg.version !== undefined) entry.version = pkg.version;
    checked.push(entry);
    if (result.malicious.length > 0) ok = false;
  }
  return { ok, checked };
}

/**
 * Describe a JSON.parse failure WITHOUT echoing the input. V8 messages quote a
 * snippet of the source around the error, and `.mcp.json` `env` blocks hold
 * secrets, so only the error name and a numeric location are kept.
 */
function describeParseError(err: unknown): string {
  const name = err instanceof Error ? err.name : 'Error';
  const message = err instanceof Error ? err.message : '';
  const lineCol = /line (\d+) column (\d+)/.exec(message);
  if (lineCol) return `${name} at line ${lineCol[1]} column ${lineCol[2]}`;
  const position = /position (\d+)/.exec(message);
  if (position) return `${name} at position ${position[1]}`;
  return name;
}

function abstain(reason: string): GuardCheckResult {
  return { ok: false, checked: [], abstained: { reason } };
}

/**
 * Map a guard result to the process exit code.
 *
 * - malicious package found → 2 (block), regardless of `--strict`.
 * - abstained (unparseable `.mcp.json`) → fail-open `0` by default, matching
 *   the guard's documented fail-open posture; `--strict` fails closed with
 *   `ExitCode.ZERO_DENOMINATOR` (3) — "examined nothing", not "clean".
 * - otherwise → 0.
 */
export function guardExitCode(result: GuardCheckResult, strict: boolean): number {
  if (result.abstained) return strict ? ExitCode.ZERO_DENOMINATOR : ExitCode.SUCCESS;
  return result.ok ? ExitCode.SUCCESS : 2;
}

function formatHuman(result: GuardCheckResult): void {
  if (result.abstained) {
    console.error(chalk.yellow(`ABSTAINED: ${result.abstained.reason} — nothing was verified.`));
    return;
  }
  if (result.checked.length === 0) {
    console.log(chalk.dim('No MCP servers launched via npx detected.'));
    return;
  }
  for (const entry of result.checked) {
    const id = entry.version ? `${entry.npmName}@${entry.version}` : entry.npmName;
    if (entry.malicious.length > 0) {
      console.log(chalk.red(`  ✗ ${entry.serverName}  ${id}`));
      for (const adv of entry.malicious) {
        console.log(chalk.red(`      ${adv.id} — ${adv.summary ?? '(no summary)'}`));
      }
    } else {
      const src = entry.source === 'cache' ? chalk.dim('(cache)') : '';
      console.log(chalk.green(`  ✓ ${entry.serverName}  ${id}`) + ` ${src}`);
    }
    if (entry.other.length > 0) {
      console.log(chalk.yellow(`      ${entry.other.length} non-malicious advisory(ies)`));
    }
  }
}

export function createMcpGuardCommand(): Command {
  const command = new Command('mcp-guard')
    .description('Pre-launch OSV malware guard for MCP/npx packages')
    .addHelpText(
      'after',
      '\nUse "harness mcp-guard check" before launching MCP servers to block known malicious packages.'
    );

  command
    .command('check')
    .description('Check every MCP/npx package in .mcp.json against OSV.dev advisories')
    .option('--strict', 'Fail closed on network errors (default: fail-open)', false)
    .option('--json', 'Emit machine-readable JSON', false)
    .option('--path <path>', 'Project root path', '.')
    .action(async (opts) => {
      const cwd = path.resolve(opts.path);
      const result = await runMcpGuardCheck({ cwd, strict: opts.strict, json: opts.json });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('Checking MCP servers against OSV.dev advisories...\n');
        formatHuman(result);
      }
      if (opts.json && result.abstained) {
        console.error(`ABSTAINED: ${result.abstained.reason} — nothing was verified.`);
      }
      process.exit(guardExitCode(result, opts.strict === true));
    });

  command
    .command('cache')
    .description('Manage the on-disk OSV advisory cache')
    .command('clear')
    .option('--path <path>', 'Project root path', '.')
    .action(async (opts) => {
      const cwd = path.resolve(opts.path);
      const cacheDir = path.join(cwd, '.harness', 'cache', 'osv');
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log(`Cleared ${cacheDir}`);
      } catch (err) {
        logger.error(`Failed to clear cache: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(ExitCode.ERROR);
      }
      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
