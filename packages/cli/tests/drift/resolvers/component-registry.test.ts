import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadComponentRegistry } from '../../../src/drift/resolvers/component-registry';

describe('loadComponentRegistry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-registry-'));
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
    expect(loadComponentRegistry(tmpDir)).toBeNull();
  });

  it('returns null when ## Component Registry section is missing', () => {
    writeDesignMd(`# Title\n\n## Other Section\nnot a registry`);
    expect(loadComponentRegistry(tmpDir)).toBeNull();
  });

  it('parses a basic table mapping Button → button', () => {
    writeDesignMd(`# DESIGN

## Component Registry

| Type    | File                       | Notes |
|---------|----------------------------|-------|
| Button  | packages/ui/src/Button.tsx |       |
| Input   | packages/ui/src/Input.tsx  |       |
`);
    const reg = loadComponentRegistry(tmpDir)!;
    expect(reg.primitiveToComponent.get('button')).toBe('Button');
    expect(reg.primitiveToComponent.get('input')).toBe('Input');
  });

  it('maps Link AND Anchor → a (both register the anchor primitive)', () => {
    writeDesignMd(`## Component Registry

| Type   | File              |
|--------|-------------------|
| Link   | src/Link.tsx      |
`);
    const reg = loadComponentRegistry(tmpDir)!;
    expect(reg.primitiveToComponent.get('a')).toBe('Link');
  });

  it('stops collecting at the next H2 (does not bleed into adjacent sections)', () => {
    writeDesignMd(`## Component Registry

| Type   | File         |
|--------|--------------|
| Button | b.tsx        |

## Patterns

| Type   | File         |
|--------|--------------|
| Input  | i.tsx        |
`);
    const reg = loadComponentRegistry(tmpDir)!;
    expect(reg.primitiveToComponent.has('button')).toBe(true);
    // Input is in Patterns, not Component Registry — must NOT be picked up.
    expect(reg.primitiveToComponent.has('input')).toBe(false);
  });

  it('ignores unknown component types (only HTML_PRIMITIVE_MAP entries are kept)', () => {
    writeDesignMd(`## Component Registry

| Type    | File         |
|---------|--------------|
| Carousel | c.tsx       |
| Modal    | m.tsx       |
`);
    const reg = loadComponentRegistry(tmpDir)!;
    expect(reg.primitiveToComponent.size).toBe(0);
  });
});
