---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Incomplete-unit contract: a comprehension unit can now describe the FULL module even when the compiler only saw a lossy SUBSET (finding pnyon#319 — a fail-closed scrubber drops a blocked file, whose absence from the member set otherwise makes the unit's `sourceHash` never match a serve-time hash over the working tree, leaving it permanently source-stale).

- core: `ComprehensionProvenance.incomplete?: string[]` + a `ModuleIdentity` type; an optional `compileModule` `opts.provenance` seam and an optional `ComprehendModuleReader.readModuleIdentity(module)` so a reader that compiles from a subset supplies the full-set `sourceHash`/`members` (parity with the serve-time hash) plus the excluded basenames; `serializeUnit`/`parseUnit` round-trip `incomplete`; `serveGate` refuses an incomplete unit whose full-set hash matches with a distinct `incomplete` reason so a local consumer recompiles a complete unit.
- cli: `get_comprehension` Mode B (trust-remote, no local source) serves an incomplete unit but surfaces the excluded members on the outcome so the caller knows the interface contract is not exhaustive.

Additive and backward-compatible: a complete unit's serialized bytes are unchanged, and every existing reader/consumer is unaffected until it opts into the new seam.
