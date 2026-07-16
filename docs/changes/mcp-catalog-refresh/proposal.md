---
title: Refresh the suggested MCP-server catalog to current best-in-class
status: draft
keywords: mcp, integrations, registry, catalog, context7, exa, github-mcp, harness-mcp, freshness
---

# Refresh the suggested MCP-server catalog

## Overview & Goals

`packages/cli/src/integrations/registry.ts` (`INTEGRATION_REGISTRY`) suggests MCP servers to adopters and
feeds the local-agent MCP wiring ([[ollama-backend-mcp-tools]]). The current set — context7,
sequential-thinking, playwright, perplexity, augment-code — has drifted from 2026 best-in-class and misses
servers that directly serve a dev harness. This refresh brings the catalog current and makes it
**freshness-aware** so it doesn't restale (the MCP ecosystem moves monthly).

**Goal:** curate a current, dev-harness-relevant suggested catalog, add per-entry freshness metadata, and
warn when the catalog is stale — without breaking existing adopters (removing a suggestion never touches an
already-installed integration).

**Non-goals (YAGNI):** auto-installing servers; live popularity scraping; a general plugin marketplace;
changing the `IntegrationDef` launch/consumer contract beyond the additive freshness field.

## Decisions made

- **D1 — Keep:** `context7` (still the #1 docs server; verified live in the ollama-mcp e2e) and
  `playwright` (E2E automation). _(Rationale: both current best-in-class, zero-config or widely used.)_
- **D2 — Add `github` (official GitHub MCP), Tier 1.** The harness lives on GitHub (roadmap↔issues, PR
  flows) yet doesn't suggest it. `envVar: GITHUB_PERSONAL_ACCESS_TOKEN`. Launch via the current official
  server — the executor MUST confirm the exact launch (npm `@modelcontextprotocol/server-github` vs the
  GitHub-published `github-mcp-server`) and use the current one; default to the npx package if unsure. This
  is data, not a live-tested path, so an imperfect command does not break CI — but pick the current one.
- **D3 — Add `exa` (agent search), Tier 1**, replacing `perplexity`. `envVar: EXA_API_KEY`, launch
  `npx -y exa-mcp-server`. _(Rationale: Exa is now the most-used agent search server; better structured
  results than perplexity for a coding agent.)_
- **D4 — Add `harness` (harness's own MCP), Tier 0**, first-class. Launch `harness-mcp` (the shipped bin);
  exposes `code_search`/`ask_graph`/`review_changes`/`outcome_eval`/`gather_context` — the harness's own
  code-intelligence + workflow tools, more useful to an agent than a generic code-context server.
  _(Rationale: dogfoods the harness; the highest-value server for harness-native work.)_
- **D5 — Remove suggestions:** `perplexity` (→ exa), `augment-code` (redundant with the harness MCP + graph),
  `sequential-thinking` (marginal now that strong models reason natively). Removal only stops _suggesting_;
  it never uninstalls an adopter's existing config. _(Rationale: keep the catalog sharp.)_
- **D6 — Freshness-aware catalog.** Add `lastReviewed: string` (ISO date) to `IntegrationDef` (optional,
  additive) and a module const `CATALOG_LAST_REVIEWED = '2026-07-16'`. `harness doctor` emits an advisory
  (non-blocking) note when `CATALOG_LAST_REVIEWED` is older than a threshold (e.g. 120 days), pointing at
  this roadmap item. _(Rationale: mirrors [[local-model-discovery-recommendation]]'s recency principle so the
  catalog signals its own staleness instead of silently rotting.)_

## Technical design

- `packages/cli/src/integrations/types.ts` — add optional `lastReviewed?: string` to `IntegrationDef`.
- `packages/cli/src/integrations/registry.ts` — rewrite `INTEGRATION_REGISTRY` to the D1–D5 set; add
  `lastReviewed` per entry and the `CATALOG_LAST_REVIEWED` const. Preserve the `IntegrationDef` shape,
  `tier`/`envVar`/`installHint`/`platforms` conventions, and the Tier-0/Tier-1 comment grouping.
- `packages/cli/src/commands/doctor.ts` — add the freshness advisory (non-blocking) using
  `CATALOG_LAST_REVIEWED`. Follow doctor's existing check/advisory pattern; it must never fail the command.
- Every consumer (`setup.ts`, `integrations/{list,add,remove,dismiss}.ts`) reads the registry generically —
  confirm none hardcodes a removed name (`perplexity`/`augment-code`/`sequential-thinking`); if a test or
  fixture references one, update it.

## Integration Points

- **Entry Points:** `INTEGRATION_REGISTRY` (data), the doctor freshness advisory.
- **Registrations Required:** none beyond the registry data + the additive `lastReviewed` field.
- **Documentation Updates:** wherever the suggested set is documented (search `docs/` for `context7`,
  `perplexity`, `augment-code`, `sequential-thinking`, "suggested MCP", "integrations"); update the list and
  note the freshness field. Regenerate any generated reference (`pnpm run generate-docs`) if the catalog
  feeds it.
- **Knowledge Impact:** concept — _suggested MCP catalog freshness_.

## Success Criteria

- SC1: `INTEGRATION_REGISTRY` contains exactly context7, playwright, github, exa, harness (D1–D5); no
  perplexity/augment-code/sequential-thinking. Unit test asserting the name set.
- SC2: each entry validates against the `IntegrationDef` contract (tier ∈ {0,1}; Tier-1 entries have
  `envVar`; `mcpConfig.command`/`args` present); the `harness` entry is Tier 0 launching `harness-mcp`.
  Existing registry/integration tests stay green (or are updated for the new set).
- SC3: `IntegrationDef.lastReviewed` is populated on every entry; `CATALOG_LAST_REVIEWED` exists.
- SC4: `harness doctor` emits a non-blocking freshness advisory when `CATALOG_LAST_REVIEWED` is older than
  the threshold, and none when fresh. Unit test with an injected/near clock or a threshold boundary.
- SC5: no consumer or test references a removed integration name (grep-clean).

## Implementation Order

- **Phase 1 — Catalog + freshness field.** `lastReviewed` on the type; rewrite the registry (D1–D5) + the
  const; update/repair registry tests (SC1–SC3, SC5).
- **Phase 2 — Doctor advisory + docs.** Freshness advisory in doctor (SC4); doc updates + reference regen.
