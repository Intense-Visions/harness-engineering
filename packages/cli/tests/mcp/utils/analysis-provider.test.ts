import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveAnalysisProvider,
  isClaudeCliAvailable,
  isCliAvailable,
  resolveProviderKind,
  type AnalysisCliConfig,
} from '../../../src/mcp/utils/analysis-provider.js';

/**
 * The eval MCP tools (acceptance_eval / outcome_eval) were Anthropic-only, so a
 * fully-local run (no ANTHROPIC_API_KEY) got no judge and degraded to advisory.
 * The shared resolver now falls back to a local /v1 endpoint so the reasoner can
 * serve verdicts on-device. These tests pin the selection precedence.
 */
const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'HARNESS_ANALYSIS_BASE_URL',
  'HARNESS_ANALYSIS_MODEL',
  'HARNESS_ANALYSIS_API_KEY',
] as const;

function providerName(p: unknown): string | undefined {
  if (p === null || typeof p !== 'object') return undefined;
  return (p as { constructor?: { name?: string } }).constructor?.name;
}

describe('resolveAnalysisProvider — provider selection precedence', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const clear = () => ENV_KEYS.forEach((k) => delete process.env[k]);

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns null (degrade) when neither a cloud key nor a local endpoint is configured (and no claude on PATH)', async () => {
    clear();
    // Inject claude-unavailable so this pins the fully-empty environment
    // deterministically regardless of whether the host has `claude` installed
    // (D8 appended a claude-CLI step; absent all three signals it is still null).
    expect(
      await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => false })
    ).toBeNull();
  });

  it('uses the Anthropic provider when ANTHROPIC_API_KEY is set', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(providerName(await resolveAnalysisProvider('claude-x'))).toBe(
      'AnthropicAnalysisProvider'
    );
  });

  it('uses a local OpenAI-compatible provider when HARNESS_ANALYSIS_BASE_URL is set and no cloud key', async () => {
    clear();
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
    process.env.HARNESS_ANALYSIS_MODEL = 'qwen3.6:27b';
    expect(providerName(await resolveAnalysisProvider())).toBe('OpenAICompatibleAnalysisProvider');
  });

  it('uses a config-declared endpoint (ADR 0109 slice 3) when the env base-url is unset', async () => {
    clear();
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          isClaudeCliAvailable: () => false,
          endpoint: { baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'vendor-key' },
        })
      )
    ).toBe('OpenAICompatibleAnalysisProvider');
  });

  it('prefers Anthropic over a config-declared endpoint (unchanged precedence)', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          endpoint: { baseUrl: 'http://127.0.0.1:1234/v1' },
        })
      )
    ).toBe('AnthropicAnalysisProvider');
  });

  it('prefers Anthropic over the local endpoint when both are configured (backward compatible)', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
    expect(providerName(await resolveAnalysisProvider())).toBe('AnthropicAnalysisProvider');
  });

  it('treats a blank/whitespace local endpoint as unset (degrade, never throws)', async () => {
    clear();
    process.env.HARNESS_ANALYSIS_BASE_URL = '   ';
    // claude-unavailable injected so the whitespace-endpoint degrade is pinned to
    // null independent of the host having `claude` installed.
    expect(
      await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => false })
    ).toBeNull();
  });

  // --- D8: append-last claude-CLI fallback -------------------------------------

  it('falls back to ClaudeCliAnalysisProvider when neither key nor base-url is set but claude is on PATH', async () => {
    clear();
    expect(
      providerName(await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => true }))
    ).toBe('ClaudeCliAnalysisProvider');
  });

  it('returns null when nothing is configured and claude is NOT on PATH', async () => {
    clear();
    expect(
      await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => false })
    ).toBeNull();
  });

  it('still prefers Anthropic / local over claude-CLI (append-last, unchanged precedence)', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(
      providerName(await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => true }))
    ).toBe('AnthropicAnalysisProvider');
    delete process.env.ANTHROPIC_API_KEY;
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
    expect(
      providerName(await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => true }))
    ).toBe('OpenAICompatibleAnalysisProvider');
  });
});

// --- #1710: generic subscription-CLI provider (codex/gemini/custom) -----------

describe('resolveAnalysisProvider — generic subscription CLI (#1710)', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const clear = () => ENV_KEYS.forEach((k) => delete process.env[k]);
  const codexCli: AnalysisCliConfig = { vendor: 'codex', command: 'codex' };

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('resolves GenericCliAnalysisProvider when a CLI is configured and on PATH (no key, no endpoint)', async () => {
    clear();
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          cli: codexCli,
          isGenericCliAvailable: () => true,
          isClaudeCliAvailable: () => true, // claude also present — generic must win
        })
      )
    ).toBe('GenericCliAnalysisProvider');
  });

  it('inserts the generic CLI BEFORE claude-CLI in precedence', async () => {
    clear();
    // Configured codex on PATH AND claude on PATH → codex wins.
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          cli: codexCli,
          isGenericCliAvailable: () => true,
          isClaudeCliAvailable: () => true,
        })
      )
    ).toBe('GenericCliAnalysisProvider');
    // Configured codex NOT on PATH but claude is → falls through to claude-CLI.
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          cli: codexCli,
          isGenericCliAvailable: () => false,
          isClaudeCliAvailable: () => true,
        })
      )
    ).toBe('ClaudeCliAnalysisProvider');
  });

  it('still prefers Anthropic and a local endpoint over the generic CLI (append-after)', async () => {
    clear();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          cli: codexCli,
          isGenericCliAvailable: () => true,
        })
      )
    ).toBe('AnthropicAnalysisProvider');
    delete process.env.ANTHROPIC_API_KEY;
    process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          cli: codexCli,
          isGenericCliAvailable: () => true,
        })
      )
    ).toBe('OpenAICompatibleAnalysisProvider');
  });

  it('degrades to null when a CLI is configured but NOT on PATH and nothing else resolves', async () => {
    clear();
    expect(
      await resolveAnalysisProvider(undefined, {
        cli: codexCli,
        isGenericCliAvailable: () => false,
        isClaudeCliAvailable: () => false,
      })
    ).toBeNull();
  });

  it('builds a custom-vendor provider from a template spec', async () => {
    clear();
    const custom: AnalysisCliConfig = {
      vendor: 'custom',
      command: 'myagent',
      custom: { args: ['run', '{{prompt}}'], parse: 'text' },
    };
    expect(
      providerName(
        await resolveAnalysisProvider(undefined, {
          cli: custom,
          isGenericCliAvailable: () => true,
          isClaudeCliAvailable: () => false,
        })
      )
    ).toBe('GenericCliAnalysisProvider');
  });
});

describe('resolveProviderKind — generic-cli precedence (#1710)', () => {
  const codexCli: AnalysisCliConfig = { vendor: 'codex', command: 'codex' };

  it('generic-cli when configured + on PATH, over claude-cli', () => {
    expect(
      resolveProviderKind({
        env: {},
        cli: codexCli,
        isGenericCliAvailable: () => true,
        isClaudeCliAvailable: () => true,
      })
    ).toBe('generic-cli');
  });

  it('falls through to claude-cli when the generic CLI is not on PATH', () => {
    expect(
      resolveProviderKind({
        env: {},
        cli: codexCli,
        isGenericCliAvailable: () => false,
        isClaudeCliAvailable: () => true,
      })
    ).toBe('claude-cli');
  });

  it('anthropic and local still win over generic-cli', () => {
    expect(
      resolveProviderKind({
        env: { ANTHROPIC_API_KEY: 'k' },
        cli: codexCli,
        isGenericCliAvailable: () => true,
      })
    ).toBe('anthropic');
    expect(
      resolveProviderKind({
        env: { HARNESS_ANALYSIS_BASE_URL: 'http://x' },
        cli: codexCli,
        isGenericCliAvailable: () => true,
      })
    ).toBe('local');
  });

  it('null when a CLI is configured but not on PATH and nothing else resolves', () => {
    expect(
      resolveProviderKind({
        env: {},
        cli: codexCli,
        isGenericCliAvailable: () => false,
        isClaudeCliAvailable: () => false,
      })
    ).toBeNull();
  });
});

describe('isCliAvailable — generalized, injectable, Windows-safe PATH scan', () => {
  it('detects an arbitrary command (codex) on a POSIX PATH dir', () => {
    expect(
      isCliAvailable('codex', {
        platform: 'linux',
        env: { PATH: '/opt/bin:/usr/bin' },
        fileExists: (p) => p === '/usr/bin/codex',
      })
    ).toBe(true);
  });

  it('resolves a Windows PATHEXT variant for a bare command name', () => {
    expect(
      isCliAvailable('gemini', {
        platform: 'win32',
        env: { Path: 'C:\\bin', PATHEXT: '.COM;.EXE;.CMD' },
        fileExists: (p) => p === 'C:\\bin\\gemini.CMD',
      })
    ).toBe(true);
  });

  it('probes an absolute/relative path directly, not against PATH', () => {
    expect(
      isCliAvailable('/usr/local/bin/codex', {
        platform: 'linux',
        env: { PATH: '/nowhere' },
        fileExists: (p) => p === '/usr/local/bin/codex',
      })
    ).toBe(true);
  });

  it('is false for an empty command or when the binary is absent', () => {
    expect(isCliAvailable('', { fileExists: () => true })).toBe(false);
    expect(isCliAvailable('codex', { env: { PATH: '/opt/bin' }, fileExists: () => false })).toBe(
      false
    );
  });
});

describe('isClaudeCliAvailable — injectable, Windows-safe PATH scan', () => {
  it('detects claude on a POSIX PATH dir', () => {
    expect(
      isClaudeCliAvailable({
        // Pin the platform so the POSIX `:`-delimiter + bare-`claude` semantics are
        // exercised regardless of the HOST OS — on a win32 CI runner the default
        // `process.platform` would split on `;` and probe PATHEXT variants, missing
        // the bare `/usr/bin/claude` and failing spuriously.
        platform: 'linux',
        env: { PATH: '/opt/bin:/usr/bin' },
        fileExists: (p) => p === '/usr/bin/claude',
      })
    ).toBe(true);
  });

  it('is false when PATH is empty or claude is absent', () => {
    expect(isClaudeCliAvailable({ env: {}, fileExists: () => false })).toBe(false);
    expect(isClaudeCliAvailable({ env: { PATH: '/opt/bin' }, fileExists: () => false })).toBe(
      false
    );
  });

  it('resolves a Windows PATHEXT variant', () => {
    expect(
      isClaudeCliAvailable({
        platform: 'win32',
        env: { Path: 'C:\\bin', PATHEXT: '.COM;.EXE;.CMD' },
        fileExists: (p) => p === 'C:\\bin\\claude.CMD',
      })
    ).toBe(true);
  });

  it('splits PATH with the platform-correct delimiter (win32 uses ";")', () => {
    expect(
      isClaudeCliAvailable({
        platform: 'win32',
        env: { Path: 'C:\\a;C:\\b', PATHEXT: '.EXE' },
        fileExists: (p) => p === 'C:\\b\\claude.EXE',
      })
    ).toBe(true);
  });
});

describe('resolveProviderKind — mirrors resolveAnalysisProvider precedence', () => {
  it('anthropic when ANTHROPIC_API_KEY is set (wins over local + claude-cli)', () => {
    expect(
      resolveProviderKind({
        env: { ANTHROPIC_API_KEY: 'k', HARNESS_ANALYSIS_BASE_URL: 'http://x' },
        isClaudeCliAvailable: () => true,
      })
    ).toBe('anthropic');
  });

  it('local when a base URL is set and no key (wins over claude-cli)', () => {
    expect(
      resolveProviderKind({
        env: { HARNESS_ANALYSIS_BASE_URL: 'http://x' },
        isClaudeCliAvailable: () => true,
      })
    ).toBe('local');
  });

  it('local when a config-declared endpoint is present even with an empty env (slice 3)', () => {
    expect(
      resolveProviderKind({
        env: {},
        endpoint: { baseUrl: 'http://vendor-gateway/v1' },
        isClaudeCliAvailable: () => true,
      })
    ).toBe('local');
  });

  it('claude-cli when neither key nor base URL but claude is on PATH', () => {
    expect(resolveProviderKind({ env: {}, isClaudeCliAvailable: () => true })).toBe('claude-cli');
  });

  it('null when nothing resolves', () => {
    expect(resolveProviderKind({ env: {}, isClaudeCliAvailable: () => false })).toBeNull();
  });
});
