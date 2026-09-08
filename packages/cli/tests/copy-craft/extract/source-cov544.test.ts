import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../../../src/copy-craft/extract/source.js';
import type { CopySurface } from '../../../src/copy-craft/findings/schema.js';

/**
 * Branch-coverage tests for the copy-craft source extractor: error throws,
 * Result-style Err(), log/logger/cli-output surfaces, comment cleaning, and
 * the surface-filter / non-source guards.
 */

function surfaces(items: { surface: CopySurface }[]): CopySurface[] {
  return items.map((i) => i.surface);
}

describe('extractFromSource guards', () => {
  it('returns [] for a non-source file', () => {
    expect(extractFromSource({ file: 'readme.md', source: 'throw new Error("x");' })).toEqual([]);
  });
});

describe('error surface', () => {
  it('extracts a thrown Error message', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'function f() { throw new Error("boom happened"); }',
      surfaces: ['error'],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.snippet).toBe('boom happened');
    expect(items[0]!.context.errorType).toBe('Error');
  });

  it('extracts a custom *Error subtype', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'throw new ValidationError("bad input");',
      surfaces: ['error'],
    });
    expect(items[0]!.context.errorType).toBe('ValidationError');
  });

  it('extracts a Result-style Err({ message })', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'const r = Err({ message: "not found" });',
      surfaces: ['error'],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.snippet).toBe('not found');
    expect(items[0]!.context.errorType).toBe('Err');
  });

  it('ignores a thrown non-Error constructor', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'throw new Widget("hi");',
      surfaces: ['error'],
    });
    expect(items).toEqual([]);
  });

  it('handles a template-literal error message with interpolation', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'throw new Error(`failed for ${id} reason`);',
      surfaces: ['error'],
    });
    expect(items[0]!.snippet).toContain('failed for');
    expect(items[0]!.snippet).toContain('${...}');
  });
});

describe('log surface', () => {
  it('extracts a console.warn message', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'console.warn("watch out");',
      surfaces: ['log'],
    });
    expect(surfaces(items)).toEqual(['log']);
    expect(items[0]!.context.logLevel).toBe('warn');
  });

  it('extracts a logger.info message from a logger-like receiver', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'logger.info("started");',
      surfaces: ['log'],
    });
    expect(items[0]!.context.logLevel).toBe('info');
  });

  it('ignores a non-log-level method', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: 'console.table(rows);',
      surfaces: ['log'],
    });
    expect(items).toEqual([]);
  });
});

describe('cli-output surface', () => {
  it('classifies console output in a CLI source path as cli-output', () => {
    const items = extractFromSource({
      file: '/repo/packages/cli/src/commands/init.ts',
      source: 'console.log("Done!");',
      surfaces: ['cli-output', 'log'],
    });
    expect(surfaces(items)).toContain('cli-output');
  });

  it('does not treat non-CLI files as cli-output', () => {
    const items = extractFromSource({
      file: '/repo/lib/util.ts',
      source: 'console.log("hi");',
      surfaces: ['cli-output', 'log'],
    });
    expect(surfaces(items)).toEqual(['log']);
  });

  it('honors an explicit cliOutputPaths substring match', () => {
    const items = extractFromSource({
      file: '/repo/tooling/mycli/print.ts',
      source: 'console.log("hey");',
      surfaces: ['cli-output'],
      cliOutputPaths: ['tooling/mycli/'],
    });
    expect(surfaces(items)).toContain('cli-output');
  });
});

describe('comment surface', () => {
  it('extracts a line comment', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: '// this is a note\nconst x = 1;',
      surfaces: ['comment'],
    });
    expect(items.some((i) => i.snippet === 'this is a note')).toBe(true);
  });

  it('extracts and cleans a block comment', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: '/* line one\n * line two */\nconst y = 2;',
      surfaces: ['comment'],
    });
    const c = items.find((i) => i.surface === 'comment');
    expect(c!.snippet).toContain('line one');
    expect(c!.snippet).toContain('line two');
  });

  it('skips JSDoc block comments (docs-craft territory)', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: '/** jsdoc here */\nconst z = 3;',
      surfaces: ['comment'],
    });
    expect(items).toEqual([]);
  });

  it('skips license/copyright banner comments near the top', () => {
    const items = extractFromSource({
      file: 'a.ts',
      source: '// Copyright 2026 Acme. MIT License.\nconst q = 4;',
      surfaces: ['comment'],
    });
    expect(items).toEqual([]);
  });
});

describe('surface filtering', () => {
  it('extracts only the requested surface', () => {
    const src = 'throw new Error("e");\nconsole.log("l");\n// c';
    const onlyErrors = extractFromSource({ file: 'a.ts', source: src, surfaces: ['error'] });
    expect(surfaces(onlyErrors)).toEqual(['error']);
  });
});
