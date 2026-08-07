/**
 * Single source of truth for per-client harness install + MCP-setup steps.
 * Consumed by `harness setup` (packages/cli/src/commands/setup.ts) AND by the
 * agent-setup prompt generator (scripts/generate-agent-setup-prompt.mjs).
 * Adding a client here is the ONLY place a new client must be registered —
 * the parity test and the prompt drift-gate enforce that both consumers stay
 * in sync. See ADR 0073.
 */
export interface SetupClient {
  /** Human-readable client name, e.g. "Claude Code". */
  name: string;
  /** Home-relative dir whose presence detects the client, e.g. ".claude". */
  detectDir: string;
  /** Internal client key passed to setupMcp(), e.g. "claude". */
  client: string;
  /** Project-relative MCP config file this client writes, e.g. ".mcp.json". */
  configTarget: string;
  /** How this client installs harness. */
  install:
    | {
        kind: 'plugin';
        marketplace: 'Intense-Visions/harness-engineering';
        plugin: string;
      }
    | { kind: 'npm'; pkg: '@harness-engineering/cli'; setup: 'harness setup' };
}

const NPM_INSTALL = {
  kind: 'npm',
  pkg: '@harness-engineering/cli',
  setup: 'harness setup',
} as const;

export const SETUP_CLIENTS: SetupClient[] = [
  {
    name: 'Claude Code',
    detectDir: '.claude',
    client: 'claude',
    configTarget: '.mcp.json',
    install: {
      kind: 'plugin',
      marketplace: 'Intense-Visions/harness-engineering',
      plugin: 'harness-claude',
    },
  },
  {
    name: 'Gemini CLI',
    detectDir: '.gemini',
    client: 'gemini',
    configTarget: '.gemini/settings.json',
    install: {
      kind: 'plugin',
      marketplace: 'Intense-Visions/harness-engineering',
      plugin: 'harness-gemini',
    },
  },
  {
    name: 'Antigravity CLI',
    // agy shares the ~/.gemini/ home dir with Gemini CLI; the antigravity-cli/ subdir
    // (where agy bundles its own docs) is the marker that distinguishes an agy install
    // from a plain gemini-cli install, so a gemini-only user is not misdetected as agy.
    detectDir: '.gemini/antigravity-cli',
    client: 'antigravity',
    // agy reads MCP from config/mcp_config.json; declaring it in settings.json is
    // silently ignored (unlike the gemini client, which writes .gemini/settings.json).
    configTarget: '.gemini/config/mcp_config.json',
    install: {
      kind: 'plugin',
      marketplace: 'Intense-Visions/harness-engineering',
      plugin: 'harness-antigravity',
    },
  },
  {
    name: 'Codex CLI',
    detectDir: '.codex',
    client: 'codex',
    configTarget: '.codex/config.toml',
    install: {
      kind: 'plugin',
      marketplace: 'Intense-Visions/harness-engineering',
      plugin: 'harness-codex',
    },
  },
  {
    name: 'Cursor',
    detectDir: '.cursor',
    client: 'cursor',
    configTarget: '.cursor/mcp.json',
    install: {
      kind: 'plugin',
      marketplace: 'Intense-Visions/harness-engineering',
      plugin: 'harness-cursor',
    },
  },
  {
    name: 'OpenCode',
    detectDir: '.config/opencode',
    client: 'opencode',
    configTarget: 'opencode.json',
    install: NPM_INSTALL,
  },
];
