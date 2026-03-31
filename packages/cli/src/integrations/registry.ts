import type { IntegrationDef } from './types';

/**
 * Static registry of all MCP peer integrations.
 *
 * To add a new integration, append an object to this array.
 * No plugin system — this is intentionally a flat, inspectable list.
 *
 * NOTE: Exact npm package names should be verified before release.
 * Some packages below use best-known names with TODO markers where uncertain.
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
  },
  {
    name: 'sequential-thinking',
    displayName: 'Sequential Thinking',
    description: 'Structured multi-step reasoning',
    tier: 0,
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    platforms: ['claude-code', 'gemini-cli'],
  },
  {
    name: 'playwright',
    displayName: 'Playwright',
    description: 'Browser automation for E2E testing',
    tier: 0,
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
    platforms: ['claude-code', 'gemini-cli'],
  },

  // --- Tier 1: API-key required ---
  {
    name: 'perplexity',
    displayName: 'Perplexity',
    description: 'Real-time web search and deep research',
    tier: 1,
    envVar: 'PERPLEXITY_API_KEY',
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@anthropic/perplexity-mcp'], // TODO: verify exact package name
      env: { PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}' },
    },
    installHint: 'Get an API key at https://perplexity.ai',
    platforms: ['claude-code', 'gemini-cli'],
  },
  {
    name: 'augment-code',
    displayName: 'Augment Code',
    description: 'Semantic code search across codebase',
    tier: 1,
    envVar: 'AUGMENT_API_KEY',
    mcpConfig: {
      command: 'npx',
      args: ['-y', '@augmentcode/mcp-server'], // TODO: verify exact package name
      env: { AUGMENT_API_KEY: '${AUGMENT_API_KEY}' },
    },
    installHint: 'Get an API key at https://augmentcode.com',
    platforms: ['claude-code', 'gemini-cli'],
  },
] as const satisfies readonly IntegrationDef[];
