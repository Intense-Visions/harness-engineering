import {
  AgentBackend,
  TurnParams,
  AgentEvent,
  TurnResult,
  Issue,
} from '@harness-engineering/types';
import { extractRateLimitReset } from '../core/rate-limit-events';

/** Hard cap on a single rate-limit sleep — prevents a malformed or adversarial
 * reset time from parking the runner indefinitely. Sleeps capped at this
 * value surface `truncated: true` so the orchestrator/TUI can escalate. */
const MAX_SLEEP_MS = 12 * 60 * 60_000;

/** Build the descriptive message and optional warning log for a rate-limit sleep. */
function buildSleepMessage(
  resetsAtMs: number,
  sleepMs: number,
  requestedSleepMs: number,
  truncated: boolean
): string {
  const resetsAt = new Date(resetsAtMs).toISOString();
  const base = `Subscription rate limit hit. Sleeping until ${resetsAt} (${Math.round(sleepMs / 60_000)}min)`;
  if (!truncated) return base;
  console.warn(
    `[runner] rate limit sleep truncated: requested ${Math.round(requestedSleepMs / 60_000)}min, sleeping ${Math.round(sleepMs / 60_000)}min`
  );
  return `${base} — capped at MAX_SLEEP_MS (${Math.round(MAX_SLEEP_MS / 60_000)}min); human intervention may be needed.`;
}

export interface RunnerOptions {
  maxTurns: number;
}

export class AgentRunner {
  private backend: AgentBackend;
  private options: RunnerOptions;

  constructor(backend: AgentBackend, options: RunnerOptions) {
    this.backend = backend;
    this.options = options;
  }

  /**
   * Run a multi-turn agent session for an issue.
   */
  public async *runSession(
    _issue: Issue,
    workspacePath: string,
    prompt: string
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const startResult = await this.backend.startSession({
      workspacePath,
      permissionMode: 'full', // Default for now
    });

    if (!startResult.ok) {
      throw new Error(`Failed to start agent session: ${startResult.error.message}`);
    }

    const session = startResult.value;
    let currentTurn = 0;
    let lastResult: TurnResult = {
      success: false,
      sessionId: session.sessionId,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
    };

    try {
      while (currentTurn < this.options.maxTurns) {
        currentTurn++;

        yield {
          type: 'turn_start',
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
        };

        const turnParams: TurnParams = {
          sessionId: session.sessionId,
          prompt: currentTurn === 1 ? prompt : 'Continue your work.',
          isContinuation: currentTurn > 1,
        };

        const turnGen = this.backend.runTurn(session, turnParams);
        const turnOutcome = yield* this.consumeTurn(turnGen, session);

        if (turnOutcome.hitRateLimit) {
          currentTurn--;
          if (turnOutcome.rateLimitResetsAtMs) {
            yield* this.sleepUntilReset(turnOutcome.rateLimitResetsAtMs, session.sessionId);
          }
        }

        lastResult = turnOutcome.result;

        // Early termination if agent reports success
        if (lastResult.success) {
          break;
        }
      }
    } finally {
      await this.backend.stopSession(session);
    }

    return lastResult;
  }

  /**
   * Consume all events from a single turn, forwarding them to the caller.
   * Tracks rate-limit signals and session ID updates, returning the turn
   * result along with rate-limit metadata.
   */
  private async *consumeTurn(
    turnGen: AsyncGenerator<AgentEvent, TurnResult, void>,
    session: { sessionId: string }
  ): AsyncGenerator<
    AgentEvent,
    { result: TurnResult; hitRateLimit: boolean; rateLimitResetsAtMs: number | null },
    void
  > {
    let next = await turnGen.next();
    let hitRateLimit = false;
    let rateLimitResetsAtMs: number | null = null;

    while (!next.done) {
      const event = next.value;
      yield event;

      if (event.type === 'rate_limit') {
        hitRateLimit = true;
        rateLimitResetsAtMs = extractRateLimitReset(event);
      }

      if (event.sessionId && event.sessionId !== session.sessionId) {
        session.sessionId = event.sessionId;
      }

      next = await turnGen.next();
    }

    return { result: next.value, hitRateLimit, rateLimitResetsAtMs };
  }

  /**
   * Yield a `rate_limit_sleep` event then sleep until `resetsAtMs` (capped
   * at MAX_SLEEP_MS). No-op when the reset is in the past.
   */
  private async *sleepUntilReset(
    resetsAtMs: number,
    sessionId: string
  ): AsyncGenerator<AgentEvent, void, void> {
    const requestedSleepMs = resetsAtMs - Date.now();
    const sleepMs = Math.min(requestedSleepMs, MAX_SLEEP_MS);
    if (sleepMs <= 0) return;

    const truncated = requestedSleepMs > MAX_SLEEP_MS;
    const message = buildSleepMessage(resetsAtMs, sleepMs, requestedSleepMs, truncated);

    yield {
      type: 'rate_limit_sleep',
      timestamp: new Date().toISOString(),
      content: { message, resetsAtMs, sleepMs, truncated },
      sessionId,
    };

    await new Promise((r) => setTimeout(r, sleepMs));
  }
}
