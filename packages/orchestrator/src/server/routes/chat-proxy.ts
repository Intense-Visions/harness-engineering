import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody } from '../utils';
import type Anthropic from '@anthropic-ai/sdk';

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Handle the chat proxy route. Proxies to the Anthropic API and streams
 * responses back as Server-Sent Events (SSE).
 *
 * @param client - Anthropic SDK client instance (or compatible mock)
 * @returns true if the route was handled, false otherwise
 */
export function handleChatProxyRoute(
  req: IncomingMessage,
  res: ServerResponse,
  client: Anthropic
): boolean {
  const { method, url } = req;

  if (method === 'POST' && url === '/api/chat') {
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as ChatRequest;

        if (!parsed.messages || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or empty messages array' }));
          return;
        }

        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const streamParams: Record<string, unknown> = {
          model: parsed.model ?? 'claude-sonnet-4-20250514',
          max_tokens: parsed.maxTokens ?? 8192,
          messages: parsed.messages,
        };
        if (parsed.system) {
          streamParams.system = parsed.system;
        }

        const stream = client.messages.stream(
          streamParams as Parameters<typeof client.messages.stream>[0]
        );

        // Abort the Anthropic stream if the client disconnects mid-stream
        let clientDisconnected = false;
        res.on('close', () => {
          clientDisconnected = true;
          if (typeof stream.abort === 'function') stream.abort();
        });

        for await (const event of stream) {
          if (clientDisconnected) break;
          if (
            event.type === 'content_block_delta' &&
            'delta' in event &&
            event.delta &&
            typeof event.delta === 'object' &&
            'text' in event.delta
          ) {
            const text = (event.delta as { text: string }).text;
            res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
          }
        }

        if (!clientDisconnected) {
          // Send final usage
          const finalMessage = await stream.finalMessage();
          const usage = finalMessage.usage;
          res.write(
            `data: ${JSON.stringify({ type: 'usage', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens })}\n\n`
          );
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (err) {
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
