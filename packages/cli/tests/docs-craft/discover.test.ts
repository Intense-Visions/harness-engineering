import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverDocs, classifyDoc } from '../../src/docs-craft/extract/discover';

describe('discoverDocs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-discover-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content = '# stub'): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('returns empty array when docs/ does not exist and no root README', () => {
    expect(discoverDocs(tmpDir)).toEqual([]);
  });

  it('discovers .md docs under docs/ and the root README', () => {
    writeFile('README.md');
    writeFile('docs/guides/getting-started.md');
    const docs = discoverDocs(tmpDir);
    expect(docs.map((d) => d.relative).sort()).toEqual([
      'README.md',
      'docs/guides/getting-started.md',
    ]);
  });

  it('walks subdirectories recursively', () => {
    writeFile('docs/guides/intro.md');
    writeFile('docs/reference/api.md');
    const docs = discoverDocs(tmpDir);
    expect(docs.map((d) => d.relative).sort()).toEqual([
      'docs/guides/intro.md',
      'docs/reference/api.md',
    ]);
  });

  it('EXCLUDES sibling-owned territories (knowledge/, changes/, decisions/, adr/)', () => {
    writeFile('docs/knowledge/fact.md'); // knowledge-craft
    writeFile('docs/changes/proposal.md'); // spec-craft
    writeFile('docs/decisions/0001-adr.md'); // spec-craft
    writeFile('docs/adr/0002-adr.md'); // spec-craft
    writeFile('docs/guides/keep-me.md');
    const docs = discoverDocs(tmpDir);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.relative).toBe('docs/guides/keep-me.md');
  });

  it('excludes generated / non-teaching dirs (roadmap.d, plans, solutions)', () => {
    writeFile('docs/roadmap.d/item.md');
    writeFile('docs/plans/plan.md');
    writeFile('docs/solutions/postmortem.md');
    writeFile('docs/guides/real.md');
    const docs = discoverDocs(tmpDir);
    expect(docs.map((d) => d.relative)).toEqual(['docs/guides/real.md']);
  });

  it('honors extraExcludeDirs argument', () => {
    writeFile('docs/drafts/wip.md');
    writeFile('docs/guides/canonical.md');
    const docs = discoverDocs(tmpDir, ['drafts']);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.relative).toBe('docs/guides/canonical.md');
  });

  it('excludes hidden dotfile dirs and files', () => {
    writeFile('docs/.cache/junk.md');
    writeFile('docs/visible.md');
    const docs = discoverDocs(tmpDir);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.relative).toBe('docs/visible.md');
  });

  it('ignores non-markdown files', () => {
    writeFile('docs/data.json');
    writeFile('docs/notes.txt');
    writeFile('docs/real.md');
    const docs = discoverDocs(tmpDir);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.relative).toBe('docs/real.md');
  });
});

describe('classifyDoc', () => {
  it('classifies READMEs', () => {
    expect(classifyDoc('README.md')).toBe('readme');
    expect(classifyDoc('docs/foo/README.md')).toBe('readme');
  });

  it('classifies reference/api docs', () => {
    expect(classifyDoc('docs/reference/api.md')).toBe('reference');
    expect(classifyDoc('docs/api/endpoints.md')).toBe('reference');
  });

  it('classifies guides/tutorials', () => {
    expect(classifyDoc('docs/guides/intro.md')).toBe('guide');
    expect(classifyDoc('docs/tutorials/first-app.md')).toBe('guide');
    expect(classifyDoc('docs/getting-started/index.md')).toBe('guide');
  });

  it('defaults to prose', () => {
    expect(classifyDoc('docs/architecture/overview.md')).toBe('prose');
  });
});
