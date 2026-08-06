import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GoldenBuildManager } from '../../src/golden/manager';
import { GoldenSnapshotSchema } from '../../src/golden/types';

describe('GoldenBuildManager', () => {
  let tmpDir: string;
  const referencePaths = ['coverage-baselines.json', 'harness.config.json'];
  const provenance = { commit: 'abc1234', branch: 'main' };

  function manager(): GoldenBuildManager {
    return new GoldenBuildManager(tmpDir, { referencePaths });
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'golden-'));
    writeFileSync(join(tmpDir, 'coverage-baselines.json'), '{"lines":90}\n');
    writeFileSync(join(tmpDir, 'harness.config.json'), '{"version":1}\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('promote + load', () => {
    it('captures a hash for each existing reference file, sorted by path', () => {
      const { snapshot, changed } = manager().promote(provenance);
      expect(changed).toBe(true);
      expect(snapshot.files.map((f) => f.path)).toEqual([
        'coverage-baselines.json',
        'harness.config.json',
      ]);
      expect(snapshot.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
      // Round-trips through the schema and reloads.
      expect(GoldenSnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(manager().load()).toEqual(snapshot);
    });

    it('omits reference files that do not exist at promote time', () => {
      rmSync(join(tmpDir, 'harness.config.json'));
      const { snapshot } = manager().promote(provenance);
      expect(snapshot.files.map((f) => f.path)).toEqual(['coverage-baselines.json']);
    });

    it('load() returns null when no golden exists', () => {
      expect(manager().load()).toBeNull();
    });
  });

  describe('byte-stable re-promote', () => {
    it('leaves the manifest byte-identical when the fingerprint is unchanged', () => {
      manager().promote({ commit: 'first', branch: 'main' });
      const path = join(tmpDir, '.harness', 'golden', 'manifest.json');
      const bytesBefore = readFileSync(path, 'utf-8');

      // Re-promote from a DIFFERENT commit, but no file content changed.
      const { changed } = manager().promote({ commit: 'second', branch: 'feature' });
      const bytesAfter = readFileSync(path, 'utf-8');

      expect(changed).toBe(false);
      expect(bytesAfter).toBe(bytesBefore);
      // Provenance is preserved (informational, ignored) — not bumped to `second`.
      expect(manager().load()?.commit).toBe('first');
    });

    it('rewrites and bumps provenance when a reference file changes', () => {
      manager().promote({ commit: 'first', branch: 'main' });
      writeFileSync(join(tmpDir, 'coverage-baselines.json'), '{"lines":95}\n');
      const { changed } = manager().promote({ commit: 'second', branch: 'main' });
      expect(changed).toBe(true);
      expect(manager().load()?.commit).toBe('second');
    });
  });

  describe('diff', () => {
    it('reports clean when the working tree matches the golden', () => {
      const { snapshot } = manager().promote(provenance);
      const result = manager().diff(snapshot);
      expect(result).toEqual({ clean: true, changed: [], missing: [], added: [] });
    });

    it('detects a changed reference file', () => {
      const { snapshot } = manager().promote(provenance);
      writeFileSync(join(tmpDir, 'coverage-baselines.json'), '{"lines":80}\n');
      const result = manager().diff(snapshot);
      expect(result.clean).toBe(false);
      expect(result.changed).toHaveLength(1);
      expect(result.changed[0]!.path).toBe('coverage-baselines.json');
      expect(result.changed[0]!.goldenHash).not.toBe(result.changed[0]!.currentHash);
    });

    it('detects a missing (deleted) reference file', () => {
      const { snapshot } = manager().promote(provenance);
      rmSync(join(tmpDir, 'harness.config.json'));
      const result = manager().diff(snapshot);
      expect(result.clean).toBe(false);
      expect(result.missing.map((m) => m.path)).toEqual(['harness.config.json']);
    });

    it('detects an added reference file not present in the golden', () => {
      // Promote with only one reference file...
      const narrow = new GoldenBuildManager(tmpDir, {
        referencePaths: ['coverage-baselines.json'],
      });
      const { snapshot } = narrow.promote(provenance);
      // ...then diff with a wider reference set that now includes a second file.
      const wide = new GoldenBuildManager(tmpDir, { referencePaths });
      const result = wide.diff(snapshot);
      expect(result.clean).toBe(false);
      expect(result.added.map((a) => a.path)).toEqual(['harness.config.json']);
    });
  });
});
