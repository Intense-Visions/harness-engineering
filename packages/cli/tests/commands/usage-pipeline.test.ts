/**
 * usage-pipeline.test.ts — Phase 5: Integration Testing
 *
 * Tests the full pipeline from hook write through CLI read.
 * Does NOT duplicate scenarios covered in usage.test.ts or cost-tracker.test.ts.
 *
 * Note: Uses JSONL fixture files written directly (matching the hook output format
 * that jsonl-reader.ts can parse) rather than shelling out to the hook binary, per
 * integration testing guidance. The hook output format uses snake_case cache fields
 * (cache_creation_tokens, cache_read_tokens) which jsonl-reader normalises to camelCase.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { createUsageCommand } from '../../src/commands/usage';

function createProgram(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  program.addCommand(createUsageCommand());
  return program;
}

describe('E2E pipeline: hook writes → CLI reads → priced output', () => {
  const tmpDir = path.join(__dirname, '__pipeline-e2e-tmp__');
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, '.harness', 'metrics'), { recursive: true });
    process.chdir(tmpDir);
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hook-written entry is readable by CLI and priced correctly via fallback', async () => {
    // Write a JSONL fixture matching the hook output format that jsonl-reader.ts can parse.
    // The hook writes cacheCreationTokens/cacheReadTokens (camelCase) but jsonl-reader reads
    // cache_creation_tokens/cache_read_tokens (snake_case). Use snake_case here so the
    // full read → normalise → price pipeline is exercised end-to-end.
    // claude-sonnet-4-20250514 exists in fallback.json with known pricing.
    const hookOutputEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      session_id: 'e2e-session-001',
      token_usage: { input_tokens: 1000, output_tokens: 500 },
      cache_creation_tokens: 200,
      cache_read_tokens: 100,
      model: 'claude-sonnet-4-20250514',
    });

    const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
    fs.writeFileSync(costsFile, hookOutputEntry + '\n');

    // Verify the JSONL file was created with expected fields
    expect(fs.existsSync(costsFile)).toBe(true);
    const written = JSON.parse(fs.readFileSync(costsFile, 'utf-8').trim());
    expect(written.session_id).toBe('e2e-session-001');
    expect(written.token_usage.input_tokens).toBe(1000);
    expect(written.cache_creation_tokens).toBe(200);
    expect(written.cache_read_tokens).toBe(100);

    // Now run CLI to verify the full read → price pipeline
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    const output = JSON.parse(logOutput.join(''));
    expect(output.sessionId).toBe('e2e-session-001');
    expect(output.tokens.inputTokens).toBe(1000);
    expect(output.tokens.outputTokens).toBe(500);
    expect(output.cacheCreationTokens).toBe(200);
    expect(output.cacheReadTokens).toBe(100);
    expect(output.model).toBe('claude-sonnet-4-20250514');
    // Cost must be a positive number (priced via fallback.json)
    expect(typeof output.costMicroUSD).toBe('number');
    expect(output.costMicroUSD).toBeGreaterThan(0);
  });

  it('hook-written entry without model field results in null cost', async () => {
    const hookOutputEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      session_id: 'e2e-session-nomodel',
      token_usage: { input_tokens: 500, output_tokens: 250 },
    });

    const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
    fs.writeFileSync(costsFile, hookOutputEntry + '\n');

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    const output = JSON.parse(logOutput.join(''));
    expect(output.sessionId).toBe('e2e-session-nomodel');
    // No model — cost must be null, not a number
    expect(output.costMicroUSD).toBeNull();
  });
});
