import { describe, it, expect } from 'vitest';
import { buildDependencyGraph, validateDependencies } from '../../src/constraints/dependencies';
import { defineLayer } from '../../src/constraints/layers';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';

describe('buildDependencyGraph', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../fixtures/valid-layers');

  it('should build graph from files', async () => {
    const files = [
      join(fixturesDir, 'domain/user.ts'),
      join(fixturesDir, 'services/user-service.ts'),
      join(fixturesDir, 'api/user-handler.ts'),
    ];

    const result = await buildDependencyGraph(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(3);
      expect(result.value.edges.length).toBeGreaterThan(0);
    }
  });

  it('should track import types', async () => {
    const files = [
      join(fixturesDir, 'domain/user.ts'),
      join(fixturesDir, 'services/user-service.ts'),
    ];

    const result = await buildDependencyGraph(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const edge = result.value.edges.find(e => e.to.includes('domain/user'));
      expect(edge).toBeDefined();
      expect(edge?.importType).toBe('static');
    }
  });
});
