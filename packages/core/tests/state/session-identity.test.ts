import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveSessionDir } from '../../src/state/session-resolver';
import { readIdentity } from '../../src/identity/store';
import { isValidUlid } from '../../src/identity/ulid';

describe('resolveSessionDir — identity', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-identity-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes identity.json with a ULID and number:null on create', () => {
    const res = resolveSessionDir(tmp, 'my-session', { create: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(path.basename(res.value)).toBe('my-session'); // slug is still the dir name
    const identity = readIdentity(path.join(res.value, 'identity.json'));
    expect(identity).not.toBeNull();
    expect(isValidUlid(identity!.ulid)).toBe(true);
    expect(identity!.slug).toBe('my-session');
    expect(identity!.domain).toBe('session');
    expect(identity!.number).toBeNull();
    expect(identity!.completedAt).toBeNull();
  });

  it('is immutable — a second resolve does not change the ULID', () => {
    const first = resolveSessionDir(tmp, 'sess', { create: true });
    const idFile = path.join((first as { value: string }).value, 'identity.json');
    const ulid1 = readIdentity(idFile)!.ulid;
    resolveSessionDir(tmp, 'sess', { create: true });
    expect(readIdentity(idFile)!.ulid).toBe(ulid1);
  });

  it('does not write identity when create is not requested', () => {
    const res = resolveSessionDir(tmp, 'no-create');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(fs.existsSync(path.join(res.value, 'identity.json'))).toBe(false);
  });
});
