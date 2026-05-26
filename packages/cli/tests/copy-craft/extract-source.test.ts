import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../../src/copy-craft/extract/source';

describe('extractFromSource — errors', () => {
  it('extracts throw new Error("msg")', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `throw new Error("boom");\n`,
      surfaces: ['error'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].surface).toBe('error');
    expect(items[0].snippet).toBe('boom');
    expect(items[0].context.errorType).toBe('Error');
  });

  it('extracts throw new TypeError("msg")', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `throw new TypeError("not a string");\n`,
      surfaces: ['error'],
    });
    expect(items[0].context.errorType).toBe('TypeError');
  });

  it('extracts throw new ValidationError("msg") — any *Error class', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `throw new ValidationError("invalid");\n`,
      surfaces: ['error'],
    });
    expect(items[0].context.errorType).toBe('ValidationError');
  });

  it('extracts Err({ message: "msg" })', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `return Err({ message: "could not resolve" });\n`,
      surfaces: ['error'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].context.errorType).toBe('Err');
    expect(items[0].snippet).toBe('could not resolve');
  });

  it('does NOT match throw new MyClass("not an error")', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `throw new MyClass("not an error");\n`,
      surfaces: ['error'],
    });
    expect(items).toHaveLength(0);
  });
});

describe('extractFromSource — logs', () => {
  it('extracts console.log("msg")', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `console.log("starting");\n`,
      surfaces: ['log'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].surface).toBe('log');
    expect(items[0].context.logLevel).toBe('log');
  });

  it('extracts console.warn/error/info/debug with correct level', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `console.warn("w");\nconsole.error("e");\nconsole.info("i");\nconsole.debug("d");\n`,
      surfaces: ['log'],
    });
    expect(items.map((i) => i.context.logLevel).sort()).toEqual(['debug', 'error', 'info', 'warn']);
  });

  it('extracts logger.info("msg")', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `logger.info("hi");\n`,
      surfaces: ['log'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].context.logLevel).toBe('info');
  });

  it('does NOT match arbitraryReceiver.info("msg")', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `randomThing.info("hi");\n`,
      surfaces: ['log'],
    });
    expect(items).toHaveLength(0);
  });
});

describe('extractFromSource — cli-output', () => {
  it('treats console.log in CLI command files as cli-output (not log)', () => {
    const items = extractFromSource({
      file: 'packages/cli/src/commands/foo.ts',
      source: `console.log("hello user");\n`,
      surfaces: ['log', 'cli-output'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].surface).toBe('cli-output');
  });

  it('treats console.log outside CLI paths as log', () => {
    const items = extractFromSource({
      file: 'src/utils/foo.ts',
      source: `console.log("hello");\n`,
      surfaces: ['log', 'cli-output'],
    });
    expect(items[0].surface).toBe('log');
  });
});

describe('extractFromSource — comments', () => {
  it('extracts single-line // comments', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `// this is a comment\nconst x = 1;\n`,
      surfaces: ['comment'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].surface).toBe('comment');
    expect(items[0].snippet).toBe('this is a comment');
  });

  it('extracts block /* */ comments', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `/* multi-line\n * comment */\nconst x = 1;\n`,
      surfaces: ['comment'],
    });
    expect(items).toHaveLength(1);
    expect(items[0].snippet).toContain('multi-line');
  });

  it('EXCLUDES JSDoc /** */', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `/** doc comment */\nexport function foo() {}\n`,
      surfaces: ['comment'],
    });
    expect(items).toHaveLength(0);
  });

  it('EXCLUDES license banner blocks (early file + Copyright/SPDX/etc.)', () => {
    const items = extractFromSource({
      file: 'src/a.ts',
      source: `/*\n * Copyright (c) 2026 Foo\n * SPDX-License-Identifier: Apache-2.0\n */\nconst x = 1;\n`,
      surfaces: ['comment'],
    });
    expect(items).toHaveLength(0);
  });
});

describe('extractFromSource — file kind filter', () => {
  it('returns [] for non-TS/JS files', () => {
    const items = extractFromSource({
      file: 'README.md',
      source: `// throw new Error("not parsed")\n`,
      surfaces: ['error', 'log', 'comment'],
    });
    expect(items).toEqual([]);
  });
});
