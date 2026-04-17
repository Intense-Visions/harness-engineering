import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe } from './shared';

/** Tool slugs agnix targets — keep in sync with https://agent-sh.github.io/agnix/docs/configuration */
const KNOWN_AGNIX_TOOLS = new Set([
  'claude-code',
  'cursor',
  'codex',
  'copilot',
  'github-copilot',
  'kiro',
  'windsurf',
]);

/**
 * Run .agnix.toml sanity rules:
 *   HARNESS-AC-090 agnix-toml-valid   (present but not parseable as TOML)
 *   HARNESS-AC-091 agnix-toml-target  (target/tools references an unknown slug)
 *
 * We only parse the subset of TOML needed for these checks so we avoid pulling in a full TOML
 * dependency. The parser accepts `key = value` and `tools = [...]` at the top level plus
 * simple string values; anything else is tolerated.
 */
export function runAgnixTomlRules(cwd: string): AgentConfigFinding[] {
  const rel = '.agnix.toml';
  const abs = join(cwd, rel);
  if (!existsSync(abs)) return [];
  const content = readTextSafe(abs);
  if (content === null) return [];

  const parsed = parseMiniToml(content);
  if (parsed.errors.length > 0) return [buildParseError(rel, parsed)];

  const findings: AgentConfigFinding[] = [];
  if (parsed.target && !KNOWN_AGNIX_TOOLS.has(parsed.target)) {
    findings.push(buildUnknownTargetFinding(rel, parsed.target));
  }
  for (const tool of parsed.tools) {
    if (!KNOWN_AGNIX_TOOLS.has(tool)) findings.push(buildUnknownToolFinding(rel, tool));
  }
  return findings;
}

function buildParseError(rel: string, parsed: MiniTomlResult): AgentConfigFinding {
  return makeFinding({
    file: rel,
    ruleId: 'HARNESS-AC-090',
    severity: 'error',
    message: `.agnix.toml parse error: ${parsed.errors[0]}`,
    suggestion: 'Run `agnix .` to see the detailed TOML error',
    ...(parsed.errorLine !== undefined && { line: parsed.errorLine }),
  });
}

function buildUnknownTargetFinding(rel: string, target: string): AgentConfigFinding {
  return makeFinding({
    file: rel,
    ruleId: 'HARNESS-AC-091',
    severity: 'warning',
    message: `.agnix.toml target '${target}' is not a known agnix tool slug`,
    suggestion: `Use one of: ${Array.from(KNOWN_AGNIX_TOOLS).join(', ')}`,
  });
}

function buildUnknownToolFinding(rel: string, tool: string): AgentConfigFinding {
  return makeFinding({
    file: rel,
    ruleId: 'HARNESS-AC-091',
    severity: 'warning',
    message: `.agnix.toml tools entry '${tool}' is not a known agnix tool slug`,
    suggestion: `Use one of: ${Array.from(KNOWN_AGNIX_TOOLS).join(', ')}`,
  });
}

interface MiniTomlResult {
  target?: string;
  tools: string[];
  errors: string[];
  errorLine?: number;
}

function parseMiniToml(content: string): MiniTomlResult {
  const result: MiniTomlResult = { tools: [], errors: [] };
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('[')) continue; // Table headers are fine.

    const eq = line.indexOf('=');
    if (eq <= 0) {
      result.errors.push(`unparsable line: '${raw}'`);
      result.errorLine = i + 1;
      return result;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'target') {
      result.target = stripTomlString(value);
    } else if (key === 'tools') {
      result.tools = parseStringArray(value);
    }
  }
  return result;
}

function stripTomlString(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseStringArray(value: string): string[] {
  const match = /^\[(.*)\]$/s.exec(value);
  if (!match) return [];
  return match[1]!
    .split(',')
    .map((s) => stripTomlString(s.trim()))
    .filter(Boolean);
}
