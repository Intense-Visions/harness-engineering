import { describe, it, expect } from 'vitest';
import { extractEntities } from './entities.js';

describe('extractEntities — structured signal shapes', () => {
  it('extracts backticked tokens', () => {
    const out = extractEntities('Harden `renderRow` against null input');
    expect(out).toContain('renderRow');
  });

  it('extracts file-ish paths (with and without extension)', () => {
    const out = extractEntities(
      'Refactor packages/core/src/roadmap/parse.ts and update src/nlq/EntityResolver'
    );
    expect(out).toContain('packages/core/src/roadmap/parse.ts');
    expect(out).toContain('src/nlq/EntityResolver');
  });

  it('extracts CamelCase and PascalCase identifiers', () => {
    const out = extractEntities('Wire BackendRouter into the autoTriage scheduler');
    expect(out).toContain('BackendRouter');
    expect(out).toContain('autoTriage');
  });

  it('extracts dotted / member-access identifiers', () => {
    const out = extractEntities('Fix config.roadmap.autoTriage default handling');
    expect(out).toContain('config.roadmap.autoTriage');
  });

  it('handles a realistic roadmap row with mixed shapes', () => {
    const out = extractEntities(
      'feat(triage): register a leader-gated triage job on `task-registry.ts` so ' +
        'BackendRouter and the scheduler.ts loop do not double-run'
    );
    expect(out).toContain('task-registry.ts');
    expect(out).toContain('BackendRouter');
    expect(out).toContain('scheduler.ts');
  });
});

describe('extractEntities — the explicit-empty contract (P1 unresolved-scope, not a fallback)', () => {
  it('returns [] for prose with no structured entity (the terse-item case)', () => {
    // "Migrate auth to OIDC" — the classic terse row the length proxy mis-scores.
    expect(extractEntities('Migrate auth to OIDC')).toEqual([]);
  });

  it('returns [] for plain lowercase words and ALL-CAPS acronyms (no case transition)', () => {
    expect(extractEntities('improve the api and http handling')).toEqual([]);
    expect(extractEntities('API HTTP JSON')).toEqual([]);
  });

  it('returns [] for empty / whitespace / non-string input', () => {
    expect(extractEntities('')).toEqual([]);
    expect(extractEntities('   ')).toEqual([]);
    // defensive: non-string
    expect(extractEntities(undefined as unknown as string)).toEqual([]);
  });
});

describe('extractEntities — purity and determinism', () => {
  it('is deterministic and de-duplicates repeated mentions', () => {
    const text = 'BackendRouter feeds BackendRouter; see `BackendRouter`';
    const a = extractEntities(text);
    const b = extractEntities(text);
    expect(a).toEqual(b);
    expect(a.filter((e) => e === 'BackendRouter')).toHaveLength(1);
  });

  it('does not mutate or depend on prior calls (regex lastIndex safety)', () => {
    // Repeated calls must not leak regex state across invocations.
    expect(extractEntities('shapeKey')).toEqual(['shapeKey']);
    expect(extractEntities('shapeKey')).toEqual(['shapeKey']);
    expect(extractEntities('shapeKey')).toEqual(['shapeKey']);
  });
});
