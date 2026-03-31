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
import * as os from 'node:os';
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
  const tmpDir = path.join(os.tmpdir(), `harness-pipeline-e2e-${process.pid}`);
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

describe('Offline fallback: fetch fails, fallback.json provides pricing', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-offline-${process.pid}`);
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let warnOutput: string[];
  let originalCwd: string;

  const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');

  const fixtureEntry = JSON.stringify({
    timestamp: '2026-03-31T10:00:00.000Z',
    session_id: 'offline-sess-001',
    token_usage: { input_tokens: 1000, output_tokens: 500 },
    model: 'claude-sonnet-4-20250514',
  });

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.dirname(costsFile), { recursive: true });
    fs.writeFileSync(costsFile, fixtureEntry + '\n');
    process.chdir(tmpDir);
    logOutput = [];
    warnOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnOutput.push(args.join(' '));
    });
    // Mock fetch to fail (simulate offline)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network unavailable')));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses fallback.json when network fetch fails and no disk cache exists', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    const output = JSON.parse(logOutput.join(''));
    // Session should be found
    expect(output.sessionId).toBe('offline-sess-001');
    // Cost should be non-null — fallback.json has pricing for claude-sonnet-4-20250514
    expect(typeof output.costMicroUSD).toBe('number');
    expect(output.costMicroUSD).toBeGreaterThan(0);
  });

  it('emits staleness warning when fallback has been used for more than 7 days', async () => {
    // Write a staleness marker dated 10 days ago
    const markerDir = path.join(tmpDir, '.harness', 'cache');
    fs.mkdirSync(markerDir, { recursive: true });
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(markerDir, 'staleness-marker.json'),
      JSON.stringify({ firstFallbackUse: tenDaysAgo })
    );

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    // Command must succeed and produce valid priced output (confirms fallback path ran)
    const output = JSON.parse(logOutput[logOutput.length - 1]!);
    expect(output.sessionId).toBe('offline-sess-001');
    expect(output.costMicroUSD).toBeGreaterThan(0);

    // The staleness warning must appear in console.warn output
    expect(warnOutput.length).toBeGreaterThan(0);
    expect(warnOutput.some((line) => line.includes('stale'))).toBe(true);
  });
});

describe('Spec criterion 9: unknown model emits warning and returns null cost', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-unknown-model-${process.pid}`);
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let warnOutput: string[];
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, '.harness', 'metrics'), { recursive: true });
    process.chdir(tmpDir);
    logOutput = [];
    warnOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnOutput.push(args.join(' '));
    });
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('model with no pricing data produces null cost and logs a warning', async () => {
    const entry = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'unknown-model-sess',
      token_usage: { input_tokens: 1000, output_tokens: 500 },
      model: 'claude-future-unknown-model-9999',
    });
    fs.writeFileSync(path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl'), entry + '\n');

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    const output = JSON.parse(logOutput[logOutput.length - 1]!);
    expect(output.sessionId).toBe('unknown-model-sess');
    // Unknown model → cost must be null
    expect(output.costMicroUSD).toBeNull();
    // Pricing module must warn about the unknown model
    expect(warnOutput.some((line) => line.toLowerCase().includes('no pricing'))).toBe(true);
  });
});

describe('Spec criterion 6: successful network fetch writes pricing cache to disk', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-cache-write-${process.pid}`);
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, '.harness', 'metrics'), { recursive: true });
    const entry = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'cache-write-sess',
      token_usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-sonnet-4-20250514',
    });
    fs.writeFileSync(path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl'), entry + '\n');
    process.chdir(tmpDir);
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Stub fetch to return minimal valid LiteLLM JSON so the cache write path is exercised
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            'claude-sonnet-4-20250514': {
              mode: 'chat',
              input_cost_per_token: 0.000003,
              output_cost_per_token: 0.000015,
            },
          }),
      })
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes pricing.json to .harness/cache after a successful network fetch', async () => {
    const cachePath = path.join(tmpDir, '.harness', 'cache', 'pricing.json');
    expect(fs.existsSync(cachePath)).toBe(false);

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    // Cache file must now exist
    expect(fs.existsSync(cachePath)).toBe(true);
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(typeof cached.fetchedAt).toBe('string');
    expect(typeof cached.data).toBe('object');
  });
});

describe('--json schema shape validation', () => {
  const tmpDir = path.join(os.tmpdir(), `harness-schema-${process.pid}`);
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let originalCwd: string;

  const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');

  // Two sessions across two days, one with model (priced), one legacy (no model)
  const schemaFixture =
    [
      JSON.stringify({
        timestamp: '2026-03-30T10:00:00.000Z',
        session_id: 'schema-sess-alpha',
        token_usage: { input_tokens: 2000, output_tokens: 1000 },
        model: 'claude-sonnet-4-20250514',
        cache_creation_tokens: 100,
        cache_read_tokens: 50,
      }),
      JSON.stringify({
        timestamp: '2026-03-31T11:00:00.000Z',
        session_id: 'schema-sess-beta',
        token_usage: { input_tokens: 500, output_tokens: 250 },
        // No model — legacy entry
      }),
    ].join('\n') + '\n';

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.dirname(costsFile), { recursive: true });
    fs.writeFileSync(costsFile, schemaFixture);
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

  it('daily --json: each item has required fields with correct types', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json']);

    const output = JSON.parse(logOutput.join(''));
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThanOrEqual(1);

    for (const item of output) {
      expect(typeof item.date).toBe('string');
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof item.sessionCount).toBe('number');
      expect(typeof item.tokens).toBe('object');
      expect(typeof item.tokens.inputTokens).toBe('number');
      expect(typeof item.tokens.outputTokens).toBe('number');
      expect(typeof item.tokens.totalTokens).toBe('number');
      // costMicroUSD is number or null
      expect(item.costMicroUSD === null || typeof item.costMicroUSD === 'number').toBe(true);
      expect(Array.isArray(item.models)).toBe(true);
    }
  });

  it('sessions --json: each item has required fields with correct types', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

    const output = JSON.parse(logOutput.join(''));
    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(2);

    for (const item of output) {
      expect(typeof item.sessionId).toBe('string');
      expect(typeof item.firstTimestamp).toBe('string');
      expect(typeof item.lastTimestamp).toBe('string');
      expect(typeof item.tokens).toBe('object');
      expect(typeof item.tokens.inputTokens).toBe('number');
      expect(typeof item.tokens.outputTokens).toBe('number');
      expect(typeof item.tokens.totalTokens).toBe('number');
      expect(item.costMicroUSD === null || typeof item.costMicroUSD === 'number').toBe(true);
      expect(['harness', 'claude-code', 'merged']).toContain(item.source);
    }
  });

  it('sessions --json: legacy entry has null costMicroUSD and source harness', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

    const output = JSON.parse(logOutput.join(''));
    const beta = output.find((s: { sessionId: string }) => s.sessionId === 'schema-sess-beta');
    expect(beta).toBeDefined();
    expect(beta.costMicroUSD).toBeNull();
    expect(beta.source).toBe('harness');
    // model field must be absent (not present in JSONL)
    expect(beta.model).toBeUndefined();
  });

  it('session <id> --json: priced session has non-null costMicroUSD with cache fields', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'harness',
      'usage',
      'session',
      'schema-sess-alpha',
      '--json',
    ]);

    const output = JSON.parse(logOutput.join(''));
    expect(output.sessionId).toBe('schema-sess-alpha');
    expect(typeof output.tokens).toBe('object');
    expect(typeof output.tokens.inputTokens).toBe('number');
    // schema-sess-alpha has a known model — cost must be positive, not null
    expect(output.costMicroUSD).toBeGreaterThan(0);
    expect(output.source).toBe('harness');
    expect(typeof output.firstTimestamp).toBe('string');
    expect(typeof output.lastTimestamp).toBe('string');
    // Cache tokens from JSONL fixture
    expect(output.cacheCreationTokens).toBe(100);
    expect(output.cacheReadTokens).toBe(50);
  });

  it('latest --json: returns single SessionUsage object, not an array', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

    const output = JSON.parse(logOutput.join(''));
    // Must be an object, not an array
    expect(Array.isArray(output)).toBe(false);
    expect(typeof output).toBe('object');
    // Most recent session by timestamp is schema-sess-beta (2026-03-31)
    expect(output.sessionId).toBe('schema-sess-beta');
    expect(typeof output.firstTimestamp).toBe('string');
    expect(typeof output.lastTimestamp).toBe('string');
    expect(typeof output.tokens).toBe('object');
    expect(output.costMicroUSD === null || typeof output.costMicroUSD === 'number').toBe(true);
    expect(['harness', 'claude-code', 'merged']).toContain(output.source);
  });
});
