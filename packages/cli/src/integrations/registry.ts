import type { IntegrationDef } from './types';

/**
 * ISO date the suggested MCP catalog was last curated for currency.
 *
 * The MCP ecosystem moves monthly; `harness doctor` emits a non-blocking
 * freshness advisory once this date is older than the staleness threshold
 * (see CATALOG_STALE_DAYS in commands/doctor.ts), pointing at the
 * mcp-catalog-refresh roadmap item so the catalog signals its own staleness
 * instead of silently rotting.
 */
export const CATALOG_LAST_REVIEWED = '2026-07-16';

/**
 * Static registry of all MCP peer integrations.
 *
 * To add a new integration, append an object to this array.
 * No plugin system — this is intentionally a flat, inspectable list.
 *
 * Package names verified against npm registry as of 2026-07-16.
 * Each entry carries `lastReviewed`; the module-level CATALOG_LAST_REVIEWED
 * mirrors the review date for the freshness advisory.
 */
export const INTEGRATION_REGISTRY: readonly IntegrationDef[] = [
  // --- Tier 0: zero-config (free, no API key) ---
  {
    name: 'context7',
    displayName: 'Context7',
    description: 'Live version-pinned docs for 9,000+ libraries',
    tier: 0,
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
    platforms: ['claude-code', 'gemini-cli'],
    lastReviewed: '2026-07-16',
  },
  {
    name: 'playwright',
    displayName: 'Playwright',
    description: 'Browser automation for E2E testing',
    tier: 0,
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    },
    platforms: ['claude-code', 'gemini-cli'],
    lastReviewed: '2026-07-16',
  },
  {
    name: 'harness',
    displayName: 'Harness',
    description:
      "Harness's own code-intelligence + workflow MCP (code_search, ask_graph, review_changes, outcome_eval)",
    tier: 0,
    mcpConfig: {
      command: 'harness-mcp',
      args: [],
    },
    platforms: ['claude-code', 'gemini-cli'],
    lastReviewed: '2026-07-16',
  },

  // --- Tier 1: API-key required ---
  {
    name: 'github',
    displayName: 'GitHub',
    description: 'GitHub repo, issue, and PR access (official GitHub MCP)',
    tier: 1,
    envVar: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    mcpConfig: {
      // The official GitHub MCP server (github/github-mcp-server) is a Go
      // binary distributed via Docker/GHCR and has no clean npx entry point;
      // the canonical npm reference server @modelcontextprotocol/server-github
      // is deprecated but remains the documented default launch. Revisit when
      // GitHub ships an official npx-launchable package.
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' }, // harness-ignore SEC-SEC-002: env var placeholder, not a hardcoded secret
    },
    installHint:
      'Create a GitHub personal access token at https://github.com/settings/tokens and set GITHUB_PERSONAL_ACCESS_TOKEN',
    platforms: ['claude-code', 'gemini-cli'],
    lastReviewed: '2026-07-16',
  },
  {
    name: 'exa',
    displayName: 'Exa',
    description: 'Structured agent web search and research',
    tier: 1,
    envVar: 'EXA_API_KEY',
    mcpConfig: {
      command: 'npx',
      args: ['-y', 'exa-mcp-server'],
      env: { EXA_API_KEY: '${EXA_API_KEY}' }, // harness-ignore SEC-SEC-002: env var placeholder, not a hardcoded secret
    },
    installHint: 'Get an API key at https://dashboard.exa.ai/api-keys',
    platforms: ['claude-code', 'gemini-cli'],
    lastReviewed: '2026-07-16',
  },
] as const satisfies readonly IntegrationDef[];
