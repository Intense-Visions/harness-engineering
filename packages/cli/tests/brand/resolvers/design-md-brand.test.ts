import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadBrandRules } from '../../../src/brand/resolvers/design-md-brand';

describe('loadBrandRules', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-md-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDesignMd(content: string): void {
    const dir = path.join(tmpDir, 'design-system');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'DESIGN.md'), content);
  }

  it('returns null when DESIGN.md is absent', () => {
    expect(loadBrandRules(tmpDir)).toBeNull();
  });

  it('returns null when ## Brand Rules section is missing', () => {
    writeDesignMd(`# DESIGN\n\n## Other Section\nnope\n`);
    expect(loadBrandRules(tmpDir)).toBeNull();
  });

  it('parses voice.forbidden_phrases from a basic Brand Rules section', () => {
    writeDesignMd(`# DESIGN

## Brand Rules

### Voice

constant: "warm, direct"
forbidden_phrases:
  - "click here"
  - "synergy"
  - "best-in-class"
reading_level: 7
max_sentence_words: 25
`);
    const rules = loadBrandRules(tmpDir)!;
    expect(rules.voice).not.toBeNull();
    expect(rules.voice!.forbiddenPhrases).toEqual(['click here', 'synergy', 'best-in-class']);
    expect(rules.voice!.constant).toBe('warm, direct');
    expect(rules.voice!.readingLevel).toBe(7);
    expect(rules.voice!.maxSentenceWords).toBe(25);
  });

  it('returns voice.forbiddenPhrases as empty array when forbidden_phrases key missing', () => {
    writeDesignMd(`## Brand Rules

### Voice

constant: "warm"
`);
    const rules = loadBrandRules(tmpDir)!;
    expect(rules.voice).not.toBeNull();
    expect(rules.voice!.forbiddenPhrases).toEqual([]);
    expect(rules.voice!.constant).toBe('warm');
  });

  it('stops at the next H2 (does not bleed into adjacent sections)', () => {
    writeDesignMd(`## Brand Rules

### Voice

forbidden_phrases:
  - "click here"

## Patterns

### Voice

forbidden_phrases:
  - "stale"
`);
    const rules = loadBrandRules(tmpDir)!;
    expect(rules.voice!.forbiddenPhrases).toEqual(['click here']);
  });

  it('parses semantic_token_aliases for forward-compat (unused in v1)', () => {
    writeDesignMd(`## Brand Rules

### Semantic Token Aliases

brand_primary: "color.brand.500"
brand_accent: "color.accent.500"
`);
    const rules = loadBrandRules(tmpDir)!;
    expect(rules.semanticTokenAliases).not.toBeNull();
    expect(rules.semanticTokenAliases!.brand_primary).toBe('color.brand.500');
    expect(rules.semanticTokenAliases!.brand_accent).toBe('color.accent.500');
  });

  it('returns null sections cleanly when subsections are absent', () => {
    writeDesignMd(`## Brand Rules\n\nNo subsections.\n`);
    const rules = loadBrandRules(tmpDir)!;
    expect(rules.voice).toBeNull();
    expect(rules.toneByContext).toBeNull();
    expect(rules.assets).toBeNull();
    expect(rules.semanticTokenAliases).toBeNull();
  });
});
