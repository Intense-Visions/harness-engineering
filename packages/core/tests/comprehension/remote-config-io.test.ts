import { describe, it, expect } from 'vitest';
import { resolveRemoteComprehensionWithGlobalToken } from '../../src/comprehension/remote-config-io';
import type { RemoteComprehensionFileConfig } from '../../src/comprehension/remote-config';

// Obviously-fake tokens — never a real-looking secret literal.
const FILE_TOKEN = 'pnyon_cst_FAKE_test_only';
const ENV_TOKEN = 'pnyon_cst_FAKE_from_env';

// The env fields OTHER than the token, so the global-token fallback path can produce a full config.
const envBase = {
  HARNESS_COMPREHENSION_STORAGE: 'remote',
  HARNESS_COMPREHENSION_REMOTE_URL: 'https://core.pnyon.example',
  HARNESS_COMPREHENSION_OUTPOST: '7a11f0e0-0000-4000-8000-000000000001',
};

/** Deps whose credential read always yields `token` (undefined ⇒ "no global credential"). */
function credsYielding(token: string | undefined): { readFile: () => string | undefined } {
  return {
    readFile: () =>
      token === undefined ? undefined : JSON.stringify({ 'comprehension-serve-token': token }),
  };
}

describe('resolveRemoteComprehensionWithGlobalToken (env override → global credential)', () => {
  it('uses the env token verbatim and never reads the file when the env token is present', () => {
    // A throwing reader PROVES the credential file is not consulted on the env-token path.
    const deps = {
      readFile: (): string | undefined => {
        throw new Error('credential file must not be read when the env token is present');
      },
    };
    const result = resolveRemoteComprehensionWithGlobalToken(
      { ...envBase, PNYON_COMPREHENSION_SERVE_TOKEN: ENV_TOKEN },
      undefined,
      deps
    );
    expect(result?.token).toBe(ENV_TOKEN);
  });

  it('injects the global token when the env token is absent, yielding a full config', () => {
    const result = resolveRemoteComprehensionWithGlobalToken(
      envBase,
      undefined,
      credsYielding(FILE_TOKEN)
    );
    expect(result).toEqual({
      baseUrl: 'https://core.pnyon.example',
      outpost: '7a11f0e0-0000-4000-8000-000000000001',
      token: FILE_TOKEN,
      trustRemote: false,
    });
  });

  it('injects the global token when the env token is present but only whitespace', () => {
    const result = resolveRemoteComprehensionWithGlobalToken(
      { ...envBase, PNYON_COMPREHENSION_SERVE_TOKEN: '   ' },
      undefined,
      credsYielding(FILE_TOKEN)
    );
    expect(result?.token).toBe(FILE_TOKEN);
  });

  it('returns undefined (local behavior) when neither env nor global supplies a token', () => {
    expect(
      resolveRemoteComprehensionWithGlobalToken(envBase, undefined, credsYielding(undefined))
    ).toBeUndefined();
  });

  it('never lets the global token override a present env token', () => {
    const result = resolveRemoteComprehensionWithGlobalToken(
      { ...envBase, PNYON_COMPREHENSION_SERVE_TOKEN: ENV_TOKEN },
      undefined,
      credsYielding(FILE_TOKEN)
    );
    expect(result?.token).toBe(ENV_TOKEN);
    expect(result?.token).not.toBe(FILE_TOKEN);
  });

  it('does not mutate the caller-supplied env when filling from the global credential', () => {
    const env = { ...envBase } as Record<string, string | undefined>;
    resolveRemoteComprehensionWithGlobalToken(env, undefined, credsYielding(FILE_TOKEN));
    expect('PNYON_COMPREHENSION_SERVE_TOKEN' in env).toBe(false);
  });

  it('threads the committed `file` block through: committed enabled+outpost + global token resolves', () => {
    // No env routing at all — the committed block supplies enable + outpost, and the global token
    // supplies the secret. Proves `file` is forwarded to the pure resolver unchanged.
    const file: RemoteComprehensionFileConfig = {
      enabled: true,
      url: 'https://committed.pnyon.example',
      outpost: '7a11f0e0-0000-4000-8000-0000000000ab',
      trustRemote: true,
    };
    const result = resolveRemoteComprehensionWithGlobalToken({}, file, credsYielding(FILE_TOKEN));
    expect(result).toEqual({
      baseUrl: 'https://committed.pnyon.example',
      outpost: '7a11f0e0-0000-4000-8000-0000000000ab',
      token: FILE_TOKEN,
      trustRemote: true,
    });
  });

  it('threaded `file` still yields undefined when it does not enable remote, even with a global token', () => {
    const file: RemoteComprehensionFileConfig = {
      enabled: false,
      outpost: '7a11f0e0-0000-4000-8000-0000000000ab',
    };
    const result = resolveRemoteComprehensionWithGlobalToken({}, file, credsYielding(FILE_TOKEN));
    expect(result).toBeUndefined();
  });

  it('stays undefined when storage is not remote, even with a global token available', () => {
    const result = resolveRemoteComprehensionWithGlobalToken(
      { ...envBase, HARNESS_COMPREHENSION_STORAGE: 'committed' },
      undefined,
      credsYielding(FILE_TOKEN)
    );
    expect(result).toBeUndefined();
  });
});
