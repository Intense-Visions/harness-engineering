import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

// Repo root: this file lives at packages/cli/tests/mcp/tools/ → up 5 levels.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..');

/**
 * Recursively collect .ts/.js source files under a directory, skipping node_modules,
 * dist, and any test directories/files.
 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'tests', '__tests__', 'coverage'].includes(entry.name)) continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|js|mjs|cjs)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('events.jsonl retirement guard (#580 SC6 / D5)', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('no production source uses the legacy bare events.jsonl path literal', () => {
    // Match the filename ONLY as a quoted string literal ('events.jsonl' / "events.jsonl").
    // This catches real path usage while ignoring:
    //   - the relocated 'skill-events.jsonl' / core 'state.events.jsonl' / 'signal-events.jsonl'
    //     (the quote precedes a different word, so it never matches),
    //   - prose/backtick mentions in comments.
    const LEGACY = /['"]events\.jsonl['"]/;

    const offenders: string[] = [];
    for (const pkg of fs.readdirSync(path.join(REPO_ROOT, 'packages'))) {
      const srcDir = path.join(REPO_ROOT, 'packages', pkg, 'src');
      for (const file of collectSourceFiles(srcDir)) {
        if (LEGACY.test(fs.readFileSync(file, 'utf-8'))) {
          offenders.push(path.relative(REPO_ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a full emit_interaction round-trip + manage_state mutation never creates .harness/events.jsonl', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'events-retired-guard-'));
    tmpDirs.push(tmpDir);

    const { handleEmitInteraction } = await import('../../../src/mcp/tools/interaction');
    const { handleManageState } = await import('../../../src/mcp/tools/state');

    // 1) A full interaction round-trip (prompt side emits the audit events).
    const res = await handleEmitInteraction({
      path: tmpDir,
      type: 'confirmation',
      confirmation: { text: 'Proceed?', context: 'guard test' },
    });
    expect(res.isError).toBeFalsy();

    // 2) A manage_state mutation (decision recording onto the authoritative log).
    await handleManageState({
      path: tmpDir,
      action: 'append_entry',
      section: 'decisions',
      authorSkill: 'harness-execution',
      content: 'guard decision',
    } as Parameters<typeof handleManageState>[0]);

    // The retired legacy log must never appear.
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'events.jsonl'))).toBe(false);
  });
});
