---
title: Docs-Publish Connector (harness.config.json) + Confluence Implementation + Proposal-Pitch Skill
status: proposed
owner: Chad Warner
keywords:
  [
    docs-publish,
    connector,
    resolver,
    harness-config,
    confluence,
    adf,
    atlassian,
    playwright,
    render-verify,
    cli-command,
    mcp-tool,
    proposal-pitch,
  ]
---

# Docs-Publish Connector (harness.config.json) + Confluence Implementation + Proposal-Pitch Skill

## Overview

The publishing capability moves from a prose "contract skill" to a real **code
connector** configured in `harness.config.json`. A `DocsPublishConnector`
interface defines four operations (`draft`, `attachMedia`, `verifyRender`,
`pageTree`); a resolver reads a new `docsPublish` config block and returns the
configured connector with graceful degradation when none is set. `ConfluenceConnector`
implements the interface, codifying the API-driven Atlassian mechanics in code and
modeling the headless-impossible attachment upload as a typed manual-step result.
`proposal-pitch` stays a skill but now invokes the connector through a real
surface — a `harness docs-publish <op>` CLI command and a `docs_publish` MCP tool —
instead of a prose dependency.

This supersedes the three-skill design (contract skill + adapter skill + pipeline
skill). The two `docs-publish*` skills are **deleted**; their hard-won knowledge is
preserved in code (implementations + structured guidance + comments).

## Problem Boundary

**In scope:**

- `DocsPublishConnector` interface + operation/result types + documented invariants,
  in `packages/cli/src/docs-publish/`.
- A resolver reading `config.docsPublish` (`{ connector, config }`) from
  `harness.config.json`, returning the connector by name with graceful degradation
  (typed error / no-op) when absent or unknown. Modeled on the graph-connector and
  agent-backend resolver idioms.
- `docsPublish` config block added to `packages/cli/src/config/schema.ts`.
- `ConfluenceConnector implements DocsPublishConnector`: page CRUD + sidebar
  tree/move via Atlassian REST; ADF `media-single` serialization (never media-group);
  `verifyRender` via Playwright (lazy/optional). `attachMedia` returns a typed
  `{ status: 'manual-step-required', instructions, verifyWith }` (the Chrome-tab +
  osascript FormData recipe and its three traps preserved as the instructions payload
  and code comments).
- `harness docs-publish <op>` CLI command (subops draft/attach-media/verify-render/
  page-tree) and a `docs_publish` MCP tool as the pipeline's invocation surface.
- `proposal-pitch` skill retained (pipeline + 6 gates), body updated to invoke the
  connector surface; names no vendor.
- Delete the `docs-publish` and `docs-publish-confluence` skills (dirs, symlinks,
  command files, catalog rows).

**Out of scope:** additional connectors (Notion/GDocs/Markdown) — the interface is
authored so they slot in via the resolver without touching the pipeline. Actually
performing a live publish during this change. Automating the headless-impossible
attachment upload (it stays a surfaced manual step by design). Shipping a browser
binary (Playwright is an optional peer; render-verify degrades with a clear
install message when it is absent).

## Decisions Made

1. **Connector is code, not a skill.** A `DocsPublishConnector` TypeScript interface
   with concrete implementations resolved from `harness.config.json` replaces the
   prose contract. This gives real types, testability, and a stable invocation
   surface, and aligns with how the repo already models pluggable backends.

2. **Resolver idiom: name-keyed factory with graceful degradation.** Following the
   agent-backend resolver (`makeBackendResolver` → returns `null` on unknown) and the
   graph `SyncManager` (never-throw, structured error), the docs-publish resolver
   reads `config.docsPublish`, dispatches on `connector` name, and returns a typed
   "not configured" / "unknown connector" result rather than throwing. Consumers
   surface it as an actionable message.

3. **`attachMedia` is a typed manual step, not an automated upload.** The Atlassian
   MCP has no attachment API and the working upload recipe requires a logged-in
   Chrome tab driven by osascript — impossible headless. `attachMedia` returns
   `{ status: 'manual-step-required', instructions, verifyWith }`; the pipeline
   surfaces the instructions (the osascript/FormData recipe + the three traps) to the
   human and later confirms via `verifyRender` / an authoritative read-back. The
   knowledge is preserved verbatim in the instructions payload and code comments.

4. **Playwright is an optional peer with lazy import.** `verifyRender` needs a real
   browser; a hard runtime dep on a publishable package (`@harness-engineering/cli`)
   would force a browser download on every install. Playwright is declared a
   `peerDependency` + `peerDependenciesMeta.optional`, imported via a guarded
   `await import('playwright')` that returns a clear "install playwright to enable
   render-verify" degradation when absent. (Mirrors the existing optional-peer
   pattern for `@harness-engineering/intelligence` and lazy `await import` precedents
   in the MCP server.)

5. **Two invocation surfaces: CLI + MCP.** `harness docs-publish <op>` (for humans /
   scripts) and a `docs_publish` MCP tool (for the skill/agent) both call the same
   resolver + connector. The skill calls the surface; it does not embed mechanics.

6. **Delete the two `docs-publish*` skills.** With the capability in code, a contract
   skill and an adapter skill are redundant. `proposal-pitch` remains the only skill,
   pointing at the CLI/MCP surface.

7. **Invariants encoded, not just stated.** drafts-only (no operation publishes or
   promotes), verify-render-before-done (a page is not "done" until `verifyRender`
   passes), authoritative read-back over optimistic success (results carry a
   confirmed-by-read flag), stored ≠ rendered (only `verifyRender` decides render
   correctness). These live in the interface docs and are honored by each operation.

## Technical Design

### File layout

```
packages/cli/src/docs-publish/
  interface.ts        # DocsPublishConnector + op input/result types + invariants (doc comments)
  resolver.ts         # resolveDocsPublishConnector(config): Result<DocsPublishConnector, CLIError> — graceful
  connectors/
    confluence.ts     # ConfluenceConnector implements DocsPublishConnector (injectable HttpClient)
    adf.ts            # ADF media-single serialization helpers (never media-group)
  render/
    verify.ts         # verifyRender via lazy `await import('playwright')`, guarded degradation
  index.ts            # barrel (interface + resolver + connector registry)
packages/cli/src/config/schema.ts                 # + docsPublish block
packages/cli/src/commands/docs-publish/
  index.ts            # createDocsPublishCommand() addCommand(draft/attach-media/verify-render/page-tree)
  draft.ts attach-media.ts verify-render.ts page-tree.ts
packages/cli/src/mcp/tools/docs-publish.ts         # docsPublishDefinition + handleDocsPublish
packages/cli/src/mcp/server.ts                     # register (import + TOOL_DEFINITIONS + TOOL_HANDLERS)
packages/cli/src/mcp/tool-capability-declarations.ts  # docs_publish: { scopes:['write'], network:true }
agents/skills/claude-code/proposal-pitch/          # EDITED — invoke the surface
# DELETED: agents/skills/claude-code/docs-publish, docs-publish-confluence (+ symlinks + command files + catalog rows)
```

### `DocsPublishConnector` interface (shape)

```ts
export interface DocsPublishConnector {
  readonly name: string; // e.g. 'confluence'
  draft(input: DraftInput): Promise<DocsPublishResult<DraftHandle>>;
  attachMedia(input: AttachMediaInput): Promise<AttachMediaResult>;
  verifyRender(input: VerifyRenderInput): Promise<VerifyRenderResult>;
  pageTree(input: PageTreeInput): Promise<DocsPublishResult<PageTreeResult>>;
}

// attachMedia never silently "succeeds": headless upload is impossible, so it
// returns a manual step the pipeline surfaces to the human.
export type AttachMediaResult =
  | { status: 'manual-step-required'; instructions: string; verifyWith: string }
  | { status: 'unsupported'; reason: string };

// verifyRender is the only authority on render correctness.
export interface VerifyRenderResult {
  ok: boolean;
  imagesLoaded: number; // img with naturalWidth > 0
  mediaCardErrors: number; // must be 0
  mediaSingleCount: number;
  mediaGroupCount: number; // expected 0
  degraded?: 'playwright-not-installed';
  failures: string[];
}
```

Operations follow the never-throw, structured-result idiom (`DocsPublishResult<T>` =
`{ ok: true; value: T; confirmedByReadBack: boolean } | { ok: false; error: string }`).
`draft` targets draft state only. `pageTree` uses the Atlassian move endpoint and
preserves `data-local-id` on retained nodes across round-trips.

### `resolver.ts`

`resolveDocsPublishConnector(config: HarnessConfig): Result<DocsPublishConnector, CLIError>`:
returns an `Err(CLIError('docsPublish not configured — add a "docsPublish" block …'))`
when the block is absent (graceful, exit code carrying), an `Err` naming valid
connectors when the name is unknown, and `Ok(connector)` otherwise. A small registry
`Record<string, (cfg) => DocsPublishConnector>` maps `'confluence'` → `ConfluenceConnector`.

### `ConfluenceConnector` (mechanics preserved in code)

- **draft** → create/update a Confluence page in draft state via REST; documents the
  draft/publish race (pending-edit-not-fork, stale-editor clobber, tiny-link timing)
  as code comments; never publishes.
- **attachMedia** → returns `manual-step-required` with the osascript + FormData recipe
  (scratch-file JS, `atob`→`File`→`FormData`→
  `POST /wiki/rest/api/content/{id}/child/attachment?status=draft` with
  `X-Atlassian-Token: nocheck`) and the three traps (no large base64 through params;
  never the `127.0.0.1` literal; verify with an authoritative GET) as the `instructions`
  payload; `verifyWith` names the GET/verifyRender check.
- **verifyRender** → `render/verify.ts` drives Playwright (lazy import) to assert
  `naturalWidth > 0`, zero `media-card-error`, `mediaSingle` vs `mediaGroup` counts.
- **pageTree** → children under a draft parent; sidebar order via
  `PUT /content/{id}/move/{before|after|append}/{target}`; `data-local-id` preserved.
- **adf.ts** → always emit `media-single`; never `media-group`; `media-inline` chips
  helper.

Injectable `HttpClient` (default `withRetry(fetch)`), mirroring `JiraConnector`, for
testability without network.

### CLI + MCP surface

`harness docs-publish draft|attach-media|verify-render|page-tree` — each subcommand
resolves config, resolves the connector, runs the op, prints JSON (`--json`) or human
output, exits `ExitCode.SUCCESS` / `VALIDATION_FAILED` / `ERROR`. The `docs_publish`
MCP tool takes `{ op, ...opInput }` and dispatches to the same resolver+connector,
returning structured content (and `isError` on failure / not-configured).

### Config schema

```ts
docsPublish: z
  .object({ connector: z.string(), config: z.record(z.unknown()).default({}) })
  .optional(),
```

added to `HarnessConfigSchema`.

## Integration Points

- **Entry Points** — new `harness docs-publish` CLI command (4 subops); new
  `docs_publish` MCP tool; new `packages/cli/src/docs-publish/` module; edited
  `proposal-pitch` skill. Deleted: two `docs-publish*` skills.
- **Registrations Required** — `pnpm run generate-barrel-exports` (auto-discovers the
  new command dir into `_registry.ts`); MCP `server.ts` 3-edit registration +
  `tool-capability-declarations.ts` entry (`docs_publish: { scopes:['write'],
network:true }`) or `tests/commands/mcp-list-capabilities.test.ts` fails; config
  schema block; `pnpm run generate-docs` (regenerates `cli-commands.md` +
  `mcp-tools.md`, requires a prior build); skills-catalog + plugin command files
  updated for the skill deletions.
- **Documentation Updates** — regenerated `docs/reference/cli-commands.md`,
  `docs/reference/mcp-tools.md`, `docs/reference/skills-catalog.md`.
- **Architectural Decisions** — the connector-in-config architecture (Decisions 1–2)
  is the load-bearing decision; it is captured here and mirrors existing
  backend/connector patterns, so no standalone repo-level ADR is required.
- **Knowledge Impact** — introduces the "docs-publish connector interface +
  config-driven resolver" and "headless-impossible upload as typed manual step"
  concepts; retains "ADF media-single vs media-group" and "draft/publish race" as
  Confluence-connector knowledge.

## Success Criteria

- `DocsPublishConnector` interface + resolver + `ConfluenceConnector` exist under
  `packages/cli/src/docs-publish/`, typecheck, and are unit-tested (resolver graceful
  degradation; ADF media-single serialization; attachMedia manual-step shape;
  verifyRender degradation when Playwright absent) — with an injectable HTTP client so
  tests need no network.
- `docsPublish` block parses in `harness.config.json`; absent block degrades with a
  clear message (no crash, no silent no-op); unknown connector names a valid set.
- `harness docs-publish <op>` runs all four subops; `docs_publish` MCP tool registered
  (capability declaration present; `mcp-list-capabilities` test passes).
- Playwright is an optional peer; `verify-render` prints an actionable install message
  when it is absent (no hard dependency; `pnpm install` pulls no browser).
- The two `docs-publish*` skills are removed (dirs, symlinks, command files, catalog
  rows); `proposal-pitch` remains, invokes the surface, names no vendor,
  `harness skill validate proposal-pitch` EXIT 0.
- Atlassian mechanics preserved in code/guidance: media-single serialization, page
  CRUD + move, `data-local-id` preservation, verifyRender DOM assertions, and the full
  osascript/FormData recipe + three traps as the attachMedia instructions.
- `.changeset/*.md` present (`@harness-engineering/cli` minor); `pnpm build`,
  `pnpm typecheck`, `pnpm test` (cli), `pnpm generate-docs --check`,
  `pnpm generate:barrels:check`, `pnpm generate:plugin:check`, `pnpm format:check` all
  green; `.harness/arch/baselines.json` byte-identical to origin/main (allowance file
  only for a real regression).

## Implementation Order

1. Add the `docsPublish` config block to `schema.ts`.
2. Author `docs-publish/` interface + result types + invariants doc comments.
3. Author the resolver (graceful degradation) + connector registry.
4. Author `ConfluenceConnector` + `adf.ts` (media-single) + `render/verify.ts`
   (lazy Playwright); model `attachMedia` as the typed manual step with the recipe +
   traps preserved.
5. Add the `harness docs-publish` CLI command (4 subops) and the `docs_publish` MCP
   tool (+ registration + capability declaration).
6. Delete the two `docs-publish*` skills (dirs/symlinks/command files); update
   `proposal-pitch` to invoke the surface.
7. Unit tests for resolver / adf / attachMedia shape / verifyRender degradation.
8. `playwright` optional peer in `packages/cli/package.json`.
9. Build; regenerate barrels + docs; changeset; run gates (typecheck, cli tests,
   generate:plugin:check, format, arch).
