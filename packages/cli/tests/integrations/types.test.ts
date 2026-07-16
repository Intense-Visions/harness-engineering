import { describe, it, expect } from 'vitest';
import type { IntegrationDef } from '../../src/integrations/types';
import type { IntegrationsConfig } from '../../src/config/schema';

describe('IntegrationDef type', () => {
  it('accepts a valid Tier 0 integration definition', () => {
    const def: IntegrationDef = {
      name: 'context7',
      displayName: 'Context7',
      description: 'Live version-pinned docs for 9,000+ libraries',
      tier: 0,
      mcpConfig: {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
      platforms: ['claude-code', 'gemini-cli'],
    };
    expect(def.name).toBe('context7');
    expect(def.tier).toBe(0);
    expect(def.envVar).toBeUndefined();
  });

  it('accepts a valid Tier 1 integration definition with envVar and env', () => {
    const def: IntegrationDef = {
      name: 'exa',
      displayName: 'Exa',
      description: 'Structured agent web search and research',
      tier: 1,
      envVar: 'EXA_API_KEY',
      mcpConfig: {
        command: 'npx',
        args: ['-y', 'exa-mcp-server'],
        env: { EXA_API_KEY: '${EXA_API_KEY}' },
      },
      installHint: 'Get an API key at https://dashboard.exa.ai/api-keys',
      platforms: ['claude-code', 'gemini-cli'],
    };
    expect(def.envVar).toBe('EXA_API_KEY');
    expect(def.mcpConfig.env).toBeDefined();
    expect(def.installHint).toBeDefined();
  });

  it('accepts an optional lastReviewed ISO date (additive field)', () => {
    const def: IntegrationDef = {
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
    };
    expect(def.lastReviewed).toBe('2026-07-16');
  });
});

describe('IntegrationsConfig type', () => {
  it('accepts a valid integrations config', () => {
    const config: IntegrationsConfig = {
      enabled: ['exa'],
      dismissed: ['github'],
    };
    expect(config.enabled).toHaveLength(1);
    expect(config.dismissed).toHaveLength(1);
  });

  it('accepts empty arrays', () => {
    const config: IntegrationsConfig = {
      enabled: [],
      dismissed: [],
    };
    expect(config.enabled).toHaveLength(0);
    expect(config.dismissed).toHaveLength(0);
  });
});
