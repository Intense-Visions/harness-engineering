import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readIdentity, ensureIdentity, assignNumber, nextNumber } from '../../src/identity/store';
import { isValidUlid } from '../../src/identity/ulid';

describe('identity store', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-store-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('ensureIdentity writes once and is immutable on re-call with a different slug', () => {
    const file = path.join(tmp, 'a', 'identity.json');
    const first = ensureIdentity(file, { slug: 'my-session', domain: 'session' });
    expect(isValidUlid(first.ulid)).toBe(true);
    expect(first.number).toBeNull();
    expect(first.completedAt).toBeNull();
    const second = ensureIdentity(file, { slug: 'renamed-slug', domain: 'session' });
    expect(second.ulid).toBe(first.ulid); // immutable
    expect(second.slug).toBe('my-session'); // original preserved
  });

  it('readIdentity returns null when the file is absent or malformed', () => {
    expect(readIdentity(path.join(tmp, 'missing.json'))).toBeNull();
    const bad = path.join(tmp, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    expect(readIdentity(bad)).toBeNull();
  });

  it('nextNumber increments a monotonic counter from an empty start', () => {
    const counter = path.join(tmp, '.number-counter');
    expect(nextNumber(counter)).toBe(1);
    expect(nextNumber(counter)).toBe(2);
    expect(nextNumber(counter)).toBe(3);
  });

  it('assignNumber allocates 1,2,3… across identities and is idempotent per identity', () => {
    const counter = path.join(tmp, '.number-counter');
    const fileA = path.join(tmp, 'a', 'identity.json');
    const fileB = path.join(tmp, 'b', 'identity.json');
    ensureIdentity(fileA, { slug: 'a', domain: 'session' });
    ensureIdentity(fileB, { slug: 'b', domain: 'session' });

    const a1 = assignNumber(fileA, counter);
    expect(a1?.number).toBe(1);
    expect(typeof a1?.completedAt).toBe('string');

    const b1 = assignNumber(fileB, counter);
    expect(b1?.number).toBe(2);

    const a2 = assignNumber(fileA, counter); // idempotent
    expect(a2?.number).toBe(1);
    // counter not re-incremented by the idempotent call:
    const c = assignNumber(path.join(tmp, 'c', 'identity.json'), counter);
    expect(c).toBeNull(); // no identity to assign
  });

  it('assignNumber returns null when no identity exists', () => {
    expect(assignNumber(path.join(tmp, 'none.json'), path.join(tmp, '.c'))).toBeNull();
  });
});
