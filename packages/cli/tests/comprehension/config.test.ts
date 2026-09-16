import { describe, it, expect } from 'vitest';
import {
  readComprehensionConfig,
  comprehensionEndpoint,
  comprehensionCli,
  selectSemanticModel,
  resolveComprehensionCiMode,
  resolveRemoteComprehension,
  remoteFileConfig,
} from '../../src/comprehension/config';
import {
  HarnessConfigSchema,
  ComprehensionConfigSchema,
  type HarnessConfig,
} from '../../src/config/schema';

const cfg = (over: Record<string, unknown> = {}) => ComprehensionConfigSchema.parse(over);

describe('readComprehensionConfig', () => {
  it('returns all defaults when the block is absent', () => {
    expect(readComprehensionConfig(undefined)).toEqual({
      storage: 'committed',
      semantic: true,
      model: null,
      maxTokensPerRun: 200000,
      concurrency: 4,
      ci: 'verify',
      hook: false,
    });
  });

  it('applies overrides and defaults the rest', () => {
    const config = { comprehension: { semantic: false, concurrency: 2 } } as HarnessConfig;
    expect(readComprehensionConfig(config)).toEqual({
      storage: 'committed',
      semantic: false,
      model: null,
      maxTokensPerRun: 200000,
      concurrency: 2,
      ci: 'verify',
      hook: false,
    });
  });

  it('handles a null config', () => {
    expect(readComprehensionConfig(null).storage).toBe('committed');
  });
});

describe('ComprehensionConfigSchema wired into HarnessConfigSchema', () => {
  it('accepts a valid comprehension block', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      comprehension: { storage: 'cache' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid enum value', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      comprehension: { storage: 'nope' },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('resolveComprehensionCiMode (ADR 0116 §2 — the seam is now CONSUMED)', () => {
  it("defaults to 'verify' (token-free gate) when unset", () => {
    expect(resolveComprehensionCiMode(undefined)).toBe('verify');
    expect(resolveComprehensionCiMode(null)).toBe('verify');
  });

  it("reads 'off' from config (gate disabled)", () => {
    expect(resolveComprehensionCiMode({ comprehension: { ci: 'off' } } as HarnessConfig)).toBe(
      'off'
    );
  });

  it("reads 'refresh' from config (main-pass seam)", () => {
    expect(resolveComprehensionCiMode({ comprehension: { ci: 'refresh' } } as HarnessConfig)).toBe(
      'refresh'
    );
  });
});

describe('comprehensionEndpoint', () => {
  it('reflects analysisBaseUrl and is empty when unset', () => {
    expect(comprehensionEndpoint(cfg({ analysisBaseUrl: 'http://vendor/v1' }))).toEqual({
      baseUrl: 'http://vendor/v1',
    });
    expect(comprehensionEndpoint(cfg({}))).toEqual({});
  });
});

describe('comprehensionCli (#1710 — bare subscription CLI)', () => {
  it('is undefined when no analysisCli block is set', () => {
    expect(comprehensionCli(cfg({}))).toBeUndefined();
  });

  it('reflects a codex vendor block', () => {
    expect(comprehensionCli(cfg({ analysisCli: { vendor: 'codex', command: 'codex' } }))).toEqual({
      vendor: 'codex',
      command: 'codex',
    });
  });

  it('carries model + custom template for a custom vendor', () => {
    expect(
      comprehensionCli(
        cfg({
          analysisCli: {
            vendor: 'custom',
            command: 'myagent',
            model: 'm1',
            custom: { args: ['run', '{{prompt}}'], promptVia: 'stdin', parse: 'json' },
          },
        })
      )
    ).toEqual({
      vendor: 'custom',
      command: 'myagent',
      model: 'm1',
      custom: { args: ['run', '{{prompt}}'], promptVia: 'stdin', parse: 'json' },
    });
  });

  it('the schema rejects an analysisCli block missing a command', () => {
    expect(
      HarnessConfigSchema.safeParse({
        version: 1,
        comprehension: { analysisCli: { vendor: 'codex' } },
      }).success
    ).toBe(false);
  });
});

describe('selectSemanticModel — generic CLI is provider-neutral (#1710)', () => {
  it('returns undefined for a configured CLI on PATH (never a Claude id), even with claude on PATH', () => {
    expect(
      selectSemanticModel(cfg({ analysisCli: { vendor: 'codex', command: 'codex' } }), {
        isGenericCliAvailable: () => true,
        isClaudeCliAvailable: () => true,
        env: {},
      })
    ).toBeUndefined();
  });

  it('falls through to the Claude default when the configured CLI is NOT on PATH', () => {
    expect(
      selectSemanticModel(cfg({ analysisCli: { vendor: 'codex', command: 'codex' } }), {
        isGenericCliAvailable: () => false,
        isClaudeCliAvailable: () => true,
        env: {},
      })
    ).toBe('claude-haiku-4-5');
  });
});

describe('selectSemanticModel (ADR 0109 slice 3 — model/provider decisions cannot diverge)', () => {
  // The regression this pins: a config-declared endpoint must NOT get a Claude
  // model id forced onto it just because `claude` is on PATH. Before the fix, the
  // model was chosen from `resolveProviderKind()` WITHOUT the endpoint, so it
  // returned 'claude-cli' → 'claude-haiku-4-5' → the vendor gateway rejected it and
  // comprehension silently produced zero semantic units.
  it('returns undefined for a config endpoint even with claude on PATH (the bug)', () => {
    expect(
      selectSemanticModel(cfg({ analysisBaseUrl: 'http://vendor/v1' }), {
        isClaudeCliAvailable: () => true,
        env: {},
      })
    ).toBeUndefined();
  });

  it('returns the Claude default when no endpoint and claude is on PATH', () => {
    expect(selectSemanticModel(cfg({}), { isClaudeCliAvailable: () => true, env: {} })).toBe(
      'claude-haiku-4-5'
    );
  });

  it('an explicit config model wins over any provider', () => {
    expect(
      selectSemanticModel(cfg({ model: 'my-model', analysisBaseUrl: 'http://vendor/v1' }), {
        isClaudeCliAvailable: () => true,
        env: {},
      })
    ).toBe('my-model');
  });

  it('returns undefined when nothing resolves (degrade to static-only)', () => {
    expect(
      selectSemanticModel(cfg({}), { isClaudeCliAvailable: () => false, env: {} })
    ).toBeUndefined();
  });
});

describe('resolveRemoteComprehension (env-driven, not committed config)', () => {
  const full = {
    HARNESS_COMPREHENSION_STORAGE: 'remote',
    HARNESS_COMPREHENSION_REMOTE_URL: 'https://core.pnyon.example',
    HARNESS_COMPREHENSION_OUTPOST: '7a11f0e0-0000-4000-8000-000000000001',
    PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret',
  };

  it('undefined unless storage=remote (default = local)', () => {
    expect(resolveRemoteComprehension({})).toBeUndefined();
    expect(
      resolveRemoteComprehension({ ...full, HARNESS_COMPREHENSION_STORAGE: 'committed' })
    ).toBeUndefined();
  });

  it('undefined when outpost/token is missing (fail-safe: never half-enable)', () => {
    // The URL is OPTIONAL (defaults to pnyon), so only the outpost + token are required.
    for (const drop of ['HARNESS_COMPREHENSION_OUTPOST', 'PNYON_COMPREHENSION_SERVE_TOKEN']) {
      const env: Record<string, string> = { ...full };
      delete env[drop];
      expect(resolveRemoteComprehension(env)).toBeUndefined();
    }
  });

  it('the URL is OPTIONAL — a missing HARNESS_COMPREHENSION_REMOTE_URL still resolves (default host)', () => {
    const env: Record<string, string> = { ...full };
    delete env.HARNESS_COMPREHENSION_REMOTE_URL;
    expect(resolveRemoteComprehension(env)).toBeDefined();
  });

  it('resolves the config when complete; trustRemote defaults off, enabled by 1/true', () => {
    expect(resolveRemoteComprehension(full)).toEqual({
      baseUrl: 'https://core.pnyon.example',
      outpost: '7a11f0e0-0000-4000-8000-000000000001',
      token: 'pnyon_cst_secret',
      trustRemote: false,
    });
    expect(
      resolveRemoteComprehension({ ...full, HARNESS_COMPREHENSION_TRUST_REMOTE: '1' })?.trustRemote
    ).toBe(true);
    expect(
      resolveRemoteComprehension({ ...full, HARNESS_COMPREHENSION_TRUST_REMOTE: 'true' })
        ?.trustRemote
    ).toBe(true);
    expect(
      resolveRemoteComprehension({ ...full, HARNESS_COMPREHENSION_TRUST_REMOTE: 'no' })?.trustRemote
    ).toBe(false);
  });
});

describe('remoteFileConfig (committed comprehension.remote block → resolver file arg)', () => {
  it('undefined when the block is absent', () => {
    expect(remoteFileConfig(cfg())).toBeUndefined();
  });

  it('maps the committed block, dropping undefined-valued optionals', () => {
    const cconf = cfg({ remote: { enabled: true, outpost: 'o-1' } });
    // url/trustRemote unset in the block → omitted (not `undefined`), enabled kept.
    expect(remoteFileConfig(cconf)).toEqual({ enabled: true, outpost: 'o-1', trustRemote: false });
  });

  it('feeds the resolver so a committed block + env token resolves remote', () => {
    const cconf = cfg({ remote: { enabled: true, outpost: 'o-1', url: 'https://file.example' } });
    expect(
      resolveRemoteComprehension(
        { PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret' },
        remoteFileConfig(cconf)
      )
    ).toEqual({
      baseUrl: 'https://file.example',
      outpost: 'o-1',
      token: 'pnyon_cst_secret',
      trustRemote: false,
    });
  });
});
