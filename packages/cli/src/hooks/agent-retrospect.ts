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

/**
 * Read a JSON config file, distinguishing three outcomes so a caller never
 * silently destroys a user's existing config:
 *  - `absent`      — the file does not exist (or is empty); safe to create.
 *  - `parsed`      — a valid JSON object; merge into it and preserve its keys.
 *  - `unparseable` — the file exists with content that is not a JSON object
 *                    (malformed JSON, JSONC/comments, a top-level array, …).
 *
 * A previous version returned `{}` for the `unparseable` case, which caused the
 * caller's write to OVERWRITE the user's whole config with only the harness
 * hook — silent data loss that violated this module's "unrelated user config is
 * always preserved" contract. We now surface it so the writers report a
 * `conflict` and leave the file untouched, mirroring how `hooks init` refuses to
 * clobber a malformed `.claude/settings.json`.
 */
type JsonReadResult =
  | { kind: 'absent' }
  | { kind: 'parsed'; value: JsonObject }
  | { kind: 'unparseable' };

function readJsonConfig(filePath: string): JsonReadResult {
  if (!fs.existsSync(filePath)) return { kind: 'absent' };
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    // Unreadable (permissions, race) — do not clobber.
    return { kind: 'unparseable' };
  }
  if (raw.trim() === '') return { kind: 'absent' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { kind: 'parsed', value: parsed as JsonObject };
    }
    // Valid JSON but not an object (array / string / number) — not a config
    // shape we can safely merge into, so preserve it rather than overwrite.
    return { kind: 'unparseable' };
  } catch {
    return { kind: 'unparseable' };
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
 * settings and all other hook events; idempotent by name/command. An existing
 * file that is not a JSON object is reported as a `conflict` and left untouched
 * rather than overwritten.
 */
export function writeGeminiSessionEndHook(
  settingsPath: string,
  command: string
): AgentRetrospectStatus {
  const read = readJsonConfig(settingsPath);
  if (read.kind === 'unparseable') return 'conflict';
  const settings: JsonObject = read.kind === 'parsed' ? read.value : {};
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
 * the existing version and any other events/entries; idempotent by command. An
 * existing file that is not a JSON object is reported as a `conflict` and left
 * untouched rather than overwritten.
 */
export function writeCursorRetrospectHooks(
  hooksPath: string,
  command: string
): AgentRetrospectStatus {
  const read = readJsonConfig(hooksPath);
  if (read.kind === 'unparseable') return 'conflict';
  const config: JsonObject = read.kind === 'parsed' ? read.value : {};
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
 * Wire the `notify` trigger into `.codex/config.toml`. Codex `notify` is a raw
 * argv array with no shell and a subprocess CWD that is not guaranteed to be the
 * repo root, so — unlike the other agents — it cannot use a `git rev-parse`
 * shell command. We route it through the PATH-resolvable command
 * `["harness", "hooks", "run", "session-retrospect-codex"]`, which carries no
 * absolute path and is therefore byte-identical on every machine (committable).
 *
 * Codex `notify` holds a SINGLE program, so we never clobber a user's existing
 * non-harness notify. An existing `notify` line is classified into three cases:
 *  - New form — already the PATH-resolvable line (the bare `session-retrospect-codex`
 *    marker, no `.js`) → 'skipped' (idempotent no-op).
 *  - Old harness form — references the copied `session-retrospect-codex.js`
 *    entry script (the absolute-path line only the OLD harness generator ever
 *    wrote) → rewritten IN PLACE to the new form → 'installed' (an upgrade).
 *  - Foreign — any other notify → 'conflict' (left untouched; caller warns).
 * Absent → insert ours → 'installed'.
 *
 * This no longer takes a `scriptPath`: the emitted line is a fixed, PATH-resolvable
 * command with no filesystem path at all.
 *
 * The notify entry is a top-level TOML key, so it must precede the first table
 * header (otherwise it would be parsed into that table). We prepend it at the
 * very top of the file: a top-level key on line 1 is always valid TOML — it
 * comes before every table AND is never spliced inside a multi-line array. The
 * previous "find the first line starting with `[` and insert before it"
 * heuristic could mistake an array-element line (e.g. `  [1, 2],` inside a
 * top-level array literal) for a table header and corrupt the file.
 */
export function writeCodexNotifyHook(configPath: string): AgentRetrospectStatus {
  // Only the OLD harness generator ever wrote a notify line referencing the
  // copied `.js` entry script, so its presence proves harness ownership.
  const scriptMarker = 'session-retrospect-codex.js';
  const notifyLine = 'notify = ["harness", "hooks", "run", "session-retrospect-codex"]';
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';

  const notifyLineRe = /^[ \t]*notify[ \t]*=.*$/m;
  const match = existing.match(notifyLineRe);
  if (match) {
    const line = match[0];
    // Old harness form (absolute-path `.js`) → upgrade in place.
    if (line.includes(scriptMarker)) {
      const updatedInPlace = existing.replace(notifyLineRe, notifyLine);
      const tmpPath = configPath + '.tmp';
      fs.writeFileSync(tmpPath, updatedInPlace);
      fs.renameSync(tmpPath, configPath);
      return 'installed';
    }
    // New form (bare `session-retrospect-codex` marker, no `.js`) → idempotent skip.
    if (line.includes('session-retrospect-codex')) return 'skipped';
    // Anything else is a foreign notify → conflict, untouched.
    return 'conflict';
  }

  let updated: string;
  if (existing.trim() === '') {
    updated = notifyLine + '\n';
  } else {
    // Prepend as a top-level key. A blank line keeps it visually separate from
    // whatever the user already had at the top of the file.
    updated = notifyLine + '\n\n' + existing;
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
    const geminiResult: AgentRetrospectResult = { agent: 'Gemini CLI', status, configPath };
    if (status === 'conflict') {
      geminiResult.reason = 'unparseable .gemini/settings.json left untouched';
    }
    results.push(geminiResult);
  }

  // Codex CLI — .codex present.
  if (fs.existsSync(path.join(projectDir, '.codex'))) {
    const configPath = path.join(projectDir, '.codex', 'config.toml');
    // notify cannot run a shell snippet cleanly, so it uses the PATH-resolvable
    // `harness hooks run session-retrospect-codex` command instead of an
    // absolute path — machine-independent and committable.
    const status = writeCodexNotifyHook(configPath);
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
    const cursorResult: AgentRetrospectResult = { agent: 'Cursor', status, configPath };
    if (status === 'conflict') {
      cursorResult.reason = 'unparseable .cursor/hooks.json left untouched';
    }
    results.push(cursorResult);
  }

  return results;
}
