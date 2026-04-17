import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe } from './shared';

/** Settings files that can contain an `mcpServers` section. */
const MCP_SETTINGS_FILES = ['.mcp.json', '.gemini/settings.json', '.codex/settings.json'];

/**
 * Run MCP server configuration rules:
 *   HARNESS-AC-040 mcp-server-shape  (missing required `command`, unknown keys)
 *   HARNESS-AC-041 mcp-args-array    (`args` is not an array of strings)
 */
export function runMcpRules(cwd: string): AgentConfigFinding[] {
  const findings: AgentConfigFinding[] = [];
  for (const rel of MCP_SETTINGS_FILES) {
    const servers = loadMcpServers(cwd, rel);
    if (!servers) continue;
    for (const [name, raw] of Object.entries(servers)) {
      findings.push(...checkMcpServer(rel, name, raw));
    }
  }
  return findings;
}

function loadMcpServers(cwd: string, rel: string): Record<string, unknown> | null {
  const abs = join(cwd, rel);
  if (!existsSync(abs)) return null;
  const content = readTextSafe(abs);
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null; // Handled by settings-json rule.
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const servers = (parsed as Record<string, unknown>).mcpServers;
  if (!servers || typeof servers !== 'object') return null;
  return servers as Record<string, unknown>;
}

function checkMcpServer(rel: string, name: string, raw: unknown): AgentConfigFinding[] {
  if (!raw || typeof raw !== 'object') {
    return [
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-040',
        severity: 'error',
        message: `MCP server '${name}' is not an object`,
        suggestion: 'Each MCP server entry must be an object with at least a `command` field',
      }),
    ];
  }
  const out: AgentConfigFinding[] = [];
  const entry = raw as Record<string, unknown>;
  if (typeof entry.command !== 'string' && typeof entry.url !== 'string') {
    out.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-040',
        severity: 'error',
        message: `MCP server '${name}' is missing a \`command\` or \`url\``,
        suggestion: 'Add `command` (stdio server) or `url` (HTTP server)',
      })
    );
  }
  if (entry.args !== undefined) {
    const argsOk = Array.isArray(entry.args) && entry.args.every((a) => typeof a === 'string');
    if (!argsOk) {
      out.push(
        makeFinding({
          file: rel,
          ruleId: 'HARNESS-AC-041',
          severity: 'error',
          message: `MCP server '${name}' has \`args\` that is not an array of strings`,
          suggestion: 'Set `args` to an array of string arguments',
        })
      );
    }
  }
  return out;
}
