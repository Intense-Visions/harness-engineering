import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSnapshot } from '../../src/entropy/snapshot';

// #2168 / PR #2549: on win32 `harness cleanup` builds its drift doc glob with
// `path.join(docsDir, '**/*.md')`, which yields backslashes. `glob` reads a
// backslash as an ESCAPE, so the pattern matched nothing and drift scanned zero
// docs on Windows CI. Simulated here by stubbing `process.platform` and
// handing the snapshot a backslash-separated pattern.
describe('buildSnapshot doc globbing on win32', () => {
  let dir: string;
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-win32-docglob-'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const a = 1;\n');
    fs.mkdirSync(path.join(dir, 'docs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'nested', 'guide.md'), '# Guide\n\nUse `a`.\n');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds docs through a backslash-separated docPaths glob', async () => {
    Object.defineProperty(process, 'platform', { ...realPlatform, value: 'win32' });
    const backslashGlob = `${dir.replaceAll('/', '\\')}\\docs\\**\\*.md`;
    const result = await buildSnapshot({
      rootDir: dir,
      entryPoints: ['src/index.ts'],
      docPaths: [backslashGlob],
      analyze: { drift: true },
      exclude: ['**/node_modules/**'],
    });
    Object.defineProperty(process, 'platform', realPlatform);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // MUTATION: drop the win32 separator normalization in buildSnapshot and
    // this is [] — the backslashes are consumed as glob escapes.
    expect(result.value.docs.map((d) => path.basename(d.path))).toEqual(['guide.md']);
  });
});
