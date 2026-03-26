import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDateFromEntry, analyzeLearningPatterns } from '../../src/state/learnings';

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
