import { describe, it, expect } from 'vitest';
import type { StrategyDoc } from '@harness-engineering/types';
import { serializeStrategyDoc } from './serialize';
import { parseStrategyDoc, asStrategyDoc } from './parser';
import { StrategyDocSchema } from './schema';

function sampleDoc(overrides: Partial<StrategyDoc> = {}): StrategyDoc {
  return {
    frontmatter: {
      name: 'Acme',
      last_updated: '2026-06-02',
      version: 1,
      ...overrides.frontmatter,
    },
    sections: overrides.sections ?? [
      { name: 'Target problem', body: 'Engineering teams ship without a strategic anchor.' },
      { name: 'Our approach', body: 'Force the upstream conversation into a small, durable doc.' },
      {
        name: "Who it's for",
        body: 'Mid-size eng orgs that already run a roadmap and need the why.',
      },
      {
        name: 'Key metrics',
        body: '- Activation rate: % new projects with STRATEGY.md within 7 days',
      },
      { name: 'Tracks', body: '- Strategic anchor: ship STRATEGY.md + harness-strategy skill' },
    ],
  };
}

describe('serializeStrategyDoc', () => {
  it('emits frontmatter with quoted last_updated to avoid YAML date coercion', () => {
    const out = serializeStrategyDoc(sampleDoc());
    expect(out).toMatch(/^---\nname: Acme\nlast_updated: "2026-06-02"\nversion: 1\n---/);
  });

  it('emits the default H1 from frontmatter.name when no opts.h1 is provided', () => {
    const out = serializeStrategyDoc(sampleDoc());
    expect(out).toMatch(/\n# Acme Strategy\n/);
  });

  it('preserves a user-supplied H1 verbatim when opts.h1 is provided', () => {
    const out = serializeStrategyDoc(sampleDoc(), { h1: '# Acme — Engineering Strategy' });
    expect(out).toMatch(/\n# Acme — Engineering Strategy\n/);
    expect(out).not.toMatch(/# Acme Strategy/);
  });

  it('emits sections in REQUIRED-then-OPTIONAL template order regardless of input order', () => {
    const shuffled = sampleDoc({
      sections: [
        { name: 'Tracks', body: 'tracks body' },
        { name: 'Target problem', body: 'target problem body' },
        { name: 'Our approach', body: 'our approach body' },
        { name: 'Key metrics', body: '- m1' },
        { name: "Who it's for", body: "who it's for body" },
      ],
    });
    const out = serializeStrategyDoc(shuffled);
    const idxTarget = out.indexOf('## Target problem');
    const idxApproach = out.indexOf('## Our approach');
    const idxWho = out.indexOf("## Who it's for");
    const idxMetrics = out.indexOf('## Key metrics');
    const idxTracks = out.indexOf('## Tracks');
    expect(idxTarget).toBeLessThan(idxApproach);
    expect(idxApproach).toBeLessThan(idxWho);
    expect(idxWho).toBeLessThan(idxMetrics);
    expect(idxMetrics).toBeLessThan(idxTracks);
  });

  it('emits optional sections after required ones, in template order', () => {
    const doc = sampleDoc({
      sections: [
        ...sampleDoc().sections,
        { name: 'Marketing', body: 'marketing body' },
        { name: 'Milestones', body: '- milestone 1' },
      ],
    });
    const out = serializeStrategyDoc(doc);
    const idxTracks = out.indexOf('## Tracks');
    const idxMilestones = out.indexOf('## Milestones');
    const idxMarketing = out.indexOf('## Marketing');
    expect(idxTracks).toBeLessThan(idxMilestones);
    expect(idxMilestones).toBeLessThan(idxMarketing);
  });

  it('skips optional sections that are absent from the doc', () => {
    const out = serializeStrategyDoc(sampleDoc());
    expect(out).not.toMatch(/## Milestones/);
    expect(out).not.toMatch(/## Not working on/);
    expect(out).not.toMatch(/## Marketing/);
  });

  it('always ends with exactly one trailing newline', () => {
    const out = serializeStrategyDoc(sampleDoc());
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('round-trips through parseStrategyDoc — parse(serialize(doc)) recovers doc', () => {
    const doc = sampleDoc();
    const serialized = serializeStrategyDoc(doc);
    const parsed = parseStrategyDoc(serialized);
    const recovered = asStrategyDoc(parsed);
    expect(recovered).not.toBeNull();
    expect(recovered).toEqual(doc);
  });

  it('serializer output passes StrategyDocSchema validation', () => {
    const doc = sampleDoc();
    const serialized = serializeStrategyDoc(doc);
    const parsed = parseStrategyDoc(serialized);
    const recovered = asStrategyDoc(parsed);
    expect(recovered).not.toBeNull();
    const result = StrategyDocSchema.safeParse(recovered);
    expect(result.success).toBe(true);
  });

  it('is idempotent: serialize ∘ parse ∘ serialize == serialize', () => {
    const doc = sampleDoc();
    const once = serializeStrategyDoc(doc);
    const twice = serializeStrategyDoc(asStrategyDoc(parseStrategyDoc(once))!);
    expect(twice).toBe(once);
  });
});
