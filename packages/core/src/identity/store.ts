import * as fs from 'fs';
import * as path from 'path';
import type { HarnessIdentity, IdentityDomain } from '@harness-engineering/types';
import { generateUlid } from './ulid';

/** Best-effort read; returns null when absent or unparseable. */
export function readIdentity(filePath: string): HarnessIdentity | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HarnessIdentity;
  } catch {
    return null;
  }
}

/**
 * Create-if-absent. Writes the ULID exactly once; a subsequent call returns the
 * existing record unchanged (immutable) even with a different slug. Best-effort:
 * a write failure still returns the in-memory record.
 */
export function ensureIdentity(
  filePath: string,
  opts: { slug: string; domain: IdentityDomain }
): HarnessIdentity {
  const existing = readIdentity(filePath);
  if (existing?.ulid) return existing;
  const record: HarnessIdentity = {
    ulid: generateUlid(),
    slug: opts.slug,
    domain: opts.domain,
    createdAt: new Date().toISOString(),
    number: null,
    completedAt: null,
  };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  } catch {
    // best-effort — identity is metadata, never a gate.
  }
  return record;
}

/** Read-increment-write a monotonic integer counter. Best-effort; starts at 0. */
export function nextNumber(counterFilePath: string): number {
  let current = 0;
  try {
    if (fs.existsSync(counterFilePath)) {
      const parsed = parseInt(fs.readFileSync(counterFilePath, 'utf-8').trim(), 10);
      if (Number.isFinite(parsed) && parsed >= 0) current = parsed;
    }
  } catch {
    // start from 0
  }
  const next = current + 1;
  try {
    fs.mkdirSync(path.dirname(counterFilePath), { recursive: true });
    fs.writeFileSync(counterFilePath, String(next));
  } catch {
    // best-effort
  }
  return next;
}

/**
 * Allocate the next completion number and stamp `number`/`completedAt`.
 * Idempotent: a second call returns the already-assigned record WITHOUT
 * re-incrementing the counter. Returns null when no identity exists.
 */
export function assignNumber(filePath: string, counterFilePath: string): HarnessIdentity | null {
  const existing = readIdentity(filePath);
  if (!existing) return null;
  if (existing.number !== null && existing.number !== undefined) return existing; // idempotent
  const updated: HarnessIdentity = {
    ...existing,
    number: nextNumber(counterFilePath),
    completedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  } catch {
    return existing;
  }
  return updated;
}
