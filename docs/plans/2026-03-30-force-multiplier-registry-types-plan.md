# Plan: Force-Multiplier Integrations -- Registry + Types (Phase 1)

**Date:** 2026-03-30
**Spec:** docs/changes/force-multiplier-integrations/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Define the `IntegrationDef` interface, `IntegrationsConfig` type, static 5-entry integration registry, and Zod schema addition so that later phases (CLI commands, setup, doctor) have a stable foundation to build on.

## Observable Truths (Acceptance Criteria)

1. The system shall export an `IntegrationDef` interface from `packages/cli/src/integrations/types.ts` with fields: `name`, `displayName`, `description`, `tier` (0 | 1), `envVar?`, `mcpConfig` (command, args, env?), `installHint?`, `platforms`.
2. The system shall export an `IntegrationsConfig` type from `packages/cli/src/integrations/types.ts` with fields: `enabled` (string[]), `dismissed` (string[]).
3. The system shall export an `INTEGRATION_REGISTRY` array from `packages/cli/src/integrations/registry.ts` containing exactly 5 entries: context7, sequential-thinking, playwright, perplexity, augment-code.
4. When `HarnessConfigSchema` parses a config with `integrations: { enabled: ["perplexity"], dismissed: ["augment-code"] }`, the result shall be successful.
5. When `HarnessConfigSchema` parses a config with `integrations: { enabled: "invalid" }`, the result shall fail validation.
6. When `HarnessConfigSchema` parses a config without an `integrations` field, the result shall succeed (optional field).
7. The registry shall contain exactly 3 Tier 0 entries (context7, sequential-thinking, playwright) and exactly 2 Tier 1 entries (perplexity, augment-code).
8. Each Tier 1 entry shall have a non-empty `envVar` field. Each Tier 0 entry shall not have an `envVar` field.
9. `cd packages/cli && npx vitest run tests/integrations/` passes all tests.
10. `harness validate` passes after all changes.

## File Map

```
CREATE packages/cli/src/integrations/types.ts
CREATE packages/cli/src/integrations/registry.ts
CREATE packages/cli/tests/integrations/types.test.ts
CREATE packages/cli/tests/integrations/registry.test.ts
CREATE packages/cli/tests/config/integrations-schema.test.ts
MODIFY packages/cli/src/config/schema.ts (add IntegrationsConfigSchema, wire into HarnessConfigSchema)
```

## Tasks

### Task 1: Define IntegrationDef and IntegrationsConfig types (TDD)

**Depends on:** none
**Files:** `packages/cli/src/integrations/types.ts`, `packages/cli/tests/integrations/types.test.ts`

1. Create test file `packages/cli/tests/integrations/types.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import type { IntegrationDef, IntegrationsConfig } from '../../src/integrations/types';

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
         name: 'perplexity',
         displayName: 'Perplexity',
         description: 'Real-time web search and deep research',
         tier: 1,
         envVar: 'PERPLEXITY_API_KEY',
         mcpConfig: {
           command: 'npx',
           args: ['-y', '@anthropic/perplexity-mcp'],
           env: { PERPLEXITY_API_KEY: '${PERPLEXITY_API_KEY}' },
         },
         installHint: 'Get an API key at https://perplexity.ai',
         platforms: ['claude-code', 'gemini-cli'],
       };
       expect(def.envVar).toBe('PERPLEXITY_API_KEY');
       expect(def.mcpConfig.env).toBeDefined();
       expect(def.installHint).toBeDefined();
     });
   });

   describe('IntegrationsConfig type', () => {
     it('accepts a valid integrations config', () => {
       const config: IntegrationsConfig = {
         enabled: ['perplexity'],
         dismissed: ['augment-code'],
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
   ```

2. Run test: `cd packages/cli && npx vitest run tests/integrations/types.test.ts`
3. Observe failure: module not found (types.ts does not exist yet)

4. Create implementation `packages/cli/src/integrations/types.ts`:

   ```typescript
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
       /** Environment variables to pass to the MCP server process */
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
    * - `enabled`: Tier 1 integrations the user has explicitly added
    * - `dismissed`: Integrations the user does not want doctor to suggest
    */
   export interface IntegrationsConfig {
     enabled: string[];
     dismissed: string[];
   }
   ```

5. Run test: `cd packages/cli && npx vitest run tests/integrations/types.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(integrations): define IntegrationDef and IntegrationsConfig types`

---

### Task 2: Create static integration registry with 5 entries (TDD)

**Depends on:** Task 1
**Files:** `packages/cli/src/integrations/registry.ts`, `packages/cli/tests/integrations/registry.test.ts`

1. Create test file `packages/cli/tests/integrations/registry.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { INTEGRATION_REGISTRY } from '../../src/integrations/registry';
   import type { IntegrationDef } from '../../src/integrations/types';

   describe('INTEGRATION_REGISTRY', () => {
     it('contains exactly 5 entries', () => {
       expect(INTEGRATION_REGISTRY).toHaveLength(5);
     });

     it('has unique names', () => {
       const names = INTEGRATION_REGISTRY.map((d) => d.name);
       expect(new Set(names).size).toBe(names.length);
     });

     it('contains all expected integrations', () => {
       const names = INTEGRATION_REGISTRY.map((d) => d.name);
       expect(names).toContain('context7');
       expect(names).toContain('sequential-thinking');
       expect(names).toContain('playwright');
       expect(names).toContain('perplexity');
       expect(names).toContain('augment-code');
     });

     it('has exactly 3 Tier 0 entries', () => {
       const tier0 = INTEGRATION_REGISTRY.filter((d) => d.tier === 0);
       expect(tier0).toHaveLength(3);
       const names = tier0.map((d) => d.name);
       expect(names).toContain('context7');
       expect(names).toContain('sequential-thinking');
       expect(names).toContain('playwright');
     });

     it('has exactly 2 Tier 1 entries', () => {
       const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
       expect(tier1).toHaveLength(2);
       const names = tier1.map((d) => d.name);
       expect(names).toContain('perplexity');
       expect(names).toContain('augment-code');
     });

     it('every Tier 1 entry has an envVar', () => {
       const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
       for (const def of tier1) {
         expect(def.envVar).toBeTruthy();
       }
     });

     it('no Tier 0 entry has an envVar', () => {
       const tier0 = INTEGRATION_REGISTRY.filter((d) => d.tier === 0);
       for (const def of tier0) {
         expect(def.envVar).toBeUndefined();
       }
     });

     it('every entry has a non-empty mcpConfig.command', () => {
       for (const def of INTEGRATION_REGISTRY) {
         expect(def.mcpConfig.command).toBeTruthy();
       }
     });

     it('every entry has at least one platform', () => {
       for (const def of INTEGRATION_REGISTRY) {
         expect(def.platforms.length).toBeGreaterThan(0);
       }
     });

     it('every entry has a non-empty description', () => {
       for (const def of INTEGRATION_REGISTRY) {
         expect(def.description.length).toBeGreaterThan(0);
       }
     });

     it('Tier 1 entries have mcpConfig.env referencing their envVar', () => {
       const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
       for (const def of tier1) {
         expect(def.mcpConfig.env).toBeDefined();
         expect(Object.keys(def.mcpConfig.env!)).toContain(def.envVar);
       }
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/integrations/registry.test.ts`
3. Observe failure: module not found (registry.ts does not exist yet)

4. Create implementation `packages/cli/src/integrations/registry.ts`:

   ```typescript
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
   ```

5. Run test: `cd packages/cli && npx vitest run tests/integrations/registry.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(integrations): add static 5-entry integration registry`

---

### Task 3: Add IntegrationsConfigSchema to Zod config schema (TDD)

**Depends on:** none (can be done in parallel with Tasks 1-2, but logically grouped after)
**Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/integrations-schema.test.ts`

1. Create test file `packages/cli/tests/config/integrations-schema.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { IntegrationsConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

   describe('IntegrationsConfigSchema', () => {
     it('accepts valid integrations config', () => {
       const result = IntegrationsConfigSchema.safeParse({
         enabled: ['perplexity'],
         dismissed: ['augment-code'],
       });
       expect(result.success).toBe(true);
     });

     it('defaults enabled to empty array', () => {
       const result = IntegrationsConfigSchema.parse({});
       expect(result.enabled).toEqual([]);
     });

     it('defaults dismissed to empty array', () => {
       const result = IntegrationsConfigSchema.parse({});
       expect(result.dismissed).toEqual([]);
     });

     it('rejects non-array enabled', () => {
       const result = IntegrationsConfigSchema.safeParse({
         enabled: 'invalid',
       });
       expect(result.success).toBe(false);
     });

     it('rejects non-array dismissed', () => {
       const result = IntegrationsConfigSchema.safeParse({
         dismissed: 123,
       });
       expect(result.success).toBe(false);
     });

     it('rejects non-string array elements in enabled', () => {
       const result = IntegrationsConfigSchema.safeParse({
         enabled: [123],
       });
       expect(result.success).toBe(false);
     });
   });

   describe('HarnessConfigSchema with integrations', () => {
     it('accepts config with integrations block', () => {
       const result = HarnessConfigSchema.safeParse({
         version: 1,
         integrations: {
           enabled: ['perplexity'],
           dismissed: ['augment-code'],
         },
       });
       expect(result.success).toBe(true);
     });

     it('accepts config without integrations block', () => {
       const result = HarnessConfigSchema.safeParse({
         version: 1,
       });
       expect(result.success).toBe(true);
     });

     it('accepts config with empty integrations block', () => {
       const result = HarnessConfigSchema.safeParse({
         version: 1,
         integrations: {},
       });
       expect(result.success).toBe(true);
       if (result.success) {
         expect(result.data.integrations?.enabled).toEqual([]);
         expect(result.data.integrations?.dismissed).toEqual([]);
       }
     });

     it('rejects config with invalid integrations block', () => {
       const result = HarnessConfigSchema.safeParse({
         version: 1,
         integrations: {
           enabled: 'invalid',
         },
       });
       expect(result.success).toBe(false);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/config/integrations-schema.test.ts`
3. Observe failure: `IntegrationsConfigSchema` is not exported from schema.ts

4. Modify `packages/cli/src/config/schema.ts`:
   - Add after the `ReviewConfigSchema` definition (before `HarnessConfigSchema`):
     ```typescript
     /**
      * Schema for MCP integration enablement and dismissal tracking.
      */
     export const IntegrationsConfigSchema = z.object({
       /** Tier 1 integrations explicitly enabled by the user */
       enabled: z.array(z.string()).default([]),
       /** Integrations the user does not want doctor to suggest */
       dismissed: z.array(z.string()).default([]),
     });
     ```
   - Add to `HarnessConfigSchema` object, after the `review` field:
     ```typescript
     /** MCP peer integration enablement and dismissal */
     integrations: IntegrationsConfigSchema.optional(),
     ```
   - Add at the bottom with the other type exports:
     ```typescript
     /**
      * Type for integrations-specific configuration.
      */
     export type IntegrationsConfig = z.infer<typeof IntegrationsConfigSchema>;
     ```

5. Run test: `cd packages/cli && npx vitest run tests/config/integrations-schema.test.ts`
6. Observe: all tests pass
7. Run: `cd packages/cli && npx vitest run tests/config/` (verify no regressions in existing config tests)
8. Run: `harness validate`
9. Commit: `feat(integrations): add IntegrationsConfigSchema to Zod config`

---

### Task 4: Verify full test suite and validate

**Depends on:** Tasks 1, 2, 3
**Files:** none (verification only)

1. Run all integration-related tests: `cd packages/cli && npx vitest run tests/integrations/ tests/config/integrations-schema.test.ts`
2. Observe: all tests pass
3. Run existing config tests to verify no regressions: `cd packages/cli && npx vitest run tests/config/`
4. Observe: all tests pass
5. Run: `harness validate`
6. Observe: validation passes

[checkpoint:human-verify] -- Verify the types, registry, and schema are correct before later phases build on them.
