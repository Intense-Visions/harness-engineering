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
  loadIndexEntries,
  normalizeLearningContent,
  computeContentHash,
} from '../../src/state';

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

describe('loadIndexEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-index-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings file', async () => {
    const result = await loadIndexEntries(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return index entries with summaries (first line only)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:skill-a,gotcha -->',
        '- **2026-03-25 [skill:skill-a] [outcome:gotcha]:** Auth tokens expire silently',
        '  More detail about the auth token issue that is not needed for index',
        '',
        '- **2026-03-24 [skill:skill-b]:** Simple one-liner',
        '',
      ].join('\n')
    );

    const result = await loadIndexEntries(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // First entry: has frontmatter, should use it
      expect(result.value[0]!.hash).toBe('a1b2c3d4');
      expect(result.value[0]!.tags).toEqual(['skill-a', 'gotcha']);
      expect(result.value[0]!.summary).toContain('Auth tokens expire silently');
      expect(result.value[0]!.summary).not.toContain('More detail');
      // Second entry: no frontmatter, hash computed on read
      expect(result.value[1]!.hash).toMatch(/^[a-f0-9]{8}$/);
      expect(result.value[1]!.summary).toContain('Simple one-liner');
    }
  });

  it('should use frontmatter tags when available', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:abcd1234 tags:auth,middleware -->',
        '- **2026-03-25 [skill:auth] [outcome:decision]:** Use middleware pattern',
        '',
      ].join('\n')
    );

    const result = await loadIndexEntries(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.tags).toEqual(['auth', 'middleware']);
    }
  });

  it('should consume fewer tokens than loading full entries', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const entries = Array.from({ length: 10 }, (_, i) =>
      [
        `<!-- hash:${String(i).padStart(8, '0')} tags:skill-${i} -->`,
        `- **2026-03-${String(20 + (i % 10)).padStart(2, '0')} [skill:skill-${i}]:** Learning ${i} short summary`,
        `  This is a much longer detailed explanation that spans multiple words and provides context about learning ${i}. It includes technical details, code references, and implementation notes that are not needed for the index scan layer.`,
      ].join('\n')
    ).join('\n\n');
    fs.writeFileSync(path.join(harnessDir, 'learnings.md'), `# Learnings\n\n${entries}\n`);

    const indexResult = await loadIndexEntries(tmpDir);
    const fullResult = await loadRelevantLearnings(tmpDir);
    expect(indexResult.ok).toBe(true);
    expect(fullResult.ok).toBe(true);
    if (indexResult.ok && fullResult.ok) {
      const indexTokens = Math.ceil(indexResult.value.map((e) => e.summary).join('\n').length / 4);
      const fullTokens = Math.ceil(fullResult.value.join('\n').length / 4);
      expect(indexTokens).toBeLessThan(fullTokens * 0.5);
    }
  });
});

describe('loadBudgetedLearnings with depth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-depth-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return summaries only when depth is "index"', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:skill-a -->',
        '- **2026-03-25 [skill:skill-a]:** Auth token handling summary',
        '  Detailed explanation of auth token issue with code examples and edge cases that spans many words',
        '',
        '<!-- hash:e5f6a7b8 tags:skill-b -->',
        '- **2026-03-24 [skill:skill-b]:** Middleware ordering matters',
        '  Long explanation of middleware order dependencies and how they affect request processing pipeline',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'auth tokens',
      tokenBudget: 1000,
      depth: 'index',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // Summaries should not contain the detail lines
      result.value.forEach((entry) => {
        expect(entry).not.toContain('Detailed explanation');
        expect(entry).not.toContain('Long explanation');
      });
    }
  });

  it('should return full entries when depth is "summary" (default behavior)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:a]:** Learning with detail',
        '  Extra detail line',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toContain('Extra detail line');
    }
  });

  it('should default to "summary" depth when not specified', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:a]:** Full entry with detail',
        '  Detail preserved',
        '',
      ].join('\n')
    );

    const resultDefault = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
    });
    const resultExplicit = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
      depth: 'summary',
    });
    expect(resultDefault.ok).toBe(true);
    expect(resultExplicit.ok).toBe(true);
    if (resultDefault.ok && resultExplicit.ok) {
      expect(resultDefault.value).toEqual(resultExplicit.value);
    }
  });
});

describe('normalizeLearningContent', () => {
  it('should strip date prefix', () => {
    const result = normalizeLearningContent('2026-03-25 UTC normalization needed');
    expect(result).not.toContain('2026-03-25');
    expect(result).toContain('utc normalization needed');
  });

  it('should strip skill and outcome tags', () => {
    const result = normalizeLearningContent('[skill:harness-tdd] [outcome:gotcha] Some insight');
    expect(result).not.toContain('[skill:');
    expect(result).not.toContain('[outcome:');
    expect(result).toContain('some insight');
  });

  it('should strip list markers and bold markers', () => {
    const result = normalizeLearningContent('- **2026-03-25 [skill:a]:** My learning');
    expect(result).not.toContain('- ');
    expect(result).not.toContain('**');
    expect(result).toContain('my learning');
  });

  it('should collapse whitespace and lowercase', () => {
    const result = normalizeLearningContent('  Multiple   Spaces   Here  ');
    expect(result).toBe('multiple spaces here');
  });

  it('should produce same output for semantically identical content', () => {
    const a = normalizeLearningContent(
      '- **2026-03-25 [skill:harness-tdd] [outcome:gotcha]:** UTC normalization needed'
    );
    const b = normalizeLearningContent(
      '- **2026-03-28 [skill:harness-execution] [outcome:success]:** UTC normalization needed'
    );
    expect(a).toBe(b);
  });
});

describe('computeContentHash', () => {
  it('should return a 16-char hex string', () => {
    const hash = computeContentHash('some content');
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('should return same hash for same input', () => {
    expect(computeContentHash('hello')).toBe(computeContentHash('hello'));
  });

  it('should return different hash for different input', () => {
    expect(computeContentHash('hello')).not.toBe(computeContentHash('world'));
  });
});

describe('content deduplication in appendLearning', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-dedup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write only one entry when identical learning appended twice', async () => {
    await appendLearning(tmpDir, 'UTC normalization needed', 'harness-tdd', 'gotcha');
    await appendLearning(tmpDir, 'UTC normalization needed', 'harness-tdd', 'gotcha');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const matches = content.match(/UTC normalization needed/g);
    expect(matches?.length).toBe(1);
  });

  it('should deduplicate same content with different dates/tags', async () => {
    await appendLearning(tmpDir, 'UTC normalization needed', 'harness-tdd', 'gotcha');
    await appendLearning(tmpDir, 'UTC normalization needed', 'harness-execution', 'success');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const matches = content.match(/UTC normalization needed/g);
    expect(matches?.length).toBe(1);
  });

  it('should write both entries when content differs', async () => {
    await appendLearning(tmpDir, 'First unique learning', 'skill-a', 'success');
    await appendLearning(tmpDir, 'Second unique learning', 'skill-b', 'gotcha');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('First unique learning');
    expect(content).toContain('Second unique learning');
  });

  it('should create content-hashes.json sidecar file', async () => {
    await appendLearning(tmpDir, 'A learning', 'skill-a', 'success');

    const hashesPath = path.join(tmpDir, '.harness', 'content-hashes.json');
    expect(fs.existsSync(hashesPath)).toBe(true);
    const hashes = JSON.parse(fs.readFileSync(hashesPath, 'utf-8'));
    expect(Object.keys(hashes).length).toBe(1);
  });

  it('should maintain independent hash indexes per session', async () => {
    await appendLearning(tmpDir, 'Session learning', 'skill-a', 'success', undefined, 'session-1');
    await appendLearning(tmpDir, 'Session learning', 'skill-a', 'success', undefined, 'session-2');

    // Both sessions should have the entry (different hash indexes)
    const session1Dir = path.join(tmpDir, '.harness', 'sessions', 'session-1');
    const session2Dir = path.join(tmpDir, '.harness', 'sessions', 'session-2');
    const content1 = fs.readFileSync(path.join(session1Dir, 'learnings.md'), 'utf-8');
    const content2 = fs.readFileSync(path.join(session2Dir, 'learnings.md'), 'utf-8');
    expect(content1).toContain('Session learning');
    expect(content2).toContain('Session learning');
  });
});

describe('self-healing content hash index', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-heal-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should rebuild index when content-hashes.json is deleted and new entry appended', async () => {
    await appendLearning(tmpDir, 'First learning', 'skill-a', 'success');
    const hashesPath = path.join(tmpDir, '.harness', 'content-hashes.json');
    expect(fs.existsSync(hashesPath)).toBe(true);

    // Delete the sidecar
    fs.unlinkSync(hashesPath);
    expect(fs.existsSync(hashesPath)).toBe(false);

    // Append a NEW (different) learning — should rebuild index and write
    await appendLearning(tmpDir, 'Second learning', 'skill-b', 'gotcha');

    // Index should be rebuilt with both entries
    expect(fs.existsSync(hashesPath)).toBe(true);
    const hashes = JSON.parse(fs.readFileSync(hashesPath, 'utf-8'));
    expect(Object.keys(hashes).length).toBe(2);
  });

  it('should deduplicate after index rebuild when content-hashes.json is deleted', async () => {
    await appendLearning(tmpDir, 'Duplicate me', 'skill-a', 'success');
    const hashesPath = path.join(tmpDir, '.harness', 'content-hashes.json');

    // Delete the sidecar
    fs.unlinkSync(hashesPath);

    // Append the SAME learning — should rebuild, detect duplicate, and skip
    await appendLearning(tmpDir, 'Duplicate me', 'skill-a', 'success');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const matches = content.match(/Duplicate me/g);
    expect(matches?.length).toBe(1);
  });

  it('should rebuild when content-hashes.json contains corrupted JSON', async () => {
    await appendLearning(tmpDir, 'Valid learning', 'skill-a', 'success');
    const hashesPath = path.join(tmpDir, '.harness', 'content-hashes.json');

    // Corrupt the sidecar
    fs.writeFileSync(hashesPath, '{corrupted json!!!');

    // Append a new learning — should handle corruption gracefully
    await appendLearning(tmpDir, 'After corruption', 'skill-b', 'gotcha');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('Valid learning');
    expect(content).toContain('After corruption');
  });

  it('should deduplicate after corruption when same content appended', async () => {
    await appendLearning(tmpDir, 'Corrupted dedup test', 'skill-a', 'success');
    const hashesPath = path.join(tmpDir, '.harness', 'content-hashes.json');

    // Corrupt the sidecar
    fs.writeFileSync(hashesPath, '{corrupted json!!!');

    // Append the SAME learning — should rebuild from learnings.md and skip
    await appendLearning(tmpDir, 'Corrupted dedup test', 'skill-a', 'success');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const matches = content.match(/Corrupted dedup test/g);
    expect(matches?.length).toBe(1);
  });
});

describe('appendLearning performance', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-perf-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should append 100 unique learnings in under 2 seconds', async () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await appendLearning(tmpDir, `Unique learning number ${i}`, 'skill-perf', 'success');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);

    // Verify all 100 were written
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const matches = content.match(/Unique learning number/g);
    expect(matches?.length).toBe(100);
  });
});

describe('extractIndexEntry with structured fields', () => {
  it('should extract rootCause from entry', () => {
    const entry =
      '- **2026-04-17 [skill:debugging] [outcome:gotcha] [root_cause:circular-import]:** Found circular dep';
    const idx = extractIndexEntry(entry);
    expect(idx.rootCause).toBe('circular-import');
  });

  it('should extract triedAndFailed from entry', () => {
    const entry =
      '- **2026-04-17 [skill:debugging] [tried:manual-fix,auto-gen]:** Tried multiple approaches';
    const idx = extractIndexEntry(entry);
    expect(idx.triedAndFailed).toEqual(['manual-fix', 'auto-gen']);
  });

  it('should handle entry without structured fields', () => {
    const entry = '- **2026-04-17 [skill:debugging]:** Simple learning';
    const idx = extractIndexEntry(entry);
    expect(idx.rootCause).toBeUndefined();
    expect(idx.triedAndFailed).toBeUndefined();
  });

  it('should extract both rootCause and triedAndFailed together', () => {
    const entry =
      '- **2026-04-17 [skill:debug] [outcome:gotcha] [root_cause:race-condition] [tried:mutex,semaphore]:** Fixed race';
    const idx = extractIndexEntry(entry);
    expect(idx.rootCause).toBe('race-condition');
    expect(idx.triedAndFailed).toEqual(['mutex', 'semaphore']);
  });
});

describe('appendLearning with structured fields', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should include root_cause tag in written entry', async () => {
    const result = await appendLearning(
      tmpDir,
      'Found circular dep',
      'debugging',
      'gotcha',
      undefined,
      undefined,
      'circular-import'
    );
    expect(result.ok).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('[root_cause:circular-import]');
  });

  it('should include tried tag in written entry', async () => {
    const result = await appendLearning(
      tmpDir,
      'Tried multiple approaches',
      'debugging',
      'gotcha',
      undefined,
      undefined,
      undefined,
      ['manual-fix', 'auto-gen']
    );
    expect(result.ok).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('[tried:manual-fix,auto-gen]');
  });

  it('should include both root_cause and tried tags', async () => {
    const result = await appendLearning(
      tmpDir,
      'Complex fix',
      'debugging',
      'gotcha',
      undefined,
      undefined,
      'race-condition',
      ['mutex', 'semaphore']
    );
    expect(result.ok).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('[root_cause:race-condition]');
    expect(content).toContain('[tried:mutex,semaphore]');
  });

  it('should work without structured fields (backwards compatible)', async () => {
    const result = await appendLearning(tmpDir, 'Simple learning', 'testing', 'success');
    expect(result.ok).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).not.toContain('[root_cause:');
    expect(content).not.toContain('[tried:');
  });
});

describe('appendLearning overlap detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return overlap when similar entry exists', async () => {
    await appendLearning(
      tmpDir,
      'The auth module has a race condition in src/auth.ts',
      'debugging',
      'gotcha',
      undefined,
      undefined,
      'race-condition'
    );
    const result = await appendLearning(
      tmpDir,
      'Found race condition issue in the auth module src/auth.ts',
      'debugging',
      'gotcha',
      undefined,
      undefined,
      'race-condition'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appended).toBe(true);
      expect(result.value.overlap).toBeDefined();
      expect(result.value.overlap!.score).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('should not return overlap for unrelated entry', async () => {
    await appendLearning(tmpDir, 'Database migration completed', 'testing', 'success');
    const result = await appendLearning(
      tmpDir,
      'Auth token expiry needs handling',
      'debugging',
      'gotcha'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appended).toBe(true);
      expect(result.value.overlap).toBeUndefined();
    }
  });

  it('should return appended false for exact duplicate', async () => {
    await appendLearning(tmpDir, 'Exact same learning text', 'debugging', 'gotcha');
    const result = await appendLearning(tmpDir, 'Exact same learning text', 'debugging', 'gotcha');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appended).toBe(false);
    }
  });
});
