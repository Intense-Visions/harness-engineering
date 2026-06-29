import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveComponentType } from '../../../../src/audit/component-anatomy/resolvers/component-type';

describe('resolveComponentType — JSDoc @component-type (Layer 1)', () => {
  it('returns the self-declared type from the leading JSDoc', () => {
    const source = `/**\n * @component-type Button\n */\nexport const Whatever = () => null;\n`;
    expect(resolveComponentType('/abs/Whatever.tsx', source)).toBe('Button');
  });

  it('JSDoc wins over the export-name fallback', () => {
    // Export name would resolve to nothing useful, but the tag is authoritative.
    const source = `/**\n * @component-type Input\n */\nexport const NotInput = () => null;\n`;
    expect(resolveComponentType('/abs/NotInput.tsx', source)).toBe('Input');
  });
});

describe('resolveComponentType — DESIGN.md Component Registry (Layer 2)', () => {
  let dir = '';
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('resolves the type by matching the audited file against the registry', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-ct-'));
    fs.writeFileSync(
      path.join(dir, 'DESIGN.md'),
      `## Component Registry\n\n| Type | File | \n| --- | --- |\n| Button | src/widgets/Thing.tsx |\n`
    );
    const file = path.join(dir, 'src', 'widgets', 'Thing.tsx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // No JSDoc tag and an export name that is not in the catalog → only the
    // registry can resolve it.
    fs.writeFileSync(file, 'export const Thing = () => null;\n');
    expect(resolveComponentType(file, fs.readFileSync(file, 'utf8'))).toBe('Button');
  });

  it('returns null when neither JSDoc, registry, nor export-name match', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-ct-none-'));
    const file = path.join(dir, 'Mystery.tsx');
    fs.writeFileSync(file, 'export const Mystery = () => null;\n');
    expect(resolveComponentType(file, fs.readFileSync(file, 'utf8'))).toBeNull();
  });
});
