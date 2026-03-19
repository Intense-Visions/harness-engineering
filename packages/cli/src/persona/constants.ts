/**
 * Commands that the persona runner is allowed to execute via shell.
 * Shared between CLI agent run command and MCP handler.
 */
export const ALLOWED_PERSONA_COMMANDS = new Set([
  'validate',
  'check-deps',
  'check-docs',
  'check-perf',
  'check-security',
  'cleanup',
  'fix-drift',
  'add',
]);
