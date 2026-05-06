import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { seedFromStrategy } from './strategy-seeder';

describe('seedFromStrategy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('soft-fails when STRATEGY.md is absent', () => {
    const result = seedFromStrategy({ cwd: tmpDir });
    expect(result.name).toBeNull();
    expect(result.keyMetrics).toEqual([]);
    expect(result.warnings).toContain('STRATEGY.md not found');
  });

  it('extracts name from frontmatter and Key metrics list', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'STRATEGY.md'),
      [
        '---',
        "name: 'Acme Widgets'",
        '---',
        '# Strategy',
        '',
        '## Key metrics',
        '- Daily active users',
        '- Plans completed per week',
        '- p95 latency on /api/plan',
        '',
        '## Other section',
        '- not a metric',
      ].join('\n')
    );
    const result = seedFromStrategy({ cwd: tmpDir });
    expect(result.name).toBe('Acme Widgets');
    expect(result.keyMetrics).toEqual([
      'Daily active users',
      'Plans completed per week',
      'p95 latency on /api/plan',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('falls back to H1 when frontmatter has no name', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'STRATEGY.md'),
      ['# My Product', '', '## Key metrics', '- Metric one'].join('\n')
    );
    const result = seedFromStrategy({ cwd: tmpDir });
    expect(result.name).toBe('My Product');
    expect(result.keyMetrics).toEqual(['Metric one']);
    expect(result.warnings.some((w) => /frontmatter/i.test(w))).toBe(true);
  });

  it('stops key-metrics extraction at H3 sub-headings', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'STRATEGY.md'),
      [
        '---',
        'name: Acme',
        '---',
        '# Acme',
        '',
        '## Key metrics',
        '- Daily active users',
        '- Plans completed per week',
        '',
        '### Implementation notes',
        '- depends on instrumented event X',
        '- currently sampled at 10%',
        '',
        '## Other section',
        '- not a metric',
      ].join('\n')
    );
    const result = seedFromStrategy({ cwd: tmpDir });
    // Implementation-note bullets under the H3 must NOT leak into keyMetrics.
    expect(result.keyMetrics).toEqual(['Daily active users', 'Plans completed per week']);
  });

  it('soft-fails when Key metrics section is missing', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'STRATEGY.md'),
      '---\nname: X\n---\n# X\n\n## Vision\n- nothing'
    );
    const result = seedFromStrategy({ cwd: tmpDir });
    expect(result.name).toBe('X');
    expect(result.keyMetrics).toEqual([]);
    expect(result.warnings.some((w) => /key metrics/i.test(w))).toBe(true);
  });
});
