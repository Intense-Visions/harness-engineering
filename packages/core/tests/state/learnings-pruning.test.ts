import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDateFromEntry, analyzeLearningPatterns } from '../../src/state/learnings-content';
import { archiveLearnings, pruneLearnings } from '../../src/state/learnings-lifecycle';

describe('parseDateFromEntry', () => {
  it('should parse date from tagged bullet entry', () => {
    const entry = '- **2026-03-10 [skill:harness-tdd] [outcome:success]:** Some learning';
    expect(parseDateFromEntry(entry)).toBe('2026-03-10');
  });

  it('should parse date from heading-based entry', () => {
    const entry = '## 2026-03-14 — Task 3: Notification Expiry';
    expect(parseDateFromEntry(entry)).toBe('2026-03-14');
  });

  it('should return null for entry without date', () => {
    expect(parseDateFromEntry('- some text without a date')).toBeNull();
  });
});

describe('analyzeLearningPatterns', () => {
  it('should detect skill patterns with 3+ occurrences', () => {
    const entries = [
      '- **2026-03-01 [skill:harness-execution]:** Learning A',
      '- **2026-03-02 [skill:harness-execution]:** Learning B',
      '- **2026-03-03 [skill:harness-execution]:** Learning C',
      '- **2026-03-04 [skill:harness-tdd]:** Learning D',
      '- **2026-03-05 [skill:harness-tdd]:** Learning E',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(1);
    expect(patterns[0].tag).toBe('skill:harness-execution');
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].entries.length).toBe(3);
  });

  it('should return empty array when no patterns reach threshold', () => {
    const entries = [
      '- **2026-03-01 [skill:a]:** Learning A',
      '- **2026-03-02 [skill:b]:** Learning B',
      '- **2026-03-03 [skill:c]:** Learning C',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(0);
  });

  it('should detect multiple patterns when present', () => {
    const entries = [
      '- **2026-03-01 [skill:harness-execution]:** L1',
      '- **2026-03-02 [skill:harness-execution]:** L2',
      '- **2026-03-03 [skill:harness-execution]:** L3',
      '- **2026-03-04 [skill:harness-planning]:** L4',
      '- **2026-03-05 [skill:harness-planning]:** L5',
      '- **2026-03-06 [skill:harness-planning]:** L6',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(2);
  });

  it('should also detect outcome tag patterns', () => {
    const entries = [
      '- **2026-03-01 [skill:a] [outcome:gotcha]:** L1',
      '- **2026-03-02 [skill:b] [outcome:gotcha]:** L2',
      '- **2026-03-03 [skill:c] [outcome:gotcha]:** L3',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.some((p) => p.tag === 'outcome:gotcha')).toBe(true);
  });

  it('should handle entries without tags gracefully', () => {
    const entries = [
      '- **2026-03-01:** Untagged learning',
      '- **2026-03-02:** Another untagged',
      '- **2026-03-03:** Third untagged',
    ];
    const patterns = analyzeLearningPatterns(entries);
    expect(patterns.length).toBe(0);
  });
});

describe('archiveLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should move entries to archive file with YYYY-MM naming', async () => {
    const entriesToArchive = [
      '- **2026-02-01 [skill:a]:** Old learning one',
      '- **2026-02-15 [skill:b]:** Old learning two',
    ];

    const result = await archiveLearnings(tmpDir, entriesToArchive);
    expect(result.ok).toBe(true);

    const archiveDir = path.join(tmpDir, '.harness', 'learnings-archive');
    const files = fs.readdirSync(archiveDir);
    expect(files.length).toBe(1);

    const archiveContent = fs.readFileSync(path.join(archiveDir, files[0]), 'utf-8');
    expect(archiveContent).toContain('Old learning one');
    expect(archiveContent).toContain('Old learning two');
    expect(archiveContent).toContain('[skill:a]');
  });

  it('should append to existing archive file for same month', async () => {
    const harnessDir = path.join(tmpDir, '.harness', 'learnings-archive');
    fs.mkdirSync(harnessDir, { recursive: true });
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = path.join(harnessDir, `${yearMonth}.md`);
    fs.writeFileSync(archivePath, '# Learnings Archive\n\n- **2026-03-01 [skill:x]:** Existing\n');

    const result = await archiveLearnings(tmpDir, ['- **2026-03-02 [skill:y]:** New entry']);
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(archivePath, 'utf-8');
    expect(content).toContain('Existing');
    expect(content).toContain('New entry');
  });
});

describe('pruneLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-prune-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should keep 20 most recent entries and archive the rest', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    const entries = Array.from({ length: 35 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = i < 28 ? '01' : '02';
      return `- **2026-${month}-${day} [skill:harness-execution]:** Learning ${i}`;
    });

    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const result = await pruneLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kept).toBe(20);
      expect(result.value.archived).toBe(15);
      expect(result.value.patterns.length).toBeGreaterThan(0);
    }

    const remaining = fs.readFileSync(path.join(harnessDir, 'learnings.md'), 'utf-8');
    const remainingEntries = remaining.match(/^- \*\*/gm);
    expect(remainingEntries?.length).toBe(20);

    const archiveDir = path.join(harnessDir, 'learnings-archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  it('should return nothing-to-prune when under threshold', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const entries = Array.from({ length: 15 }, (_, i) => `- **${today} [skill:a]:** Learning ${i}`);

    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const result = await pruneLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kept).toBe(15);
      expect(result.value.archived).toBe(0);
      expect(result.value.patterns).toEqual([]);
    }
  });

  it('should handle missing learnings file gracefully', async () => {
    const result = await pruneLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kept).toBe(0);
      expect(result.value.archived).toBe(0);
    }
  });
});
