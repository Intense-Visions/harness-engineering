# Plan: Phase 5b -- Provider Cache Adapters

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Define the `CacheAdapter` interface and implement three provider-specific adapters (Anthropic, OpenAI, Gemini) that map stability tiers to provider-specific cache directives and extract cache usage metrics from responses.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/caching/adapter.ts` exports `CacheAdapter` interface, `StabilityTaggedBlock`, `ProviderSystemBlock`, and `ProviderToolBlock` types.
2. When the Anthropic adapter's `wrapSystemBlock` is called with `stability: 'static'`, the system shall return a block with `cache_control: { type: 'ephemeral', ttl: '1h' }`.
3. When the Anthropic adapter's `wrapSystemBlock` is called with `stability: 'session'`, the system shall return a block with `cache_control: { type: 'ephemeral' }`.
4. When the Anthropic adapter's `wrapSystemBlock` is called with `stability: 'ephemeral'`, the system shall return a plain text block with no `cache_control`.
5. When the Anthropic adapter's `wrapTools` is called, the system shall add `cache_control` to the last tool definition.
6. When the OpenAI adapter's `wrapSystemBlock` is called, the system shall return a passthrough block (no cache directives).
7. When the OpenAI adapter's `orderContent` is called, the system shall sort blocks with static first, session second, ephemeral last.
8. When the OpenAI adapter's `parseCacheUsage` is called, the system shall extract `prompt_tokens_details.cached_tokens` and return `cacheCreationTokens: 0`.
9. When the Gemini adapter's `wrapSystemBlock` is called with `stability: 'static'`, the system shall return a block with `cachedContentRef` marker.
10. When the Gemini adapter's `parseCacheUsage` is called, the system shall extract `usageMetadata.cachedContentTokenCount`.
11. When any adapter's `orderContent` is called, the system shall sort static before session before ephemeral.
12. `npx vitest run packages/core/tests/caching/` passes with all adapter tests green.
13. `harness validate` passes.

## File Map

- CREATE `packages/core/src/caching/adapter.ts` -- CacheAdapter interface and supporting types
- CREATE `packages/core/src/caching/adapters/anthropic.ts` -- AnthropicCacheAdapter
- CREATE `packages/core/src/caching/adapters/openai.ts` -- OpenAICacheAdapter
- CREATE `packages/core/src/caching/adapters/gemini.ts` -- GeminiCacheAdapter
- MODIFY `packages/core/src/caching/index.ts` -- add exports for adapter + all three adapters
- CREATE `packages/core/tests/caching/adapter.test.ts` -- interface contract tests
- CREATE `packages/core/tests/caching/adapters/anthropic.test.ts` -- Anthropic adapter unit tests
- CREATE `packages/core/tests/caching/adapters/openai.test.ts` -- OpenAI adapter unit tests
- CREATE `packages/core/tests/caching/adapters/gemini.test.ts` -- Gemini adapter unit tests

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Define CacheAdapter interface and supporting types

**Depends on:** none
**Files:** `packages/core/src/caching/adapter.ts`, `packages/core/tests/caching/adapter.test.ts`

1. Create test file `packages/core/tests/caching/adapter.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import type {
     CacheAdapter,
     StabilityTaggedBlock,
     ProviderSystemBlock,
     ProviderToolBlock,
   } from '../../src/caching/adapter';

   describe('CacheAdapter types', () => {
     it('StabilityTaggedBlock has required fields', () => {
       const block: StabilityTaggedBlock = {
         stability: 'static',
         content: 'system prompt content',
         role: 'system',
       };
       expect(block.stability).toBe('static');
       expect(block.content).toBe('system prompt content');
       expect(block.role).toBe('system');
     });

     it('StabilityTaggedBlock accepts all stability tiers', () => {
       const tiers = ['static', 'session', 'ephemeral'] as const;
       for (const tier of tiers) {
         const block: StabilityTaggedBlock = {
           stability: tier,
           content: 'test',
           role: 'system',
         };
         expect(block.stability).toBe(tier);
       }
     });

     it('ProviderSystemBlock supports text-only shape', () => {
       const block: ProviderSystemBlock = { type: 'text', text: 'hello' };
       expect(block.type).toBe('text');
       expect(block.text).toBe('hello');
     });

     it('ProviderSystemBlock supports cache_control shape', () => {
       const block: ProviderSystemBlock = {
         type: 'text',
         text: 'hello',
         cache_control: { type: 'ephemeral' },
       };
       expect(block.cache_control).toEqual({ type: 'ephemeral' });
     });

     it('ProviderSystemBlock supports cachedContentRef shape', () => {
       const block: ProviderSystemBlock = {
         type: 'text',
         text: 'hello',
         cachedContentRef: 'cachedContents/abc123',
       };
       expect(block.cachedContentRef).toBe('cachedContents/abc123');
     });

     it('ProviderToolBlock wraps an array of tool definitions', () => {
       const block: ProviderToolBlock = {
         tools: [
           { name: 'tool1', description: 'first', input_schema: {} },
           { name: 'tool2', description: 'second', input_schema: {} },
         ],
       };
       expect(block.tools).toHaveLength(2);
     });

     it('ProviderToolBlock supports cache_control on individual tools', () => {
       const block: ProviderToolBlock = {
         tools: [
           {
             name: 'tool1',
             description: 'first',
             input_schema: {},
             cache_control: { type: 'ephemeral' },
           },
         ],
       };
       expect(block.tools[0].cache_control).toEqual({ type: 'ephemeral' });
     });

     it('CacheAdapter interface is structurally valid', () => {
       // Structural type check -- an object that satisfies CacheAdapter
       const adapter: CacheAdapter = {
         provider: 'claude',
         wrapSystemBlock: (content, stability) => ({ type: 'text', text: content }),
         wrapTools: (tools, stability) => ({ tools }),
         orderContent: (blocks) => blocks,
         parseCacheUsage: () => ({ cacheCreationTokens: 0, cacheReadTokens: 0 }),
       };
       expect(adapter.provider).toBe('claude');
       expect(typeof adapter.wrapSystemBlock).toBe('function');
       expect(typeof adapter.wrapTools).toBe('function');
       expect(typeof adapter.orderContent).toBe('function');
       expect(typeof adapter.parseCacheUsage).toBe('function');
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/caching/adapter.test.ts`
3. Observe failure: cannot find module `../../src/caching/adapter`

4. Create `packages/core/src/caching/adapter.ts`:

   ```typescript
   import type { StabilityTier } from '@harness-engineering/types';

   /**
    * A content block tagged with its stability classification.
    * Used by CacheAdapter.orderContent() to sort blocks for optimal cache hits.
    */
   export interface StabilityTaggedBlock {
     /** Stability classification of this content */
     stability: StabilityTier;
     /** The content payload (system prompt text, tool output, etc.) */
     content: string;
     /** The role this block serves in the message (system, user, assistant) */
     role: 'system' | 'user' | 'assistant';
   }

   /**
    * Provider-formatted system prompt block.
    * Shape varies by provider -- may include cache_control (Anthropic),
    * cachedContentRef (Gemini), or plain text (OpenAI).
    */
   export interface ProviderSystemBlock {
     type: 'text';
     text: string;
     /** Anthropic cache control directive */
     cache_control?: { type: 'ephemeral'; ttl?: string };
     /** Gemini cached content reference */
     cachedContentRef?: string;
   }

   /**
    * A tool definition as passed to provider APIs.
    * Minimal shape -- provider adapters may extend individual entries.
    */
   export interface ToolDefinition {
     name: string;
     description: string;
     input_schema: Record<string, unknown>;
     /** Anthropic cache control directive (added by adapter) */
     cache_control?: { type: 'ephemeral'; ttl?: string };
   }

   /**
    * Provider-formatted tool block wrapping an array of tool definitions.
    */
   export interface ProviderToolBlock {
     tools: ToolDefinition[];
   }

   /**
    * Unified interface for provider-specific prompt cache behavior.
    *
    * Each provider has different mechanisms for prompt caching:
    * - Anthropic: explicit cache_control breakpoints
    * - OpenAI: automatic prefix-matching (content ordering matters)
    * - Gemini: cachedContents resource for static content
    *
    * Adapters translate stability tiers into provider-native directives.
    */
   export interface CacheAdapter {
     /** Provider identifier */
     provider: 'claude' | 'openai' | 'gemini';

     /** Wrap a system prompt block with provider-specific cache directives */
     wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock;

     /** Wrap tool definitions with provider-specific cache directives */
     wrapTools(tools: ToolDefinition[], stability: StabilityTier): ProviderToolBlock;

     /** Order message content blocks for optimal cache hit rates */
     orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[];

     /** Extract cache token counts from a provider API response */
     parseCacheUsage(response: unknown): {
       cacheCreationTokens: number;
       cacheReadTokens: number;
     };
   }
   ```

5. Run test: `npx vitest run packages/core/tests/caching/adapter.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(caching): define CacheAdapter interface and supporting types`

---

### Task 2: Implement Anthropic cache adapter (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/caching/adapters/anthropic.ts`, `packages/core/tests/caching/adapters/anthropic.test.ts`

1. Create directory: `mkdir -p packages/core/src/caching/adapters packages/core/tests/caching/adapters`

2. Create test file `packages/core/tests/caching/adapters/anthropic.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { AnthropicCacheAdapter } from '../../../src/caching/adapters/anthropic';
   import type { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter';

   describe('AnthropicCacheAdapter', () => {
     const adapter = new AnthropicCacheAdapter();

     it('has provider set to claude', () => {
       expect(adapter.provider).toBe('claude');
     });

     describe('wrapSystemBlock', () => {
       it('adds cache_control with ttl for static content', () => {
         const result = adapter.wrapSystemBlock('static system prompt', 'static');
         expect(result).toEqual({
           type: 'text',
           text: 'static system prompt',
           cache_control: { type: 'ephemeral', ttl: '1h' },
         });
       });

       it('adds cache_control without ttl for session content', () => {
         const result = adapter.wrapSystemBlock('session context', 'session');
         expect(result).toEqual({
           type: 'text',
           text: 'session context',
           cache_control: { type: 'ephemeral' },
         });
       });

       it('returns plain text block for ephemeral content', () => {
         const result = adapter.wrapSystemBlock('ephemeral data', 'ephemeral');
         expect(result).toEqual({
           type: 'text',
           text: 'ephemeral data',
         });
         expect(result).not.toHaveProperty('cache_control');
       });
     });

     describe('wrapTools', () => {
       it('adds cache_control to the last tool definition', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
           { name: 'tool2', description: 'second', input_schema: {} },
         ];
         const result = adapter.wrapTools(tools, 'static');
         expect(result.tools).toHaveLength(2);
         expect(result.tools[0]).not.toHaveProperty('cache_control');
         expect(result.tools[1].cache_control).toEqual({ type: 'ephemeral' });
       });

       it('adds cache_control to single tool', () => {
         const tools: ToolDefinition[] = [
           { name: 'only', description: 'only tool', input_schema: {} },
         ];
         const result = adapter.wrapTools(tools, 'session');
         expect(result.tools[0].cache_control).toEqual({ type: 'ephemeral' });
       });

       it('returns empty tools array unchanged', () => {
         const result = adapter.wrapTools([], 'static');
         expect(result.tools).toEqual([]);
       });

       it('does not add cache_control for ephemeral stability', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
         ];
         const result = adapter.wrapTools(tools, 'ephemeral');
         expect(result.tools[0]).not.toHaveProperty('cache_control');
       });

       it('does not mutate original tool definitions', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
         ];
         adapter.wrapTools(tools, 'static');
         expect(tools[0]).not.toHaveProperty('cache_control');
       });
     });

     describe('orderContent', () => {
       it('orders static first, session second, ephemeral last', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'ephemeral', content: 'e', role: 'system' },
           { stability: 'static', content: 's', role: 'system' },
           { stability: 'session', content: 'ss', role: 'system' },
         ];
         const result = adapter.orderContent(blocks);
         expect(result.map((b) => b.stability)).toEqual(['static', 'session', 'ephemeral']);
       });

       it('preserves order within the same tier', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'static', content: 'a', role: 'system' },
           { stability: 'static', content: 'b', role: 'system' },
           { stability: 'ephemeral', content: 'c', role: 'user' },
         ];
         const result = adapter.orderContent(blocks);
         expect(result[0].content).toBe('a');
         expect(result[1].content).toBe('b');
       });

       it('does not mutate original array', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'ephemeral', content: 'e', role: 'system' },
           { stability: 'static', content: 's', role: 'system' },
         ];
         const original = [...blocks];
         adapter.orderContent(blocks);
         expect(blocks).toEqual(original);
       });
     });

     describe('parseCacheUsage', () => {
       it('extracts cache_creation_input_tokens and cache_read_input_tokens', () => {
         const response = {
           usage: {
             cache_creation_input_tokens: 1500,
             cache_read_input_tokens: 3000,
           },
         };
         const result = adapter.parseCacheUsage(response);
         expect(result).toEqual({
           cacheCreationTokens: 1500,
           cacheReadTokens: 3000,
         });
       });

       it('returns zeros when usage is missing', () => {
         const result = adapter.parseCacheUsage({});
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('returns zeros when cache fields are missing from usage', () => {
         const result = adapter.parseCacheUsage({ usage: { input_tokens: 100 } });
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('handles null response gracefully', () => {
         const result = adapter.parseCacheUsage(null);
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });
     });
   });
   ```

3. Run test: `npx vitest run packages/core/tests/caching/adapters/anthropic.test.ts`
4. Observe failure: cannot find module

5. Create `packages/core/src/caching/adapters/anthropic.ts`:

   ```typescript
   import type { StabilityTier } from '@harness-engineering/types';
   import type {
     CacheAdapter,
     ProviderSystemBlock,
     ProviderToolBlock,
     StabilityTaggedBlock,
     ToolDefinition,
   } from '../adapter';

   /** Tier ordering: static=0, session=1, ephemeral=2 */
   const TIER_ORDER: Record<StabilityTier, number> = {
     static: 0,
     session: 1,
     ephemeral: 2,
   };

   /**
    * Anthropic cache adapter.
    *
    * Uses explicit `cache_control` breakpoints on content blocks:
    * - static: cache_control with type "ephemeral" and ttl "1h"
    * - session: cache_control with type "ephemeral" (default 5m TTL)
    * - ephemeral: no cache_control (not cached)
    *
    * Tool definitions get cache_control on the last entry (Anthropic's
    * breakpoint model caches everything up to and including the marked block).
    */
   export class AnthropicCacheAdapter implements CacheAdapter {
     readonly provider = 'claude' as const;

     wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock {
       if (stability === 'ephemeral') {
         return { type: 'text', text: content };
       }

       const ttl = stability === 'static' ? '1h' : undefined;
       return {
         type: 'text',
         text: content,
         cache_control: {
           type: 'ephemeral',
           ...(ttl !== undefined && { ttl }),
         },
       };
     }

     wrapTools(tools: ToolDefinition[], stability: StabilityTier): ProviderToolBlock {
       if (tools.length === 0 || stability === 'ephemeral') {
         return { tools: tools.map((t) => ({ ...t })) };
       }

       const wrapped = tools.map((t) => ({ ...t }));
       wrapped[wrapped.length - 1].cache_control = { type: 'ephemeral' as const };
       return { tools: wrapped };
     }

     orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[] {
       return [...blocks].sort((a, b) => TIER_ORDER[a.stability] - TIER_ORDER[b.stability]);
     }

     parseCacheUsage(response: unknown): {
       cacheCreationTokens: number;
       cacheReadTokens: number;
     } {
       const resp = response as Record<string, unknown> | null | undefined;
       const usage = resp?.usage as Record<string, unknown> | undefined;
       return {
         cacheCreationTokens: (usage?.cache_creation_input_tokens as number) ?? 0,
         cacheReadTokens: (usage?.cache_read_input_tokens as number) ?? 0,
       };
     }
   }
   ```

6. Run test: `npx vitest run packages/core/tests/caching/adapters/anthropic.test.ts`
7. Observe: all tests pass
8. Run: `harness validate`
9. Commit: `feat(caching): implement Anthropic cache adapter`

---

### Task 3: Implement OpenAI cache adapter (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/caching/adapters/openai.ts`, `packages/core/tests/caching/adapters/openai.test.ts`

1. Create test file `packages/core/tests/caching/adapters/openai.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { OpenAICacheAdapter } from '../../../src/caching/adapters/openai';
   import type { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter';

   describe('OpenAICacheAdapter', () => {
     const adapter = new OpenAICacheAdapter();

     it('has provider set to openai', () => {
       expect(adapter.provider).toBe('openai');
     });

     describe('wrapSystemBlock', () => {
       it('returns plain text block for static content (passthrough)', () => {
         const result = adapter.wrapSystemBlock('static prompt', 'static');
         expect(result).toEqual({ type: 'text', text: 'static prompt' });
         expect(result).not.toHaveProperty('cache_control');
       });

       it('returns plain text block for session content (passthrough)', () => {
         const result = adapter.wrapSystemBlock('session context', 'session');
         expect(result).toEqual({ type: 'text', text: 'session context' });
       });

       it('returns plain text block for ephemeral content (passthrough)', () => {
         const result = adapter.wrapSystemBlock('ephemeral data', 'ephemeral');
         expect(result).toEqual({ type: 'text', text: 'ephemeral data' });
       });
     });

     describe('wrapTools', () => {
       it('returns tools unchanged (passthrough)', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: { type: 'object' } },
           { name: 'tool2', description: 'second', input_schema: {} },
         ];
         const result = adapter.wrapTools(tools, 'static');
         expect(result.tools).toHaveLength(2);
         expect(result.tools[0]).toEqual(tools[0]);
         expect(result.tools[1]).toEqual(tools[1]);
       });

       it('does not add cache_control to any tool', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
         ];
         const result = adapter.wrapTools(tools, 'static');
         expect(result.tools[0]).not.toHaveProperty('cache_control');
       });

       it('does not mutate original tool definitions', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
         ];
         adapter.wrapTools(tools, 'static');
         expect(tools[0]).not.toHaveProperty('cache_control');
       });
     });

     describe('orderContent', () => {
       it('orders static first, session second, ephemeral last', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'session', content: 'ss', role: 'system' },
           { stability: 'ephemeral', content: 'e', role: 'user' },
           { stability: 'static', content: 's', role: 'system' },
         ];
         const result = adapter.orderContent(blocks);
         expect(result.map((b) => b.stability)).toEqual(['static', 'session', 'ephemeral']);
       });

       it('preserves order within the same tier', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'session', content: 'a', role: 'system' },
           { stability: 'session', content: 'b', role: 'user' },
         ];
         const result = adapter.orderContent(blocks);
         expect(result[0].content).toBe('a');
         expect(result[1].content).toBe('b');
       });

       it('does not mutate original array', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'ephemeral', content: 'e', role: 'user' },
           { stability: 'static', content: 's', role: 'system' },
         ];
         const original = [...blocks];
         adapter.orderContent(blocks);
         expect(blocks).toEqual(original);
       });
     });

     describe('parseCacheUsage', () => {
       it('extracts cached_tokens from prompt_tokens_details', () => {
         const response = {
           usage: {
             prompt_tokens: 5000,
             prompt_tokens_details: {
               cached_tokens: 2000,
             },
           },
         };
         const result = adapter.parseCacheUsage(response);
         expect(result).toEqual({
           cacheCreationTokens: 0,
           cacheReadTokens: 2000,
         });
       });

       it('returns zeros when usage is missing', () => {
         const result = adapter.parseCacheUsage({});
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('returns zeros when prompt_tokens_details is missing', () => {
         const result = adapter.parseCacheUsage({ usage: { prompt_tokens: 100 } });
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('handles null response gracefully', () => {
         const result = adapter.parseCacheUsage(null);
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('always returns cacheCreationTokens as 0 (OpenAI does not separate creation)', () => {
         const response = {
           usage: { prompt_tokens_details: { cached_tokens: 999 } },
         };
         const result = adapter.parseCacheUsage(response);
         expect(result.cacheCreationTokens).toBe(0);
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/caching/adapters/openai.test.ts`
3. Observe failure: cannot find module

4. Create `packages/core/src/caching/adapters/openai.ts`:

   ```typescript
   import type { StabilityTier } from '@harness-engineering/types';
   import type {
     CacheAdapter,
     ProviderSystemBlock,
     ProviderToolBlock,
     StabilityTaggedBlock,
     ToolDefinition,
   } from '../adapter';

   /** Tier ordering: static=0, session=1, ephemeral=2 */
   const TIER_ORDER: Record<StabilityTier, number> = {
     static: 0,
     session: 1,
     ephemeral: 2,
   };

   /**
    * OpenAI cache adapter.
    *
    * OpenAI uses automatic prefix-matching for prompt caching -- no explicit
    * cache directives are needed. The only optimization is content ordering:
    * static content first, then session, then ephemeral. This maximizes the
    * stable prefix length that OpenAI's automatic caching can match.
    *
    * wrapSystemBlock and wrapTools are passthroughs.
    */
   export class OpenAICacheAdapter implements CacheAdapter {
     readonly provider = 'openai' as const;

     wrapSystemBlock(content: string, _stability: StabilityTier): ProviderSystemBlock {
       return { type: 'text', text: content };
     }

     wrapTools(tools: ToolDefinition[], _stability: StabilityTier): ProviderToolBlock {
       return { tools: tools.map((t) => ({ ...t })) };
     }

     orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[] {
       return [...blocks].sort((a, b) => TIER_ORDER[a.stability] - TIER_ORDER[b.stability]);
     }

     parseCacheUsage(response: unknown): {
       cacheCreationTokens: number;
       cacheReadTokens: number;
     } {
       const resp = response as Record<string, unknown> | null | undefined;
       const usage = resp?.usage as Record<string, unknown> | undefined;
       const details = usage?.prompt_tokens_details as Record<string, unknown> | undefined;
       return {
         cacheCreationTokens: 0,
         cacheReadTokens: (details?.cached_tokens as number) ?? 0,
       };
     }
   }
   ```

5. Run test: `npx vitest run packages/core/tests/caching/adapters/openai.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(caching): implement OpenAI cache adapter`

---

### Task 4: Implement Gemini cache adapter (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/caching/adapters/gemini.ts`, `packages/core/tests/caching/adapters/gemini.test.ts`

1. Create test file `packages/core/tests/caching/adapters/gemini.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { GeminiCacheAdapter } from '../../../src/caching/adapters/gemini';
   import type { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter';

   describe('GeminiCacheAdapter', () => {
     const adapter = new GeminiCacheAdapter();

     it('has provider set to gemini', () => {
       expect(adapter.provider).toBe('gemini');
     });

     describe('wrapSystemBlock', () => {
       it('returns cachedContentRef marker for static content', () => {
         const result = adapter.wrapSystemBlock('static system instructions', 'static');
         expect(result.type).toBe('text');
         expect(result.text).toBe('static system instructions');
         expect(result.cachedContentRef).toBeDefined();
         expect(typeof result.cachedContentRef).toBe('string');
       });

       it('returns plain text block for session content', () => {
         const result = adapter.wrapSystemBlock('session context', 'session');
         expect(result).toEqual({ type: 'text', text: 'session context' });
         expect(result).not.toHaveProperty('cachedContentRef');
       });

       it('returns plain text block for ephemeral content', () => {
         const result = adapter.wrapSystemBlock('ephemeral data', 'ephemeral');
         expect(result).toEqual({ type: 'text', text: 'ephemeral data' });
         expect(result).not.toHaveProperty('cachedContentRef');
       });
     });

     describe('wrapTools', () => {
       it('returns tools unchanged (passthrough) for all stability tiers', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
         ];
         for (const tier of ['static', 'session', 'ephemeral'] as const) {
           const result = adapter.wrapTools(tools, tier);
           expect(result.tools).toHaveLength(1);
           expect(result.tools[0]).not.toHaveProperty('cache_control');
         }
       });

       it('does not mutate original tool definitions', () => {
         const tools: ToolDefinition[] = [
           { name: 'tool1', description: 'first', input_schema: {} },
         ];
         adapter.wrapTools(tools, 'static');
         expect(tools[0]).not.toHaveProperty('cache_control');
       });
     });

     describe('orderContent', () => {
       it('orders static first, then session, then ephemeral', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'ephemeral', content: 'e', role: 'user' },
           { stability: 'session', content: 'ss', role: 'system' },
           { stability: 'static', content: 's', role: 'system' },
         ];
         const result = adapter.orderContent(blocks);
         expect(result.map((b) => b.stability)).toEqual(['static', 'session', 'ephemeral']);
       });

       it('preserves order within the same tier', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'static', content: 'a', role: 'system' },
           { stability: 'static', content: 'b', role: 'system' },
         ];
         const result = adapter.orderContent(blocks);
         expect(result[0].content).toBe('a');
         expect(result[1].content).toBe('b');
       });

       it('does not mutate original array', () => {
         const blocks: StabilityTaggedBlock[] = [
           { stability: 'ephemeral', content: 'e', role: 'user' },
           { stability: 'static', content: 's', role: 'system' },
         ];
         const original = [...blocks];
         adapter.orderContent(blocks);
         expect(blocks).toEqual(original);
       });
     });

     describe('parseCacheUsage', () => {
       it('extracts cachedContentTokenCount from usageMetadata', () => {
         const response = {
           usageMetadata: {
             promptTokenCount: 5000,
             cachedContentTokenCount: 3000,
             candidatesTokenCount: 200,
           },
         };
         const result = adapter.parseCacheUsage(response);
         expect(result).toEqual({
           cacheCreationTokens: 0,
           cacheReadTokens: 3000,
         });
       });

       it('returns zeros when usageMetadata is missing', () => {
         const result = adapter.parseCacheUsage({});
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('returns zeros when cachedContentTokenCount is missing', () => {
         const result = adapter.parseCacheUsage({
           usageMetadata: { promptTokenCount: 100 },
         });
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('handles null response gracefully', () => {
         const result = adapter.parseCacheUsage(null);
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it('always returns cacheCreationTokens as 0 (Gemini does not separate in response)', () => {
         const response = {
           usageMetadata: { cachedContentTokenCount: 500 },
         };
         const result = adapter.parseCacheUsage(response);
         expect(result.cacheCreationTokens).toBe(0);
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/caching/adapters/gemini.test.ts`
3. Observe failure: cannot find module

4. Create `packages/core/src/caching/adapters/gemini.ts`:

   ```typescript
   import type { StabilityTier } from '@harness-engineering/types';
   import type {
     CacheAdapter,
     ProviderSystemBlock,
     ProviderToolBlock,
     StabilityTaggedBlock,
     ToolDefinition,
   } from '../adapter';

   /** Tier ordering: static=0, session=1, ephemeral=2 */
   const TIER_ORDER: Record<StabilityTier, number> = {
     static: 0,
     session: 1,
     ephemeral: 2,
   };

   /**
    * Marker prefix for Gemini cachedContents references.
    * In a live integration, the orchestrator replaces this with the actual
    * cachedContents/{id} from the Gemini API. This adapter produces the marker
    * so the orchestrator knows which blocks to cache.
    */
   const CACHED_CONTENT_MARKER = 'cachedContents:pending';

   /**
    * Gemini cache adapter.
    *
    * Gemini uses explicit `cachedContents` resources for static content:
    * - static: marked with cachedContentRef for the orchestrator to resolve
    *   into a real cachedContents/{id} via the Gemini API
    * - session: passthrough (relies on implicit caching in Gemini 2.5+)
    * - ephemeral: passthrough
    *
    * Tools are passed through unchanged -- Gemini caches tools as part
    * of the cachedContents resource when applicable.
    */
   export class GeminiCacheAdapter implements CacheAdapter {
     readonly provider = 'gemini' as const;

     wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock {
       if (stability === 'static') {
         return {
           type: 'text',
           text: content,
           cachedContentRef: CACHED_CONTENT_MARKER,
         };
       }
       return { type: 'text', text: content };
     }

     wrapTools(tools: ToolDefinition[], _stability: StabilityTier): ProviderToolBlock {
       return { tools: tools.map((t) => ({ ...t })) };
     }

     orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[] {
       return [...blocks].sort((a, b) => TIER_ORDER[a.stability] - TIER_ORDER[b.stability]);
     }

     parseCacheUsage(response: unknown): {
       cacheCreationTokens: number;
       cacheReadTokens: number;
     } {
       const resp = response as Record<string, unknown> | null | undefined;
       const metadata = resp?.usageMetadata as Record<string, unknown> | undefined;
       return {
         cacheCreationTokens: 0,
         cacheReadTokens: (metadata?.cachedContentTokenCount as number) ?? 0,
       };
     }
   }
   ```

5. Run test: `npx vitest run packages/core/tests/caching/adapters/gemini.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(caching): implement Gemini cache adapter`

---

### Task 5: Update barrel export

**Depends on:** Tasks 1-4
**Files:** `packages/core/src/caching/index.ts`

1. Modify `packages/core/src/caching/index.ts` to add exports:

   Replace the existing content:

   ```typescript
   /**
    * Caching module — stability classification and cache-aware utilities.
    */
   export { resolveStability } from './stability';
   ```

   With:

   ```typescript
   /**
    * Caching module — stability classification, cache adapter interface,
    * and provider-specific cache adapters.
    */
   export { resolveStability } from './stability';
   export type {
     CacheAdapter,
     StabilityTaggedBlock,
     ProviderSystemBlock,
     ProviderToolBlock,
     ToolDefinition,
   } from './adapter';
   export { AnthropicCacheAdapter } from './adapters/anthropic';
   export { OpenAICacheAdapter } from './adapters/openai';
   export { GeminiCacheAdapter } from './adapters/gemini';
   ```

2. Run: `npx vitest run packages/core/tests/caching/`
3. Observe: all caching tests pass (stability + adapter + all three provider tests)
4. Run: `harness validate`
5. Commit: `feat(caching): export CacheAdapter interface and provider adapters from barrel`

---

### Task 6: Cross-adapter ordering consistency test

**Depends on:** Tasks 2, 3, 4
**Files:** `packages/core/tests/caching/adapter-ordering.test.ts`

This task adds a shared test that verifies all three adapters produce identical ordering behavior, ensuring consistency across providers.

1. Create test file `packages/core/tests/caching/adapter-ordering.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { AnthropicCacheAdapter } from '../../src/caching/adapters/anthropic';
   import { OpenAICacheAdapter } from '../../src/caching/adapters/openai';
   import { GeminiCacheAdapter } from '../../src/caching/adapters/gemini';
   import type { CacheAdapter, StabilityTaggedBlock } from '../../src/caching/adapter';

   const adapters: CacheAdapter[] = [
     new AnthropicCacheAdapter(),
     new OpenAICacheAdapter(),
     new GeminiCacheAdapter(),
   ];

   describe('Cross-adapter ordering consistency', () => {
     const scrambled: StabilityTaggedBlock[] = [
       { stability: 'ephemeral', content: 'e1', role: 'user' },
       { stability: 'static', content: 's1', role: 'system' },
       { stability: 'session', content: 'ss1', role: 'system' },
       { stability: 'ephemeral', content: 'e2', role: 'user' },
       { stability: 'static', content: 's2', role: 'system' },
     ];

     for (const adapter of adapters) {
       it(`${adapter.provider}: orders static -> session -> ephemeral`, () => {
         const result = adapter.orderContent(scrambled);
         const stabilities = result.map((b) => b.stability);
         expect(stabilities).toEqual(['static', 'static', 'session', 'ephemeral', 'ephemeral']);
       });
     }

     it('all adapters produce identical ordering for the same input', () => {
       const results = adapters.map((a) => a.orderContent(scrambled));
       const first = results[0].map((b) => b.content);
       for (const result of results.slice(1)) {
         expect(result.map((b) => b.content)).toEqual(first);
       }
     });
   });

   describe('Cross-adapter parseCacheUsage null safety', () => {
     for (const adapter of adapters) {
       it(`${adapter.provider}: returns zeros for undefined`, () => {
         const result = adapter.parseCacheUsage(undefined);
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });

       it(`${adapter.provider}: returns zeros for empty object`, () => {
         const result = adapter.parseCacheUsage({});
         expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
       });
     }
   });
   ```

2. Run test: `npx vitest run packages/core/tests/caching/adapter-ordering.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(caching): add cross-adapter ordering consistency tests`

---

### Task 7: Full caching test suite verification

[checkpoint:human-verify]

**Depends on:** Tasks 1-6
**Files:** none (verification only)

1. Run the full caching test suite: `npx vitest run packages/core/tests/caching/`
2. Observe: all tests pass (stability.test.ts + adapter.test.ts + anthropic.test.ts + openai.test.ts + gemini.test.ts + adapter-ordering.test.ts)
3. Run: `npx vitest run packages/core/` to verify no regressions across the core package
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Verify: no TypeScript errors with `cd packages/core && npx tsc --noEmit`

**Expected outcome:** All tests green, no type errors, no regressions.
