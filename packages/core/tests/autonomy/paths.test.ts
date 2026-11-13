import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  harnessHomeDir,
  userConfigPath,
  computeRepoKey,
  sessionOverridePath,
  validateOverrideSlug,
} from '../../src/autonomy/paths';

const norm = (p: string) => p.replaceAll('\\', '/');
const identity = (p: string) => p;

describe('autonomy paths', () => {
  it('derives ~/.harness and config.json from an injected home', () => {
    expect(norm(harnessHomeDir({ homeDir: '/h' }))).toBe('/h/.harness');
    expect(norm(userConfigPath({ homeDir: '/h' }))).toBe('/h/.harness/config.json');
  });
  it('defaults to os.homedir() when no home is injected', () => {
    expect(norm(harnessHomeDir())).toBe(norm(path.join(os.homedir(), '.harness')));
  });
  it('repoKey is 16 hex chars, deterministic, path-sensitive, separator-insensitive', () => {
    const a = computeRepoKey('/repo/a', { realpath: identity });
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(computeRepoKey('/repo/a', { realpath: identity })).toBe(a);
    expect(computeRepoKey('/repo/b', { realpath: identity })).not.toBe(a);
    expect(computeRepoKey('C:\\r\\a', { realpath: identity })).toBe(
      computeRepoKey('C:/r/a', { realpath: identity })
    );
  });
  it.skipIf(process.platform === 'win32')('repoKey follows symlinks to the real root', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-key-'));
    const real = path.join(tmp, 'real');
    fs.mkdirSync(real);
    fs.symlinkSync(real, path.join(tmp, 'link'));
    expect(computeRepoKey(path.join(tmp, 'link'))).toBe(computeRepoKey(real));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('places overrides under <home>/.harness/session-overrides/<repoKey>/<slug>.json', () => {
    const r = sessionOverridePath('/repo/a', 's1', { homeDir: '/h', realpath: identity });
    const key = computeRepoKey('/repo/a', { realpath: identity });
    expect(r.ok && norm(r.value)).toBe(`/h/.harness/session-overrides/${key}/s1.json`);
  });
  it.each(['', '   ', '../x', 'a/b', 'a\\b', 'C:x', '..'])('rejects slug %j', (slug) => {
    expect(validateOverrideSlug(slug).ok).toBe(false);
    expect(sessionOverridePath('/repo', slug, { homeDir: '/h', realpath: identity }).ok).toBe(
      false
    );
  });
});
