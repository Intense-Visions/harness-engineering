import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import { checkNodeVersion as checkNode } from '../utils/node-version';
import { ExitCode } from '../utils/errors';
import { INTEGRATION_REGISTRY } from '../integrations/registry';
import { readMcpConfig, readIntegrationsConfig } from '../integrations/config';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'info' | 'warn';
  message: string;
  fix?: string;
}

export interface DoctorResult {
  checks: CheckResult[];
  allPassed: boolean;
}

function checkNodeVersion(): CheckResult {
  const result = checkNode();
  if (result.satisfies) {
    return {
      name: 'node',
      status: 'pass',
      message: `Node.js ${result.current} (requires ${result.required})`,
    };
  }
  return {
    name: 'node',
    status: 'fail',
    message: `Node.js ${result.current} (requires ${result.required})`,
    fix: 'Install Node.js >= 22: https://nodejs.org/',
  };
}

function countCommandFiles(dir: string, ext: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function checkSlashCommands(): CheckResult[] {
  const platforms: Array<{ name: string; dir: string; ext: string; client: string }> = [
    {
      name: 'Claude Code',
      dir: path.join(os.homedir(), '.claude', 'commands', 'harness'),
      ext: '.md',
      client: 'claude-code',
    },
    {
      name: 'Gemini CLI',
      dir: path.join(os.homedir(), '.gemini', 'commands', 'harness'),
      ext: '.toml',
      client: 'gemini-cli',
    },
  ];

  return platforms.map(({ name, dir, ext, client }) => {
    const count = countCommandFiles(dir, ext);
    if (count > 0) {
      return {
        name: `slash-commands-${client}`,
        status: 'pass' as const,
        message: `Slash commands installed -> ${dir} (${count} commands)`,
      };
    }
    return {
      name: `slash-commands-${client}`,
      status: 'fail' as const,
      message: `No slash commands found for ${name}`,
      fix: 'Run: harness setup',
    };
  });
}

function checkMcpConfig(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Claude Code: check cwd/.mcp.json
  const claudeConfig = readMcpConfig(path.join(cwd, '.mcp.json'));
  if (claudeConfig.mcpServers?.['harness']) {
    results.push({
      name: 'mcp-claude',
      status: 'pass',
      message: 'MCP configured for Claude Code',
    });
  } else {
    results.push({
      name: 'mcp-claude',
      status: 'fail',
      message: 'MCP not configured for Claude Code',
      fix: 'Run: harness setup-mcp --client claude',
    });
  }

  // Gemini CLI: check cwd/.gemini/settings.json (where setup-mcp writes it)
  // Only check if .gemini directory exists — skip for projects not using Gemini CLI
  const geminiDir = path.join(cwd, '.gemini');
  if (fs.existsSync(geminiDir)) {
    const geminiConfig = readMcpConfig(path.join(geminiDir, 'settings.json'));
    if (geminiConfig.mcpServers?.['harness']) {
      results.push({
        name: 'mcp-gemini',
        status: 'pass',
        message: 'MCP configured for Gemini CLI',
      });
    } else {
      results.push({
        name: 'mcp-gemini',
        status: 'fail',
        message: 'MCP not configured for Gemini CLI',
        fix: 'Run: harness setup-mcp --client gemini',
      });
    }
  }

  return results;
}

interface McpPresence {
  mcpConfig: ReturnType<typeof readMcpConfig>;
  geminiConfig: ReturnType<typeof readMcpConfig> | null;
  hasGemini: boolean;
}

function loadMcpPresence(cwd: string): McpPresence {
  const mcpPath = path.join(cwd, '.mcp.json');
  const geminiDir = path.join(cwd, '.gemini');
  const hasGemini = fs.existsSync(geminiDir);
  return {
    mcpConfig: readMcpConfig(mcpPath),
    geminiConfig: hasGemini ? readMcpConfig(path.join(geminiDir, 'settings.json')) : null,
    hasGemini,
  };
}

function checkTier0Presence(
  def: (typeof INTEGRATION_REGISTRY)[number],
  presence: McpPresence
): CheckResult {
  const inClaude = !!presence.mcpConfig.mcpServers?.[def.name];
  const inGemini = !!presence.geminiConfig?.mcpServers?.[def.name];

  if (!inClaude) {
    return {
      name: `integration-${def.name}`,
      status: 'fail',
      message: `${def.displayName} not configured. Run \`harness setup\` to fix.`,
      fix: 'Run: harness setup',
    };
  }
  if (presence.hasGemini && !inGemini) {
    return {
      name: `integration-${def.name}`,
      status: 'warn',
      message: `${def.displayName} missing from Gemini CLI config. Run \`harness setup\` to fix.`,
      fix: 'Run: harness setup',
    };
  }
  return {
    name: `integration-${def.name}`,
    status: 'pass',
    message: `${def.displayName} configured`,
  };
}

function checkIntegrations(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];
  const presence = loadMcpPresence(cwd);
  const configPath = path.join(cwd, 'harness.config.json');
  const integrationsConfig = readIntegrationsConfig(configPath);

  // Tier 0: presence check — fail if not configured
  for (const def of INTEGRATION_REGISTRY.filter((d) => d.tier === 0)) {
    results.push(checkTier0Presence(def, presence));
  }

  // Tier 1: suggestions for non-enabled, non-dismissed integrations
  for (const def of INTEGRATION_REGISTRY.filter((d) => d.tier === 1)) {
    const enabled = integrationsConfig.enabled.includes(def.name);
    const dismissed = integrationsConfig.dismissed.includes(def.name);

    if (enabled && def.envVar && !process.env[def.envVar]) {
      results.push({
        name: `integration-${def.name}-env`,
        status: 'warn',
        message: `${def.displayName} enabled but ${def.envVar} not set.`,
        ...(def.installHint !== undefined && { fix: def.installHint }),
      });
    } else if (!enabled && !dismissed) {
      results.push({
        name: `integration-${def.name}`,
        status: 'info',
        message: `${def.displayName} enables ${def.description.toLowerCase()}. Run \`harness integrations add ${def.name}\`.`,
      });
    }
  }

  return results;
}

// --- Hermes Phase 3 / A7: doctor hardening checks ----------------------
//
// Four new check classes, all synchronous, all presence/shape only. Per
// spec D6, live HTTP probes are explicitly NOT in scope by default — the
// goal is "doctor runs anywhere, never blocks on a dead corporate proxy."
// Operators who want a probe will get a `--probe` flag in a follow-up.

interface IntegrationCredentialCheck {
  envVar: string;
  displayName: string;
  /** Expected prefix when set (light validity check). */
  prefix?: string;
  /** Minimum acceptable length (light validity check). */
  minLength?: number;
}

const LIVE_PING_CREDENTIALS: IntegrationCredentialCheck[] = [
  {
    envVar: 'ANTHROPIC_API_KEY',
    displayName: 'Anthropic API key',
    prefix: 'sk-ant-',
    minLength: 30,
  },
  { envVar: 'OPENAI_API_KEY', displayName: 'OpenAI API key', prefix: 'sk-', minLength: 20 },
  { envVar: 'GITHUB_TOKEN', displayName: 'GitHub token', minLength: 30 },
];

/**
 * Verify presence + shape of well-known integration credentials. Each is
 * `info` when absent (the operator may not use that integration), `pass`
 * when present and well-shaped, `warn` when present but shape is wrong
 * (likely a copy-paste error).
 */
export function checkLivePings(env: NodeJS.ProcessEnv = process.env): CheckResult[] {
  const results: CheckResult[] = [];
  for (const cred of LIVE_PING_CREDENTIALS) {
    const value = env[cred.envVar];
    if (!value) {
      results.push({
        name: `live-pings-${cred.envVar.toLowerCase()}`,
        status: 'info',
        message: `${cred.displayName} (${cred.envVar}) not set — skip if you do not use this integration`,
      });
      continue;
    }
    const tooShort = cred.minLength !== undefined && value.length < cred.minLength;
    const wrongPrefix = cred.prefix !== undefined && !value.startsWith(cred.prefix);
    if (tooShort || wrongPrefix) {
      const issue = wrongPrefix
        ? `expected prefix '${cred.prefix}'`
        : `length ${value.length} < ${cred.minLength}`;
      results.push({
        name: `live-pings-${cred.envVar.toLowerCase()}`,
        status: 'warn',
        message: `${cred.displayName} (${cred.envVar}) looks malformed: ${issue}`,
        fix: `Re-check the value for ${cred.envVar}`,
      });
    } else {
      results.push({
        name: `live-pings-${cred.envVar.toLowerCase()}`,
        status: 'pass',
        message: `${cred.displayName} (${cred.envVar}) present`,
      });
    }
  }
  return results;
}

interface HookEntry {
  relativePath: string;
  absolutePath: string;
}

function listHookFiles(cwd: string): HookEntry[] {
  const hooksDir = path.join(cwd, '.harness', 'hooks');
  if (!fs.existsSync(hooksDir)) return [];
  try {
    return fs
      .readdirSync(hooksDir)
      .filter((f) => !f.startsWith('.'))
      .map((f) => ({
        relativePath: path.join('.harness', 'hooks', f),
        absolutePath: path.join(hooksDir, f),
      }));
  } catch {
    return [];
  }
}

function validateJsonHook(entry: HookEntry, content: string): CheckResult {
  try {
    JSON.parse(content);
    return {
      name: `hook-validity-${entry.relativePath}`,
      status: 'pass',
      message: `Hook ${entry.relativePath} parses as JSON`,
    };
  } catch (err) {
    return {
      name: `hook-validity-${entry.relativePath}`,
      status: 'fail',
      message: `Hook ${entry.relativePath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      fix: `Edit ${entry.relativePath} and fix the JSON syntax`,
    };
  }
}

function validateShellHook(entry: HookEntry, content: string): CheckResult {
  if (content.length === 0) {
    return {
      name: `hook-validity-${entry.relativePath}`,
      status: 'fail',
      message: `Hook ${entry.relativePath} is empty`,
      fix: `Remove the empty file or add a script body`,
    };
  }
  const firstLine = content.split('\n', 1)[0] ?? '';
  if (!firstLine.startsWith('#!')) {
    return {
      name: `hook-validity-${entry.relativePath}`,
      status: 'warn',
      message: `Hook ${entry.relativePath} has no shebang — may not be executable`,
      fix: `Add a shebang (e.g., '#!/usr/bin/env bash')`,
    };
  }
  return {
    name: `hook-validity-${entry.relativePath}`,
    status: 'pass',
    message: `Hook ${entry.relativePath} OK`,
  };
}

function validateHookEntry(entry: HookEntry): CheckResult {
  let content: string;
  try {
    content = fs.readFileSync(entry.absolutePath, 'utf-8');
  } catch (err) {
    return {
      name: `hook-validity-${entry.relativePath}`,
      status: 'fail',
      message: `Cannot read ${entry.relativePath}: ${err instanceof Error ? err.message : String(err)}`,
      fix: `Check file permissions on ${entry.relativePath}`,
    };
  }
  return entry.relativePath.endsWith('.json')
    ? validateJsonHook(entry, content)
    : validateShellHook(entry, content);
}

/**
 * Validate hook scripts under `.harness/hooks/`. JSON hooks must parse,
 * shell/node scripts must be readable, and the directory's absence is
 * `info` (hooks are optional). One CheckResult per hook so a single bad
 * hook is individually addressable.
 */
export function checkHookValidity(cwd: string): CheckResult[] {
  const entries = listHookFiles(cwd);
  if (entries.length === 0) {
    return [
      {
        name: 'hook-validity',
        status: 'info',
        message: 'No hooks configured under .harness/hooks/ (optional)',
      },
    ];
  }
  return entries.map(validateHookEntry);
}

interface BaselineDefinition {
  relativePath: string;
  displayName: string;
  fix: string;
}

const BASELINE_FILES: BaselineDefinition[] = [
  {
    relativePath: '.harness/arch/baselines.json',
    displayName: 'architecture baselines',
    fix: 'Run: harness check-arch --update',
  },
  {
    relativePath: 'benchmark-baselines.json',
    displayName: 'benchmark baselines',
    fix: 'Run: harness check-perf --update',
  },
  {
    relativePath: 'coverage-baselines.json',
    displayName: 'coverage baselines',
    fix: 'Run: harness ci coverage --update',
  },
];

const BASELINE_WARN_DAYS = 30;
const BASELINE_FAIL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Surface stale baseline files. Architecture / benchmark / coverage
 * baselines older than `BASELINE_WARN_DAYS` warn; older than
 * `BASELINE_FAIL_DAYS` fail. Absent baseline files are `info` because
 * they are optional in some projects.
 */
export function checkBaselineFreshness(cwd: string, now: number = Date.now()): CheckResult[] {
  const results: CheckResult[] = [];
  for (const def of BASELINE_FILES) {
    const absolutePath = path.join(cwd, def.relativePath);
    if (!fs.existsSync(absolutePath)) {
      results.push({
        name: `baseline-freshness-${def.relativePath}`,
        status: 'info',
        message: `${def.displayName} (${def.relativePath}) not present — optional`,
      });
      continue;
    }
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(absolutePath).mtimeMs;
    } catch (err) {
      results.push({
        name: `baseline-freshness-${def.relativePath}`,
        status: 'fail',
        message: `Cannot stat ${def.relativePath}: ${err instanceof Error ? err.message : String(err)}`,
        fix: def.fix,
      });
      continue;
    }
    const ageDays = Math.floor((now - mtimeMs) / DAY_MS);
    if (ageDays >= BASELINE_FAIL_DAYS) {
      results.push({
        name: `baseline-freshness-${def.relativePath}`,
        status: 'fail',
        message: `${def.displayName} is ${ageDays}d old (>= ${BASELINE_FAIL_DAYS}d)`,
        fix: def.fix,
      });
    } else if (ageDays >= BASELINE_WARN_DAYS) {
      results.push({
        name: `baseline-freshness-${def.relativePath}`,
        status: 'warn',
        message: `${def.displayName} is ${ageDays}d old`,
        fix: def.fix,
      });
    } else {
      results.push({
        name: `baseline-freshness-${def.relativePath}`,
        status: 'pass',
        message: `${def.displayName} fresh (${ageDays}d old)`,
      });
    }
  }
  return results;
}

const SESSIONS_SAMPLE_SIZE = 5;

interface SessionDir {
  name: string;
  absolutePath: string;
  mtimeMs: number;
}

function listRecentSessions(cwd: string): SessionDir[] {
  const sessionsDir = path.join(cwd, '.harness', 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(sessionsDir);
  } catch {
    return [];
  }
  const dirs: SessionDir[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const absolutePath = path.join(sessionsDir, name);
    try {
      const stat = fs.statSync(absolutePath);
      if (!stat.isDirectory()) continue;
      dirs.push({ name, absolutePath, mtimeMs: stat.mtimeMs });
    } catch {
      continue;
    }
  }
  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return dirs.slice(0, SESSIONS_SAMPLE_SIZE);
}

interface SessionsScanResult {
  parsed: number;
  missing: number;
  corrupt: string[];
}

function scanSessionSummaries(sessions: SessionDir[]): SessionsScanResult {
  let parsed = 0;
  let missing = 0;
  const corrupt: string[] = [];
  for (const session of sessions) {
    const summaryPath = path.join(session.absolutePath, 'session-summary.json');
    if (!fs.existsSync(summaryPath)) {
      missing += 1;
      continue;
    }
    try {
      JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      parsed += 1;
    } catch {
      corrupt.push(session.name);
    }
  }
  return { parsed, missing, corrupt };
}

/**
 * Scan the N most-recent `.harness/sessions/<id>/` directories and try to
 * parse each `session-summary.json`. Missing summaries are tolerated
 * (early lifecycle); malformed JSON is the actual signal. Aggregates one
 * CheckResult (most operators just want "are my sessions OK?").
 */
export function checkSessionCorruption(cwd: string): CheckResult[] {
  const sessions = listRecentSessions(cwd);
  if (sessions.length === 0) {
    return [
      {
        name: 'session-corruption',
        status: 'info',
        message: 'No session archives under .harness/sessions/',
      },
    ];
  }
  const { parsed, missing, corrupt } = scanSessionSummaries(sessions);
  if (corrupt.length === 0) {
    return [
      {
        name: 'session-corruption',
        status: 'pass',
        message: `Sampled ${sessions.length} session(s): ${parsed} parsed, ${missing} without summary`,
      },
    ];
  }
  const allCorrupt = corrupt.length === sessions.length;
  return [
    {
      name: 'session-corruption',
      status: allCorrupt ? 'fail' : 'warn',
      message: allCorrupt
        ? `All ${corrupt.length} sampled session summaries failed to parse`
        : `${corrupt.length}/${sessions.length} session summaries malformed: ${corrupt.join(', ')}`,
      fix: 'Run: harness cleanup-sessions',
    },
  ];
}

export function runDoctor(cwd: string): DoctorResult {
  const checks: CheckResult[] = [];

  checks.push(checkNodeVersion());
  checks.push(...checkSlashCommands());
  checks.push(...checkMcpConfig(cwd));
  checks.push(...checkIntegrations(cwd));
  // Hermes Phase 3 / A7: hardened checks. Order chosen so credential
  // issues surface before filesystem checks (operators usually fix env
  // vars before they investigate a stale baseline).
  checks.push(...checkLivePings());
  checks.push(...checkHookValidity(cwd));
  checks.push(...checkBaselineFreshness(cwd));
  checks.push(...checkSessionCorruption(cwd));

  const allPassed = checks.every((c) => c.status !== 'fail');

  return { checks, allPassed };
}

function formatCheck(check: CheckResult): string {
  const icons: Record<CheckResult['status'], string> = {
    pass: chalk.green('✓'),
    fail: chalk.red('✗'),
    warn: chalk.yellow('!'),
    info: chalk.blue('ℹ'),
  };
  const icon = icons[check.status];
  let line = `  ${icon} ${check.message}`;
  if ((check.status === 'fail' || check.status === 'warn') && check.fix) {
    line += `\n    -> ${check.fix}`;
  }
  return line;
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description(
      'Check environment health: Node, slash commands, MCP, integrations, integration credentials, hooks, baselines, sessions'
    )
    .action((_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const useJson = globalOpts.json;

      const result = runDoctor(cwd);

      if (useJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('');
        console.log(`  ${chalk.bold('harness doctor')}`);
        console.log('');

        for (const check of result.checks) {
          console.log(formatCheck(check));
        }

        console.log('');
        const passed = result.checks.filter((c) => c.status === 'pass').length;
        const total = result.checks.length;
        console.log(`  ${passed}/${total} checks passed`);
        console.log('');
      }

      process.exit(result.allPassed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
