---
slug: "integrations-reconcile"
milestone: "Intake"
order: 28
---

### Reconcile a project's configured MCP servers against the refreshed catalog (consent-gated)

- **Status:** in-progress
- **Spec:** docs/changes/integrations-reconcile/proposal.md
- **Summary:** [[mcp-catalog-refresh]] refreshes the *suggested* catalog, but an existing project keeps whatever MCP servers it configured earlier (the deprecated perplexity/augment-code/sequential-thinking; none of the new github/exa/harness). Add `harness integrations sync`: diff configured servers vs the current `INTEGRATION_REGISTRY`, show newly-suggested + deprecated, and apply changes **only with the operator's consent** (report-only default; `--apply` prompts per group in a TTY; `--yes` for scripts; non-interactive without `--yes` never mutates). Pure `reconcileIntegrations` core; applies via the existing add/remove/dismiss helpers; Tier-1 adds surface the env requirement, never invent a secret. doctor's freshness advisory points at it.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1035