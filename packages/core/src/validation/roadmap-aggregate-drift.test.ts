import { describe, it, expect } from 'vitest';
import { checkRoadmapAggregateDrift } from './roadmap-aggregate-drift';

describe('checkRoadmapAggregateDrift', () => {
  it('reports stale when the committed aggregate differs from the regenerated one', () => {
    const result = checkRoadmapAggregateDrift({
      shardDirExists: true,
      committedAggregate: '# Roadmap\n\nold\n',
      regeneratedAggregate: '# Roadmap\n\nnew\n',
    });
    expect(result).toEqual({ applicable: true, stale: true });
  });

  it('reports fresh when the committed aggregate matches the regenerated one', () => {
    const same = '# Roadmap\n\nidentical\n';
    const result = checkRoadmapAggregateDrift({
      shardDirExists: true,
      committedAggregate: same,
      regeneratedAggregate: same,
    });
    expect(result).toEqual({ applicable: true, stale: false });
  });

  it('no-ops for a monolith project (no shard dir)', () => {
    const result = checkRoadmapAggregateDrift({
      shardDirExists: false,
      committedAggregate: '# Roadmap\n',
      regeneratedAggregate: null,
    });
    expect(result).toEqual({ applicable: false, stale: false });
  });

  it('does not report drift when content differs only by CRLF vs LF line endings', () => {
    const result = checkRoadmapAggregateDrift({
      shardDirExists: true,
      // A Windows clone (core.autocrlf=true, no eol=lf attribute) reads CRLF.
      committedAggregate: '# Roadmap\r\n\r\nidentical\r\n',
      regeneratedAggregate: '# Roadmap\n\nidentical\n',
    });
    expect(result).toEqual({ applicable: true, stale: false });
  });

  it('treats a missing aggregate as stale when shards regenerate non-empty content', () => {
    const result = checkRoadmapAggregateDrift({
      shardDirExists: true,
      committedAggregate: null,
      regeneratedAggregate: '# Roadmap\n\nregenerated\n',
    });
    expect(result).toEqual({ applicable: true, stale: true });
  });

  it('is not applicable when regeneration failed (null regenerated content)', () => {
    const result = checkRoadmapAggregateDrift({
      shardDirExists: true,
      committedAggregate: '# Roadmap\n',
      regeneratedAggregate: null,
    });
    expect(result).toEqual({ applicable: false, stale: false });
  });
});
