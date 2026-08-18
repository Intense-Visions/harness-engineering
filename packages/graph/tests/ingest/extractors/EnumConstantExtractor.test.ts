import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'path';
import { EnumConstantExtractor } from '../../../src/ingest/extractors/EnumConstantExtractor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../__fixtures__/extractor-project');
const extractor = new EnumConstantExtractor();

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

describe('EnumConstantExtractor', () => {
  it('extracts enums, as const, and union types from TypeScript', () => {
    const content = readFixture('enums.ts');
    const records = extractor.extract(content, 'enums.ts', 'typescript');

    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records.every((r) => r.nodeType === 'business_term')).toBe(true);

    const names = records.map((r) => r.name);
    expect(names).toContain('OrderStatus');
    expect(names).toContain('PaymentMethod');
    expect(names).toContain('UserRole');

    // Enum should have high confidence
    const orderStatus = records.find((r) => r.name === 'OrderStatus');
    expect(orderStatus!.confidence).toBe(0.8);
    expect(orderStatus!.metadata.members).toContain('PENDING');
  });

  it('extracts Enum subclasses from Python', () => {
    const content = readFixture('enums.py');
    const records = extractor.extract(content, 'enums.py', 'python');

    expect(records.length).toBeGreaterThanOrEqual(3);

    const names = records.map((r) => r.name);
    expect(names).toContain('OrderStatus');
    expect(names).toContain('Priority');
  });

  it('extracts iota const blocks from Go', () => {
    const content = readFixture('enums.go');
    const records = extractor.extract(content, 'enums.go', 'go');

    expect(records.length).toBeGreaterThanOrEqual(2);

    const orderStatus = records.find(
      (r) => r.name === 'OrderStatus' || (r.metadata.members as string[])?.includes('Pending')
    );
    expect(orderStatus).toBeDefined();
  });

  it('extracts enum declarations from Rust', () => {
    const content = readFixture('enums.rs');
    const records = extractor.extract(content, 'enums.rs', 'rust');

    expect(records.length).toBeGreaterThanOrEqual(3);

    const names = records.map((r) => r.name);
    expect(names).toContain('OrderStatus');
    expect(names).toContain('Priority');
    expect(names).toContain('PaymentMethod');
  });

  it('extracts enum classes from Java', () => {
    const content = readFixture('Enums.java');
    const records = extractor.extract(content, 'Enums.java', 'java');

    expect(records.length).toBeGreaterThanOrEqual(2);

    const names = records.map((r) => r.name);
    expect(names).toContain('OrderStatus');
    expect(names).toContain('Priority');
  });

  it('generates stable IDs', () => {
    const content = readFixture('enums.ts');
    const records1 = extractor.extract(content, 'enums.ts', 'typescript');
    const records2 = extractor.extract(content, 'enums.ts', 'typescript');

    expect(records1.map((r) => r.id)).toEqual(records2.map((r) => r.id));
  });

  it('collects only top-level keys of an as-const object with a multi-line nested value', () => {
    // A nested object value must not leak its keys into the parent member list,
    // and its closing brace must not end collection early (dropping siblings).
    const content = [
      'export const CONFIG = {',
      '  server: {',
      '    port: 3000,',
      '  },',
      '  debug: false,',
      '} as const;',
    ].join('\n');
    const records = extractor.extract(content, 'config.ts', 'typescript');

    const config = records.find((r) => r.name === 'CONFIG');
    expect(config).toBeDefined();
    expect(config!.metadata.members).toEqual(['server', 'debug']);
  });

  it('does not treat prose/comment lines that merely contain "enum <word>" as TS enums (#1331)', () => {
    // A JSDoc line and a TODO comment both contain the substring `enum <word>`
    // but are ordinary prose, not enum declarations. An unanchored regex would
    // parse them and emit junk business_term nodes (e.g. `enum or { ... }`).
    const content = [
      '/**',
      ' * a types.ts that also exports an enum or a const map is ordinary',
      ' */',
      'function ordinary() {',
      '  // TODO: replace this enum with a union',
      '  return 1;',
      '}',
      '',
      'export enum Real {',
      '  A,',
      '  B,',
      '}',
    ].join('\n');
    const records = extractor.extract(content, 'prose.ts', 'typescript');

    const names = records.map((r) => r.name);
    // The real enum is still extracted.
    expect(names).toContain('Real');
    // The prose "enum or" and comment "enum with" are NOT extracted.
    expect(names).not.toContain('or');
    expect(names).not.toContain('with');
  });

  it('does not treat prose/comment lines that merely contain "enum <word>" as Java enums (#1331)', () => {
    const content = [
      '/**',
      ' * a Types.java that also exports an enum or a const map is ordinary',
      ' */',
      'class Ordinary {',
      '  // TODO: replace this enum with a union',
      '  public enum Real {',
      '    A,',
      '    B,',
      '  }',
      '}',
    ].join('\n');
    const records = extractor.extract(content, 'Prose.java', 'java');

    const names = records.map((r) => r.name);
    expect(names).toContain('Real');
    expect(names).not.toContain('or');
    expect(names).not.toContain('with');
  });
});
