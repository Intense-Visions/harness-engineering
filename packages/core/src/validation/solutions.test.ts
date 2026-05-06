import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateSolutionsDir } from './solutions';

const validFm = `---
module: orchestrator
tags: [concurrency]
problem_type: race-condition
last_updated: '2026-05-05'
track: bug-track
category: integration-issues
---

# Body
`;

const badCategory = validFm.replace('integration-issues', 'unicorn-bugs');

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'solutions-validate-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return dir;
}

describe('validateSolutionsDir', () => {
  it('returns ok=true when docs/solutions does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'solutions-empty-'));
    const r = await validateSolutionsDir(dir);
    expect(r.ok).toBe(true);
  });

  it('accepts valid solution doc', async () => {
    const dir = await makeProject({
      'docs/solutions/bug-track/integration-issues/foo.md': validFm,
    });
    const r = await validateSolutionsDir(dir);
    expect(r.ok).toBe(true);
  });

  it('rejects unknown category', async () => {
    // A bad-category file inside a known track/category dir is validated
    // (frontmatter category mismatches schema).
    const dir = await makeProject({
      'docs/solutions/bug-track/integration-issues/foo.md': badCategory,
    });
    const r = await validateSolutionsDir(dir);
    expect(r.ok).toBe(false);
  });

  it('does not visit sibling directories under docs/solutions/', async () => {
    // Files placed in sibling dirs like .archive, .candidates, references, or
    // assets must NOT be walked — even if they contain invalid frontmatter.
    // The walker positively filters to known track/category subtrees only.
    const dir = await makeProject({
      'docs/solutions/.archive/some-file.md': badCategory,
      'docs/solutions/.candidates/draft.md': badCategory,
      'docs/solutions/references/notes.md': badCategory,
      'docs/solutions/assets/image-notes.md': badCategory,
    });
    const r = await validateSolutionsDir(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.filesChecked).toBe(0);
  });

  it('walks only known track/category subtrees', async () => {
    // A doc placed at an unknown-category directory under a known track is
    // not walked (positive filter rejects unknown category dir).
    const dir = await makeProject({
      'docs/solutions/bug-track/unicorn-bugs/foo.md': badCategory,
      'docs/solutions/bug-track/integration-issues/ok.md': validFm,
    });
    const r = await validateSolutionsDir(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.filesChecked).toBe(1);
  });
});
