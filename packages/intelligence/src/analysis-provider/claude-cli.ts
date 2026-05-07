import { spawn } from 'node:child_process';
import type { AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js';
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

    const args = [
      '--print',
      '-p',
      prompt,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify({ type: 'object', ...jsonSchema }),
    ];

    if (model) {
      args.push('--model', model);
    }

    const startMs = performance.now();
    const result = await this.runClaude(args);
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
}
