import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as readline from 'node:readline';
import { readBody } from '../utils';

interface ChatRequest {
  /** The user's message for this turn */
  prompt: string;
  /** System prompt (only used on first turn) */
  system?: string;
  /** Session ID for multi-turn conversations. Omit for first turn. */
  sessionId?: string;
}

/** SSE event types emitted to the client. */
type SSEEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; tool: string; args?: string }
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
    void (async () => {
      let child: ChildProcess | null = null;
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as ChatRequest;

        if (!parsed.prompt || typeof parsed.prompt !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing prompt string' }));
          return;
        }

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
        child = spawn(command, args, { env: process.env });
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

        const rl = readline.createInterface({ input: child.stdout!, terminal: false });

        for await (const line of rl) {
          if (clientDisconnected) break;
          try {
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

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (err) {
        if (child && child.exitCode === null) child.kill('SIGTERM');
        const errorMsg = err instanceof Error ? err.message : 'Chat proxy error';
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: errorMsg }));
        } else {
          emit(res, { type: 'error', error: errorMsg });
          res.end();
        }
      }
    })();
    return true;
  }

  return false;
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
function mapContentBlock(block: any): SSEEvent | null {
  if (block.type === 'thinking' && block.thinking) {
    return { type: 'thinking', text: block.thinking };
  }
  if (block.type === 'text' && block.text) {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_use' && block.name) {
    const result: SSEEvent = { type: 'tool_use', tool: block.name };
    if (block.input) result.args = JSON.stringify(block.input).slice(0, 500);
    return result;
  }
  return null;
}

/** Extract SSE events from a Claude Code stream-json line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChunks(event: any): SSEEvent[] {
  // assistant — message with content blocks (thinking + text + tool_use)
  if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
    return event.message.content.map(mapContentBlock).filter(Boolean) as SSEEvent[];
  }

  // tool results from user messages
  if (event.type === 'user' && Array.isArray(event.message?.content)) {
    const results: SSEEvent[] = [];
    for (const block of event.message.content) {
      if (block.type === 'tool_result' && typeof block.content === 'string') {
        results.push({
          type: 'tool_result',
          content: block.content.slice(0, 1000),
          isError: block.is_error ?? false,
        });
      }
    }
    return results;
  }

  // content_block_delta — streaming text
  if (event.type === 'content_block_delta' && event.delta?.text) {
    return [{ type: 'text', text: event.delta.text }];
  }

  // system task_progress — agent activity
  if (event.type === 'system' && event.subtype === 'task_progress' && event.description) {
    return [{ type: 'status', text: event.description }];
  }

  // result / turn_complete — final output
  if (event.type === 'result' || event.type === 'turn_complete') {
    const text = event.result ?? event.content?.result;
    if (typeof text === 'string') return [{ type: 'text', text }];
  }

  return [];
}
