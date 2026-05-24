import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadBrandTokenIndex } from '../../../src/brand/resolvers/token-extensions';

describe('loadBrandTokenIndex', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-tokens-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTokens(obj: unknown): void {
    const dir = path.join(tmpDir, 'design-system');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(obj));
  }

  it('returns null when tokens.json absent', () => {
    expect(loadBrandTokenIndex(tmpDir)).toBeNull();
  });

  it('returns null when no token carries the harness.brand extension', () => {
    writeTokens({ color: { brand: { primary: { $type: 'color', $value: '#0066cc' } } } });
    expect(loadBrandTokenIndex(tmpDir)).toBeNull();
  });

  it('captures role + approvedContexts + forbiddenContexts per token', () => {
    writeTokens({
      color: {
        brand: {
          '500': {
            $type: 'color',
            $value: '#3b82f6',
            $extensions: {
              harness: {
                brand: {
                  role: 'primary',
                  approved_contexts: ['cta', 'selection', 'focus'],
                  forbidden_contexts: ['data-visualization', 'decorative'],
                },
              },
            },
          },
        },
      },
    });
    const idx = loadBrandTokenIndex(tmpDir)!;
    const info = idx.byPath.get('color.brand.500');
    expect(info).toBeDefined();
    expect(info!.role).toBe('primary');
    expect(info!.approvedContexts).toEqual(['cta', 'selection', 'focus']);
    expect(info!.forbiddenContexts).toEqual(['data-visualization', 'decorative']);
  });

  it('handles missing optional fields gracefully (empty-array defaults)', () => {
    writeTokens({
      color: {
        x: {
          $type: 'color',
          $value: '#ffffff',
          $extensions: { harness: { brand: { role: 'neutral' } } },
        },
      },
    });
    const idx = loadBrandTokenIndex(tmpDir)!;
    const info = idx.byPath.get('color.x')!;
    expect(info.role).toBe('neutral');
    expect(info.approvedContexts).toEqual([]);
    expect(info.forbiddenContexts).toEqual([]);
  });
});
