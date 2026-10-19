---
slug: 'design-time-reuse-discovery'
milestone: 'v5.0 — Enforcement Hardening'
order: 217
---

### Design-time reuse discovery — "this already exists" before the code is written

- **Status:** planned
- **Spec:** —
- **Summary:** `duplication-detection` catches copy-paste after it lands; the more expensive failure is reinvention — a spec proposing something the codebase already implements. `harness-brainstorming` already instructs "Check for prior art. Has this been partially solved elsewhere?" (SKILL.md step 4) with no tool behind it, and `spec-craft`'s seven rubrics contain no reuse/prior-art rubric, so the check is unenforced prose. Build the retrieval side: at spec time, search for existing implementations of what the spec proposes and surface them to the author before a line is written. This is deliberately a _recall_ problem, not the _detection_ problem `duplication-detection` solves — it needs semantic/Type-4 similarity (the existing `VectorStore` cosine top-K in `@harness-engineering/graph` plus `gather_context` are the likely substrate), and it has no clean ground truth, which is why it is scoped separately rather than bundled. Prevention over cleanup: the highest-leverage DRY intervention is the duplicate that never gets created.
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
