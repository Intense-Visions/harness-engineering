import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  Err,
  AgentError,
} from '@harness-engineering/types';

function resolveExitCode(
  code: number | null,
  command: string,
  resolve: (value: Result<void, AgentError>) => void
): void {
  if (code === 0) {
    resolve(Ok(undefined));
  } else {
    resolve(
      Err({
        category: 'agent_not_found',
        message: `Claude command '${command}' not found or failed`,
      })
    );
  }
}

function resolveSpawnError(
  command: string,
  resolve: (value: Result<void, AgentError>) => void
): void {
  resolve(Err({ category: 'agent_not_found', message: `Claude command '${command}' not found` }));
}

export interface SubscriptionLimitParse {
  resetsAtMs: number;
  resetTime: string;
  timezone: string;
  /**
   * `'exact'` when the reset time was parsed from the CLI message;
   * `'fallback'` when we couldn't resolve the timezone and substituted a
   * safe 1-hour default. Callers should surface the distinction so a stale
   * fallback doesn't masquerade as a legitimate schedule.
   */
  resolved: 'exact' | 'fallback';
}

/** Minute-grace applied when the parsed reset appears to be just-past. */
const JUST_PAST_GRACE_MS = 5 * 60_000;

/**
 * Primary regex for the canonical Claude CLI limit message, e.g.:
 *   "You've hit your limit · resets 8pm (America/Indianapolis)"
 */
const PRIMARY_LIMIT_RE =
  /You[\u2019']ve hit your limit.*resets\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\(([^)]+)\)/i;

/**
 * Loose detector for "the CLI said something about a limit but we couldn't
 * extract a reset time". When PRIMARY_LIMIT_RE fails but this fires, callers
 * should at least apply their default cooldown rather than silently
 * misclassifying the line as unrelated output.
 */
const LOOSE_LIMIT_RE = /\b(?:rate\s?limit|quota|limit)\b.*\bresets?\b/i;

/**
 * Returns true when the line looks like a limit notification but does NOT
 * match the strict parser. Useful for logging drift so teams notice when the
 * CLI's message format changes.
 */
export function looksLikeUnparsedLimit(line: string): boolean {
  return !PRIMARY_LIMIT_RE.test(line) && LOOSE_LIMIT_RE.test(line);
}

/** Parse "8pm" / "11:30am" into 24-hour {hours, minutes}. Returns null on malformed input. */
function parse12HourTime(resetTime: string): { hours: number; minutes: number } | null {
  const m = resetTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;

  let hours = parseInt(m[1]!, 10);
  const minutes = parseInt(m[2] ?? '0', 10);
  const meridiem = m[3]!.toLowerCase();

  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  return { hours, minutes };
}

/** Read {year, month, day} for `now` in `timezone`. Returns null if Intl can't resolve it. */
function getDatePartsInTimezone(
  now: Date,
  timezone: string
): { year: string; month: string; day: string } | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/**
 * Given a wall-clock time `{hours, minutes}` that is meant to be interpreted
 * in `timezone` on the given `{year, month, day}`, return the corresponding
 * UTC milliseconds. Uses the difference between the same instant seen as UTC
 * vs seen in `timezone` to derive the offset.
 */
function resolveWallClockToUtcMs(
  year: string,
  month: string,
  day: string,
  hours: number,
  minutes: number,
  timezone: string
): number {
  const targetDateStr = `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const utcDate = new Date(targetDateStr + 'Z');
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utcDate);
  const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const tzMinute = parseInt(tzParts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const offsetMinutes = tzHour * 60 + tzMinute - (hours * 60 + minutes);
  return utcDate.getTime() - offsetMinutes * 60_000;
}

/** Build a "fallback" parse: 1h from now with the original resetTime/timezone preserved for logging. */
function fallbackParse(resetTime: string, timezone: string): SubscriptionLimitParse {
  return {
    resetsAtMs: Date.now() + 60 * 60_000,
    resetTime,
    timezone,
    resolved: 'fallback',
  };
}

/**
 * Parse Claude CLI subscription-level rate limit messages.
 *
 * The CLI outputs non-JSON text like:
 *   "You've hit your limit · resets 8pm (America/Indianapolis)"
 * when the user's plan quota is exhausted. We extract the reset time and
 * timezone to compute when the limit lifts. If the timezone is unresolvable
 * the function returns `resolved: 'fallback'` with a 1-hour reset so callers
 * can surface the distinction.
 */
export function parseSubscriptionLimit(line: string): SubscriptionLimitParse | null {
  const match = line.match(PRIMARY_LIMIT_RE);
  if (!match) return null;

  const resetTime = match[1]!.trim();
  const timezone = match[2]!.trim();

  try {
    const time = parse12HourTime(resetTime);
    if (!time) return null;

    const now = new Date();
    const dateParts = getDatePartsInTimezone(now, timezone);
    if (!dateParts) return null;

    const resetsAtMs = resolveWallClockToUtcMs(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      time.hours,
      time.minutes,
      timezone
    );

    // Wrap to tomorrow when clearly in the past. Apply a small grace window
    // so minor clock skew doesn't bounce a just-about-to-fire reset 24h away.
    const effectiveMs =
      resetsAtMs <= now.getTime() - JUST_PAST_GRACE_MS ? resetsAtMs + 24 * 60 * 60_000 : resetsAtMs;

    return { resetsAtMs: effectiveMs, resetTime, timezone, resolved: 'exact' };
  } catch {
    // Timezone not recognized or other parse error — return a safe fallback
    // so we at least don't spin. Caller can inspect `resolved` to log.
    return fallbackParse(resetTime, timezone);
  }
}

/**
 * Extract a human-readable summary from a Claude result event.
 * The content field can be a string, an array of content blocks, or the full response object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeResultContent(rawEvent: any): string {
  if (typeof rawEvent.result === 'string') return rawEvent.result;

  const content = rawEvent.content;
  if (Array.isArray(content)) {
    const textParts = content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string);
    if (textParts.length > 0) return textParts.join('\n');

    const toolNames = content.filter((b) => b.type === 'tool_use').map((b) => b.name);
    if (toolNames.length > 0) return `Tool calls: ${toolNames.join(', ')}`;
  }

  if (typeof content === 'string') return content;
  return 'Turn completed';
}

function mkEvent(type: string, content: unknown, sessionId: string): AgentEvent {
  return { type, timestamp: new Date().toISOString(), content, sessionId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUsage(usage: any): import('@harness-engineering/types').TokenUsage | null {
  if (!usage) return null;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractToolResultText(blockContent: any): string {
  if (typeof blockContent === 'string') return blockContent;
  if (!Array.isArray(blockContent)) return '';
  return (
    blockContent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => (typeof c === 'string' ? c : (c.text ?? '')))
      .join('\n')
  );
}

/** Map a single assistant content block to an AgentEvent, or null to skip. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAssistantBlock(block: any, sessionId: string): AgentEvent | null {
  if (block.type === 'text' && typeof block.text === 'string') {
    return mkEvent('text', block.text, sessionId);
  }
  if (block.type === 'tool_use') {
    return mkEvent(
      'call',
      `Calling ${block.name}(${JSON.stringify(block.input ?? {})})`,
      sessionId
    );
  }
  if (block.type === 'thinking' && typeof block.thinking === 'string') {
    return mkEvent('thought', block.thinking, sessionId);
  }
  return null;
}

/** Walk an assistant message's content blocks, emitting granular events. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAssistantBlocks(rawEvent: any, sessionId: string): AgentEvent[] {
  const blocks = rawEvent.message?.content;
  if (!Array.isArray(blocks)) return [];
  const events = blocks
    .map((b) => mapAssistantBlock(b, sessionId))
    .filter((e): e is AgentEvent => e !== null);

  // Claude streams multiple assistant events per API request (same requestId,
  // cumulative-ish usage on each chunk). Only the terminal chunk carries a
  // non-null stop_reason — attach usage there so the state machine's
  // additive `+=` accumulator sees each request exactly once.
  const stopReason = rawEvent.message?.stop_reason;
  if (stopReason !== null && stopReason !== undefined) {
    const usage = extractUsage(rawEvent.message?.usage);
    if (usage) {
      if (events.length > 0) {
        events[0] = { ...events[0]!, usage };
      } else {
        // Final chunk with no renderable content — still surface the usage so
        // token totals and ITPM/OTPM windows advance.
        events.push({
          type: 'usage',
          timestamp: new Date().toISOString(),
          sessionId,
          usage,
        });
      }
    }
  }
  return events;
}

/** Walk a user message's tool_result blocks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserBlocks(rawEvent: any, sessionId: string): AgentEvent[] {
  const blocks = rawEvent.message?.content;
  if (!Array.isArray(blocks)) return [];

  const events: AgentEvent[] = [];
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      const text = extractToolResultText(block.content).slice(0, 500);
      events.push(mkEvent('status', text, sessionId));
    }
  }
  return events;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClaudeEventHandler = (rawEvent: any, sessionId: string) => AgentEvent[];

/** Build a terminal `result` event, attaching any top-level usage for token accounting. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResultEvent(rawEvent: any, sessionId: string): AgentEvent[] {
  const event = mkEvent('result', summarizeResultContent(rawEvent), sessionId);
  const usage = extractUsage(rawEvent.usage);
  if (usage) event.usage = usage;
  return [event];
}

const CLAUDE_EVENT_HANDLERS: Record<string, ClaudeEventHandler> = {
  text: (e, s) => [mkEvent('text', e.content ?? e.text ?? '', s)],
  progress: (e, s) => (e.content ? [mkEvent('thought', e.content, s)] : []),
  call: (e, s) => [mkEvent('call', `Calling ${e.tool}(${JSON.stringify(e.args)})`, s)],
  rate_limit_event: (_e, s) => [mkEvent('rate_limit', 'Rate limit hit - waiting...', s)],
  result: mapResultEvent,
  turn_complete: mapResultEvent,
  assistant: mapAssistantBlocks,
  user: mapUserBlocks,
  system: () => [],
  message: () => [],
};

/**
 * Map a Claude stream-json event to one or more AgentEvents.
 *
 * Claude's stream-json emits: system (init), assistant (model response with
 * content blocks), user (tool results), result (final summary). Each assistant
 * message may contain multiple content blocks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClaudeEvent(rawEvent: any, sessionId: string): AgentEvent[] {
  const handler = CLAUDE_EVENT_HANDLERS[rawEvent.type];
  if (handler) return handler(rawEvent, sessionId);
  return typeof rawEvent.message === 'string'
    ? [mkEvent('status', rawEvent.message, sessionId)]
    : [];
}

export class ClaudeBackend implements AgentBackend {
  readonly name = 'claude';
  private command: string;

  constructor(command = 'claude') {
    this.command = command;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: AgentSession = {
      sessionId: randomUUID(),
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
    };
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const args = [
      '--print',
      '-p',
      params.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
    ];

    if (params.isContinuation) {
      args.push('--resume', session.sessionId);
    } else {
      args.push('--session-id', session.sessionId);
    }

    const child = spawn(this.command, args, {
      cwd: session.workspacePath,
      env: process.env,
    });

    // Close stdin to signal no input is coming
    child.stdin.end();

    child.on('error', (err) => {
      console.error(`[claude spawn error] ${err.message}`);
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });

    const errRl = readline.createInterface({
      input: child.stderr,
      terminal: false,
    });

    // Log stderr for debugging
    errRl.on('line', (line) => {
      console.error(`[claude stderr] ${line}`);
    });

    let lastResult: TurnResult | null = null;
    let exitCode: number | null = null;

    child.on('exit', (code) => {
      exitCode = code;
    });

    try {
      for await (const line of rl) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawEvent = JSON.parse(line) as any;

          if (rawEvent.type === 'result' || rawEvent.type === 'turn_complete') {
            // Claude stream-json result events use { subtype, is_error } rather than
            // { success }. Translate explicitly so AgentRunner's early-termination
            // check (if lastResult.success) actually fires — otherwise the runner
            // loops sending "Continue your work." until maxTurns is exhausted.
            const isSuccess =
              rawEvent.is_error === false ||
              (rawEvent.is_error === undefined && rawEvent.subtype === 'success');
            lastResult = {
              success: isSuccess,
              sessionId: session.sessionId,
              usage: extractUsage(rawEvent.usage) ?? {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
              },
            };
          }

          for (const mapped of mapClaudeEvent(rawEvent, session.sessionId)) {
            yield mapped;
          }
        } catch {
          // Non-JSON output — check for subscription rate limit messages
          const limitInfo = parseSubscriptionLimit(line);
          if (limitInfo) {
            if (limitInfo.resolved === 'fallback') {
              console.warn(
                `[claude limit] unresolved timezone "${limitInfo.timezone}" — sleeping 1h fallback. Line: ${line.trim()}`
              );
            }
            yield {
              type: 'rate_limit',
              timestamp: new Date().toISOString(),
              content: {
                message: line.trim(),
                resetsAtMs: limitInfo.resetsAtMs,
                resetTime: limitInfo.resetTime,
                timezone: limitInfo.timezone,
                resolved: limitInfo.resolved,
              },
              sessionId: session.sessionId,
            };
          } else if (looksLikeUnparsedLimit(line)) {
            // The CLI said something about a limit that our strict parser
            // didn't match. Fall back to the orchestrator's default cooldown
            // so we don't silently misclassify this as unrelated output.
            console.warn(
              `[claude limit] detected limit-like line that did not match parser. Falling back to default cooldown. Line: ${line.trim()}`
            );
            yield {
              type: 'rate_limit',
              timestamp: new Date().toISOString(),
              content: { message: line.trim() },
              sessionId: session.sessionId,
            };
          }
        }
      }
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
      rl.close();
      errRl.close();
    }

    // Wait briefly for exit event if not already set
    if (exitCode === null) {
      await new Promise((resolve) => {
        child.on('exit', (code) => {
          exitCode = code;
          resolve(null);
        });
      });
    }

    if (exitCode !== 0 && !lastResult) {
      return {
        success: false,
        sessionId: session.sessionId,
        error: `Claude process exited with code ${exitCode}`,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    return (
      lastResult || {
        success: true,
        sessionId: session.sessionId,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }
    );
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    return new Promise((resolve) => {
      const child = spawn(this.command, ['--version']);
      child.on('exit', (code) => resolveExitCode(code, this.command, resolve));
      child.on('error', () => resolveSpawnError(this.command, resolve));
    });
  }
}
