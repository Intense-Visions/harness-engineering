/**
 * Emits SETUP_CLIENTS as JSON on stdout. Run under tsx by the agent-setup
 * prompt generator (scripts/generate-agent-setup-prompt.mjs), which cannot
 * import a .ts module directly. Keeps clients.ts the single source of truth
 * (no duplicated clients.json). See ADR 0073.
 */
import { SETUP_CLIENTS } from './clients';

process.stdout.write(JSON.stringify(SETUP_CLIENTS, null, 2));
