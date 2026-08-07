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
  // Hooks that share format-check.js.
  'quality-warner': ['format-check.js'],
  'strict-quality-gate': ['format-check.js'],
  // Hooks that share read-hook-stdin.js (extracted in #994). Every hook that
  // `import`s a sibling must be listed here, or the installer ships a hook whose
  // static import fails at load with ERR_MODULE_NOT_FOUND in the adopter — a
  // non-blocking failure that silently stops the gate from running. The
  // registry↔import drift guard in support-files.test.ts pins this invariant.
  'block-no-verify': ['read-hook-stdin.js'],
  'adoption-tracker': ['read-hook-stdin.js'],
  'cost-tracker': ['read-hook-stdin.js'],
  'protect-config': ['read-hook-stdin.js'],
  'pre-compact-state': ['read-hook-stdin.js'],
  'sentinel-pre': ['read-hook-stdin.js'],
  'sentinel-post': ['read-hook-stdin.js'],
  'telemetry-reporter': ['read-hook-stdin.js'],
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
