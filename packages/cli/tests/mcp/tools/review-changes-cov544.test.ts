import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'node:child_process';

// Mock the underlying analysis tools so review depth handlers are deterministic.
vi.mock('../../../src/mcp/tools/feedback', () => ({
  handleAnalyzeDiff: vi.fn(),
  handleCreateSelfReview: vi.fn(),
}));
vi.mock('../../../src/mcp/tools/review-pipeline', () => ({
  handleRunCodeReview: vi.fn(),
}));

import { handleReviewChanges } from '../../../src/mcp/tools/review-changes';
import { handleAnalyzeDiff, handleCreateSelfReview } from '../../../src/mcp/tools/feedback';
import { handleRunCodeReview } from '../../../src/mcp/tools/review-pipeline';

function tool(obj: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj) }],
    ...(isError ? { isError } : {}),
  };
}
function parse(r: { content: Array<{ text: string }> }) {
  return JSON.parse(r.content[0].text);
}

const DIFF = ['diff --git a/x.ts b/x.ts', '+++ b/x.ts', '+const a = 1;'].join('\n');
const PATH = '/tmp/rc-cov544';

describe('review_changes branch coverage (cov544)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizePath throw (root) → isError', async () => {
    const r = await handleReviewChanges({ path: '/', depth: 'quick', diff: DIFF });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('filesystem root');
  });

  it('quick: sorts findings by severity, uses summary.filesChanged', async () => {
    vi.mocked(handleAnalyzeDiff).mockResolvedValue(
      tool({
        findings: [
          { severity: 'info', message: 'i' },
          { severity: 'error', message: 'e' },
          { severity: 'warning', message: 'w' },
        ],
        summary: { filesChanged: 3 },
      })
    );
    const parsed = parse(await handleReviewChanges({ path: PATH, depth: 'quick', diff: DIFF }));
    expect(parsed.depth).toBe('quick');
    expect(parsed.findings[0].severity).toBe('error');
    expect(parsed.fileCount).toBe(3);
  });

  it('quick: warnings fallback + files.length fallback + isError attaches error', async () => {
    vi.mocked(handleAnalyzeDiff).mockResolvedValue(
      tool({ warnings: [{ severity: 'warning', message: 'w' }], files: [1, 2] }, true)
    );
    const parsed = parse(await handleReviewChanges({ path: PATH, depth: 'quick', diff: DIFF }));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.fileCount).toBe(2);
    expect(parsed).toHaveProperty('error');
  });

  it('quick: empty analyze_diff response → throws → isError', async () => {
    vi.mocked(handleAnalyzeDiff).mockResolvedValue({ content: [] } as never);
    const r = await handleReviewChanges({ path: PATH, depth: 'quick', diff: DIFF });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Empty analyze_diff response');
  });

  it('standard: merges diff + self-review findings; filesChanged from summary', async () => {
    vi.mocked(handleAnalyzeDiff).mockResolvedValue(
      tool({ findings: [{ severity: 'error', message: 'e' }], summary: { filesChanged: 5 } })
    );
    vi.mocked(handleCreateSelfReview).mockResolvedValue(
      tool({ items: [{ severity: 'info', message: 'i' }] })
    );
    const parsed = parse(await handleReviewChanges({ path: PATH, depth: 'standard', diff: DIFF }));
    expect(parsed.depth).toBe('standard');
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.fileCount).toBe(5);
    expect(parsed).toHaveProperty('diffAnalysis');
    expect(parsed).toHaveProperty('selfReview');
  });

  it('standard: file count falls back to files.length when no summary', async () => {
    vi.mocked(handleAnalyzeDiff).mockResolvedValue(tool({ findings: [], files: [1, 2, 3] }));
    vi.mocked(handleCreateSelfReview).mockResolvedValue(tool({ findings: [] }));
    const parsed = parse(await handleReviewChanges({ path: PATH, depth: 'standard', diff: DIFF }));
    expect(parsed.fileCount).toBe(3);
  });

  it('standard: empty review content → throws → isError', async () => {
    vi.mocked(handleAnalyzeDiff).mockResolvedValue({ content: [] } as never);
    vi.mocked(handleCreateSelfReview).mockResolvedValue(tool({ findings: [] }));
    const r = await handleReviewChanges({ path: PATH, depth: 'standard', diff: DIFF });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Empty review response');
  });

  it('deep: runs pipeline, strips embedded findings, paginates top-level', async () => {
    vi.mocked(handleRunCodeReview).mockResolvedValue(
      tool({
        findings: [
          { severity: 'error', message: 'e' },
          { severity: 'info', message: 'i' },
        ],
        findingCount: 2,
        assessment: 'ok',
        phases: ['a'],
      })
    );
    const parsed = parse(await handleReviewChanges({ path: PATH, depth: 'deep', diff: DIFF }));
    expect(parsed.depth).toBe('deep');
    expect(parsed.downgraded).toBe(false);
    expect(parsed.findingCount).toBe(2);
    expect(parsed.findings[0].severity).toBe('error');
    // embedded full findings stripped from pipeline payload
    expect(parsed.pipeline).not.toHaveProperty('findings');
    expect(parsed.pipeline).toHaveProperty('phases');
  });

  it('deep: empty pipeline response → throws → isError', async () => {
    vi.mocked(handleRunCodeReview).mockResolvedValue({ content: [] } as never);
    const r = await handleReviewChanges({ path: PATH, depth: 'deep', diff: DIFF });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Empty code review response');
  });

  describe('getDiff auto-detect from a real git repo', () => {
    let repo: string;
    beforeEach(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-git-'));
      execSync('git init -q', { cwd: repo });
      execSync('git config user.email t@t.co && git config user.name t', { cwd: repo });
      fs.writeFileSync(path.join(repo, 'f.ts'), 'export const a = 1;\n');
      execSync('git add f.ts && git commit -q -m init', { cwd: repo });
      vi.mocked(handleAnalyzeDiff).mockResolvedValue(
        tool({ findings: [], summary: { filesChanged: 1 } })
      );
    });
    afterEach(() => {
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it('returns staged diff when present', async () => {
      fs.writeFileSync(path.join(repo, 'f.ts'), 'export const a = 2;\n');
      execSync('git add f.ts', { cwd: repo });
      const r = await handleReviewChanges({ path: repo, depth: 'quick' });
      expect(r.isError).toBeFalsy();
      expect(parse(r).depth).toBe('quick');
    });

    it('returns unstaged diff when nothing is staged', async () => {
      fs.writeFileSync(path.join(repo, 'f.ts'), 'export const a = 3;\n');
      const r = await handleReviewChanges({ path: repo, depth: 'quick' });
      expect(r.isError).toBeFalsy();
      expect(parse(r).depth).toBe('quick');
    });

    it('throws "No diff found" when the tree is clean', async () => {
      const r = await handleReviewChanges({ path: repo, depth: 'quick' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('No diff found');
    });
  });
});
