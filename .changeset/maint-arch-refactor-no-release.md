---

---

Internal complexity refactors (behavior-preserving, full test suite green) across core, graph, intelligence, local-models, orchestrator, and dashboard — reducing cyclomatic complexity / nesting / function length to clear arch-violation findings. No public API change; no release intended for these packages. Also adds `docs/reference/*` indices for doc-coverage. The user-facing check-perf fix releases separately via the cli changeset.
