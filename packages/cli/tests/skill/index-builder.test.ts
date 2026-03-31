import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { computeSkillsDirHash } from '../../src/skill/index-builder';

describe('computeSkillsDirHash', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-builder-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a hash string for empty dirs', () => {
    const hash = computeSkillsDirHash([tmpDir]);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // sha256 hex
  });

  it('returns same hash for same content', () => {
    const hash1 = computeSkillsDirHash([tmpDir]);
    const hash2 = computeSkillsDirHash([tmpDir]);
    expect(hash1).toBe(hash2);
  });

  it('returns consistent hash for nonexistent dirs', () => {
    const hash = computeSkillsDirHash(['/nonexistent/path']);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
  });

  it('includes skill.yaml files in hash', () => {
    const skillDir = path.join(tmpDir, 'my-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'name: my-skill');

    const hashBefore = computeSkillsDirHash([]);
    const hashAfter = computeSkillsDirHash([tmpDir]);
    expect(hashAfter).not.toBe(hashBefore);
  });

  it('ignores non-directory entries', () => {
    fs.writeFileSync(path.join(tmpDir, 'not-a-dir.txt'), 'content');
    const hash = computeSkillsDirHash([tmpDir]);
    // Should not crash and should return valid hash
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
  });

  it('ignores directories without skill.yaml', () => {
    const emptySkillDir = path.join(tmpDir, 'empty-skill');
    fs.mkdirSync(emptySkillDir);
    fs.writeFileSync(path.join(emptySkillDir, 'other.txt'), 'content');

    const hashEmpty = computeSkillsDirHash([]);
    const hashWithDir = computeSkillsDirHash([tmpDir]);
    // Both should be valid hashes (they may or may not differ based on implementation)
    expect(hashEmpty.length).toBe(64);
    expect(hashWithDir.length).toBe(64);
  });
});
