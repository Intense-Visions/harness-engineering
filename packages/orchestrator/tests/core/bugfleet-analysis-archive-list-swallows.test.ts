import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AnalysisArchive } from '../../src/core/analysis-archive';
import type { AnalysisRecord } from '../../src/core/analysis-archive';

function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    issueId: 'issue-1',
    identifier: 'TEST-1',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-01-01T00:00:00Z',
    externalId: null,
    ...overrides,
  };
}

describe('AnalysisArchive.list with an entry that disappears mid-scan', () => {
  let tmpDir: string;
  let archive: AnalysisArchive;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bugfleet-aa-'));
    archive = new AnalysisArchive(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * `list()` reads the directory, then reads every `*.json` entry inside ONE
   * try/catch whose ENOENT branch returns `[]`. So a single entry that is
   * listed by `readdir` but gone by the time `readFile` reaches it does not
   * merely get skipped — it discards every record already read and reports the
   * archive as EMPTY, so the publish path sees no analyses to publish.
   *
   * `AnalysisArchive.get()` in the same file already scopes its ENOENT guard to
   * the single `readFile` it guards; `list()` does not. Here the mid-scan
   * disappearance is produced deterministically with a dangling symlink instead
   * of a scheduled race.
   */
  async function seedSurvivorPlusVanishedEntry(): Promise<void> {
    await archive.save(makeRecord({ issueId: 'issue-live', identifier: 'LIVE-1' }));
    await fs.symlink(path.join(tmpDir, 'gone.json'), path.join(tmpDir, 'issue-vanished.json'));
  }

  it('still returns the records it successfully read', async () => {
    await seedSurvivorPlusVanishedEntry();

    const result = await archive.list();

    expect(result.map((r) => r.issueId)).toEqual(['issue-live']);
  });
});
