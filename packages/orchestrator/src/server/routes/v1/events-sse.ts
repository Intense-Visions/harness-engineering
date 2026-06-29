import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

/**
 * Event-bus topics the SSE handler subscribes to. Mirrors the WebSocket
 * broadcaster topics today + the two new Phase 2 interaction emits.
 * Phase 3 extends this with `webhook.*`; Phase 5 with `telemetry.*`.
 */
const SSE_TOPICS = [
  'state_change',
  'agent_event',
  'interaction.created',
  'interaction.resolved',
  'maintenance:started',
  'maintenance:completed',
  'maintenance:error',
  'maintenance:baseref_fallback',
  'local-model:status',
  // ── Phase 3 ──
  'webhook.subscription.created',
  'webhook.subscription.deleted',
] as const;

const HEARTBEAT_MS = 15_000;

/** Default ring-buffer capacity for `Last-Event-ID` replay. */
const DEFAULT_REPLAY_BUFFER = 1024;

interface SseEvent {
  /** Monotonic, gap-free sequence id (1-based). Serialized as the SSE `id:`. */
  id: number;
  topic: string;
  data: unknown;
}

/**
 * Per-bus event recorder backing `Last-Event-ID` reconnection.
 *
 * The original handler stamped each frame with a *random* id, so a reconnecting
 * client's `Last-Event-ID` pointed at nothing replayable. This log is the single
 * subscriber to the bus: it assigns every event a monotonic id, keeps the most
 * recent `cap` events in a ring buffer, and fans them out to connected streams.
 * A reconnecting client replays the buffered tail strictly after its last id,
 * then resumes live — with no gap and no duplicate.
 *
 * The buffer is in-memory and bounded, so a server restart (or an outage longer
 * than `cap` events) drops history: such a client simply resumes live from the
 * next event, exactly as a first-time connection would. A durable store can
 * replace the ring buffer later without changing the wire contract.
 */
export class SseEventLog {
  private seq = 0;
  private readonly buffer: SseEvent[] = [];
  private readonly subscribers = new Set<(e: SseEvent) => void>();

  constructor(bus: EventEmitter, cap: number = DEFAULT_REPLAY_BUFFER) {
    this.cap = cap;
    for (const topic of SSE_TOPICS) {
      bus.on(topic, (data: unknown) => this.record(topic, data));
    }
  }

  private readonly cap: number;

  private record(topic: string, data: unknown): void {
    const event: SseEvent = { id: ++this.seq, topic, data };
    this.buffer.push(event);
    if (this.buffer.length > this.cap) this.buffer.shift();
    for (const fn of this.subscribers) fn(event);
  }

  /** Highest assigned id (0 when nothing has been recorded yet). */
  currentSeq(): number {
    return this.seq;
  }

  /** Buffered events strictly newer than `lastId`, oldest-first. */
  replayFrom(lastId: number): SseEvent[] {
    return this.buffer.filter((e) => e.id > lastId);
  }

  /** Register a live listener; returns an unsubscribe function. */
  subscribe(fn: (e: SseEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
}

// One log per bus instance — the bus is the orchestrator and lives for the
// server's lifetime, so the log (and its single set of bus listeners) is a
// per-server singleton. WeakMap lets test buses be GC'd with their logs.
const logsByBus = new WeakMap<EventEmitter, SseEventLog>();

/** Get (or lazily create) the replay log for a bus. Exposed for tests. */
export function getSseEventLog(bus: EventEmitter): SseEventLog {
  let log = logsByBus.get(bus);
  if (!log) {
    log = new SseEventLog(bus);
    logsByBus.set(bus, log);
  }
  return log;
}

/**
 * Parse a client's `Last-Event-ID` into a numeric sequence id. Returns null when
 * absent or non-numeric (e.g. a client that connected before monotonic ids
 * existed) — such a client resumes live without replay.
 */
function parseLastEventId(req: IncomingMessage): number | null {
  const raw = req.headers['last-event-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * GET /api/v1/events — Phase 2 bridge primitive.
 *
 * Spec D1: SSE stream alongside legacy /ws WebSocket. Each event is framed as:
 *   event: <type>
 *   data: <json>
 *   id: <seq>
 *
 * Reconnection: a client that sends `Last-Event-ID: <seq>` (the browser
 * `EventSource` does this automatically) replays every buffered event after that
 * id before live delivery resumes (see {@link SseEventLog}).
 *
 * Scope: read-telemetry (enforced by dispatchAuthedRequest).
 */
export function handleV1EventsSseRoute(
  req: IncomingMessage,
  res: ServerResponse,
  bus: EventEmitter
): boolean {
  if (req.method !== 'GET' || req.url !== '/api/v1/events') return false;

  // Set headers via setHeader() so callers (and tests) can introspect via
  // getHeader() after dispatch. writeHead({...}) bypasses that storage.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disables proxy buffering (nginx, etc.)
  res.writeHead(200);
  // Initial comment frame opens the stream for the client.
  res.write(`: harness gateway SSE — connected at ${new Date().toISOString()}\n\n`);

  const log = getSseEventLog(bus);

  const send = (e: SseEvent): void => {
    try {
      res.write(`event: ${e.topic}\n` + `data: ${JSON.stringify(e.data)}\n` + `id: ${e.id}\n\n`);
    } catch {
      // Connection write failure → unsubscribe on close handler below.
    }
  };

  // Replay buffered history after the client's last seen id (if any). Everything
  // up to and including `replayedThrough` has been sent; the live subscriber
  // forwards only strictly-newer events, so there is no duplicate and no gap.
  const lastId = parseLastEventId(req);
  let replayedThrough = lastId ?? log.currentSeq();
  if (lastId !== null) {
    for (const e of log.replayFrom(lastId)) {
      send(e);
      replayedThrough = e.id;
    }
  }

  const unsubscribe = log.subscribe((e) => {
    if (e.id > replayedThrough) send(e);
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // ignore — close handler cleans up
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  res.on('close', cleanup);
  res.on('finish', cleanup);

  return true;
}
