import { describe, it, expect } from 'vitest';
import {
  resolveRemoteComprehension,
  normalizeRemoteFileConfig,
  DEFAULT_REMOTE_URL,
} from '../../src/comprehension/remote-config';

const full = {
  HARNESS_COMPREHENSION_STORAGE: 'remote',
  HARNESS_COMPREHENSION_REMOTE_URL: 'https://core.pnyon.example',
  HARNESS_COMPREHENSION_OUTPOST: '7a11f0e0-0000-4000-8000-000000000001',
  PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret',
};

describe('resolveRemoteComprehension (env-driven, shared by cli + orchestrator)', () => {
  it('undefined unless storage=remote', () => {
    expect(resolveRemoteComprehension({})).toBeUndefined();
    expect(
      resolveRemoteComprehension({ ...full, HARNESS_COMPREHENSION_STORAGE: 'committed' })
    ).toBeUndefined();
  });

  it('undefined when outpost/token is missing (fail-safe: never half-enable)', () => {
    for (const drop of ['HARNESS_COMPREHENSION_OUTPOST', 'PNYON_COMPREHENSION_SERVE_TOKEN']) {
      const env: Record<string, string> = { ...full };
      delete env[drop];
      expect(resolveRemoteComprehension(env)).toBeUndefined();
    }
  });

  it('the URL is OPTIONAL — defaults to DEFAULT_REMOTE_URL (pnyon) when unset', () => {
    const env: Record<string, string> = { ...full };
    delete env.HARNESS_COMPREHENSION_REMOTE_URL;
    expect(resolveRemoteComprehension(env)).toEqual({
      baseUrl: DEFAULT_REMOTE_URL,
      outpost: '7a11f0e0-0000-4000-8000-000000000001',
      token: 'pnyon_cst_secret',
      trustRemote: false,
    });
    // A blank/whitespace URL also falls back to the default.
    expect(
      resolveRemoteComprehension({ ...full, HARNESS_COMPREHENSION_REMOTE_URL: '  ' })?.baseUrl
    ).toBe(DEFAULT_REMOTE_URL);
  });

  it('resolves when complete; an explicit URL wins; trustRemote defaults off, enabled by 1/true', () => {
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

describe('resolveRemoteComprehension — committed config block (comprehension.remote) + env merge', () => {
  it('a committed block (enabled + outpost) resolves with only the token in the env', () => {
    // No HARNESS_COMPREHENSION_* env at all except the token — the repo config supplies the rest.
    expect(
      resolveRemoteComprehension(
        { PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret' },
        { enabled: true, outpost: 'o-file', url: 'https://file.example', trustRemote: true }
      )
    ).toEqual({
      baseUrl: 'https://file.example',
      outpost: 'o-file',
      token: 'pnyon_cst_secret',
      trustRemote: true,
    });
  });

  it('the URL still defaults when neither env nor the committed block sets it', () => {
    expect(
      resolveRemoteComprehension(
        { PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret' },
        { enabled: true, outpost: 'o-file' }
      )?.baseUrl
    ).toBe(DEFAULT_REMOTE_URL);
  });

  it('env OVERRIDES the committed block per field (url + outpost + trust)', () => {
    const res = resolveRemoteComprehension(
      {
        PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret',
        HARNESS_COMPREHENSION_REMOTE_URL: 'https://env.example',
        HARNESS_COMPREHENSION_OUTPOST: 'o-env',
        HARNESS_COMPREHENSION_TRUST_REMOTE: '0',
      },
      { enabled: true, url: 'https://file.example', outpost: 'o-file', trustRemote: true }
    );
    expect(res).toEqual({
      baseUrl: 'https://env.example',
      outpost: 'o-env',
      token: 'pnyon_cst_secret',
      trustRemote: false,
    });
  });

  it('env STORAGE opts OUT even when the committed block enables it (env wins)', () => {
    expect(
      resolveRemoteComprehension(
        {
          PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret',
          HARNESS_COMPREHENSION_STORAGE: 'committed',
        },
        { enabled: true, outpost: 'o-file' }
      )
    ).toBeUndefined();
  });

  it('the TOKEN is env-only — a committed block never supplies it (no token ⇒ undefined)', () => {
    expect(resolveRemoteComprehension({}, { enabled: true, outpost: 'o-file' })).toBeUndefined();
  });

  it('a committed block that is not enabled stays local', () => {
    expect(
      resolveRemoteComprehension(
        { PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret' },
        { enabled: false, outpost: 'o-file' }
      )
    ).toBeUndefined();
  });
});

describe('normalizeRemoteFileConfig', () => {
  it('keeps only well-typed known fields and DROPS a token / unknown keys', () => {
    expect(
      normalizeRemoteFileConfig({
        enabled: true,
        url: 'https://x',
        outpost: 'o',
        trustRemote: false,
        token: 'pnyon_cst_should_be_ignored',
        extra: 1,
      })
    ).toEqual({ enabled: true, url: 'https://x', outpost: 'o', trustRemote: false });
  });

  it('ignores wrong-typed fields and returns undefined for a non-object', () => {
    expect(normalizeRemoteFileConfig({ enabled: 'yes', outpost: 5 })).toEqual({});
    expect(normalizeRemoteFileConfig(null)).toBeUndefined();
    expect(normalizeRemoteFileConfig('nope')).toBeUndefined();
  });
});
