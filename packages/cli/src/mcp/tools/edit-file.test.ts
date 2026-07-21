import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { editFileDefinition, handleEditFile } from './edit-file.js';

type EditResult = Awaited<ReturnType<typeof handleEditFile>>;
const isErr = (r: EditResult): boolean => 'isError' in r && r.isError === true;
const firstText = (r: EditResult): string => r.content[0]?.text ?? '';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-file-'));
  file = path.join(dir, 'sample.ts');
  fs.writeFileSync(file, 'export const a = 1;\nexport const b = 2;\nexport const a2 = 1;\n');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('editFileDefinition', () => {
  it('is named edit_file and requires path/old_string/new_string', () => {
    expect(editFileDefinition.name).toBe('edit_file');
    expect(editFileDefinition.inputSchema.required).toEqual(['path', 'old_string', 'new_string']);
  });
});

describe('handleEditFile', () => {
  it('replaces a unique old_string and writes the file', async () => {
    const r = await handleEditFile({
      path: file,
      old_string: 'const b = 2',
      new_string: 'const b = 42',
    });
    expect(isErr(r)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain('const b = 42');
  });

  it('refuses an ambiguous match without replace_all (no write)', async () => {
    const before = fs.readFileSync(file, 'utf8');
    const r = await handleEditFile({ path: file, old_string: '= 1;', new_string: '= 9;' });
    expect(isErr(r)).toBe(true);
    expect(firstText(r)).toMatch(/appears 2 times/);
    expect(fs.readFileSync(file, 'utf8')).toBe(before); // unchanged
  });

  it('replace_all replaces every occurrence', async () => {
    const r = await handleEditFile({
      path: file,
      old_string: '= 1;',
      new_string: '= 9;',
      replace_all: true,
    });
    expect(isErr(r)).toBe(false);
    expect(firstText(r)).toMatch(/replaced 2 occurrences/);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('= 1;');
  });

  it('errors (no write) when old_string is absent', async () => {
    const r = await handleEditFile({ path: file, old_string: 'nonexistent', new_string: 'x' });
    expect(isErr(r)).toBe(true);
    expect(firstText(r)).toMatch(/not found/);
  });

  it('rejects identical old/new', async () => {
    const r = await handleEditFile({
      path: file,
      old_string: 'const b = 2',
      new_string: 'const b = 2',
    });
    expect(isErr(r)).toBe(true);
    expect(firstText(r)).toMatch(/identical/);
  });

  it('rejects an empty old_string (does not create files)', async () => {
    const r = await handleEditFile({ path: file, old_string: '', new_string: 'x' });
    expect(isErr(r)).toBe(true);
    expect(firstText(r)).toMatch(/empty/);
  });

  it('errors on a missing file', async () => {
    const r = await handleEditFile({
      path: path.join(dir, 'nope.ts'),
      old_string: 'a',
      new_string: 'b',
    });
    expect(isErr(r)).toBe(true);
    expect(firstText(r)).toMatch(/file not found/);
  });

  it('rejects filesystem root', async () => {
    const r = await handleEditFile({ path: '/', old_string: 'a', new_string: 'b' });
    expect(isErr(r)).toBe(true);
    expect(firstText(r)).toMatch(/filesystem root/);
  });

  it('preserves an exact multi-line block replacement without touching neighbors', async () => {
    fs.writeFileSync(file, 'line1\nTARGET_A\nTARGET_B\nline4\n');
    const r = await handleEditFile({
      path: file,
      old_string: 'TARGET_A\nTARGET_B',
      new_string: 'REPLACED',
    });
    expect(isErr(r)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('line1\nREPLACED\nline4\n');
  });
});
