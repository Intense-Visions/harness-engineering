import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseComponentRegistry,
  findDesignMd,
} from '../../../../src/audit/component-anatomy/parsers/design-registry';

const DESIGN = `# Design

## Component Registry

| Type   | File                            | Notes    |
| ------ | ------------------------------- | -------- |
| Button | packages/ui/src/Button.tsx      |          |
| Input  | packages/ui/src/Input/index.tsx | compound |

## Something Else

| Type | File |
| ---- | ---- |
| Nope | x.ts |
`;

describe('parseComponentRegistry', () => {
  it('parses Type/File rows, skipping the header and separator', () => {
    expect(parseComponentRegistry(DESIGN)).toEqual([
      { type: 'Button', file: 'packages/ui/src/Button.tsx' },
      { type: 'Input', file: 'packages/ui/src/Input/index.tsx' },
    ]);
  });

  it('stops at the next heading (does not bleed into other tables)', () => {
    expect(parseComponentRegistry(DESIGN).some((e) => e.type === 'Nope')).toBe(false);
  });

  it('returns [] when the section is absent', () => {
    expect(parseComponentRegistry('# Design\n\nNo registry here.')).toEqual([]);
  });
});

describe('findDesignMd', () => {
  let dir = '';
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('walks up to find the nearest DESIGN.md (case-insensitive)', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-reg-'));
    fs.writeFileSync(path.join(dir, 'DESIGN.md'), DESIGN);
    const nested = path.join(dir, 'packages', 'ui', 'src');
    fs.mkdirSync(nested, { recursive: true });
    const found = findDesignMd(path.join(nested, 'Button.tsx'));
    expect(found).toBe(path.join(dir, 'DESIGN.md'));
  });

  it('returns null when no DESIGN.md exists up the tree', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-noreg-'));
    expect(findDesignMd(path.join(dir, 'Button.tsx'))).toBeNull();
  });
});
