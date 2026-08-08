import { describe, it, expect } from 'vitest';
import { verifyRender } from '../../src/docs-publish/render/verify';
import type { PlaywrightImporter } from '../../src/docs-publish/render/verify';

/* eslint-disable @typescript-eslint/no-explicit-any -- fake Playwright handles */
function fakeImporter(counts: {
  imagesLoaded: number;
  mediaCardErrors: number;
  mediaSingleCount: number;
  mediaGroupCount: number;
}): PlaywrightImporter {
  const page = {
    goto: async () => undefined,
    evaluate: async () => counts,
  };
  const browser = {
    newPage: async () => page,
    close: async () => undefined,
  };
  return async () => ({ chromium: { launch: async () => browser } }) as any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('verifyRender', () => {
  it('degrades to playwright-not-installed when the import throws', async () => {
    const throwingImporter: PlaywrightImporter = async () => {
      throw new Error('Cannot find module playwright');
    };
    const result = await verifyRender({ targetUrl: 'file:///tmp/page.html' }, throwingImporter);
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe('playwright-not-installed');
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]).toContain('playwright');
  });

  it('passes when images load, no card errors, and no mediaGroup', async () => {
    const result = await verifyRender(
      { targetUrl: 'file:///tmp/page.html' },
      fakeImporter({ imagesLoaded: 2, mediaCardErrors: 0, mediaSingleCount: 2, mediaGroupCount: 0 })
    );
    expect(result.ok).toBe(true);
    expect(result.imagesLoaded).toBe(2);
    expect(result.mediaSingleCount).toBe(2);
    expect(result.failures).toHaveLength(0);
    expect(result.degraded).toBeUndefined();
  });

  it('fails and reports when a mediaGroup downgrade is present', async () => {
    const result = await verifyRender(
      { targetUrl: 'file:///tmp/page.html' },
      fakeImporter({ imagesLoaded: 1, mediaCardErrors: 0, mediaSingleCount: 0, mediaGroupCount: 1 })
    );
    expect(result.ok).toBe(false);
    expect(result.mediaGroupCount).toBe(1);
    expect(result.failures.some((f) => f.includes('mediaGroup'))).toBe(true);
  });
});
