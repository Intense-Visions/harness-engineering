import { describe, it, expect } from 'vitest';
import { inferDomain } from '../../src/ingest/domain-inference.js';

describe('inferDomain', () => {
  describe('built-in patterns', () => {
    it('matches packages/<dir> prefix', () => {
      expect(inferDomain({ path: 'packages/cli/src/foo.ts' })).toBe('cli');
    });

    it('matches apps/<dir> prefix', () => {
      expect(inferDomain({ path: 'apps/web/src/index.tsx' })).toBe('web');
    });

    it('matches services/<dir> prefix', () => {
      expect(inferDomain({ path: 'services/api/handler.ts' })).toBe('api');
    });

    it('matches src/<dir> prefix', () => {
      expect(inferDomain({ path: 'src/utils/foo.ts' })).toBe('utils');
    });

    it('matches lib/<dir> prefix', () => {
      expect(inferDomain({ path: 'lib/parser.ts' })).toBe('parser');
    });
  });

  describe('config patterns (extraPatterns)', () => {
    it('config pattern wins over generic fallback', () => {
      expect(
        inferDomain({ path: 'agents/skills/foo.ts' }, { extraPatterns: ['agents/<dir>'] })
      ).toBe('skills');
    });
  });

  describe('generic first-segment fallback', () => {
    it('falls back to first segment when no pattern matches', () => {
      expect(inferDomain({ path: 'agents/skills/foo.ts' })).toBe('agents');
    });

    it('falls back to first segment for unrecognized non-blocklisted top-level', () => {
      expect(inferDomain({ path: 'unknown-dir/foo.ts' })).toBe('unknown-dir');
    });
  });

  describe('blocklist', () => {
    it('returns unknown for node_modules', () => {
      expect(inferDomain({ path: 'node_modules/foo/index.js' })).toBe('unknown');
    });

    it('returns unknown for .harness paths', () => {
      expect(inferDomain({ path: '.harness/extracted/x.jsonl' })).toBe('unknown');
    });
  });

  describe('metadata.domain precedence', () => {
    it('explicit metadata.domain wins over path-based inference', () => {
      expect(
        inferDomain({
          metadata: { domain: 'explicit' },
          path: 'packages/cli/foo.ts',
        })
      ).toBe('explicit');
    });

    it('metadata.domain works even without a path', () => {
      expect(inferDomain({ metadata: { domain: 'foo' } })).toBe('foo');
    });
  });

  describe('KnowledgeLinker connector source (path-less)', () => {
    it('uses connectorName when source is knowledge-linker', () => {
      expect(
        inferDomain({
          metadata: { source: 'knowledge-linker', connectorName: 'jira' },
        })
      ).toBe('jira');
    });

    it("falls back to 'general' when knowledge-linker has no connectorName", () => {
      expect(inferDomain({ metadata: { source: 'knowledge-linker' } })).toBe('general');
    });
  });
});
