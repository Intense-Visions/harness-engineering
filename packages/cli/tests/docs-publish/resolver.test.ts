import { describe, it, expect } from 'vitest';
import { resolveDocsPublishConnector } from '../../src/docs-publish/resolver';
import type { HarnessConfig } from '../../src/config/schema';

function config(docsPublish?: {
  connector: string;
  config: Record<string, unknown>;
}): HarnessConfig {
  return { version: 1, docsPublish } as unknown as HarnessConfig;
}

describe('resolveDocsPublishConnector', () => {
  it('degrades gracefully with an actionable message when docsPublish is absent', () => {
    const result = resolveDocsPublishConnector(config(undefined));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('docsPublish');
      expect(result.error.message).toContain('harness.config.json');
    }
  });

  it('errors naming the valid connectors when the name is unknown', () => {
    const result = resolveDocsPublishConnector(config({ connector: 'notion', config: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('notion');
      expect(result.error.message).toContain('confluence');
    }
  });

  it('returns Ok with a ConfluenceConnector for the confluence connector', () => {
    const result = resolveDocsPublishConnector(config({ connector: 'confluence', config: {} }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('confluence');
    }
  });

  it('never throws', () => {
    expect(() => resolveDocsPublishConnector(config(undefined))).not.toThrow();
    expect(() =>
      resolveDocsPublishConnector(config({ connector: 'bogus', config: {} }))
    ).not.toThrow();
  });
});
