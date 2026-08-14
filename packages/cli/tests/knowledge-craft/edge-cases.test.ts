import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runKnowledgeCraft } from '../../src/knowledge-craft';
import { critiqueOne } from '../../src/knowledge-craft/phases/critique';
import { loadBearingFactRubric } from '../../src/knowledge-craft/catalog/rubrics/load-bearing-fact';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

/**
 * Regression tests for latent edge-case bugs in knowledge-craft discovery /
 * validation (bug-fleet AREA 3). Each assertion fails at base 7a9a865ca.
 */
describe('knowledge-craft edge cases', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-edge-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  function writeFile(rel: string, content = '# stub\n\nbody\n'): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  // F4: the .md extension gate must be case-insensitive, matching the
  // case-insensitive README exclusion. A `NOTES.MD` file was silently skipped.
  it('discovers an uppercase .MD entry (case-insensitive extension gate)', async () => {
    writeFile('docs/knowledge/NOTES.MD');
    const out = await runKnowledgeCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  it('still excludes an uppercase README.MD', async () => {
    writeFile('docs/knowledge/README.MD');
    writeFile('docs/knowledge/real.md');
    const out = await runKnowledgeCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  // F2: a negative / non-finite maxFiles must not silently drop trailing
  // entries via JS negative-index slice; it falls back to the default cap.
  it('treats a negative maxFiles as invalid and scans all entries', async () => {
    for (let i = 0; i < 3; i++) writeFile(`docs/knowledge/e${i}.md`);
    const out = await runKnowledgeCraft({ path: tmpDir, maxFiles: -1 });
    expect(out.summary.counts.filesScanned).toBe(3);
  });

  it('still honors a valid maxFiles cap of 0', async () => {
    for (let i = 0; i < 3; i++) writeFile(`docs/knowledge/e${i}.md`);
    const out = await runKnowledgeCraft({ path: tmpDir, maxFiles: 0 });
    expect(out.summary.counts.filesScanned).toBe(0);
  });

  // F6: a whitespace-only message must be rejected like an empty one.
  it('rejects a whitespace-only critique message', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'KNOW-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"   "}\n```',
      },
    ]);
    const finding = await critiqueOne({
      file: '/x/a.md',
      relative: 'a.md',
      content: 'body',
      rubric: loadBearingFactRubric,
      provider,
    });
    expect(finding).toBeNull();
  });

  it('still accepts a non-empty critique message', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'KNOW-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"real critique"}\n```',
      },
    ]);
    const finding = await critiqueOne({
      file: '/x/a.md',
      relative: 'a.md',
      content: 'body',
      rubric: loadBearingFactRubric,
      provider,
    });
    expect(finding).not.toBeNull();
    expect(finding!.message).toBe('real critique');
  });
});
