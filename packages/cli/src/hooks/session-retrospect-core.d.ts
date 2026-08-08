// Type declarations for the shipped plain-.js ESM core so TypeScript consumers
// (e.g. the `harness hooks run` command) can import it without an implicit-any
// error under strict mode. The runtime source stays a single .js file — this
// declaration mirrors its exported surface without duplicating any logic.

export interface CodexNotifyInputs {
  sessionId: string;
  cwd: string;
}

export type RetrospectStatus =
  | 'disabled'
  | 'already-archived'
  | 'no-session'
  | 'archived'
  | 'archive-failed';

export interface RetrospectResult {
  status: RetrospectStatus;
  slug?: string;
}

/** Read all of stdin, retrying while the pipe reports EAGAIN. */
export function readHookStdin(): { ok: true; data: string } | { ok: false };

/**
 * Parse Codex's notify JSON payload (a single argv string) into retrospect
 * inputs, or null when the payload is absent or unparseable.
 */
export function parseCodexNotifyPayload(raw: unknown): CodexNotifyInputs | null;

/** Whether end-of-session retrospection is opted in via env flag (default off). */
export function isRetrospectionEnabled(): boolean;

/** Gate, dedupe, resolve the active session, and archive it. Never throws for the no-op cases. */
export function retrospectSession(params: {
  cwd: string;
  sessionId: string;
}): Promise<RetrospectResult>;

/** Render the stderr line for a retrospection result, or null when no output is warranted. */
export function retrospectLogLine(label: string, result: RetrospectResult): string | null;
