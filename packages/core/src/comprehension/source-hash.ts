import * as crypto from 'node:crypto';
import type { SourceFile } from './types';

/**
 * Full SHA-256 over the module's current directory membership + sorted
 * member-file contents. The sole correctness authority (D7): a full-length
 * digest, NOT the 32-bit truncated `ingestUtils.hash` (explicitly "not for
 * security" and too weak to be the correctness authority here).
 *
 * Membership is folded in by hashing each file's PATH alongside its CONTENT, so
 * adding or removing a file in the directory changes the hash — closing the
 * newly-added-file staleness gap (SC2). Files are sorted by path for
 * determinism regardless of enumeration order. Path and content are
 * length-prefixed so no boundary is ambiguous (a rename + content shuffle
 * cannot collide).
 */
export function computeSourceHash(sourceFiles: SourceFile[]): string {
  const sorted = [...sourceFiles].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const h = crypto.createHash('sha256');
  for (const f of sorted) {
    h.update(String(f.path.length));
    h.update('\0');
    h.update(f.path);
    h.update('\0');
    h.update(String(f.content.length));
    h.update('\0');
    h.update(f.content);
    h.update('\0');
  }
  return h.digest('hex');
}
