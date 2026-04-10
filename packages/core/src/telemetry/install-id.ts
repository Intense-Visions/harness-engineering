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

  // Try to read existing ID
  try {
    const existing = fs.readFileSync(installIdFile, 'utf-8').trim();
    if (existing.length > 0) {
      return existing;
    }
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
