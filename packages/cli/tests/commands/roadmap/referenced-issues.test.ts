import { describe, it, expect } from 'vitest';
import { runReferencedIssues } from '../../../src/commands/roadmap/referenced-issues';

describe('roadmap referenced-issues', () => {
  it('prints one issue number per line for well-formed and malformed refs', () => {
    const lines: string[] = [];
    runReferencedIssues('Closes roadmap #569\nsee #12', (l) => lines.push(l));
    expect(lines).toEqual(['569', '12']);
  });
  it('prints nothing when no refs are present', () => {
    const lines: string[] = [];
    runReferencedIssues('no refs here, issue 123', (l) => lines.push(l));
    expect(lines).toEqual([]);
  });
});
