import { describe, it, expect } from 'vitest';
import {
  findFencedCodeLines,
  isMarkdownPath,
  normalizeMarkdownTableRow,
  suppressMarkdownStructureFindings,
} from '../../src/security/scan-config-shared';
import type { ScanConfigFinding } from '../../src/security/scan-config-shared';

const finding = (ruleId: string, line: number): ScanConfigFinding => ({
  ruleId,
  severity: 'low',
  message: ruleId,
  match: '',
  line,
});

describe('isMarkdownPath', () => {
  it('recognises Markdown extensions only', () => {
    expect(isMarkdownPath('/repo/AGENTS.md')).toBe(true);
    expect(isMarkdownPath('C:\\repo\\CLAUDE.MD')).toBe(true);
    expect(isMarkdownPath('/repo/skill.yaml')).toBe(false);
    expect(isMarkdownPath('/repo/.gemini/settings.json')).toBe(false);
  });
});

describe('findFencedCodeLines', () => {
  it('marks fence lines and their body, backtick and tilde', () => {
    const content = ['a', '```js', 'x', '```', 'b', '~~~', 'y', '~~~', 'c'].join('\n');
    expect([...findFencedCodeLines(content)]).toEqual([2, 3, 4, 6, 7, 8]);
  });

  it('does not close a fence on a shorter or different marker', () => {
    const content = ['````', '```', '~~~', 'x', '````', 'after'].join('\n');
    expect([...findFencedCodeLines(content)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('treats an unclosed fence as running to end of file', () => {
    expect([...findFencedCodeLines('a\n```\nx\ny')]).toEqual([2, 3, 4]);
  });

  it('recognises fences indented inside list items', () => {
    expect([...findFencedCodeLines('1. step\n\n   ```bash\n   ls\n   ```\n')]).toEqual([3, 4, 5]);
  });
});

describe('normalizeMarkdownTableRow', () => {
  it('empties separator rows, including alignment colons', () => {
    expect(normalizeMarkdownTableRow('| ----------- | --- |')).toBe('');
    expect(normalizeMarkdownTableRow('|:------:|-------:|')).toBe('');
    expect(normalizeMarkdownTableRow('--- | ---')).toBe('');
  });

  it('collapses cell-edge padding but keeps in-cell runs', () => {
    expect(normalizeMarkdownTableRow('| Prefix      | Use          |')).toBe('| Prefix | Use |');
    expect(normalizeMarkdownTableRow('| a | b          c |')).toBe('| a | b          c |');
  });

  it('returns null for non-table lines', () => {
    expect(normalizeMarkdownTableRow('plain prose')).toBeNull();
    expect(normalizeMarkdownTableRow('a || b')).toBeNull();
  });
});

describe('suppressMarkdownStructureFindings', () => {
  const content = [
    '| H         | I            |', // 1
    '| --------- | ------------ |', // 2
    '| a | x            y |', // 3
    '```', // 4
    'readFileSync("../a")          // aligned', // 5
    '```', // 6
    'Text                 hidden', // 7
  ].join('\n');

  it('drops only structure-only matches of the exempt rules', () => {
    const findings = [
      finding('INJ-SUS-001', 1),
      finding('INJ-SUS-002', 2),
      finding('INJ-SUS-001', 3),
      finding('SEC-PTH-001', 5),
      finding('INJ-SUS-001', 5),
      finding('INJ-REROL-001', 5),
      finding('INJ-REROL-001', 1),
      finding('INJ-SUS-001', 7),
    ];
    const kept = suppressMarkdownStructureFindings(findings, content, 'AGENTS.md');
    expect(kept.map((f) => `${f.ruleId}@${f.line}`)).toEqual([
      'INJ-SUS-001@3',
      'INJ-REROL-001@5',
      'INJ-REROL-001@1',
      'INJ-SUS-001@7',
    ]);
  });

  it('is a no-op for non-Markdown files', () => {
    const findings = [finding('INJ-SUS-002', 2), finding('SEC-PTH-001', 5)];
    expect(suppressMarkdownStructureFindings(findings, content, 'skill.yaml')).toEqual(findings);
  });

  it('keeps findings without a line number', () => {
    const f: ScanConfigFinding = { ruleId: 'INJ-SUS-002', severity: 'low', message: '', match: '' };
    expect(suppressMarkdownStructureFindings([f], content, 'CLAUDE.md')).toEqual([f]);
  });
});
