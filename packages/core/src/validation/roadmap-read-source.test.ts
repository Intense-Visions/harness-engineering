import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { findRoadmapReadSourceViolations } from './roadmap-read-source';

const tmpDirs: string[] = [];

function makeTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-source-'));
  tmpDirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('findRoadmapReadSourceViolations', () => {
  it('reports a non-allowlisted file that references roadmap.md', () => {
    const root = makeTree({
      'packages/cli/src/rogue.ts': 'const p = "docs/roadmap.md";\n',
    });
    expect(findRoadmapReadSourceViolations(root, [])).toEqual(['packages/cli/src/rogue.ts']);
  });

  it('does not report a file that is on the allowlist', () => {
    const root = makeTree({
      'packages/cli/src/rogue.ts': 'const p = "docs/roadmap.md";\n',
    });
    expect(findRoadmapReadSourceViolations(root, ['packages/cli/src/rogue.ts'])).toEqual([]);
  });

  it('does not report the regenerator/store paths when allowlisted', () => {
    const root = makeTree({
      'packages/core/src/roadmap/store/regenerator.ts': 'writes docs/roadmap.md\n',
      'packages/cli/src/rogue.ts': 'reads docs/roadmap.md\n',
    });
    expect(
      findRoadmapReadSourceViolations(root, ['packages/core/src/roadmap/store/regenerator.ts'])
    ).toEqual(['packages/cli/src/rogue.ts']);
  });

  it('returns [] for a clean tree (no file references roadmap.md)', () => {
    const root = makeTree({
      'packages/core/src/foo.ts': 'export const x = 1;\n',
      'packages/cli/src/bar.ts': 'import { x } from "../foo";\n',
    });
    expect(findRoadmapReadSourceViolations(root, [])).toEqual([]);
  });

  it('skips *.test.ts files', () => {
    const root = makeTree({
      'packages/cli/src/rogue.test.ts': 'expect("docs/roadmap.md").toBeDefined();\n',
    });
    expect(findRoadmapReadSourceViolations(root, [])).toEqual([]);
  });

  it('returns repo-relative paths sorted', () => {
    const root = makeTree({
      'packages/cli/src/b.ts': 'docs/roadmap.md\n',
      'packages/core/src/a.ts': 'docs/roadmap.md\n',
    });
    expect(findRoadmapReadSourceViolations(root, [])).toEqual([
      'packages/cli/src/b.ts',
      'packages/core/src/a.ts',
    ]);
  });
});
