// Shared E2E helper: fake the `claude` CLI at the REAL provider boundary.
//
// Part of the tiered E2E framework (ADR 0111). Drops a fake `claude` executable
// on a PATH dir that emits a CAPTURED envelope, so the FULL pipeline runs for real
// (resolver -> provider spawn -> parse -> serialize -> serve) with zero network.
// This is how Tier A replays real external-tool behavior — including the #1558
// narration miss — deterministically. POSIX-only (a fake executable on PATH is
// reliable on posix; the static path covers win32).
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClaudeEnvelope } from './fixtures';

export interface FakeClaudeOptions {
  /**
   * When set, the FIRST invocation instead returns `chattyEnvelope` (prose, no
   * `structured_output` — the #1558 shape) so the provider's corrective retry is
   * exercised end-to-end. Subsequent calls return the good `envelope`.
   */
  chattyOnce?: {
    /** The prose/narration envelope to return on the first call. */
    chattyEnvelope: ClaudeEnvelope;
    /**
     * Absolute path to a first-call marker. The first invocation creates it
     * exclusively (`wx`); its existence marks every later call. Must not exist yet.
     */
    counterFile: string;
  };
}

/**
 * Create a fresh temp bin dir containing a fake `claude` that emits `envelope`.
 * Returns the bin dir; add it to `PATH` (front) via {@link fakeProviderEnv}.
 * Pair with {@link removeFakeClaude} in `afterAll`.
 */
export function withFakeClaude(envelope: ClaudeEnvelope, opts: FakeClaudeOptions = {}): string {
  const binDir = mkdtempSync(path.join(tmpdir(), 'harness-e2e-fake-bin-'));
  const good = JSON.stringify(envelope);
  let script: string;
  if (opts.chattyOnce) {
    const prose = JSON.stringify(opts.chattyOnce.chattyEnvelope);
    const ctrl = JSON.stringify(opts.chattyOnce.counterFile);
    script = `#!/usr/bin/env node
const fs = require('node:fs');
const ctrl = ${ctrl};
// First call = the one that CREATES the marker (O_EXCL: atomic, no readback).
// EEXIST => a later call; any other error throws loudly (#2231).
let first = false;
try {
  fs.closeSync(fs.openSync(ctrl, 'wx'));
  first = true;
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
process.stdout.write(first ? ${JSON.stringify(prose)} : ${JSON.stringify(good)});
`;
  } else {
    script = `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(good)});
`;
  }
  writeFileSync(path.join(binDir, 'claude'), script, { mode: 0o755 });
  return binDir;
}

/** Remove a fake-claude bin dir. */
export function removeFakeClaude(binDir: string | undefined): void {
  if (binDir) rmSync(binDir, { recursive: true, force: true });
}

/**
 * Build an env that steers the analysis-provider resolver onto the claude-CLI
 * path and finds the fake first: no Anthropic key, no local endpoint, `binDir`
 * prepended to PATH. `extra` overlays additional vars (e.g. a main-pass signal).
 */
export function fakeProviderEnv(binDir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete e.ANTHROPIC_API_KEY;
  delete e.HARNESS_ANALYSIS_BASE_URL;
  e.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ''}`;
  return e;
}
