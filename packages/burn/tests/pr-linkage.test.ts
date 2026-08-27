import { describe, expect, it } from 'vitest';

import { linkPrs, type GhRunner } from '../src/pr-linkage';
import type { ProvenanceEntry } from '../src/provenance';

function gh(byIssue: Record<string, { number: number; state: string }[]>): GhRunner {
  return (args: string[]) => {
    // args: ['issue','view','<n>','--json','closedByPullRequestsReferences']
    const issue = args[2]!;
    const refs = byIssue[issue];
    if (!refs) return { status: 1, stdout: '' };
    return {
      status: 0,
      stdout: JSON.stringify({ closedByPullRequestsReferences: refs }),
    };
  };
}

const entry = (slug: string, issues: number[]): ProvenanceEntry => ({ slug, issues });

describe('linkPrs', () => {
  it('resolves an issue to its merged PRs and marks ok', () => {
    const runGh = gh({ '42': [{ number: 7, state: 'MERGED' }] });
    const result = linkPrs([entry('a', [42])], { runGh }).get('a')!;
    expect(result).toEqual({ mergedPrs: [7], ok: true });
  });

  it('keeps only MERGED references, dropping open/closed PRs', () => {
    const runGh = gh({
      '42': [
        { number: 7, state: 'MERGED' },
        { number: 8, state: 'OPEN' },
        { number: 9, state: 'CLOSED' },
      ],
    });
    expect(linkPrs([entry('a', [42])], { runGh }).get('a')!.mergedPrs).toEqual([7]);
  });

  it('de-dups a PR that closes two issues in the same entry', () => {
    const runGh = gh({
      '1': [{ number: 5, state: 'MERGED' }],
      '2': [{ number: 5, state: 'MERGED' }],
    });
    const result = linkPrs([entry('a', [1, 2])], { runGh }).get('a')!;
    expect(result.mergedPrs).toEqual([5]);
    expect(result.ok).toBe(true);
  });

  it('degrades to ok:false when gh fails for every issue (never invents a merge)', () => {
    const runGh: GhRunner = () => ({ status: 1, stdout: '' });
    const result = linkPrs([entry('a', [42])], { runGh }).get('a')!;
    expect(result).toEqual({ mergedPrs: [], ok: false });
  });

  it('marks an entry with no issues as ok:false', () => {
    const runGh = gh({});
    expect(linkPrs([entry('a', [])], { runGh }).get('a')).toEqual({ mergedPrs: [], ok: false });
  });

  it('treats unparseable gh output as a per-issue failure', () => {
    const runGh: GhRunner = () => ({ status: 0, stdout: 'not json' });
    expect(linkPrs([entry('a', [42])], { runGh }).get('a')).toEqual({ mergedPrs: [], ok: false });
  });
});
