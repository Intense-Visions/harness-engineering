/**
 * Multi-agent session-retrospect wiring.
 *
 * The Claude Code session-retrospect hook is installed by the profile path
 * (init.ts → .claude/settings.json). This module wires the SAME opt-in
 * end-of-session retrospection trigger into the OTHER agents the harness
 * supports — Gemini CLI, Codex CLI, and Cursor — by writing each agent's native
 * session-end trigger into that agent's own config file, in its own format.
 *
 * Detection mirrors the harness client registry (setup/clients.ts): an agent is
 * wired only when its project-level detect dir is present (the same dir the MCP
 * setup writes into), so a Claude-only project is untouched. All triggers point
 * at the per-agent entry scripts shipped into `.harness/hooks/` as
 * session-retrospect support files, and all of them are runtime no-ops unless
 * HARNESS_SESSION_RETROSPECTION is set — exactly like the Claude hook.
 *
 * Idempotency: re-running never duplicates an entry, and unrelated user config
 * (other hooks, other events, other TOML keys) is always preserved.
 *
 * Per-agent event + payload seams (verified against each tool's current docs):
 *  - Gemini CLI: `SessionEnd` event in `.gemini/settings.json` `hooks` object;
 *    session id on stdin as `session_id`.
 *  - Codex CLI: no session-end lifecycle hook exists, so the `notify` key in
 *    `.codex/config.toml` (fires on agent-turn-complete, payload delivered as a
 *    JSON argv arg, session id = `thread-id`). notify holds a single program, so
 *    an existing non-harness notify is reported as a conflict and NOT clobbered.
 *  - Cursor: `stop` + `sessionEnd` events in `.cursor/hooks.json`; session id on
 *    stdin as `session_id` (sessionEnd) or `conversation_id` (stop). sessionEnd
 *    is IDE-only and the local cursor-agent CLI may not emit these yet — wired
 *    anyway so it works in the IDE agent and the moment the CLI starts emitting.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Stable identifier written into JSON hook entries so re-runs recognize ours. */
export const RETROSPECT_HOOK_ENTRY_NAME = 'harness-session-retrospect';

export type AgentRetrospectStatus = 'installed' | 'skipped' | 'conflict';

export interface AgentRetrospectResult {
  /** Human-readable agent label, e.g. "Gemini CLI". */
  agent: string;
  status: AgentRetrospectStatus;
  /** Project-relative config file written (or that would be written). */
  configPath: string;
  /** Present when status is 'conflict' — why the agent was left untouched. */
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic JSON config shapes
type JsonObject = Record<string, any>;

function readJsonObject(filePath: string): JsonObject {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : {};
  } catch {
    // Malformed config — treat as absent rather than crash the installer. The
    // caller's atomic write below replaces it with a valid document.
    return {};
  }
}

function writeJsonObject(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

/**
 * Whether a Gemini/Cursor-style event array already contains our entry — by the
 * stable name marker or by an identical command string.
 */
function hasRetrospectEntry(entries: JsonObject[], command: string): boolean {
  return entries.some((entry) => {
    if (entry?.name === RETROSPECT_HOOK_ENTRY_NAME) return true;
    if (entry?.command === command) return true;
    const inner = Array.isArray(entry?.hooks) ? (entry.hooks as JsonObject[]) : [];
    return inner.some((h) => h?.name === RETROSPECT_HOOK_ENTRY_NAME || h?.command === command);
  });
}

/**
 * Wire the SessionEnd trigger into `.gemini/settings.json`. Preserves all other
 * settings and all other hook events; idempotent by name/command.
 */
export function writeGeminiSessionEndHook(
  settingsPath: string,
  command: string
): AgentRetrospectStatus {
  const settings = readJsonObject(settingsPath);
  if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {};
  if (!Array.isArray(settings.hooks.SessionEnd)) settings.hooks.SessionEnd = [];

  const sessionEnd = settings.hooks.SessionEnd as JsonObject[];
  if (hasRetrospectEntry(sessionEnd, command)) {
    return 'skipped';
  }

  // No matcher: fire on every SessionEnd reason (exit / clear / logout / …). The
  // shared core dedupes per session, so multiple reasons are harmless.
  sessionEnd.push({
    hooks: [{ type: 'command', command, name: RETROSPECT_HOOK_ENTRY_NAME }],
  });
  writeJsonObject(settingsPath, settings);
  return 'installed';
}

/**
 * Wire the `stop` + `sessionEnd` triggers into `.cursor/hooks.json`. Preserves
 * the existing version and any other events/entries; idempotent by command.
 */
export function writeCursorRetrospectHooks(
  hooksPath: string,
  command: string
): AgentRetrospectStatus {
  const config = readJsonObject(hooksPath);
  if (typeof config.version !== 'number') config.version = 1;
  if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {};

  let changed = false;
  for (const event of ['stop', 'sessionEnd'] as const) {
    if (!Array.isArray(config.hooks[event])) config.hooks[event] = [];
    const entries = config.hooks[event] as JsonObject[];
    if (!hasRetrospectEntry(entries, command)) {
      entries.push({ command });
      changed = true;
    }
  }

  if (!changed) return 'skipped';
  writeJsonObject(hooksPath, config);
  return 'installed';
}

/**
 * Wire the `notify` trigger into `.codex/config.toml`. Codex `notify` holds a
 * SINGLE program, so we never clobber a user's existing non-harness notify:
 *  - absent            → insert ours and return 'installed'
 *  - already ours      → 'skipped' (idempotent)
 *  - a different notify → 'conflict' (left untouched; caller warns)
 *
 * The notify entry is a top-level TOML key, so it must be inserted BEFORE the
 * first table header (otherwise it would be parsed into that table).
 */
export function writeCodexNotifyHook(
  configPath: string,
  scriptPath: string
): AgentRetrospectStatus {
  const scriptMarker = 'session-retrospect-codex.js';
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';

  const notifyLineRe = /^[ \t]*notify[ \t]*=.*$/m;
  const match = existing.match(notifyLineRe);
  if (match) {
    return match[0].includes(scriptMarker) ? 'skipped' : 'conflict';
  }

  const notifyLine = `notify = ["node", ${JSON.stringify(scriptPath)}]`;

  let updated: string;
  if (existing.trim() === '') {
    updated = notifyLine + '\n';
  } else {
    const lines = existing.split('\n');
    const firstTableIdx = lines.findIndex((l) => /^[ \t]*\[/.test(l));
    if (firstTableIdx === -1) {
      // No tables: append as another top-level key.
      const sep = existing.endsWith('\n') ? '' : '\n';
      updated = existing + sep + notifyLine + '\n';
    } else {
      // Insert before the first table, with a blank-line separator.
      lines.splice(firstTableIdx, 0, notifyLine, '');
      updated = lines.join('\n');
    }
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = configPath + '.tmp';
  fs.writeFileSync(tmp, updated);
  fs.renameSync(tmp, configPath);
  return 'installed';
}

/**
 * Install the session-retrospect trigger into every supported non-Claude agent
 * that is present in the project. `buildCommand` produces the same worktree-safe
 * shell command the Claude hooks use (injected to avoid a circular import with
 * the init command).
 */
export function installAgentRetrospectHooks(options: {
  projectDir: string;
  buildCommand: (hookName: string) => string;
}): AgentRetrospectResult[] {
  const { projectDir, buildCommand } = options;
  const results: AgentRetrospectResult[] = [];

  // Gemini CLI — .gemini present.
  if (fs.existsSync(path.join(projectDir, '.gemini'))) {
    const configPath = path.join(projectDir, '.gemini', 'settings.json');
    const status = writeGeminiSessionEndHook(configPath, buildCommand('session-retrospect-gemini'));
    results.push({ agent: 'Gemini CLI', status, configPath });
  }

  // Codex CLI — .codex present.
  if (fs.existsSync(path.join(projectDir, '.codex'))) {
    const configPath = path.join(projectDir, '.codex', 'config.toml');
    // notify cannot run a shell snippet cleanly, so it points at an absolute
    // path to the project's copied entry script.
    const scriptPath = path.join(projectDir, '.harness', 'hooks', 'session-retrospect-codex.js');
    const status = writeCodexNotifyHook(configPath, scriptPath);
    const codexResult: AgentRetrospectResult = { agent: 'Codex CLI', status, configPath };
    if (status === 'conflict') {
      codexResult.reason = 'existing non-harness `notify` in .codex/config.toml left untouched';
    }
    results.push(codexResult);
  }

  // Cursor — .cursor present.
  if (fs.existsSync(path.join(projectDir, '.cursor'))) {
    const configPath = path.join(projectDir, '.cursor', 'hooks.json');
    const status = writeCursorRetrospectHooks(
      configPath,
      buildCommand('session-retrospect-cursor')
    );
    results.push({ agent: 'Cursor', status, configPath });
  }

  return results;
}
