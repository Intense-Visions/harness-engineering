import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  spillIfNeeded,
  readSpill,
  searchSpill,
  resolveSpillThreshold,
  SPILL_DIR,
  SPILL_LOCATOR_SCHEME,
  SPILL_THRESHOLD_ENV,
  DEFAULT_SPILL_THRESHOLD_BYTES,
} from './spill';

/**
 * Unit coverage for spill-to-disk (#1398). Runs against a real temp project
 * using the legacy `.harness/` state directory (no streams index present, so
 * `getStateDir` falls back to it).
 *
 * Behaviour pinned here:
 *  - over-threshold output is written to disk under the state area and a working,
 *    followup-readable locator is returned;
 *  - under-threshold output passes through inline, unchanged, with no file write;
 *  - round-trip read-by-locator returns the original content byte-for-byte;
 *  - search-by-locator greps the spilled payload without pulling it all inline;
 *  - the threshold is configurable via argument and env var;
 *  - locators that escape the project root are rejected.
 */

let projectPath: string;

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'spill-'));
  delete process.env[SPILL_THRESHOLD_ENV];
});

afterEach(() => {
  delete process.env[SPILL_THRESHOLD_ENV];
  fs.rmSync(projectPath, { recursive: true, force: true });
});

describe('spillIfNeeded', () => {
  it('spills over-threshold output and returns a working locator', async () => {
    const big = 'x'.repeat(50_000);
    const result = await spillIfNeeded(projectPath, big, { thresholdBytes: 1000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outcome = result.value;
    expect(outcome.spilled).toBe(true);
    if (!outcome.spilled) return;

    expect(outcome.locator.startsWith(SPILL_LOCATOR_SCHEME)).toBe(true);
    expect(outcome.locator).toContain(`/${SPILL_DIR}/`);
    expect(outcome.bytes).toBe(50_000);
    // The file physically exists under the state area.
    expect(fs.existsSync(outcome.path)).toBe(true);
    expect(outcome.path).toContain(path.join('.harness', SPILL_DIR));
    // Inline notice carries a bounded preview plus the recovery locator.
    expect(outcome.preview.length).toBeLessThan(big.length);
    expect(outcome.notice).toContain(outcome.locator);
    expect(outcome.notice).toContain(outcome.preview);
  });

  it('passes under-threshold output through inline without writing a file', async () => {
    const small = 'hello world';
    const result = await spillIfNeeded(projectPath, small, { thresholdBytes: 1000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outcome = result.value;
    expect(outcome.spilled).toBe(false);
    if (outcome.spilled) return;

    expect(outcome.content).toBe(small);
    expect(outcome.bytes).toBe(Buffer.byteLength(small, 'utf8'));
    // No spill directory created for a passthrough.
    expect(fs.existsSync(path.join(projectPath, '.harness', SPILL_DIR))).toBe(false);
  });

  it('respects a boundary exactly at the threshold (<= passes through)', async () => {
    const content = 'a'.repeat(100);
    const result = await spillIfNeeded(projectPath, content, { thresholdBytes: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.spilled).toBe(false);
  });

  it('spills a session-scoped payload under the session state area', async () => {
    const big = 'y'.repeat(40_000);
    const result = await spillIfNeeded(projectPath, big, {
      thresholdBytes: 1000,
      session: 'my-session',
      label: 'Test Log #1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outcome = result.value;
    expect(outcome.spilled).toBe(true);
    if (!outcome.spilled) return;
    expect(outcome.path).toContain(path.join('sessions', 'my-session', SPILL_DIR));
    // Label is sanitized into the filename.
    expect(outcome.path).toContain('test-log-1');
  });
});

describe('readSpill (round-trip)', () => {
  it('returns the original content byte-for-byte via the locator', async () => {
    const original = `line-1\nlarge diff body ${'z'.repeat(40_000)}\nfinal-line`;
    const spillResult = await spillIfNeeded(projectPath, original, { thresholdBytes: 1000 });
    expect(spillResult.ok).toBe(true);
    if (!spillResult.ok || !spillResult.value.spilled) throw new Error('expected spill');

    const readResult = await readSpill(projectPath, spillResult.value.locator);
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) return;
    expect(readResult.value).toBe(original);
  });

  it('reads via a bare project-relative path (no scheme prefix)', async () => {
    const original = 'q'.repeat(40_000);
    const spillResult = await spillIfNeeded(projectPath, original, { thresholdBytes: 1000 });
    if (!spillResult.ok || !spillResult.value.spilled) throw new Error('expected spill');
    const bare = spillResult.value.locator.slice(SPILL_LOCATOR_SCHEME.length);

    const readResult = await readSpill(projectPath, bare);
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) return;
    expect(readResult.value).toBe(original);
  });

  it('errors for a missing locator', async () => {
    const result = await readSpill(projectPath, `${SPILL_LOCATOR_SCHEME}.harness/spill/nope.txt`);
    expect(result.ok).toBe(false);
  });

  it('rejects a path-traversal locator', async () => {
    const result = await readSpill(projectPath, `${SPILL_LOCATOR_SCHEME}../../etc/passwd`);
    expect(result.ok).toBe(false);
  });
});

describe('searchSpill', () => {
  it('greps spilled content by substring and by regex', async () => {
    const body =
      'INFO starting\n' +
      'ERROR: boom at step 3\n' +
      `${'padding line\n'.repeat(4000)}` +
      'ERROR: second failure\n' +
      'INFO done';
    const spillResult = await spillIfNeeded(projectPath, body, { thresholdBytes: 1000 });
    if (!spillResult.ok || !spillResult.value.spilled) throw new Error('expected spill');
    const locator = spillResult.value.locator;

    const bySubstring = await searchSpill(projectPath, locator, 'ERROR:');
    expect(bySubstring.ok).toBe(true);
    if (!bySubstring.ok) return;
    expect(bySubstring.value.matches).toHaveLength(2);
    const [first] = bySubstring.value.matches;
    expect(first?.text).toContain('boom at step 3');
    expect(first?.line).toBe(2);

    const byRegex = await searchSpill(projectPath, locator, /second failure/);
    expect(byRegex.ok).toBe(true);
    if (!byRegex.ok) return;
    expect(byRegex.value.matches).toHaveLength(1);
  });

  it('caps matches and flags truncation', async () => {
    const body = `${'MATCH here\n'.repeat(5000)}tail`;
    const spillResult = await spillIfNeeded(projectPath, body, { thresholdBytes: 1000 });
    if (!spillResult.ok || !spillResult.value.spilled) throw new Error('expected spill');

    const result = await searchSpill(projectPath, spillResult.value.locator, 'MATCH', {
      maxMatches: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toHaveLength(10);
    expect(result.value.truncated).toBe(true);
  });
});

describe('resolveSpillThreshold', () => {
  it('prefers an explicit argument', () => {
    expect(resolveSpillThreshold(4242)).toBe(4242);
  });

  it('falls back to the env var when no argument is given', () => {
    process.env[SPILL_THRESHOLD_ENV] = '777';
    expect(resolveSpillThreshold()).toBe(777);
  });

  it('ignores an invalid env var and uses the default', () => {
    process.env[SPILL_THRESHOLD_ENV] = 'not-a-number';
    expect(resolveSpillThreshold()).toBe(DEFAULT_SPILL_THRESHOLD_BYTES);
  });

  it('honours the env var end-to-end in spillIfNeeded', async () => {
    process.env[SPILL_THRESHOLD_ENV] = '10';
    const result = await spillIfNeeded(projectPath, 'this is more than ten bytes');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.spilled).toBe(true);
  });
});
