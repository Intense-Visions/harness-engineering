import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { extractTarball, placeSkillContent, cleanupTempDir } from '../../src/registry/tarball';

describe('extractTarball', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarball-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts a valid .tgz buffer to a temp directory', () => {
    // Create a small tarball with a package/skill.yaml file
    const pkgDir = path.join(tmpDir, 'package');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'skill.yaml'), 'name: test-skill\nversion: 1.0.0\n');
    fs.writeFileSync(path.join(pkgDir, 'SKILL.md'), '# Test Skill\n');

    // Create a tarball from tmpDir
    const tarballPath = path.join(os.tmpdir(), `test-${Date.now()}.tgz`);
    execFileSync('tar', ['-czf', tarballPath, '-C', tmpDir, 'package']);
    const tarballBuffer = fs.readFileSync(tarballPath);
    fs.unlinkSync(tarballPath);

    const extractDir = extractTarball(tarballBuffer);
    try {
      expect(fs.existsSync(path.join(extractDir, 'package', 'skill.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(extractDir, 'package', 'SKILL.md'))).toBe(true);
    } finally {
      cleanupTempDir(extractDir);
    }
  });

  it('throws on invalid/corrupt tarball data', () => {
    const invalidBuffer = Buffer.from('not-a-tarball');
    expect(() => extractTarball(invalidBuffer)).toThrow();
  });
});

describe('placeSkillContent', () => {
  let tmpDir: string;
  let communityBase: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'place-test-'));
    communityBase = path.join(tmpDir, 'agents', 'skills', 'community');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies skill content to community/{platform}/{skillName}/ for each platform', () => {
    // Simulate extracted package directory
    const extractedDir = path.join(tmpDir, 'extracted', 'package');
    fs.mkdirSync(extractedDir, { recursive: true });
    fs.writeFileSync(path.join(extractedDir, 'skill.yaml'), 'name: deploy');
    fs.writeFileSync(path.join(extractedDir, 'SKILL.md'), '# Deploy');

    placeSkillContent(extractedDir, communityBase, 'deploy', ['claude-code', 'gemini-cli']);

    expect(fs.existsSync(path.join(communityBase, 'claude-code', 'deploy', 'skill.yaml'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(communityBase, 'gemini-cli', 'deploy', 'skill.yaml'))).toBe(
      true
    );
    expect(
      fs.readFileSync(path.join(communityBase, 'claude-code', 'deploy', 'SKILL.md'), 'utf-8')
    ).toBe('# Deploy');
  });

  it('overwrites existing skill directory on upgrade', () => {
    // Create existing skill
    const existingDir = path.join(communityBase, 'claude-code', 'deploy');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(path.join(existingDir, 'old-file.txt'), 'old');

    // Place new content
    const extractedDir = path.join(tmpDir, 'extracted', 'package');
    fs.mkdirSync(extractedDir, { recursive: true });
    fs.writeFileSync(path.join(extractedDir, 'skill.yaml'), 'name: deploy');

    placeSkillContent(extractedDir, communityBase, 'deploy', ['claude-code']);

    expect(fs.existsSync(path.join(existingDir, 'old-file.txt'))).toBe(false);
    expect(fs.existsSync(path.join(existingDir, 'skill.yaml'))).toBe(true);
  });
});

describe('cleanupTempDir', () => {
  it('removes a temp directory and its contents', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'data');
    cleanupTempDir(tmpDir);
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('does not throw if directory does not exist', () => {
    expect(() => cleanupTempDir('/nonexistent/path')).not.toThrow();
  });
});
