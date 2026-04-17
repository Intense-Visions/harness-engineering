import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

const IDENTITY_FILE = path.join(os.homedir(), '.harness', 'orchestrator-id');

/**
 * Resolves the orchestrator identity. Uses the explicit configId if
 * provided; otherwise reads or creates a persisted machine UUID at
 * ~/.harness/orchestrator-id and combines it with the hostname.
 *
 * Format: `{hostname}-{first8charsOfSha256(uuid)}`
 * Example: `chads-macbook-a7f3b2c1`
 */
export async function resolveOrchestratorId(configId?: string): Promise<string> {
  if (configId) return configId;

  const machineId = await getOrCreateMachineId();
  const shortHash = createHash('sha256').update(machineId).digest('hex').slice(0, 8);
  const hostname = os
    .hostname()
    .toLowerCase()
    .replace(/\.local$/, '');
  return `${hostname}-${shortHash}`;
}

async function getOrCreateMachineId(): Promise<string> {
  try {
    const content = await fs.readFile(IDENTITY_FILE, 'utf-8');
    const trimmed = content.trim();
    if (trimmed.length > 0) return trimmed;
  } catch {
    // File does not exist or is unreadable -- create it
  }

  const newId = randomUUID();
  await fs.mkdir(path.dirname(IDENTITY_FILE), { recursive: true });
  await fs.writeFile(IDENTITY_FILE, newId, 'utf-8');
  return newId;
}

/** Exposed for testing only -- returns the path to the identity file. */
export const ORCHESTRATOR_IDENTITY_FILE = IDENTITY_FILE;
