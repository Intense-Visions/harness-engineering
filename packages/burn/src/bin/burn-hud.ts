/**
 * harness-burn-hud — the hot-path binary.
 *
 * Three of these four subcommands run on a latency budget the main `harness`
 * CLI cannot meet: `line` renders on every statusline repaint and `stop` fires
 * after every assistant turn. Measured on this machine, `harness --version`
 * costs ~0.85s to load its module graph against the statusline's ~0.11s budget,
 * so this entry point is built standalone and imports nothing from
 * `@harness-engineering/*`. `tests/bin-startup.test.ts` fails the build if that
 * ever stops being true.
 *
 * The rich, interactive surface (report, weeks, calibrate, budget) lives in
 * `harness burn`, where latency does not matter.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { loadConfig, resolvePaths } from '../config';
import { gitSegment } from '../git';
import { escalation, sessionBrief, type NotifyState } from '../hooks';
import { readSummary } from '../read-summary';
import { refresh, refreshIfStale } from '../refresh';
import { renderStatusline } from '../statusline';

/**
 * Read the JSON payload Claude Code pipes in.
 *
 * Blocking on fd 0 is what the shell version did (`$(cat)`), and it is correct
 * when the caller writes and closes. The TTY guard is for the other case: a
 * human running `harness-burn-hud line` by hand would otherwise sit at a dead
 * prompt with no clue why.
 */
function readStdin(): Record<string, unknown> {
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync(0, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function cwdFrom(payload: Record<string, unknown>): string {
  const direct = typeof payload.cwd === 'string' ? payload.cwd : '';
  const workspace = payload.workspace as { current_dir?: string } | undefined;
  return process.env.CLAUDE_HUD_CWD || direct || workspace?.current_dir || process.cwd();
}

function cmdLine(): void {
  const payload = readStdin();
  const paths = resolvePaths();
  const model = payload.model as { display_name?: string } | undefined;
  process.stdout.write(
    renderStatusline({
      summary: readSummary(paths),
      config: loadConfig(paths),
      git: gitSegment(cwdFrom(payload)),
      modelName: model?.display_name ?? null,
    })
  );
}

function cmdSessionStart(): void {
  const payload = readStdin();
  const paths = resolvePaths();
  const cwd = cwdFrom(payload);

  // Keep the cache warm; this is the one hook where a full scan is affordable.
  try {
    refresh(paths);
  } catch {
    // A failed scan still gets a brief — built from whatever is cached, and
    // saying "blind" if that is nothing.
  }

  const git = gitSegment(cwd);
  const mergedBranch = git?.kind === 'merged' ? git.label : null;
  process.stdout.write(JSON.stringify(sessionBrief(readSummary(paths), mergedBranch)));
}

function cmdStop(): void {
  readStdin(); // drain; this hook needs no session fields
  const paths = resolvePaths();
  try {
    refreshIfStale(paths);
  } catch {
    // Fall through to whatever is cached.
  }

  const summary = readSummary(paths);
  if (!summary) return; // a broken cache is the session-brief hook's problem

  let previous: NotifyState | null;
  try {
    previous = JSON.parse(readFileSync(paths.lastNotify, 'utf8')) as NotifyState;
  } catch {
    previous = null;
  }

  const { message, nextNotify } = escalation(summary, previous);
  if (nextNotify) {
    try {
      writeFileSync(paths.lastNotify, JSON.stringify(nextNotify));
    } catch {
      // Losing the ladder state only costs one duplicate notification.
    }
  }
  if (message) process.stdout.write(JSON.stringify({ systemMessage: message }));
}

function cmdScan(): void {
  const summary = refresh(resolvePaths());
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(summary, null, 2));
  }
}

const USAGE = `harness-burn-hud <line|session-start|stop|scan>

  line           render the statusline from the cached summary (never scans)
  session-start  SessionStart hook: warm the cache, brief the session
  stop           Stop hook: refresh if cold, speak only on escalation
  scan           force a refresh (--json to print the summary)
`;

function main(): number {
  switch (process.argv[2]) {
    case 'line':
      cmdLine();
      return 0;
    case 'session-start':
      cmdSessionStart();
      return 0;
    case 'stop':
      cmdStop();
      return 0;
    case 'scan':
      cmdScan();
      return 0;
    default:
      process.stdout.write(USAGE);
      return 0;
  }
}

try {
  process.exitCode = main();
} catch {
  // A HUD that crashes must not take the statusline or a hook down with it.
  process.exitCode = 0;
}
