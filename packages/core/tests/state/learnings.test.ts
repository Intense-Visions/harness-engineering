import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
  parseFrontmatter,
  extractIndexEntry,
} from '../../src/state/state-manager';

describe('appendLearning with tags', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write tagged entry when skillName and outcome provided', async () => {
    const result = await appendLearning(
      tmpDir,
      'UTC normalization needed',
      'harness-tdd',
      'gotcha'
    );
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('[skill:harness-tdd]');
    expect(content).toContain('[outcome:gotcha]');
    expect(content).toContain('UTC normalization needed');
  });

  it('should write untagged entry when no tags provided (backwards compatible)', async () => {
    const result = await appendLearning(tmpDir, 'Simple learning');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).not.toContain('[skill:');
    expect(content).toContain('Simple learning');
  });
});

describe('loadRelevantLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings file exists', async () => {
    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return all entries when no skill filter', async () => {
    await appendLearning(tmpDir, 'Learning A', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Learning B', 'harness-execution', 'gotcha');
    await appendLearning(tmpDir, 'Learning C');

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });

  it('should filter by skill name', async () => {
    await appendLearning(tmpDir, 'TDD learning', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Execution learning', 'harness-execution', 'gotcha');
    await appendLearning(tmpDir, 'Another TDD', 'harness-tdd', 'gotcha');

    const result = await loadRelevantLearnings(tmpDir, 'harness-tdd');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value.every((e) => e.includes('harness-tdd'))).toBe(true);
    }
  });

  it('should include untagged entries when no filter', async () => {
    await appendLearning(tmpDir, 'Tagged', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Untagged');

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('should handle heading-based format from execution skill', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      '# Learnings\n\n## 2026-03-14 — Task 3: Notification Expiry\n- [learning]: UTC normalization needed\n'
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});

describe('loadBudgetedLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-budget-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings exist', async () => {
    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return all learnings when within budget', async () => {
    await appendLearning(tmpDir, 'Short learning A', 'skill-a', 'success');
    await appendLearning(tmpDir, 'Short learning B', 'skill-b', 'success');

    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('should truncate learnings when they exceed token budget', async () => {
    // Each learning is ~30 chars = ~8 tokens. With budget of 20 tokens, only ~2 fit.
    for (let i = 0; i < 10; i++) {
      await appendLearning(
        tmpDir,
        `Learning entry number ${i} with some extra padding text here`,
        'skill-a',
        'success'
      );
    }

    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThan(10);
      // Verify total chars fits within budget (20 tokens * 4 chars/token = 80 chars)
      const totalChars = result.value.join('\n').length;
      expect(totalChars).toBeLessThanOrEqual(20 * 4);
    }
  });

  it('should sort by recency (newest first)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-01-01 [skill:a]:** Old learning',
        '',
        '- **2026-03-15 [skill:b]:** Middle learning',
        '',
        '- **2026-03-25 [skill:c]:** Recent learning',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toContain('Recent learning');
      expect(result.value[1]).toContain('Middle learning');
      expect(result.value[2]).toContain('Old learning');
    }
  });

  it('should prioritize learnings matching intent keywords', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:a]:** Database migration requires downtime',
        '',
        '- **2026-03-25 [skill:b]:** Token budgeting improves context efficiency',
        '',
        '- **2026-03-25 [skill:c]:** Always run linter before commit',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'Implement token budget for learnings',
      tokenBudget: 1000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The token/budget related learning should come first
      expect(result.value[0]).toContain('Token budgeting');
    }
  });

  it('should load session learnings before global learnings (two-tier)', async () => {
    // Create global learnings
    const globalDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'learnings.md'),
      ['# Learnings', '', '- **2026-03-25 [skill:a]:** Global learning one', ''].join('\n')
    );

    // Create session learnings
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      ['# Learnings', '', '- **2026-03-24 [skill:b]:** Session learning one', ''].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
      session: 'test-session',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // Session learnings come first regardless of date
      expect(result.value[0]).toContain('Session learning');
      expect(result.value[1]).toContain('Global learning');
    }
  });

  it('should fall back to global only when session is omitted', async () => {
    // Create global learnings
    const globalDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'learnings.md'),
      ['# Learnings', '', '- **2026-03-25 [skill:a]:** Global only learning', ''].join('\n')
    );

    // Also create session learnings (should NOT be loaded)
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'learnings.md'),
      ['# Learnings', '', '- **2026-03-24 [skill:b]:** Session learning ignored', ''].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
      // no session parameter
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]).toContain('Global only learning');
    }
  });

  it('should respect budget across both tiers', async () => {
    // Create global learnings (many entries)
    const globalDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(globalDir, { recursive: true });
    const globalEntries = Array.from(
      { length: 5 },
      (_, i) =>
        `- **2026-03-${String(20 + i).padStart(2, '0')} [skill:a]:** Global learning ${i} with padding text`
    ).join('\n\n');
    fs.writeFileSync(path.join(globalDir, 'learnings.md'), `# Learnings\n\n${globalEntries}\n`);

    // Create session learnings (many entries)
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionEntries = Array.from(
      { length: 5 },
      (_, i) =>
        `- **2026-03-${String(20 + i).padStart(2, '0')} [skill:b]:** Session learning ${i} with padding text`
    ).join('\n\n');
    fs.writeFileSync(path.join(sessionDir, 'learnings.md'), `# Learnings\n\n${sessionEntries}\n`);

    // Very tight budget: should only fit a few
    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 50, // 200 chars
      session: 'test-session',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThan(10);
      const totalChars = result.value.join('\n').length;
      expect(totalChars).toBeLessThanOrEqual(200);
    }
  });
});

describe('parseFrontmatter', () => {
  it('should extract hash and tags from frontmatter comment', () => {
    const result = parseFrontmatter('<!-- hash:a1b2c3d4 tags:auth,middleware -->');
    expect(result).toEqual({ hash: 'a1b2c3d4', tags: ['auth', 'middleware'] });
  });

  it('should return null for line without frontmatter', () => {
    const result = parseFrontmatter('- **2026-03-15 [skill:a]:** Some learning');
    expect(result).toBeNull();
  });

  it('should handle hash-only frontmatter (no tags)', () => {
    const result = parseFrontmatter('<!-- hash:a1b2c3d4 -->');
    expect(result).toEqual({ hash: 'a1b2c3d4', tags: [] });
  });
});

describe('extractIndexEntry', () => {
  it('should extract first line of a multi-line entry as summary', () => {
    const entry =
      '- **2026-03-15 [skill:harness-execution] [outcome:success]:** JWT middleware handles refresh tokens correctly when the token is expired\n  Additional detail here about the implementation';
    const result = extractIndexEntry(entry);
    expect(result.summary).toContain('JWT middleware handles refresh tokens');
    expect(result.summary).not.toContain('Additional detail');
  });

  it('should use full entry when entry is single line', () => {
    const entry = '- **2026-03-15 [skill:a]:** Short learning';
    const result = extractIndexEntry(entry);
    expect(result.summary).toBe(entry);
  });

  it('should extract tags from skill and outcome markers', () => {
    const entry = '- **2026-03-15 [skill:harness-tdd] [outcome:gotcha]:** Something';
    const result = extractIndexEntry(entry);
    expect(result.tags).toContain('harness-tdd');
    expect(result.tags).toContain('gotcha');
  });

  it('should compute hash from entry content', () => {
    const entry = '- **2026-03-15 [skill:a]:** Some learning';
    const result = extractIndexEntry(entry);
    expect(result.hash).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe('appendLearning with frontmatter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-fm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write frontmatter comment before tagged entry', async () => {
    await appendLearning(tmpDir, 'Auth tokens expire silently', 'harness-tdd', 'gotcha');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const lines = content.split('\n');
    // Find the frontmatter line
    const fmLine = lines.find((l) => l.startsWith('<!-- hash:'));
    expect(fmLine).toBeDefined();
    expect(fmLine).toMatch(/^<!-- hash:[a-f0-9]{8} tags:harness-tdd,gotcha -->/);
  });

  it('should write frontmatter with skill-only tag when no outcome', async () => {
    await appendLearning(tmpDir, 'Use strict mode', 'harness-execution');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const fmLine = content.split('\n').find((l) => l.startsWith('<!-- hash:'));
    expect(fmLine).toBeDefined();
    expect(fmLine).toMatch(/tags:harness-execution -->/);
  });

  it('should write frontmatter with no tags when no skill/outcome', async () => {
    await appendLearning(tmpDir, 'Simple learning');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const fmLine = content.split('\n').find((l) => l.startsWith('<!-- hash:'));
    expect(fmLine).toBeDefined();
    expect(fmLine).toMatch(/^<!-- hash:[a-f0-9]{8} -->/);
  });

  it('should preserve existing entries when appending new one', async () => {
    await appendLearning(tmpDir, 'First learning', 'skill-a', 'success');
    await appendLearning(tmpDir, 'Second learning', 'skill-b', 'gotcha');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('First learning');
    expect(content).toContain('Second learning');
    const fmLines = content.split('\n').filter((l) => l.startsWith('<!-- hash:'));
    expect(fmLines.length).toBe(2);
  });
});

describe('loadRelevantLearnings with frontmatter entries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-fm-load-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should parse entries that have frontmatter comments (not treat them as separate entries)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:harness-tdd,gotcha -->',
        '- **2026-03-25 [skill:harness-tdd] [outcome:gotcha]:** Token refresh fails silently',
        '',
        '<!-- hash:e5f6a7b8 tags:harness-execution,success -->',
        '- **2026-03-24 [skill:harness-execution] [outcome:success]:** Middleware setup works',
        '',
      ].join('\n')
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // Entries should NOT include the frontmatter comment line
      expect(result.value[0]).not.toContain('<!-- hash:');
      expect(result.value[0]).toContain('Token refresh fails silently');
    }
  });

  it('should handle mixed entries (some with frontmatter, some without)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:skill-a -->',
        '- **2026-03-25 [skill:skill-a]:** With frontmatter',
        '',
        '- **2026-03-24 [skill:skill-b]:** Without frontmatter',
        '',
      ].join('\n')
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});
