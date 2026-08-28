---
schemaVersion: 1
module: 'packages/cli/src/api-craft/phases'
sourceHash: '12255704ee5b0d7d604fae47b2c3d0257ddaaf9bdc2c58c557044b1038813668'
compiledAt: '2026-08-28T01:22:08.714Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

`api-craft/phases/critique` is the LLM-driven judgment stage for API design critique. It takes an API surface (OpenAPI/Swagger document or route/handler definition) paired with an API-design rubric, prompts an LLM to critique the surface against that rubric's bar, and parses the response into a structured finding. The module follows the same fenced-JSON contract as the wider craft family (design-craft, naming-craft, docs-craft, etc.). The core flow is: `critiqueOne()` builds a prompt, calls the LLM, and parses the result; `buildPrompt()` truncates content for cost; `parseFindingFromRaw()` is a pure parser step, allowing callers to reuse/cache results. The system prompt enforces a conservative judgment posture: focus the ceiling (abstraction, naming, evolution), not the floor (validation, docs); default confidence to medium and require a specific, quotable construct to justify "high."

## Invariants

- Confidence policy is critical: Default to 'medium'; only 'high' when you can cite the specific path/method/field/status and name the concrete improvement. 'Low' when you sense a problem but can't justify it from the source alone.
- Null response means no finding: Return null when the rubric does not apply OR the surface already clears the bar. Never invent findings.
- Fenced-JSON contract is shared: Parsing uses the same extractFencedJsonPayload as other craft modules; callers rely on this consistency.
- Content truncation at 8000 chars to control LLM cost; prompt signals truncation to the model.
- Response shape is rigid: tier, impact, confidence, message (all required); exactly three enum values per axis. Malformed or missing fields → null.
- Two-step flow enables reuse: critiqueOne() calls the LLM; parseFindingFromRaw() is pure and can re-parse a cached/modified response without a second LLM call.
- Surface kind is descriptive, not prescriptive: Affects prompt wording but does not gate the judgment; applicability filtering happens in the caller.
- Derived priority is computed post-parse: The finding's derived.priority is always computed from the (tier, impact, confidence) tuple via derivePriority().
- Phase tag is always 'critique': Every finding records phase: 'critique' for traceability across the pipeline.
- No intrinsic scope filtering: The module does not check rubric.appliesTo; callers filter rubrics to match surface.kind before invoking.

## Interface Contract

```ts
export CRITIQUE_SYSTEM_PROMPT
export buildPrompt
export critiqueOne
export parseFindingFromRaw
```

## Dependency Slice

```
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js'
import { derivePriority } from '../../shared/craft/findings/derived.js'
import { LlmProvider } from '../../shared/craft/llm/provider.js'
import { ApiRubric, ApiSurfaceKind } from '../catalog/rubrics/index.js'
import { ApiFinding, Confidence, Impact, Tier } from '../findings/schema.js'
```
