// Per-target configuration for the marketplace plugin generators.
//
// Each entry describes how to render the four artifact types (skills,
// commands, agents, hooks) for one AI tool. The plugin manifest itself
// (plugin.json, marketplace.json) is hand-maintained per target — only
// the auto-generated artifacts are configured here.
//
// Adding a new target: append a key, fill in the fields, write the
// matching plugin.json + marketplace.json under <pluginDir>/, and add a
// pnpm script alias in package.json.

export const PLUGIN_CONFIGS = {
  claude: {
    label: 'Claude Code',
    pluginDir: '.claude-plugin',
    // Where `harness generate-slash-commands` and
    // `harness generate-agent-definitions` write per-platform output.
    slashCommandsPlatform: 'claude-code',
    agentPlatform: 'claude-code',
    skillsDir: 'agents/skills/claude-code',
    // Hook scripts live in the repo at .harness/hooks/. Plugin install
    // copies the whole repo, so the scripts are at <plugin-root>/.harness/hooks/.
    // Claude exposes the install dir as ${CLAUDE_PLUGIN_ROOT}.
    hooksCommandTemplate: (name) =>
      `node "\${CLAUDE_PLUGIN_ROOT}/.harness/hooks/${name}.js"`,
    cursorMode: undefined,
    commandExt: '.md',
    generateAgents: true,
    generateHooks: true,
  },
  cursor: {
    label: 'Cursor',
    pluginDir: '.cursor-plugin',
    slashCommandsPlatform: 'cursor',
    agentPlatform: 'cursor',
    skillsDir: 'agents/skills/cursor',
    // Cursor doesn't document a CURSOR_PLUGIN_ROOT env var; its hook docs
    // show relative paths like `./scripts/format-code.sh`. Plugin scripts
    // resolve relative to the plugin install directory.
    hooksCommandTemplate: (name) => `node "./.harness/hooks/${name}.js"`,
    // Cursor's slash-command generator defaults to `rules` output for the
    // `harness setup` flow; plugin commands need the `commands` mode.
    cursorMode: 'commands',
    commandExt: '.md',
    generateAgents: true,
    generateHooks: true,
  },
  gemini: {
    label: 'Gemini CLI',
    pluginDir: '.gemini-extension',
    slashCommandsPlatform: 'gemini-cli',
    // Gemini extensions don't have a native agents/subagents field. Persona
    // behavior is exposed via commands + GEMINI.md context only.
    agentPlatform: undefined,
    skillsDir: 'agents/skills/gemini-cli',
    // Gemini extensions don't have a native hooks field either. We skip
    // hook generation entirely; users invoke `harness validate` manually
    // or via CI.
    hooksCommandTemplate: undefined,
    cursorMode: undefined,
    // Gemini commands are TOML, not Markdown.
    commandExt: '.toml',
    generateAgents: false,
    generateHooks: false,
  },
  // codex deferred to PR-D.
};

// Source of truth: packages/cli/src/hooks/profiles.ts HOOK_SCRIPTS.
// Filtered to the `standard` profile (default).
export const STANDARD_HOOKS = [
  { name: 'block-no-verify', event: 'PreToolUse', matcher: 'Bash' },
  { name: 'protect-config', event: 'PreToolUse', matcher: 'Write|Edit' },
  { name: 'quality-gate', event: 'PostToolUse', matcher: 'Edit|Write' },
  { name: 'pre-compact-state', event: 'PreCompact', matcher: '*' },
  { name: 'adoption-tracker', event: 'Stop', matcher: '*' },
  { name: 'telemetry-reporter', event: 'Stop', matcher: '*' },
];

export function getConfig(target) {
  const config = PLUGIN_CONFIGS[target];
  if (!config) {
    const valid = Object.keys(PLUGIN_CONFIGS).join(', ');
    throw new Error(`Unknown plugin target "${target}". Valid: ${valid}`);
  }
  return config;
}
