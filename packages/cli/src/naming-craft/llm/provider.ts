/**
 * Re-export design-craft's LLM provider infrastructure. Cross-craft
 * sharing happens through plain re-export until a second non-design
 * craft skill needs differences; at that point the shared interface
 * extracts to `packages/cli/src/shared/llm/` (v2).
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Technical Design → Reusing design-craft infrastructure).
 */

export {
  type LlmProvider,
  type LlmCallCost,
  MockLlmProvider,
  getProvider,
} from '../../design-craft/llm/provider.js';
