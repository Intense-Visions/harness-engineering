/**
 * Hook support-file registry.
 *
 * Most hooks are self-contained single `.js` files copied verbatim into an
 * adopter's `.harness/hooks/`. Some hooks instead share logic through a sibling
 * support module that is `import`ed at runtime (resolved relative to the copied
 * hook). The installer must ship those support files alongside their dependent
 * hooks and preserve them across the stale-`.js` wipe.
 *
 * Keyed by hook name → support file basenames (relative to src/hooks/). See
 * ADR: "installer ships hook support files".
 */
export const HOOK_SUPPORT_FILES: Record<string, string[]> = {
  'quality-warner': ['format-check.js'],
  'strict-quality-gate': ['format-check.js'],
  // The session-retrospect trigger is split into an agent-agnostic core plus a
  // thin per-agent entry point. Claude Code's hook (session-retrospect.js) is
  // the profile-installed script; the core it imports and the Gemini / Codex /
  // Cursor entry points must ship alongside it so the multi-agent triggers
  // (wired into each agent's native config by agent-retrospect.ts) resolve, and
  // so they are preserved across the installer's stale-.js wipe.
  'session-retrospect': [
    'session-retrospect-core.js',
    'session-retrospect-gemini.js',
    'session-retrospect-codex.js',
    'session-retrospect-cursor.js',
  ],
};

/**
 * Collect the deduplicated set of support files required by the given active
 * hook names.
 */
export function supportFilesFor(hookNames: readonly string[]): string[] {
  const files = new Set<string>();
  for (const name of hookNames) {
    for (const file of HOOK_SUPPORT_FILES[name] ?? []) {
      files.add(file);
    }
  }
  return [...files];
}
