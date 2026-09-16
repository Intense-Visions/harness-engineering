import { describe, it, expect } from 'vitest';
import { resolveDiscoveryEnv } from '../../src/commands/public-outposts';

describe('resolveDiscoveryEnv (public-outposts discovery)', () => {
  const full = {
    HARNESS_COMPREHENSION_REMOTE_URL: 'https://core.pnyon.example',
    PNYON_COMPREHENSION_SERVE_TOKEN: 'pnyon_cst_secret',
  };

  it('resolves URL + token, and does NOT require HARNESS_COMPREHENSION_OUTPOST', () => {
    // Deliberately no HARNESS_COMPREHENSION_OUTPOST — discovery is what finds it.
    expect(resolveDiscoveryEnv(full)).toEqual({
      baseUrl: 'https://core.pnyon.example',
      token: 'pnyon_cst_secret',
    });
  });

  it('reports each missing variable (never half-resolves)', () => {
    expect(resolveDiscoveryEnv({})).toEqual({
      missing: ['HARNESS_COMPREHENSION_REMOTE_URL', 'PNYON_COMPREHENSION_SERVE_TOKEN'],
    });
    expect(resolveDiscoveryEnv({ ...full, PNYON_COMPREHENSION_SERVE_TOKEN: '  ' })).toEqual({
      missing: ['PNYON_COMPREHENSION_SERVE_TOKEN'],
    });
    expect(resolveDiscoveryEnv({ ...full, HARNESS_COMPREHENSION_REMOTE_URL: '' })).toEqual({
      missing: ['HARNESS_COMPREHENSION_REMOTE_URL'],
    });
  });
});
