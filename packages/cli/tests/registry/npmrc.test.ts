import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readNpmrcToken } from '../../src/registry/npm-client';

describe('readNpmrcToken', () => {
  let tmpDir: string;
  let originalCwd: () => string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npmrc-test-'));
    originalCwd = process.cwd;
    process.cwd = () => tmpDir;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads token from project .npmrc', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.npmrc'),
      '//npm.example.com/:_authToken=my-secret-token\n'
    );
    const token = readNpmrcToken('https://npm.example.com');
    expect(token).toBe('my-secret-token');
  });

  it('returns null when no matching registry', () => {
    fs.writeFileSync(path.join(tmpDir, '.npmrc'), '//other-registry.com/:_authToken=other-token\n');
    const token = readNpmrcToken('https://npm.example.com');
    expect(token).toBeNull();
  });

  it('returns null when no .npmrc exists', () => {
    const token = readNpmrcToken('https://npm.example.com');
    expect(token).toBeNull();
  });

  it('handles registry URL with pathname', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.npmrc'),
      '//npm.example.com/custom/:_authToken=path-token\n'
    );
    const token = readNpmrcToken('https://npm.example.com/custom/');
    expect(token).toBe('path-token');
  });

  it('handles multiple entries and picks correct one', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.npmrc'),
      [
        '//registry-a.com/:_authToken=token-a',
        '//registry-b.com/:_authToken=token-b',
        '//npm.example.com/:_authToken=correct-token',
      ].join('\n') + '\n'
    );
    const token = readNpmrcToken('https://npm.example.com');
    expect(token).toBe('correct-token');
  });
});
