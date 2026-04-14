import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { readBody } from '../utils';

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
}

/**
 * Handle the chat proxy route. Spawns Claude Code CLI as a subprocess
 * and streams responses back as Server-Sent Events (SSE).
 *
 * Uses the locally installed `claude` command — no API key required.
 * Claude Code manages its own authentication (OAuth or configured key).
 *
 * @param command - Claude CLI command name (default: 'claude')
 * @returns true if the route was handled, false otherwise
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

        if (!parsed.messages || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or empty messages array' }));
          return;
        }

        // Build prompt from messages (Claude Code takes a single prompt string)
        const prompt = buildPrompt(parsed.messages, parsed.system);

        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const args = ['--print', '-p', prompt, '--output-format', 'stream-json', '--verbose'];

        child = spawn(command, args, { env: process.env });
        child.stdin?.end();

        // Kill the subprocess if the client disconnects
        let clientDisconnected = false;
        res.on('close', () => {
          clientDisconnected = true;
          if (child && child.exitCode === null) {
            child.kill('SIGTERM');
          }
        });

        child.on('error', (err) => {
          if (!clientDisconnected) {
            res.write(
              `data: ${JSON.stringify({ type: 'error', error: `Failed to start claude: ${err.message}` })}\n\n`
            );
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
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          } catch {
            // Non-JSON output — forward as plain text if non-empty
            const trimmed = line.trim();
            if (trimmed) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: trimmed })}\n\n`);
            }
          }
        }

        rl.close();

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (err) {
        if (child && child.exitCode === null) {
          child.kill('SIGTERM');
        }
        const errorMsg = err instanceof Error ? err.message : 'Chat proxy error';
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: errorMsg }));
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
          res.end();
        }
      }
    })();
    return true;
  }

  return false;
}

/**
 * Build a single prompt string from a messages array and optional system prompt.
 * Claude Code CLI takes a single `-p` prompt, so we format the conversation.
 */
function buildPrompt(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  system?: string
): string {
  const parts: string[] = [];

  if (system) {
    parts.push(system);
    parts.push('');
  }

  // For single-turn, just use the last user message
  if (messages.length === 1) {
    const firstMsg = messages[0]!;
    return system ? `${system}\n\n${firstMsg.content}` : firstMsg.content;
  }

  // For multi-turn, format as conversation context
  for (const msg of messages) {
    if (msg.role === 'user') {
      parts.push(`User: ${msg.content}`);
    } else {
      parts.push(`Assistant: ${msg.content}`);
    }
  }

  return parts.join('\n\n');
}

interface SSEChunk {
  type: 'text' | 'thinking' | 'tool' | 'status';
  text: string;
}

/** Map a single content block from an assistant message to an SSEChunk. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContentBlock(block: any): SSEChunk | null {
  if (block.type === 'thinking' && block.thinking)
    return { type: 'thinking', text: block.thinking };
  if (block.type === 'text' && block.text) return { type: 'text', text: block.text };
  if (block.type === 'tool_use' && block.name)
    return { type: 'tool', text: `Using tool: ${block.name}` };
  return null;
}

/** Extract displayable chunks from a Claude Code stream-json event. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChunks(event: any): SSEChunk[] {
  if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
    return event.message.content.map(mapContentBlock).filter(Boolean) as SSEChunk[];
  }
  if (event.type === 'content_block_delta' && event.delta?.text) {
    return [{ type: 'text', text: event.delta.text }];
  }
  if (event.type === 'progress' && typeof event.content === 'string') {
    return [{ type: 'text', text: event.content }];
  }
  if (event.type === 'result' || event.type === 'turn_complete') {
    const text = event.result ?? event.content?.result;
    if (typeof text === 'string') return [{ type: 'text', text }];
  }
  if (event.type === 'system' && event.subtype === 'task_progress' && event.description) {
    return [{ type: 'status', text: event.description }];
  }
  return [];
}
