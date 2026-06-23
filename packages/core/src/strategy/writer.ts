import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StrategyDoc } from '@harness-engineering/types';
import { StrategyDocSchema } from './schema';
import { serializeStrategyDoc } from './serialize';

export interface WriteStrategyDocOptions {
  /** Project root. STRATEGY.md is always written to `<cwd>/STRATEGY.md`. */
  cwd: string;
  /** When true, do not write a .bak (default: false). */
  skipBackup?: boolean;
}

const FILENAME = 'STRATEGY.md';

/**
 * Read the existing file's H1 line (if any) so we can preserve user
 * customizations like `# Acme — Engineering Strategy` across re-writes. Returns
 * `undefined` when the file is absent or no H1 is found in the first 50 lines.
 */
function readExistingH1(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').slice(0, 50);
  for (const line of lines) {
    if (line.startsWith('# ')) return line.trimEnd();
  }
  return undefined;
}

/**
 * Persist a StrategyDoc to `<cwd>/STRATEGY.md`. Validates against
 * StrategyDocSchema first — does not touch disk on schema failure.
 *
 * On overwrite, preserves the existing H1 line (the schema discards it; the
 * writer restores it so user-customized titles survive). On first overwrite,
 * writes `STRATEGY.md.bak` only if no `.bak` exists yet — re-running the
 * skill preserves the *original* pre-strategy file as the rollback target
 * rather than clobbering it with an already-mutated snapshot. Mirrors
 * `writePulseConfig` semantics for parity across the strategic-anchor and
 * feedback-loops surfaces.
 *
 * Atomic write: serialize → write to `STRATEGY.md.tmp-<pid>` → rename. A
 * crash mid-write leaves STRATEGY.md either pre-mutation or post-mutation,
 * never truncated. Temp file is cleaned up on rename failure.
 *
 * Throws when:
 *   - doc fails StrategyDocSchema validation
 *   - the underlying fs operations fail
 */
export function writeStrategyDoc(doc: StrategyDoc, opts: WriteStrategyDocOptions): void {
  // Validate first; do not touch disk on rejection.
  StrategyDocSchema.parse(doc);

  const targetPath = path.join(opts.cwd, FILENAME);
  const bakPath = `${targetPath}.bak`;
  const tmpPath = `${targetPath}.tmp-${process.pid}`;

  const preservedH1 = readExistingH1(targetPath);

  // Idempotent backup: only on first overwrite, only when no .bak exists yet.
  // Pre-strategy file is the useful rollback target — a later re-run must
  // not clobber it.
  if (fs.existsSync(targetPath) && !opts.skipBackup && !fs.existsSync(bakPath)) {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    fs.writeFileSync(bakPath, raw, 'utf-8');
  }

  const serialized = serializeStrategyDoc(
    doc,
    preservedH1 !== undefined ? { h1: preservedH1 } : {}
  );

  fs.writeFileSync(tmpPath, serialized, 'utf-8');
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (e) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup; rename error is the meaningful one
    }
    throw e;
  }
}
