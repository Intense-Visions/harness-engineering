# Docs Publish Contract

> The vendor-neutral publishing contract. It defines the four operations every provider adapter MUST implement — draft, attach-media, verify-render, page-tree — and the cross-cutting invariants every adapter inherits: drafts-only, verify-render before "done", authoritative read-back over optimistic success, and stored-format correctness is not rendering correctness. This skill names no provider. Pipelines depend on it; adapters implement it.

## When to Use

- When implementing a new provider adapter and you need the normative operations and invariants to implement against.
- When building a pipeline that needs a stable publishing dependency it can `depends_on` without naming a vendor.
- When you need a single reference for what "done" means for a published target — rendered-correct, not merely stored.
- When deciding how a consumer should behave when no publishing provider is configured (graceful degradation, not a crash).
- NOT when you need the mechanics of a specific provider — those live in a provider-specific publishing adapter, never here.
- NOT when running the proposal pipeline end to end — that is `proposal-pitch`, which depends on this contract.
- NOT when reading or ingesting existing content — that is a connector/ingest concern, not publishing.

## Process

### Iron Law

**An adapter implements all four operations or it is not conformant; a consumer never reports "done" until verify-render passes; and every confirmation is an authoritative read-back, never the caller's optimistic success. Stored-format correctness is not rendering correctness.**

The contract states what an ADAPTER MUST implement and what a CONSUMER (for example, a pipeline) MAY assume. An adapter that implements fewer than all four operations is incomplete. A consumer that trusts a "success" without the adapter's authoritative read-back has proven nothing.

---

### Phase 1: SELECT-ADAPTER — Resolve the Configured Provider

1. Resolve the configured provider adapter (the concrete implementation of this contract) from the shared configuration.
2. If exactly one adapter is configured, bind to it and proceed.
3. If **no adapter is configured**, do NOT crash and do NOT silently no-op. Emit a clear, actionable graceful-degradation message that:
   - Names what is missing (no publishing provider adapter is configured).
   - Names how to configure one (which configuration pointer to set, and that an adapter such as a provider-specific publishing skill must be installed and selected).
4. Only after an adapter is bound may a consumer invoke the remaining operations. Everything downstream is the adapter's implementation of the contract.

### Phase 2: DRAFT — Create a Non-Live Target and Return a Handle

1. Create or update a publish target in a non-live DRAFT state.
2. NEVER publish or promote the target to live — promotion is the owner's action, never the adapter's or the consumer's.
3. Return a **stable handle** to the draft that the consumer can use for every later operation and for reading state back.
4. A consumer MAY assume the returned handle addresses a draft, and only a draft, until an owner explicitly promotes it.

### Phase 3: ATTACH-MEDIA — Attach an Asset and Confirm by Read-Back

1. Attach a media asset to a draft addressed by its handle.
2. Confirm the attachment with an **authoritative read-back** of the draft's actual state — not the caller's optimistic success signal and not the return value of the write call alone.
3. Return the authoritative confirmation (the asset is present in a fresh read of the target), or a failure if the read-back does not show it.
4. A consumer MAY assume an attachment landed only when the adapter returns a read-back confirmation; a bare "success" is not confirmation.

### Phase 4: VERIFY-RENDER — Assert the Rendered Output, Not the Stored Form

1. Assert that the **rendered** output is correct, not merely that it stored:
   - Media actually loaded (no zero-dimension or unresolved assets).
   - Zero broken-media indicators in the rendered output.
   - The intended figure form is present (the asset renders as the figure you meant, not a downgraded placeholder or card).
2. Return an explicit **pass/fail** result. On failure, return the specific failing assertions so the consumer can act on them.
3. Verify-render is what decides "done". Stored-format correctness is not rendering correctness — a target that stored without error can still render broken.

### Phase 5: PAGE-TREE — Children, Ordering, and Identity Round-Trips

1. Create children under a draft parent, and order siblings, using the adapter's provider-native operations.
2. Preserve **provider-native node identity** across full-body round-trips (read → edit → write back). Dropping a retained node's identity makes the provider treat it as new, breaking references, ordering, and anchors.
3. A consumer MAY assume that a round-trip through the adapter keeps retained nodes stable — provided the adapter preserves node identity as the contract requires.

### Cross-cutting invariants (every adapter inherits these)

- **Drafts-only.** No operation may publish or promote a draft to live.
- **Verify-render before "done".** Nothing is done until verify-render returns pass.
- **Authoritative read-back over optimistic success.** Confirmation is a fresh read of actual state, never the caller's optimistic success.
- **Stored-format correctness is not rendering correctness.** A target can store cleanly and still render broken; only verify-render decides done.

### Graceful degradation (what a consumer does with no adapter)

When SELECT-ADAPTER finds no configured adapter, the consumer surfaces the actionable message from Phase 1 (what is missing, how to configure an adapter) and stops the publishing work cleanly. It does not crash, and it does not silently pretend to have published.

## Harness Integration

- **`harness skill run docs-publish`** / **`run_skill`** — invoke this skill.
- **`harness skill validate docs-publish`** — validate this skill's structure and schema.
- **Dependency target.** This contract is the `depends_on` target for pipelines (such as `proposal-pitch`) and the interface that provider-specific publishing adapters implement. Pipelines depend on the contract, never on a vendor; adapters implement the contract.
- **Shared configuration (abstract).** An adapter reads its own provider pointers from the shared company-knowledge tier and documents those keys itself. The generic contract names no provider-specific configuration block — the concrete pointers belong to the adapter, not to this contract. A consumer only needs to know that an adapter must be configured and selected (SELECT-ADAPTER), and how degradation is signalled when one is not.

## Success Criteria

- From this skill alone, an adapter author knows the exact four operations to implement (draft, attach-media, verify-render, page-tree) and the four invariants they inherit.
- From this skill alone, a pipeline author knows what it may assume (a stable draft handle, read-back-confirmed attachments, a pass/fail verify-render, identity-preserving round-trips) and how degradation is signalled when no adapter is configured.
- A conformance check can state, yes/no, whether a given adapter implements all four operations and honors all four invariants.

## Examples

### Example: a consumer publishes a figure through a configured adapter, staying in drafts

1. SELECT-ADAPTER: resolve the configured provider adapter. (If none were configured, the consumer would surface "no publishing adapter configured — set the provider pointer and install an adapter" and stop — it would not crash.)
2. DRAFT: ask the adapter to create a draft target; receive a stable handle `<PAGE_ID>`.
3. ATTACH-MEDIA: attach the figure asset to `<PAGE_ID>`. The adapter performs an authoritative read-back of the draft and confirms the asset is present — the consumer does not trust the write call's bare "success".
4. VERIFY-RENDER: the adapter asserts the rendered draft — media loaded, zero broken-media indicators, the intended figure form present — and returns pass with zero failing assertions. Only now is the figure "done".
5. PAGE-TREE: create a child under `<PAGE_ID>`, order it among its siblings, and round-trip the parent body while the adapter preserves provider-native node identity. Throughout, nothing is ever promoted to live — promotion is the owner's action.

## Gates

- **All four operations or not conformant.** An adapter that implements fewer than draft, attach-media, verify-render, and page-tree is incomplete — a hard stop; do not treat a partial adapter as usable.
- **Drafts-only.** No operation may publish or promote a draft to live. Promotion is the owner's action, never the adapter's or the consumer's.
- **Verify-render is mandatory before "done".** Never report a target done until verify-render returns pass with zero failing assertions.
- **Authoritative read-back over optimistic success.** A consumer must not assume success without the adapter's authoritative read-back; a bare "success" from a write call is not confirmation.
- **Stored is not rendered.** Never equate stored-format correctness with rendering correctness.

## Escalation

- **No adapter configured.** Degrade gracefully: surface the actionable message (no publishing provider adapter configured; which pointer to set; that an adapter must be installed and selected) and stop the publishing work. Do not crash, do not silently no-op.
- **An adapter is missing an operation.** Treat the adapter as non-conformant. Report which of the four operations is missing and hand back; do not route around the gap with ad-hoc provider calls that bypass the contract.
- **Verify-render is unavailable for a target.** You cannot declare the target done. Report that render verification could not run for this target and hand back rather than claiming success on stored-format alone.

## Rationalizations to Reject

| Rationalization                                              | Reality                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| "The pipeline can just call the provider directly."          | That recouples the pipeline to a vendor. Depend on the contract so the next adapter is cheap and the pipeline stays provider-agnostic.      |
| "Three operations are enough — page-tree is optional."       | All four operations are the contract. A partial adapter is not conformant; page-tree is as mandatory as draft.                              |
| "It stored without error, so the target is published-right." | Stored-format correctness is not rendering correctness. Verify-render decides done; a target can store cleanly and still render broken.     |
| "The adapter returned success, so it worked."                | The contract requires an authoritative read-back, not optimistic success. A bare success signal from a write call proves nothing.           |
| "We only have one provider, so we don't need the contract."  | The contract is what keeps the pipeline provider-agnostic and makes the next adapter cheap. One provider today is not one provider forever. |
| "No adapter is configured, so I'll skip publishing quietly." | Degrade with an actionable message naming what is missing and how to configure an adapter. Never crash and never silently no-op.            |
