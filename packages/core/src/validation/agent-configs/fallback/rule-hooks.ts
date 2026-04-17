import { existsSync } from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe } from './shared';

/** Files that can contain hook definitions. */
const SETTINGS_PATHS = ['.claude/settings.json', '.gemini/settings.json', '.codex/settings.json'];

/** Events recognized by Claude Code and Gemini CLI hook systems. */
const KNOWN_HOOK_EVENTS = new Set([
  'Stop',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'PreCompact',
  'SessionStart',
  'SessionEnd',
  'Notification',
  'SubagentStop',
]);

interface HookEntry {
  event?: string;
  matcher?: string;
  command?: string;
  hooks?: unknown;
}

/**
 * Run hook-wiring rules:
 *   HARNESS-AC-020 hook-command-exists  (referenced script missing on disk)
 *   HARNESS-AC-021 hook-event-valid     (unknown event name)
 *   HARNESS-AC-022 hook-matcher-regex   (malformed matcher regex)
 */
export function runHookRules(cwd: string): AgentConfigFinding[] {
  const findings: AgentConfigFinding[] = [];

  for (const rel of SETTINGS_PATHS) {
    const abs = join(cwd, rel);
    if (!existsSync(abs)) continue;

    const content = readTextSafe(abs);
    if (content === null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Handled by rule-settings-json — skip here to avoid double reporting.
      continue;
    }

    const hooks = extractHooksArray(parsed);
    for (const entry of hooks) {
      inspectHookEntry(cwd, rel, entry, findings);
    }
  }
  return findings;
}

function extractHooksArray(parsed: unknown): HookEntry[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const hooks = (parsed as Record<string, unknown>).hooks;
  if (Array.isArray(hooks)) {
    return hooks.filter((h): h is HookEntry => h !== null && typeof h === 'object');
  }
  if (hooks && typeof hooks === 'object') {
    return expandEventMap(hooks as Record<string, unknown>);
  }
  return [];
}

function expandEventMap(eventMap: Record<string, unknown>): HookEntry[] {
  const result: HookEntry[] = [];
  for (const [event, value] of Object.entries(eventMap)) {
    if (!Array.isArray(value)) continue;
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      result.push(...expandHookGroup(raw as HookEntry, event));
    }
  }
  return result;
}

function expandHookGroup(group: HookEntry, event: string): HookEntry[] {
  const nested = Array.isArray(group.hooks) ? group.hooks : [];
  if (nested.length === 0) return [{ ...group, event }];
  const out: HookEntry[] = [];
  for (const inner of nested) {
    if (!inner || typeof inner !== 'object') continue;
    const merged: HookEntry = { ...(inner as HookEntry), event };
    if (group.matcher !== undefined) merged.matcher = group.matcher;
    out.push(merged);
  }
  return out;
}

function inspectHookEntry(
  cwd: string,
  rel: string,
  entry: HookEntry,
  findings: AgentConfigFinding[]
): void {
  if (entry.event && !KNOWN_HOOK_EVENTS.has(entry.event)) {
    findings.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-021',
        severity: 'warning',
        message: `Unknown hook event '${entry.event}' — will never fire`,
        suggestion: `Use one of: ${Array.from(KNOWN_HOOK_EVENTS).slice(0, 5).join(', ')}, ...`,
      })
    );
  }

  if (entry.matcher && !isValidRegex(entry.matcher)) {
    findings.push(
      makeFinding({
        file: rel,
        ruleId: 'HARNESS-AC-022',
        severity: 'error',
        message: `Hook matcher '${entry.matcher}' is not a valid regex`,
        suggestion: 'Escape special characters or quote the matcher',
      })
    );
  }

  if (typeof entry.command === 'string' && entry.command.trim()) {
    const cmdPath = extractCommandPath(entry.command);
    if (cmdPath && !commandPathExists(cwd, cmdPath)) {
      findings.push(
        makeFinding({
          file: rel,
          ruleId: 'HARNESS-AC-020',
          severity: 'error',
          message: `Hook command '${cmdPath}' does not exist on disk`,
          suggestion: 'Fix the path or run `harness generate hooks` to regenerate the hook script',
        })
      );
    }
  }
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Pull the script path out of a hook `command` string ("node hooks/foo.js arg1" → "hooks/foo.js"). */
function extractCommandPath(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  if (tokens.length === 0) return null;
  if (/[/\\]/.test(tokens[0]!)) return tokens[0]!;
  if (tokens.length > 1 && /[/\\]/.test(tokens[1]!)) return tokens[1]!;
  return null;
}

function commandPathExists(cwd: string, cmdPath: string): boolean {
  const abs = isAbsolute(cmdPath) ? cmdPath : resolve(cwd, cmdPath);
  return existsSync(abs);
}
