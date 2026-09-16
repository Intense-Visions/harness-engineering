import { describe, it, expect } from 'vitest';
import {
  resolveRemoteComprehension,
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
