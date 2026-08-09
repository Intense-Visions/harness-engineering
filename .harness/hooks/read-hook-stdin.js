// read-hook-stdin.js — resilient stdin reader shared by PreToolUse hooks.
//
// Why this exists: `readFileSync(0)` on a pipe can throw EAGAIN when the writer
// hasn't filled the pipe yet — the fd is non-blocking and the read simply isn't
// ready. Hooks that treated that throw as "no input" failed OPEN, so a guard
// like block-no-verify silently stopped enforcing under CI load while still
// reporting success (issue #619 patched the test, not this seam).
//
// The distinction that matters to a caller: a read that FAILED is not the same
// as a read that succeeded and returned nothing. The former means the hook is
// blind and must not vouch for the command; the latter is a legitimate
// "hook invoked with no payload" and stays fail-open.

import { Buffer } from 'node:buffer';
import { readSync } from 'node:fs';

const CHUNK_BYTES = 64 * 1024;
const EAGAIN_DEADLINE_MS = 5000;
const EAGAIN_BACKOFF_MS = 5;

/** Synchronously sleep without spinning the CPU. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Read all of stdin, retrying while the pipe reports EAGAIN.
 *
 * @returns {{ ok: true, data: string } | { ok: false, error: Error }}
 *   `ok: false` means the read genuinely failed and the caller is blind.
 *   `ok: true` with `data: ''` means stdin was legitimately empty.
 */
export function readHookStdin() {
  const chunks = [];
  const buf = Buffer.alloc(CHUNK_BYTES);
  const deadline = Date.now() + EAGAIN_DEADLINE_MS;

  for (;;) {
    let bytesRead;
    try {
      bytesRead = readSync(0, buf, 0, CHUNK_BYTES, null);
    } catch (err) {
      // Pipe not ready yet — the writer is still catching up. Retry until the
      // deadline rather than mistaking backpressure for end-of-input.
      if (err.code === 'EAGAIN') {
        if (Date.now() >= deadline) return { ok: false, error: err };
        sleepSync(EAGAIN_BACKOFF_MS);
        continue;
      }
      // EOF is how some platforms signal a closed tty rather than a 0-byte read.
      if (err.code === 'EOF') break;
      return { ok: false, error: err };
    }

    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
  }

  return { ok: true, data: Buffer.concat(chunks).toString('utf-8') };
}
