---
schemaVersion: 1
module: 'packages/cli/src/security-craft/phases'
sourceHash: '0d0a760ba88b612d2b2ddddee663b67c0a3c752390ad80461f20cd98c4f2874b'
compiledAt: '2026-08-28T01:22:09.335Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The `security-craft/phases` module implements the CRITIQUE phase of the security analysis pipeline. It uses an LLM to evaluate security signals (flagged code locations) against security rubrics, producing ranked `SecurityFinding` objects. The phase is deliberately conservative—the system prompt biases confidence toward MEDIUM by default, requiring specific named anti-patterns or visible missing guards to justify HIGH confidence, reducing false-positive noise in reports. Key functions: `critiqueOne` (orchestrates LLM critique), `buildPrompt` (constructs prompts with a 1500-char code window), and `parseFindingFromRaw` (parses fenced JSON to findings, pure function with no LLM call).

## Invariants

- Conservative confidence default: system prompt hard-codes MEDIUM as default; HIGH requires LLM to cite a specific named anti-pattern or missing guard (critical to keep false-positive rates down).
- Fenced JSON response contract: all LLM responses must be valid fenced JSON blocks; literal null string is valid (means no finding); non-objects, non-matching strings, and empty messages are rejected.
- Window-based critique (1500 chars): only ~1500 chars around the signal line sent to LLM, not whole file; reduces noise and keeps prompts manageable, assumes signal context is locally self-contained.
- Pure parseFindingFromRaw function: no LLM dependency enables reuse in two-step flows (LLM calls it once; in-session workflows can reuse it after human annotation without re-invoking provider).
- Field validation before construction: all enum fields (tier, impact, confidence) validated against known variants before SecurityFinding returned; invalid findings fail fast (return null).
- Signal-to-rubric matching assumption: upstream filters rubrics to only those where rubric.appliesToSignals includes signal.kind; no re-checking in critique phase.
- Null is a valid result: LLM response of null or any response failing parsing returns null finding (not an error); no finding is intentionally valid outcome.

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
import { SecurityRubric } from '../catalog/rubrics/index.js'
import { Confidence, Impact, SecurityFinding, SecuritySignal, Tier } from '../findings/schema.js'
```
