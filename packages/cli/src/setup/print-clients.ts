/**
 * Emits the agent-setup prompt inputs as JSON on stdout: the SETUP_CLIENTS
 * descriptor plus the CLI's REQUIRED_NODE_VERSION. Run under tsx by the
 * agent-setup prompt generator (scripts/generate-agent-setup-prompt.mjs),
 * which cannot import a .ts module directly. Keeps clients.ts and
 * node-version.ts the single sources of truth (no duplicated JSON). See
 * ADR 0073.
 */
import { SETUP_CLIENTS } from './clients';
import { REQUIRED_NODE_VERSION } from '../utils/node-version';

process.stdout.write(
  JSON.stringify({ clients: SETUP_CLIENTS, requiredNodeVersion: REQUIRED_NODE_VERSION }, null, 2)
);
