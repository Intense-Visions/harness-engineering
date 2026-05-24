import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadTokenSet } from '../../../src/drift/resolvers/tokens';

describe('loadTokenSet', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-tokens-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTokens(json: unknown): void {
    const dir = path.join(tmpDir, 'design-system');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(json));
  }

  it('returns null when design-system/tokens.json is absent', () => {
    expect(loadTokenSet(tmpDir)).toBeNull();
  });

  it('returns null when tokens.json is invalid JSON', () => {
    const dir = path.join(tmpDir, 'design-system');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'tokens.json'), '{ not: valid');
    expect(loadTokenSet(tmpDir)).toBeNull();
  });

  it('extracts $type:color values into the colors palette (lowercased)', () => {
    writeTokens({
      color: {
        brand: { primary: { $type: 'color', $value: '#FF6600' } },
      },
    });
    const tokens = loadTokenSet(tmpDir)!;
    expect(tokens.colors.has('#ff6600')).toBe(true);
  });

  it('extracts fontFamily values (string and array forms)', () => {
    writeTokens({
      typography: {
        body: { $type: 'fontFamily', $value: 'Inter' },
        code: { $type: 'fontFamily', $value: ['Fira Code', 'Menlo'] },
      },
    });
    const tokens = loadTokenSet(tmpDir)!;
    expect(tokens.fontFamilies.has('inter')).toBe(true);
    expect(tokens.fontFamilies.has('fira code')).toBe(true);
    expect(tokens.fontFamilies.has('menlo')).toBe(true);
  });

  it('extracts spacing dimension values in px', () => {
    writeTokens({
      space: {
        sm: { $type: 'dimension', $value: '8px' },
        md: { $type: 'spacing', $value: 16 },
      },
    });
    const tokens = loadTokenSet(tmpDir)!;
    expect(tokens.spacingPx.has(8)).toBe(true);
    expect(tokens.spacingPx.has(16)).toBe(true);
  });

  it('skips non-px dimension units (rem, em, %)', () => {
    writeTokens({
      space: {
        rel: { $type: 'dimension', $value: '1rem' },
      },
    });
    const tokens = loadTokenSet(tmpDir)!;
    expect(tokens.spacingPx.size).toBe(0);
  });

  it('captures $deprecated:true tokens by dotted path', () => {
    writeTokens({
      color: {
        old: { $type: 'color', $value: '#000000', $deprecated: true },
      },
    });
    const tokens = loadTokenSet(tmpDir)!;
    expect(tokens.deprecatedTokens.has('color.old')).toBe(true);
  });

  it('captures harness extension deprecation', () => {
    writeTokens({
      color: {
        legacy: {
          $type: 'color',
          $value: '#111111',
          $extensions: { harness: { deprecated: true } },
        },
      },
    });
    const tokens = loadTokenSet(tmpDir)!;
    expect(tokens.deprecatedTokens.has('color.legacy')).toBe(true);
  });
});
