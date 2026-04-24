import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as readline from 'node:readline';
import { z } from 'zod';
import { readBody } from '../utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Prefixes/names of environment variables safe to pass to the Claude CLI
 * subprocess.  Everything else (database credentials, internal API tokens,
 * etc.) is intentionally excluded.
 */
const SAFE_ENV_PREFIXES = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_',
  'XDG_',
  'ANTHROPIC_',
  'CLAUDE_',
  'NODE_ENV',
  'NODE_EXTRA_CA_CERTS',
  'TMPDIR',
  'TMP',
  'TEMP',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
];

function buildChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SAFE_ENV_PREFIXES.some((p) => key === p || key.startsWith(p))) {
      env[key] = value;
    }
  }
  return env;
}

const ChatRequestSchema = z.object({
  prompt: z.string().min(1),
  system: z.string().optional(),
  sessionId: z.string().regex(UUID_RE).optional(),
});

/** SSE event types emitted to the client. */
type SSEEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; tool: string; args?: string }
  | { type: 'tool_args_delta'; text: string }
  | { type: 'tool_result'; content: string; isError?: boolean }
  | { type: 'status'; text: string }
  | { type: 'error'; error: string };

/**
 * Handle the chat proxy route. Spawns Claude Code CLI as a subprocess
 * with session support for multi-turn conversations.
 *
 * Uses `--session-id` on first turn and `--resume` on subsequent turns,
 * so Claude Code maintains full conversation context natively.
 * Slash commands work because they're just prompts in a session.
 */
export function handleChatProxyRoute(
  req: IncomingMessage,
  res: ServerResponse,
  command = 'claude'
): boolean {
  const { method, url } = req;

  if (method === 'POST' && url === '/api/chat') {
    void handleChatRequest(req, res, command);
    return true;
  }

  return false;
}

/** Stream Claude CLI output lines as SSE events to the response. */
async function streamCLIOutput(
  child: ChildProcess,
  res: ServerResponse,
  isDisconnected: () => boolean
): Promise<void> {
  const rl = readline.createInterface({ input: child.stdout!, terminal: false });
  child.stderr?.resume(); // drain stderr to prevent backpressure

  for await (const line of rl) {
    if (isDisconnected()) break;
    try {
      // harness-ignore SEC-DES-001: parsing own subprocess (Claude CLI) stdout — trusted internal source
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = JSON.parse(line) as any;
      for (const chunk of extractChunks(event)) {
        emit(res, chunk);
      }
    } catch {
      // skip non-JSON lines (stderr leaking, etc.)
    }
  }

  rl.close();
}

/** Handle a single POST /api/chat request end-to-end. */
async function handleChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
  command: string
): Promise<void> {
  let child: ChildProcess | null = null;
  try {
    const body = await readBody(req);
    // harness-ignore SEC-DES-001: input validated by Zod schema (ChatRequestSchema)
    const result = ChatRequestSchema.safeParse(JSON.parse(body));
    if (!result.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: result.error.issues[0]?.message ?? 'Invalid request body' }));
      return;
    }
    const parsed = result.data;

    const sessionId = parsed.sessionId ?? randomUUID();
    const isFirstTurn = !parsed.sessionId;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send session ID so client can resume
    emit(res, { type: 'session', sessionId });

    const args = buildArgs(parsed.prompt, sessionId, isFirstTurn, parsed.system);
    child = spawn(command, args, { env: buildChildEnv(), stdio: 'pipe' });
    child.stdin?.end();

    let clientDisconnected = false;
    res.on('close', () => {
      clientDisconnected = true;
      if (child && child.exitCode === null) child.kill('SIGTERM');
    });

    child.on('error', (err) => {
      if (!clientDisconnected) {
        emit(res, { type: 'error', error: `Failed to start claude: ${err.message}` });
        res.end();
      }
    });

    await streamCLIOutput(child, res, () => clientDisconnected);

    if (!clientDisconnected) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    handleStreamError(res, err);
  }
}

/** Send an error response, choosing format based on whether headers were already sent. */
function handleStreamError(res: ServerResponse, err: unknown): void {
  const errorMsg = err instanceof Error ? err.message : 'Chat proxy error';
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: errorMsg }));
  } else {
    emit(res, { type: 'error', error: errorMsg });
    res.end();
  }
}

function emit(res: ServerResponse, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function buildArgs(
  prompt: string,
  sessionId: string,
  isFirstTurn: boolean,
  system?: string
): string[] {
  const fullPrompt = system && isFirstTurn ? `${system}\n\n${prompt}` : prompt;

  const args = [
    '--print',
    '-p',
    fullPrompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'bypassPermissions',
  ];

  if (isFirstTurn) {
    args.push('--session-id', sessionId);
  } else {
    args.push('--resume', sessionId);
  }

  return args;
}

// --- Event extraction ---

/** Map a content block from an assistant message to SSE events. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapContentBlock(block: any): SSEEvent | null {
  if (block.type === 'thinking' && block.thinking) {
    return { type: 'thinking', text: block.thinking };
  }
  if (block.type === 'text' && block.text) {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_use' && block.name) {
    const result: SSEEvent = { type: 'tool_use', tool: block.name };
    if (block.input) result.args = JSON.stringify(block.input);
    return result;
  }
  return null;
}

/**
 * Normalize a tool_result block's `content`, which Claude Code may emit as a
 * string, an array of `{type:"text", text:"..."}` blocks, or (rarely) another
 * value. Always returns a string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeToolResultContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return content.map((c: any) => (typeof c === 'string' ? c : (c.text ?? ''))).join('\n');
  }
  return String(content ?? '');
}

/** Map a content block from a user message to an SSE event. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserBlock(block: any): SSEEvent | null {
  if (block.type !== 'tool_result') return null;
  return {
    type: 'tool_result',
    content: normalizeToolResultContent(block.content).slice(0, 50000),
    isError: block.is_error ?? false,
  };
}

// --- Chunk extraction handlers (one per event type) ---

// ── Claude CLI stream-json real-time events ─────────────────────────
// The CLI emits `text`, `progress`, and `call` events as content streams
// in real-time. These are the primary source for rich block rendering.

/** Real-time text output from the CLI. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextEvent(event: any): SSEEvent[] | null {
  const text = event.content ?? event.text;
  if (typeof text === 'string' && text) return [{ type: 'text', text }];
  return null;
}

/** Real-time thinking/progress output from the CLI. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProgressEvent(event: any): SSEEvent[] | null {
  const text = event.content;
  if (typeof text === 'string' && text) return [{ type: 'thinking', text }];
  return null;
}

/** Real-time tool invocation from the CLI. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCallEvent(event: any): SSEEvent[] | null {
  if (!event.tool) return null;
  const result: SSEEvent = { type: 'tool_use', tool: event.tool };
  if (event.args != null) {
    result.args = typeof event.args === 'string' ? event.args : JSON.stringify(event.args);
  }
  return [result];
}

// ── Full message events ─────────────────────────────────────────────
// Claude CLI stream-json emits complete `assistant` messages carrying a
// content array of text/thinking/tool_use blocks — the CLI does not stream
// per-block `text`/`progress`/`call` deltas. Walk the blocks and emit one
// SSE event per block, or the client renders nothing.
// `user` messages contain tool_result blocks that attach to prior tool_use.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAssistantBlocks(event: any): SSEEvent[] | null {
  if (!Array.isArray(event.message?.content)) return null;
  return event.message.content.map(mapContentBlock).filter(Boolean) as SSEEvent[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUserBlocks(event: any): SSEEvent[] | null {
  if (!Array.isArray(event.message?.content)) return null;
  return event.message.content.map(mapUserBlock).filter(Boolean) as SSEEvent[];
}

// ── Anthropic API streaming format (fallback) ───────────────────────
// Some CLI versions may emit raw API-level events. These handlers serve
// as fallbacks and do not conflict with the CLI-specific handlers above.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDelta(event: any): SSEEvent[] | null {
  if (event.delta?.text) return [{ type: 'text', text: event.delta.text }];
  if (event.delta?.partial_json)
    return [{ type: 'tool_args_delta', text: event.delta.partial_json }];
  if (event.delta?.thinking) return [{ type: 'thinking', text: event.delta.thinking }];
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContentBlockStart(event: any): SSEEvent[] | null {
  if (event.content_block?.type === 'tool_use' && event.content_block.name) {
    const result: SSEEvent = { type: 'tool_use', tool: event.content_block.name };
    if (event.content_block.input) result.args = JSON.stringify(event.content_block.input);
    return [result];
  }
  return null;
}

// ── System / status events ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSystemStatus(event: any): SSEEvent[] | null {
  if (event.subtype === 'task_progress' && event.description) {
    return [{ type: 'status', text: event.description }];
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResultText(event: any): SSEEvent[] | null {
  const text = event.result ?? event.content?.result;
  if (typeof text === 'string') return [{ type: 'text', text }];
  return null;
}

/**
 * Map event type to its chunk extractor.
 *
 * Claude CLI stream-json emits these event types:
 *   text, progress, call   — real-time streaming (primary)
 *   assistant, user        — full message batches
 *   system                 — task progress status
 *   result, turn_complete  — turn completion
 *
 * Anthropic API streaming types (content_block_*) are kept as fallbacks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chunkExtractors: Record<string, (event: any) => SSEEvent[] | null> = {
  // CLI real-time streaming events
  text: extractTextEvent,
  progress: extractProgressEvent,
  call: extractCallEvent,
  // Full message events — CLI batches content blocks here
  assistant: extractAssistantBlocks,
  user: extractUserBlocks,
  // Anthropic API format fallbacks
  content_block_start: extractContentBlockStart,
  content_block_delta: extractDelta,
  // Status and completion
  system: extractSystemStatus,
  result: extractResultText,
  turn_complete: extractResultText,
  // Ignored (no renderable content)
  message: () => null,
};

/** Extract SSE events from a Claude Code stream-json line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChunks(event: any): SSEEvent[] {
  const extractor = chunkExtractors[event.type as string];
  return extractor?.(event) ?? [];
}
