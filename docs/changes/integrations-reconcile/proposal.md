---
title: Reconcile a project's configured MCP servers against the refreshed catalog
status: draft
keywords: mcp, integrations, catalog, reconcile, sync, consent, doctor, migration
---

# Reconcile a project's configured MCP servers against the refreshed catalog

## Overview & Goals

[[mcp-catalog-refresh]] updates the _suggested_ catalog (`INTEGRATION_REGISTRY`), but an existing project
still has whatever MCP servers it configured earlier — e.g. the now-deprecated `perplexity` /
`augment-code` / `sequential-thinking`, and none of the newly-added `github` / `exa` / `harness`. Refreshing
the suggestions does nothing for a project already set up. This adds a **consent-gated reconcile** so an
existing project can bring its configured servers in line with the refreshed catalog — **only if the
operator agrees**.

**Goal:** `harness integrations sync` — diff the project's configured MCP servers against the current
catalog, show what's newly suggested and what's deprecated, and apply changes **only with explicit
consent**. Report-only by default; never mutate a project's MCP config without agreement.

**Non-goals (YAGNI):** auto-applying on `doctor`/`setup` (the freshness advisory already nudges; this is the
opt-in action); reconciling non-MCP integrations; migrating server _config_ internals (args/env) beyond
add/remove; a GUI.

## Decisions made

- **D1 — New `harness integrations sync` subcommand.** Lives beside `add`/`list`/`remove`/`dismiss` in the
  `integrations` group; reuses their config-read/mutate plumbing. _(Rationale: cohesive, discoverable, no new
  surface area.)_
- **D2 — Report-only by default; consent required to apply.** With no flags it prints the reconcile plan and
  changes NOTHING. `--apply` applies; in a TTY `--apply` prompts per change group (add these? remove these?)
  and applies only the agreed ones; `--yes` applies without prompting (for scripts/CI). Non-interactive
  (no TTY) WITHOUT `--yes` stays report-only even with `--apply`, printing what it _would_ do. _(Rationale:
  "if they agree" — never a silent mutation; safe in automation.)_
- **D3 — Additions respect tiers; removals are explicit.** Newly-suggested **Tier-0** servers (e.g.
  `harness`) can be added directly. **Tier-1** servers (`github`, `exa`) require an env var — sync adds the
  config and surfaces the required env var (via the existing `installHint`), or skips with a note if the
  operator declines; it never invents a secret. **Deprecated** configured servers are offered for removal
  (or `dismiss` to silence future suggestions) — removed only on consent. _(Rationale: matches the existing
  add/remove/dismiss semantics + Tier-1 env contract.)_
- **D4 — Pure reconcile core.** A pure `reconcileIntegrations(configured, registry)` →
  `{ toAdd: IntegrationDef[]; deprecated: ConfiguredServer[]; unchanged: … }` computes the plan with no I/O;
  the command wraps it with read → plan → (consent) → apply. _(Rationale: testable, deterministic; the
  command layer owns IO + consent.)_
- **D5 — Idempotent + honest reporting.** After an apply, a second `sync` reports "in sync, no changes."
  Every applied/declined/skipped item is reported. _(Rationale: predictable; no silent no-ops.)_

## Technical design

- `packages/cli/src/commands/integrations/sync.ts` (new) — `createSyncIntegrationsCommand()`; registered in
  `integrations/index.ts`. Flags: `--apply`, `--yes`, (`--dry-run` is the default). Reads configured servers
  the same way `list.ts` does; computes the plan via the pure core; on consent, applies via the same helpers
  `add.ts`/`remove.ts`/`dismiss.ts` use (do NOT shell out to the subcommands — call the shared functions).
- `packages/cli/src/integrations/reconcile.ts` (new) — the pure `reconcileIntegrations` diff (D4) +
  `ConfiguredServer` shape. `toAdd` = registry entries whose `name` isn't configured; `deprecated` =
  configured servers whose `name` isn't in the registry. Deterministic ordering (registry order for adds,
  configured order for deprecated).
- Consent prompts: reuse whatever interactive-prompt mechanism the CLI already uses (check `setup.ts` /
  existing prompts — likely a small readline/inquirer wrapper); if none exists, a minimal readline
  yes/no. Respect `process.stdout.isTTY` for the non-interactive gate (D2).
- `doctor`'s freshness advisory ([[mcp-catalog-refresh]]) gains a one-line pointer to `integrations sync`.

## Integration Points

- **Entry Points:** `harness integrations sync`; the pure `reconcileIntegrations`.
- **Registrations Required:** register the subcommand in `integrations/index.ts`; regenerate CLI reference
  docs (`pnpm run generate-docs`).
- **Documentation Updates:** `docs/reference/cli*.md` (regenerated) + the integrations/guide doc — document
  `sync`, its report-only default, and the consent flags.
- **Knowledge Impact:** concept — _catalog reconcile / consent-gated integration sync_.

## Success Criteria

- SC1: a project configured with `perplexity`/`augment-code`/`sequential-thinking` → `integrations sync`
  (no flags) reports them as deprecated and `github`/`exa`/`harness` as newly suggested, and **mutates
  nothing** (config byte-identical after). Unit/CLI test.
- SC2: `--yes` applies the plan — adds the missing Tier-0 (`harness`), surfaces the Tier-1 env requirement
  for `github`/`exa`, and removes/dismisses the deprecated — via the shared add/remove/dismiss helpers.
  Test with an injected config store.
- SC3: consent gating — non-interactive WITHOUT `--yes` never mutates (even with `--apply`); a declined
  interactive prompt skips exactly that change. Test with injected TTY/prompt + store.
- SC4: idempotency — after an apply, a second `sync` reports "in sync" with an empty plan.
- SC5: pure `reconcileIntegrations` returns the correct `{toAdd, deprecated}` for representative inputs
  (all-old, all-new, mixed, empty). Pure unit test.

## Implementation Order

- **Phase 1 — Pure reconcile + command (report-only).** `reconcileIntegrations` core + `sync` command that
  reads config, prints the plan, mutates nothing; register + docs. SC1, SC4 (empty plan), SC5.
- **Phase 2 — Consent + apply.** `--apply`/`--yes` + TTY gate + prompts + shared-helper application +
  doctor pointer. SC2, SC3, SC4 (post-apply).
