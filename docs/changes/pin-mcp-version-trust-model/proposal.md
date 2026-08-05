# Pin MCP Server Version + Document Trust Model

> Replace `@harness-engineering/cli@latest` in every marketplace plugin manifest with an exact pinned version, and document the adopter trust model so updates flow deliberately instead of propagating on every session.

**Keywords:** security, supply-chain, mcp, plugin, marketplace, version-pin, trust-model, provenance

## Overview

Every marketplace plugin manifest launched the Harness MCP server with
`npx -y -p @harness-engineering/cli@latest harness-mcp`. Under `@latest`, each new agent
session pulls the newest npm publish (subject to npx's ~24h cache), so a compromised
publish reaches every active adopter within about a day, with no review step. Pin to an
exact version so adopters run a specific, reviewable build and receive updates
deliberately through the plugin update flow.

### Goals

1. Replace `@latest` with an exact pinned version (`10.2.0`, the current published
   latest) in all four plugin manifests.
2. Keep the pin consistent everywhere it appears, including the README description.
3. Add `docs/security/trust-model.md` explaining what an adopter trusts, what the pin
   protects against, how to verify integrity (npm provenance + version pin), and how
   updates flow.
4. Document the manual pin-bump procedure for maintainers.

### Out of Scope

- Automating the pin bump in CI or wiring it into `changesets` (the manifests are
  hand-maintained; a documented manual bump is the deliberate review gate — automation
  would defeat the purpose and is not warranted yet).
- Pinning transitive npm dependencies (handled by provenance + supply-chain hygiene,
  not a manifest-level version pin).
- Content-hash / integrity-hash pinning (npm provenance is the complementary control).

## Decisions

| Decision                                                            | Rationale                                                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pin to exact `10.2.0`, not a semver range                           | The whole point is that no new publish reaches adopters without a deliberate bump; a range would re-open silent propagation.                                          |
| Bump manually across 5 locations, documented in the trust-model doc | Manifests are hand-maintained (not touched by `generate-plugin.mjs` or `changesets`); the manual bump is the intended human review gate between publish and adopters. |
| Update README MCP/Updates prose to reflect the pin                  | The README previously described `@latest` behavior; leaving it stale would contradict the manifests.                                                                  |

## Verification

- All four manifests and the README reference the pinned version; no `@latest` remains
  in plugin/marketplace configs.
- Manifests remain valid JSON.
- `docs/security/trust-model.md` describes only guarantees the project actually provides
  (exact version pin + npm provenance via OIDC), with an explicit "what the pin does not
  cover" section.
