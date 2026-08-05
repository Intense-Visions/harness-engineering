import { describe, it, expect } from 'vitest';
import { extractUnits, unitSource } from '../../src/code-craft/extract/units';

describe('extractUnits', () => {
  it('returns [] for a trivial one-liner function (below the substantive bar)', () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    expect(extractUnits(src, '/tmp/util.ts')).toEqual([]);
  });

  it('detects a function with >= 3 statements', () => {
    const src = `
      export function build(x) {
        const a = x + 1;
        const b = a * 2;
        return b - 3;
      }
    `;
    const units = extractUnits(src, '/tmp/f.ts');
    expect(units.some((u) => u.kind === 'function' && u.name === 'build')).toBe(true);
  });

  it('detects a short function that hides control flow', () => {
    const src = `
      export function pick(x) {
        if (x > 0) return 'pos';
        return 'neg';
      }
    `;
    const units = extractUnits(src, '/tmp/f.ts');
    expect(units.some((u) => u.name === 'pick')).toBe(true);
  });

  it('recovers a name for an arrow bound to a const', () => {
    const src = `
      export const compute = (x) => {
        const y = x * 2;
        const z = y + 1;
        return z;
      };
    `;
    const units = extractUnits(src, '/tmp/f.ts');
    expect(units.some((u) => u.kind === 'function' && u.name === 'compute')).toBe(true);
  });

  it('detects methods on a class and the class itself', () => {
    const src = `
      export class Cache {
        private store = new Map();
        get(key) {
          if (this.store.has(key)) return this.store.get(key);
          return undefined;
        }
      }
    `;
    const units = extractUnits(src, '/tmp/c.ts');
    expect(units.some((u) => u.kind === 'class' && u.name === 'Cache')).toBe(true);
    expect(units.some((u) => u.kind === 'method' && u.name === 'get')).toBe(true);
  });

  it('does not fire on function keyword inside a comment or string', () => {
    const src = `
      // export function ghost() { return 1; }
      const doc = 'function fake() { return 2; }';
      export const real = { doc };
    `;
    const units = extractUnits(src, '/tmp/x.ts');
    expect(units.every((u) => u.name !== 'ghost' && u.name !== 'fake')).toBe(true);
  });

  it('records 1-based line and endLine for a unit', () => {
    const src = `export function build(x) {\n  const a = x + 1;\n  const b = a * 2;\n  return b;\n}\n`;
    const units = extractUnits(src, '/tmp/f.ts');
    const u = units.find((unit) => unit.name === 'build');
    expect(u).toBeDefined();
    expect(u!.line).toBe(1);
    expect(u!.endLine).toBeGreaterThanOrEqual(u!.line);
  });

  it('unitSource slices the unit span and truncates past the cap', () => {
    const src = `export function build(x) {\n  const a = x + 1;\n  const b = a * 2;\n  return b;\n}\n`;
    const units = extractUnits(src, '/tmp/f.ts');
    const u = units.find((unit) => unit.name === 'build')!;
    expect(unitSource(src, u, 5000)).toContain('const a = x + 1');
    expect(unitSource(src, u, 20)).toContain('truncated for cost');
  });

  it('returns [] for a pure type-declaration file', () => {
    const src = `
      export interface Foo { a: number; b: string; }
      export type Bar = Foo | null;
    `;
    expect(extractUnits(src, '/tmp/types.ts')).toEqual([]);
  });
});
