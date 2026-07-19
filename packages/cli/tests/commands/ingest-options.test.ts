import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadIngestOptions } from '../../src/commands/graph/ingest-options';

describe('loadIngestOptions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-options-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: unknown): void {
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
  }

  it('returns {} when no config file exists', () => {
    expect(loadIngestOptions(tmpDir)).toEqual({});
  });

  it('returns {} when neither ingest nor analysis blocks exist', () => {
    writeConfig({ version: 1 });
    expect(loadIngestOptions(tmpDir)).toEqual({});
  });

  it('passes through ingest.* settings', () => {
    writeConfig({
      version: 1,
      ingest: {
        additionalSkipDirs: ['generated'],
        excludePatterns: ['**/legacy/**'],
        respectGitignore: false,
      },
    });
    expect(loadIngestOptions(tmpDir)).toEqual({
      additionalSkipDirs: ['generated'],
      excludePatterns: ['**/legacy/**'],
      respectGitignore: false,
    });
  });

  it('merges analysis.exclude on top of ingest.excludePatterns', () => {
    writeConfig({
      version: 1,
      ingest: { excludePatterns: ['**/legacy/**'] },
      analysis: { exclude: ['**/vendored/**'] },
    });
    expect(loadIngestOptions(tmpDir).excludePatterns).toEqual(['**/legacy/**', '**/vendored/**']);
  });

  it('honors analysis.exclude when no ingest block is configured', () => {
    writeConfig({ version: 1, analysis: { exclude: ['**/vendored/**'] } });
    expect(loadIngestOptions(tmpDir).excludePatterns).toEqual(['**/vendored/**']);
  });

  it('ignores an invalid analysis block (best-effort)', () => {
    writeConfig({
      version: 1,
      ingest: { excludePatterns: ['**/legacy/**'] },
      analysis: { exclude: 'not-an-array' },
    });
    expect(loadIngestOptions(tmpDir).excludePatterns).toEqual(['**/legacy/**']);
  });
});
