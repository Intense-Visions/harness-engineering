import { spawn } from 'node:child_process';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
  AnalysisImage,
} from './interface.js';
import { zodToJsonSchema } from './schema.js';

export interface ClaudeCliProviderOptions {
  /** Path to the claude binary (default: 'claude') */
  command?: string | undefined;
  /** Model to use (default: let the CLI decide) */
  defaultModel?: string | undefined;
  /** Request timeout in ms (default: 180000) */
  timeoutMs?: number | undefined;
}

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * AnalysisProvider that uses the Claude CLI for structured analysis.
 *
 * This avoids the need for an API key — the CLI manages its own
 * authentication. Structured output is enforced via --json-schema.
 */
export class ClaudeCliAnalysisProvider implements AnalysisProvider {
  private readonly command: string;
  private readonly defaultModel: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ClaudeCliProviderOptions = {}) {
    this.command = options.command ?? 'claude';
    this.defaultModel = options.defaultModel;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    const model = request.model ?? this.defaultModel;
    const jsonSchema = zodToJsonSchema(request.responseSchema);

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const hasImages = (request.images?.length ?? 0) > 0;
    const startMs = performance.now();
    const result = hasImages
      ? await this.runClaudeVision(prompt, request.images!, jsonSchema, model)
      : await this.runClaude(this.buildTextArgs(prompt, jsonSchema, model));
    const latencyMs = Math.round(performance.now() - startMs);

    const parsed = request.responseSchema.parse(result.content) as T;

    return {
      result: parsed,
      tokenUsage: {
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        totalTokens: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
      },
      model: result.model ?? model ?? 'claude',
      latencyMs,
    };
  }

  /** Args for the text-only path (`-p` prompt, single-shot JSON output). */
  private buildTextArgs(prompt: string, jsonSchema: object, model?: string): string[] {
    const args = [
      '--print',
      '-p',
      prompt,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify({ type: 'object', ...jsonSchema }),
    ];
    if (model) args.push('--model', model);
    return args;
  }

  /**
   * Vision path. The CLI's `-p` text prompt cannot carry an image, so image
   * calls go through the `stream-json` transport: a single user message whose
   * content is the image block(s) followed by the text prompt, written to
   * stdin. `--json-schema` still enforces the structured envelope, which the
   * CLI returns as `structured_output` on the terminal `result` event.
   *
   * Verified against Claude Code CLI 2.1.x: image content blocks are read and
   * `structured_output` conforms to the supplied schema.
   */
  private runClaudeVision(
    prompt: string,
    images: AnalysisImage[],
    jsonSchema: object,
    model?: string
  ): Promise<{
    content: unknown;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  }> {
    const content = [
      ...images.map((img) => ({
        type: 'image' as const,
        source:
          img.base64 !== undefined
            ? {
                type: 'base64' as const,
                media_type: img.mediaType ?? 'image/png',
                data: img.base64,
              }
            : { type: 'url' as const, url: img.url ?? '' },
      })),
      { type: 'text' as const, text: prompt },
    ];
    const userMessage = JSON.stringify({ type: 'user', message: { role: 'user', content } });

    const args = [
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--json-schema',
      JSON.stringify({ type: 'object', ...jsonSchema }),
    ];
    if (model) args.push('--model', model);

    return this.runClaudeStream(args, `${userMessage}\n`);
  }

  private runClaude(args: string[]): Promise<{
    content: unknown;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        env: process.env,
        timeout: this.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Claude CLI failed to spawn: ${err.message}`));
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(
            new Error(`Claude CLI exited with code ${code}: ${stderr.trim() || stdout.trim()}`)
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          // Claude Code CLI 2.1.x with --output-format json --json-schema returns
          // { type: 'result', result: '<natural-language summary string>',
          //   structured_output: { ...schema-conforming object... }, usage, model, ... }.
          // Older CLI versions put the schema-conforming response in `result`
          // (sometimes JSON-encoded as a string). Prefer structured_output, then
          // fall back to result, then to the raw envelope.
          const content = parsed.structured_output ?? parsed.result ?? parsed;
          resolve({
            content: typeof content === 'string' ? JSON.parse(content) : content,
            usage: parsed.usage,
            model: parsed.model,
          });
        } catch (err) {
          const stdoutSnippet = stdout.slice(0, 500);
          const stderrSnippet = stderr.slice(0, 500);
          reject(
            new Error(
              `Failed to parse Claude CLI output: ${err instanceof Error ? err.message : String(err)}. ` +
                `stdout (first 500 chars): ${JSON.stringify(stdoutSnippet)}. ` +
                `stderr (first 500 chars): ${JSON.stringify(stderrSnippet)}`
            )
          );
        }
      });

      child.stdin.end();
    });
  }

  /**
   * Run the CLI in `stream-json` transport, writing `stdinPayload` to stdin
   * and reading newline-delimited JSON events from stdout. Resolves from the
   * terminal `result` event, preferring `structured_output` (schema-conforming
   * object) over the `result` string (JSON-encoded fallback for older CLIs).
   */
  private runClaudeStream(
    args: string[],
    stdinPayload: string
  ): Promise<{
    content: unknown;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, { env: process.env, timeout: this.timeoutMs });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        reject(new Error(`Claude CLI failed to spawn: ${err.message}`));
      });
      child.on('exit', (code) => {
        if (code !== 0) {
          reject(
            new Error(`Claude CLI exited with code ${code}: ${stderr.trim() || stdout.trim()}`)
          );
          return;
        }
        // Find the terminal `result` event among the newline-delimited stream.
        let resultEvent: Record<string, unknown> | undefined;
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed) as Record<string, unknown>;
            if (ev.type === 'result') resultEvent = ev;
          } catch {
            /* ignore non-JSON lines */
          }
        }
        if (!resultEvent) {
          reject(
            new Error(
              `Claude CLI stream produced no result event. stdout (first 500): ${JSON.stringify(
                stdout.slice(0, 500)
              )}. stderr (first 500): ${JSON.stringify(stderr.slice(0, 500))}`
            )
          );
          return;
        }
        try {
          const raw = resultEvent.structured_output ?? resultEvent.result;
          const content = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const usage = resultEvent.usage as
            | { input_tokens: number; output_tokens: number }
            | undefined;
          resolve({
            content,
            ...(usage ? { usage } : {}),
            ...(typeof resultEvent.model === 'string' ? { model: resultEvent.model } : {}),
          });
        } catch (err) {
          reject(
            new Error(
              `Failed to parse Claude CLI structured output: ${
                err instanceof Error ? err.message : String(err)
              }.`
            )
          );
        }
      });

      child.stdin.write(stdinPayload);
      child.stdin.end();
    });
  }
}
