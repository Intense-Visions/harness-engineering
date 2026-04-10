import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Reads or creates a persistent UUIDv4 install ID at `.harness/.install-id`.
 *
 * The ID is anonymous -- it correlates events from the same machine without
 * containing any PII. Created on first telemetry call, reused thereafter.
 */
export function getOrCreateInstallId(projectRoot: string): string {
  const harnessDir = path.join(projectRoot, '.harness');
  const installIdFile = path.join(harnessDir, '.install-id');

  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Try to read existing ID
  try {
    const existing = fs.readFileSync(installIdFile, 'utf-8').trim();
    if (UUID_V4_RE.test(existing)) {
      return existing;
    }
    // Invalid format -- fall through to regenerate
  } catch {
    // File does not exist -- create it below
  }

  // Generate new UUIDv4
  const id = crypto.randomUUID();

  // Ensure .harness directory exists
  fs.mkdirSync(harnessDir, { recursive: true });
  fs.writeFileSync(installIdFile, id, 'utf-8');

  return id;
}
