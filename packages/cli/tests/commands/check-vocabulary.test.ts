import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  createCheckVocabularyCommand,
  runCheckVocabulary,
} from '../../src/commands/check-vocabulary';
import {
  scanText,
  scanFiles,
  formatViolations,
  type VocabularyRule,
} from '../../src/vocabulary/scanner';

const FIXTURES = path.join(__dirname, '../fixtures/semantic-vocabulary');

const SAMPLE_RULES: readonly VocabularyRule[] = [
  { deprecated: 'sub-agent', canonical: 'subagent', reason: 'closed compound' },
  { deprecated: 'green field', canonical: 'greenfield', reason: 'closed compound' },
  { deprecated: 'master branch', canonical: 'main branch', reason: 'default branch is main' },
];

describe('semantic-vocabulary scanner', () => {
  it('flags a deprecated term in prose with the suggested canonical term', () => {
    const v = scanText('x.md', 'We spun up a sub-agent for this.', SAMPLE_RULES);
    expect(v.map((x) => x.deprecated)).toEqual(['sub-agent']);
    expect(v[0]).toMatchObject({ deprecated: 'sub-agent', canonical: 'subagent', line: 1 });
  });

  it('reports the correct 1-based line number', () => {
    const content = 'line one\nline two has a sub-agent here\nline three';
    const v = scanText('x.md', content, SAMPLE_RULES);
    expect(v.map((x) => x.line)).toEqual([2]);
  });

  it('passes clean prose that uses the canonical term', () => {
    const v = scanText('x.md', 'We spun up a subagent on the main branch.', SAMPLE_RULES);
    expect(v).toEqual([]);
  });

  it('does not match a canonical closed compound as a substring', () => {
    // "codebase" must not trip a "code base" rule via substring.
    const rules = [{ deprecated: 'code base', canonical: 'codebase', reason: 'r' }];
    expect(scanText('x.md', 'The codebase is large.', rules)).toEqual([]);
  });

  it('ignores deprecated terms inside fenced code blocks and inline code', () => {
    const content = ['```', 'const x = "sub-agent";', '```', 'inline `sub-agent` too'].join('\n');
    expect(scanText('x.md', content, SAMPLE_RULES)).toEqual([]);
  });

  it('honors per-rule allow exemptions (regex source strings)', () => {
    const rules: VocabularyRule[] = [
      { deprecated: 'sub-agent', canonical: 'subagent', reason: 'r', allow: ['quoting legacy'] },
    ];
    expect(scanText('x.md', 'quoting legacy sub-agent term', rules)).toEqual([]);
  });

  it('formats violations into an actionable message', () => {
    const v = scanText('docs/x.md', 'a sub-agent', SAMPLE_RULES);
    const msg = formatViolations(v);
    expect(msg).toContain('docs/x.md:1');
    expect(msg).toContain('use "subagent"');
  });

  it('detects every deprecated term in the deprecated fixture, and none in the clean fixture', async () => {
    const dirty = await scanFiles(
      FIXTURES,
      { include: ['deprecated-sample.md'], exclude: [] },
      SAMPLE_RULES
    );
    // Every sample rule appears exactly once in prose; code/inline are ignored.
    expect(dirty.map((v) => v.deprecated).sort()).toEqual(
      SAMPLE_RULES.map((r) => r.deprecated).sort()
    );

    const clean = await scanFiles(
      FIXTURES,
      { include: ['clean-sample.md'], exclude: [] },
      SAMPLE_RULES
    );
    expect(clean).toEqual([]);
  });
});

describe('runCheckVocabulary command', () => {
  it('fails and reports violations for a deprecated fixture', async () => {
    const result = await runCheckVocabulary({
      cwd: FIXTURES,
      configPath: path.join(FIXTURES, 'enabled-config.json'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.skipped).toBe(false);
      expect(result.value.violations.map((v) => v.deprecated).sort()).toEqual(
        SAMPLE_RULES.map((r) => r.deprecated).sort()
      );
    }
  });

  it('passes for clean prose using canonical terms', async () => {
    const result = await runCheckVocabulary({
      cwd: FIXTURES,
      configPath: path.join(FIXTURES, 'clean-config.json'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.violations).toEqual([]);
    }
  });

  it('passes trivially (skipped) when the gate is disabled', async () => {
    const result = await runCheckVocabulary({
      cwd: FIXTURES,
      configPath: path.join(FIXTURES, 'disabled-config.json'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.skipped).toBe(true);
    }
  });

  it('passes trivially (skipped) when there are no rules', async () => {
    const result = await runCheckVocabulary({
      cwd: FIXTURES,
      configPath: path.join(FIXTURES, 'empty-rules-config.json'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.skipped).toBe(true);
    }
  });

  it('returns an error when the config cannot be resolved', async () => {
    const result = await runCheckVocabulary({
      configPath: '/nonexistent/harness.config.json',
    });
    expect(result.ok).toBe(false);
  });
});

describe('createCheckVocabularyCommand', () => {
  it('creates a command named check-vocabulary', () => {
    const cmd = createCheckVocabularyCommand();
    expect(cmd.name()).toBe('check-vocabulary');
  });
});
