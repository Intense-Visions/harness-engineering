---
slug: 'duplication-vendored-build-cache-glob'
milestone: 'v5.0 — Enforcement Hardening'
order: 225
---

### A vendored-build-cache ignore glob for DEFAULT_DUPLICATION_CONFIG, generalized beyond vitepress

- **Status:** planned
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "A vendored-build-cache glob for `DEFAULT_DUPLICATION_CONFIG.ignorePatterns`, generalized beyond vitepress." Measured during the Phase 3 precision audit: `docs/.vitepress/cache/deps_temp_*` is a Vite dependency pre-bundle — vendored generated output nobody will ever refactor — and the classes it composes are false positives for any operator. This repository closes it locally through its own `entropy.excludePatterns`, which is why Scope C reports 96 classes where Scope B reports 98; an adopter gets no such protection from the shipped defaults. The reason this was NOT done inside the feature is recorded with it: the honest generalization (vendored dependency pre-bundles across build tools, not a vitepress special case) is a shape this repository alone cannot observe, and a default `ignorePatterns` entry ships to every adopter, so a one-repo sample is the wrong evidence base for it. Related precision note: the real files carry no generated-file marker (only an `eslint-disable` for vendored tooling), so marker-based detection is not available either.
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
