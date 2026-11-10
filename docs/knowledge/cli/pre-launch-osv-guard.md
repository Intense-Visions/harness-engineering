---
type: business_process
domain: cli
tags: [security, supply-chain, osv, malware, mcp, mcp-guard, hermes-phase-2]
phase: hermes-phase-2
---

# Pre-launch OSV malware guard

**Phase:** Hermes Phase 2 — Custom Maintenance Jobs
**Related ADR:** `docs/knowledge/decisions/0015-hermes-phase-2-custom-maintenance-jobs.md`

Phase 2 adds a real-time supply-chain guard between operators editing
`.mcp.json` and host CLIs (Claude Code, Cursor, etc.) launching MCP/npx
packages. The existing periodic `harness:supply-chain-audit` skill keeps
working; this surface closes the gap between "operator clicks add" and
"OSV.dev says this exact name has a `MAL-*` advisory active right now."

## Components

- `packages/core/src/security/osv-client.ts` — `createOsvClient()`
  factory. Queries `https://api.osv.dev/v1/query`, caches results at
  `.harness/cache/osv/<eco>-<name>@<version>.json` with a 24h TTL.
  Uses Node 20+'s `globalThis.fetch` — no new runtime dependency.
- `packages/cli/src/commands/mcp-guard.ts` — `harness mcp-guard check`
  CLI subcommand. Reads `.mcp.json`, iterates the `mcpServers` map,
  extracts each `npx`-launched `<pkg>[@<version>]` argument, and queries
  the client.

## Behavior

```
$ harness mcp-guard check
Checking MCP servers against OSV.dev advisories...

  ✓ harness        harness@local
  ✓ fs             @modelcontextprotocol/server-filesystem@1.0.0
  ✗ untrusted-svr  fake-mcp-pkg@2.0.0
      MAL-2026-0042 — Malicious package: credential exfil via postinstall
```

Exit codes:

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | All checked packages are clean (or abstained without `--strict`)      |
| 1    | Usage error (bad flag)                                                |
| 2    | One or more packages carry an active `MAL-*` advisory                 |
| 3    | `--strict` only: abstained — `.mcp.json` unparseable, nothing checked |

The non-zero `2` makes it useful as a `pre-mcp-launch` hook from host
plugin manifests (Claude Code, Cursor, Codex, Gemini, OpenCode). The
hook entry calls `harness mcp-guard check --pkg "$PKG"` (or a
project-wide invocation) and aborts launch on non-zero.

## Failure posture

Default: **fail-open**. Network failures emit a `[mcp-guard] OSV query failed`
warning and return as if the package were clean. This keeps operators
unblocked when OSV.dev or the network is unreachable.

`--strict` reverses to **fail-closed**: any network failure or non-2xx
response from OSV becomes a hard error and exits non-zero.

### Abstention on an unreadable `.mcp.json`

A missing `.mcp.json` means there is nothing to check and exits `0`. A
`.mcp.json` that exists but cannot be parsed (invalid JSON, or a top level
that is not an object) is different: the guard verified nothing, so it
**abstains** rather than reporting clean. The result carries
`abstained: { reason }` with `ok: false`, and the human output prints
`ABSTAINED: <path> exists but could not be parsed (<error>) — nothing was
verified.` to stderr. Under the default fail-open posture it still exits
`0`; with `--strict` it exits `3` (`ExitCode.ZERO_DENOMINATOR`, "examined
nothing"), which is distinct from both a clean pass and a malicious match.

## Cache

- Location: `.harness/cache/osv/`
- Filename: `{ecosystem}-{sanitizedName}@{version}.json`
- TTL: 24h (configurable via `osvGuard.cacheTtlHours` in
  `harness.config.json`).
- Invalidation: `harness mcp-guard cache clear` removes the directory.

Cache writes are best-effort: if the cache directory is unwritable, the
guard continues using the network on every query.

## Classification

Advisories are classified by ID prefix:

- `MAL-*` → `malicious` (blocking)
- Anything else (`GHSA-*`, `CVE-*`, etc.) → `other` (surfaced, not blocking)

The `malicious` set drives the non-zero exit; `other` advisories are
shown as a yellow count so operators can audit independently.

## Coexistence with existing primitives

- `SEC-MCP-004` (static rule) flags `npx -y` as a typosquatting vector at
  scan-time. This stays; the OSV guard is the runtime complement.
- `harness:supply-chain-audit` (skill) runs broader npm-ecosystem audits.
  This stays; the OSV guard is the narrow, real-time MCP/npx surface.

## See also

- `docs/knowledge/orchestrator/custom-maintenance-jobs.md`
- `docs/changes/hermes-phase-2-custom-jobs/proposal.md`
