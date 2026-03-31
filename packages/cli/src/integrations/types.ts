/**
 * Supported AI agent platforms for MCP integration.
 */
export type IntegrationPlatform = 'claude-code' | 'gemini-cli';

/**
 * Definition of a single MCP peer integration.
 *
 * Adding a new integration = adding a new object to the registry array
 * that satisfies this interface.
 */
export interface IntegrationDef {
  /** Machine-readable identifier, e.g. 'context7' */
  name: string;
  /** Human-readable display name, e.g. 'Context7' */
  displayName: string;
  /** One-line description for doctor/list output */
  description: string;
  /** 0 = zero-config (free, no API key), 1 = API-key required */
  tier: 0 | 1;
  /** Environment variable required for Tier 1 integrations */
  envVar?: string;
  /** MCP server launch configuration */
  mcpConfig: {
    /** Executable command, e.g. 'npx' */
    command: string;
    /** Command arguments, e.g. ['-y', '@upstash/context7-mcp'] */
    args: string[];
    /**
     * Environment variables to pass to the MCP server process.
     * Values use shell-style interpolation templates (e.g. '${PERPLEXITY_API_KEY}').
     * The launcher MUST resolve these against process.env before spawning.
     */
    env?: Record<string, string>;
  };
  /** Hint shown when the required env var is missing */
  installHint?: string;
  /** Platforms this integration supports */
  platforms: IntegrationPlatform[];
}

/**
 * Configuration for the integrations section of harness.config.json.
 *
 * Canonical type: import { IntegrationsConfig } from '../config/schema'.
 * Do not duplicate here — the Zod-inferred type is the single source of truth.
 */
