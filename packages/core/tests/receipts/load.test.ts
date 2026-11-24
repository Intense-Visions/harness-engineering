import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  REVIEW_FILE_MAX_BYTES,
  readReviewReceiptFile,
  reviewFindingsReaderFor,
} from '../../src/receipts/load';

let tmp: string;
let dir: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'core-receipt-load-'));
  dir = path.join(tmp, 'reviews', 'phase-0');
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (name: string, value: unknown) =>
  fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
describe('readReviewReceiptFile', () => {
  it('reads receipt.json when given the review directory', () => {
    write('receipt.json', { schemaVersion: 1 });
    const r = readReviewReceiptFile(dir);
    expect(r.status).toBe('ok');
    expect(path.basename(r.path)).toBe('receipt.json');
    expect(r.dir).toBe(dir);
  });
  it('SC16: reports a missing receipt as missing, for a directory and for a file path', () => {
    expect(readReviewReceiptFile(dir).status).toBe('missing');
    expect(readReviewReceiptFile(path.join(tmp, 'nowhere', 'receipt.json')).status).toBe('missing');
  });
  it('reports a receipt that is not JSON as unreadable, not missing', () => {
    write('receipt.json', '{nope');
    expect(readReviewReceiptFile(path.join(dir, 'receipt.json'))).toMatchObject({
      status: 'unreadable',
      reason: 'not valid JSON',
    });
  });
});

describe('reviewFindingsReaderFor', () => {
  it('reads a file inside the receipt directory and returns undefined for an absent one', () => {
    write('bug.json', 'x');
    const read = reviewFindingsReaderFor(dir);
    expect(read('bug.json')).toBe('x');
    expect(read('nope.json')).toBeUndefined();
  });
  it('never reads outside the receipt directory', () => {
    fs.writeFileSync(path.join(tmp, 'secret.json'), 's');
    const read = reviewFindingsReaderFor(dir);
    expect(read(path.join('..', '..', 'secret.json'))).toBeUndefined();
    expect(read(path.join(tmp, 'secret.json'))).toBeUndefined();
  });
});

describe('reviewFindingsReaderFor: symlinks and names', () => {
  it('reads a file whose name merely starts with two dots', () => {
    write('..hidden.json', '{"x":1}');
    expect(reviewFindingsReaderFor(dir)('..hidden.json')).toBe('{"x":1}');
  });
  it.skipIf(process.platform === 'win32')(
    'refuses a findings file that is a symlink to a file outside the review directory',
    () => {
      const outside = path.join(tmp, 'outside.json');
      fs.writeFileSync(outside, '{"secret":true}');
      fs.symlinkSync(outside, path.join(dir, 'bug.json'));
      expect(reviewFindingsReaderFor(dir)('bug.json')).toBeUndefined();
    }
  );
  it.skipIf(process.platform === 'win32')(
    'reads through a symlink that stays inside the review directory',
    () => {
      write('real.json', '{"ok":true}');
      fs.symlinkSync(path.join(dir, 'real.json'), path.join(dir, 'bug.json'));
      expect(reviewFindingsReaderFor(dir)('bug.json')).toBe('{"ok":true}');
    }
  );
  it.skipIf(process.platform === 'win32')(
    'reads inside a review directory that is itself reached through a symlink',
    () => {
      write('bug.json', '{"ok":true}');
      const link = path.join(tmp, 'link');
      fs.symlinkSync(dir, link);
      expect(reviewFindingsReaderFor(link)('bug.json')).toBe('{"ok":true}');
    }
  );
});

const posixOnly = it.skipIf(process.platform === 'win32');
const fifo = (name: string) => execFileSync('mkfifo', [path.join(dir, name)]);

/**
 * Fix 3. Input partition for what sits at a findings path: absent, empty, one regular file, a
 * directory, a FIFO, a symlink to a FIFO, a file exactly at the size cap, one byte over it. Only
 * a regular file within the cap is read; the rest read as absent, and none of them blocks.
 */
describe('reviewFindingsReaderFor: only a regular file within the size cap is read', () => {
  const CAP = 64;
  const read = (name: string) => reviewFindingsReaderFor(dir, CAP)(name);
  it('absent', () => expect(read('nope.json')).toBeUndefined());
  it('empty', () => {
    write('bug.json', '');
    expect(read('bug.json')).toBe('');
  });
  it('one regular file', () => {
    write('bug.json', '{"ok":1}');
    expect(read('bug.json')).toBe('{"ok":1}');
  });
  it('a directory', () => {
    fs.mkdirSync(path.join(dir, 'bug.json'));
    expect(read('bug.json')).toBeUndefined();
  });
  posixOnly('a FIFO reads as absent and does not block', () => {
    fifo('bug.json');
    expect(read('bug.json')).toBeUndefined();
  });
  posixOnly('a symlink to a FIFO inside the directory reads as absent', () => {
    fifo('pipe');
    fs.symlinkSync(path.join(dir, 'pipe'), path.join(dir, 'bug.json'));
    expect(read('bug.json')).toBeUndefined();
  });
  it('a file exactly at the cap is read', () => {
    write('bug.json', 'x'.repeat(CAP));
    expect(read('bug.json')).toHaveLength(CAP);
  });
  it('a file one byte over the cap reads as absent', () => {
    write('bug.json', 'x'.repeat(CAP + 1));
    expect(read('bug.json')).toBeUndefined();
  });
  it('the default cap is 5 MB', () => {
    expect(REVIEW_FILE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

/**
 * Input partition for the receipt file: absent, a regular file, not JSON, a directory named
 * receipt.json, a FIFO, over the cap; and, when confined to a project (`within`), a path that
 * leaves it lexically, absolutely, through a symlinked directory, through a symlinked
 * receipt.json, and a missing file behind a symlink that leaves it.
 */
describe('readReviewReceiptFile: what it refuses to read', () => {
  it('a directory named receipt.json is not a regular file', () => {
    fs.mkdirSync(path.join(dir, 'receipt.json'));
    expect(readReviewReceiptFile(dir)).toMatchObject({
      status: 'unreadable',
      reason: 'not a regular file',
    });
  });
  posixOnly('a FIFO is not a regular file, and is not opened', () => {
    fifo('receipt.json');
    expect(readReviewReceiptFile(dir)).toMatchObject({
      status: 'unreadable',
      reason: 'not a regular file',
    });
  });
  it('a receipt over the cap is refused, and one at the cap is read', () => {
    const body = JSON.stringify({ pad: 'x'.repeat(40) });
    write('receipt.json', body);
    expect(readReviewReceiptFile(dir, { maxBytes: body.length })).toMatchObject({ status: 'ok' });
    expect(readReviewReceiptFile(dir, { maxBytes: body.length - 1 })).toMatchObject({
      status: 'unreadable',
      reason: 'too large',
    });
  });
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a receipt the process may not read reports the errno code',
    () => {
      write('receipt.json', '{}');
      fs.chmodSync(path.join(dir, 'receipt.json'), 0o000);
      expect(readReviewReceiptFile(dir)).toMatchObject({ status: 'unreadable', reason: 'EACCES' });
    }
  );
  it('the reason never holds the absolute path', () => {
    fs.mkdirSync(path.join(dir, 'receipt.json'));
    const r = readReviewReceiptFile(dir);
    expect(r.status === 'unreadable' && r.reason).not.toContain(tmp);
  });
});

describe('readReviewReceiptFile: confined to a project', () => {
  let outside: string;
  beforeEach(() => {
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'core-receipt-outside-'));
    fs.writeFileSync(path.join(outside, 'receipt.json'), '{"schemaVersion":1}');
  });
  afterEach(() => fs.rmSync(outside, { recursive: true, force: true }));
  const within = (p: string) => readReviewReceiptFile(p, { within: tmp }).status;

  it('reads a receipt inside the project, given as a directory or a file', () => {
    write('receipt.json', { schemaVersion: 1 });
    expect(within(dir)).toBe('ok');
    expect(within(path.join(dir, 'receipt.json'))).toBe('ok');
  });
  it('a missing receipt inside the project is missing', () => {
    expect(within(dir)).toBe('missing');
    expect(within(path.join(tmp, 'nowhere', 'deep'))).toBe('missing');
  });
  it('a path that leaves the project lexically or absolutely is outside', () => {
    expect(within(path.join(tmp, '..', path.basename(outside)))).toBe('outside');
    expect(within(outside)).toBe('outside');
  });
  it('the project root itself resolves to its own receipt.json', () => {
    expect(within(tmp)).toBe('missing');
  });
  posixOnly('a symlinked directory that leaves the project is outside', () => {
    fs.symlinkSync(outside, path.join(tmp, 'link'));
    expect(within(path.join(tmp, 'link'))).toBe('outside');
    expect(within(path.join(tmp, 'link', 'receipt.json'))).toBe('outside');
  });
  posixOnly('a receipt.json that is a symlink out of the project is outside', () => {
    fs.symlinkSync(path.join(outside, 'receipt.json'), path.join(dir, 'receipt.json'));
    expect(within(dir)).toBe('outside');
  });
  posixOnly(
    'a missing file behind a symlink that leaves the project is outside, not missing',
    () => {
      fs.symlinkSync(outside, path.join(tmp, 'link'));
      expect(within(path.join(tmp, 'link', 'no-such-dir', 'receipt.json'))).toBe('outside');
    }
  );
  posixOnly('a project reached through a symlink still contains its own receipts', () => {
    write('receipt.json', { schemaVersion: 1 });
    const alias = path.join(outside, 'alias');
    fs.symlinkSync(tmp, alias);
    const viaAlias = path.join(alias, 'reviews', 'phase-0');
    expect(readReviewReceiptFile(viaAlias, { within: alias }).status).toBe('ok');
  });
});
