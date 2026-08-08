# Plan: Docs-Publish Connector (harness.config.json) + Confluence Implementation + Proposal-Pitch Skill

**Date:** 2026-08-07 | **Spec:** docs/changes/confluence-proposal-skills/proposal.md (amended: Technical Design, Integration Points, Success Criteria, Implementation Order) | **Tasks:** 22 | **Time:** ~110 min | **Integration Tier:** large

## Goal

Move the publishing capability from a prose skill to a real **code connector**: author a `DocsPublishConnector` interface + operation/result types + documented invariants in `packages/cli/src/docs-publish/`, a config-driven resolver that reads a new `docsPublish` block from `harness.config.json` with graceful degradation, a `ConfluenceConnector` that codifies the Atlassian mechanics (ADF media-single serialization, page CRUD + move, `data-local-id` preservation, the osascript/FormData attachment recipe as a typed `manual-step-required` result, Playwright-lazy render verification), expose the capability through a `harness docs-publish <op>` CLI command and a `docs_publish` MCP tool, DELETE the two `docs-publish*` skills (dirs, symlinks, command files, catalog rows), and re-edit `proposal-pitch` to invoke the CLI/MCP surface (no `depends_on`, names no vendor) — such that the module typechecks, unit tests pass with an injectable HTTP client (no network), the MCP capability declaration is present, Playwright is an optional peer that degrades cleanly, and every generate/format/arch/changeset gate is green.

## Scope

**In scope:** the `packages/cli/src/docs-publish/` module (`interface.ts`, `resolver.ts`, `connectors/confluence.ts`, `connectors/adf.ts`, `render/verify.ts`, `index.ts`); the `docsPublish` block in `packages/cli/src/config/schema.ts`; the `harness docs-publish` CLI command group (4 subops) under `packages/cli/src/commands/docs-publish/`; the `docs_publish` MCP tool (`packages/cli/src/mcp/tools/docs-publish.ts`) + its 3-edit `server.ts` registration + `tool-capability-declarations.ts` entry; `playwright` as an optional peer dependency in `packages/cli/package.json`; vitest unit tests under `packages/cli/tests/docs-publish/`; DELETION of the `docs-publish` and `docs-publish-confluence` skills (claude-code dirs, the 6 platform symlinks, and the 4 plugin command files); the `proposal-pitch` skill edit (remove `depends_on`, repoint render-stills/publish-drafts phases to the CLI/MCP surface, keep 5 phases + 6 gates, name no vendor); regenerated `docs/reference/{cli-commands,mcp-tools,skills-catalog}.md`; and a changeset.

**Out of scope (per spec Problem Boundary):** additional connectors (Notion/GDocs/Markdown) — the interface is authored so they slot into the resolver registry without touching the pipeline; performing a live publish during this change; automating the headless-impossible attachment upload (it stays a typed manual step by design); shipping a browser binary (Playwright is an optional peer, render-verify degrades with an install message when absent). `tool-tiers.ts` is intentionally NOT edited — `docs_publish` stays out of `core`/`standard` (full-only is the correct default for a write+network tool).

## Grounding (verified against actual code)

- **Graph connector interface is the shape to mirror for the never-throw structured result.** `packages/graph/src/ingest/connectors/ConnectorInterface.ts:4-23`: `HttpClient` is a function type `(url, options?) => Promise<{ ok; status?; json() }>` (`:4-7`); `GraphConnector` has `readonly name` + `readonly source` + a single async op returning a structured `IngestResult` (`:19-23`). Mirror the `readonly name` + never-throw structured-result idiom in `DocsPublishConnector`.
- **`JiraConnector` is the injectable-HttpClient concrete to mirror.** `packages/graph/src/ingest/connectors/JiraConnector.ts:68-75`: `class JiraConnector implements GraphConnector { readonly name = 'jira'; private readonly httpClient; constructor(httpClient?) { this.httpClient = httpClient ?? withRetry((url, options) => fetch(url, options)); } }`. Every op wraps the fetch in `try/catch` and returns a structured error object rather than throwing (`:114-125`, `:228-242`). `ConfluenceConnector` copies this exactly: `constructor(config, httpClient?)`, default `withRetry(fetch)`, no throws. `withRetry` is exported at `packages/graph/src/ingest/connectors/ConnectorUtils.ts:89`.
- **`SyncManager` is the name-keyed-registry + graceful-on-unknown resolver idiom.** `packages/graph/src/ingest/connectors/SyncManager.ts:9` (`private readonly registrations = new Map<...>`), `:22` (`registerConnector`), `:27` (`this.registrations.get(connectorName)`), `:34` (returns a structured `errors: ["Connector \"...\" not registered"]` result rather than throwing on an unknown name). The docs-publish resolver mirrors this: a `Record<string, factory>` registry, `Err(CLIError(...))` on unknown name, never a throw.
- **Agent-backend resolver = "null on unknown = graceful".** `packages/orchestrator/src/agent/backend-resolver.ts:27-34`: `makeBackendResolver(backends)` returns `(name) => backends?.[name] ? createBackend(def) : null`. The docs-publish resolver follows the same "absent → graceful degradation" contract, but returns a typed `Err(CLIError)` (CLI convention) instead of `null`.
- **`backend-factory.ts` is the exhaustive-switch pattern for a discriminated registry.** `packages/orchestrator/src/agent/backend-factory.ts:259-288`: `switch (def.type)` with a `default: { const exhaustive: never = def; throw ... }` guard (`:283-286`), and the nested `serverless` switch repeats it (`:243-246`). The docs-publish resolver registry is a `Record`, not a discriminated switch, but if any future op dispatches on a connector-result discriminant, use this `const exhaustive: never` guard.
- **Config schema is a `.passthrough()` `z.object` with `X: XSchema.optional()` blocks.** `packages/cli/src/config/schema.ts:908` (`export const HarnessConfigSchema = z.object({`), closed with `.passthrough()` conceptually at the module level; optional blocks are e.g. `analysis: AnalysisConfigSchema.optional()` (`:930`) and `design: DesignConfigSchema.optional()` (`:964`). The type is `export type HarnessConfig = z.infer<typeof HarnessConfigSchema>` (`:1084`). Consumers call `resolveConfig(configPath)` from `packages/cli/src/config/loader.ts` (returns `Result<HarnessConfig, CLIError>` — see `check-docs.ts:43-47`).
- **`_registry.ts` is AUTO-GENERATED; command dirs are discovered by their `index.ts` exporting `createXxxCommand(`.** `pnpm run generate-barrel-exports` (root `package.json:33`) scans `commands/` for `export function createXxxCommand(`; `generate:barrels:check` (`package.json:35`) gates it. So the new command lives at `packages/cli/src/commands/docs-publish/index.ts` exporting `createDocsPublishCommand()`. NEVER hand-edit `_registry.ts`.
- **Multi-subop command shape to mirror: `skill/index.ts`.** `packages/cli/src/commands/skill/index.ts:16-27`: `new Command('skill').description(...)` then `command.addCommand(createListCommand()); command.addCommand(createRunCommand()); ...`. `createDocsPublishCommand()` copies this, adding `draft/attach-media/verify-render/page-tree`.
- **Subcommand action shape to mirror: `check-docs.ts`.** `packages/cli/src/commands/check-docs.ts`: each op is `runX(options): Promise<Result<X, CLIError>>` (`:36-110`), and the `.action()` (`:174-214`) resolves globalOpts + output mode, calls `runX`, and on `!result.ok` prints JSON-or-human and `process.exit(result.error.exitCode)` (`:187-194`); on success prints JSON (`--json`) or human via `OutputFormatter`, then `process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED)` (`:196-213`). `ExitCode` (`packages/cli/src/utils/errors.ts:4-20`): `SUCCESS:0`, `VALIDATION_FAILED:1`, `ERROR:2`, `ZERO_DENOMINATOR:3`. `CLIError(message, exitCode)` at `:31-46`.
- **MCP tool shape to mirror: `tools/skill.ts`.** `packages/cli/src/mcp/tools/skill.ts:15-39` exports `runSkillDefinition = { name, description, inputSchema: { type: 'object' as const, properties: {...}, required: [...] } }`; `handleRunSkill(input)` (`:41-159`) returns via `resultToMcpResponse(Ok/Err(...))`. `resultToMcpResponse` (`packages/cli/src/mcp/utils/result-adapter.ts:13`) maps a `Result` to `{ content, isError? }` (`isError: true` on Err at `:29`). Mirror both exports in `tools/docs-publish.ts`: `docsPublishDefinition` + `handleDocsPublish`.
- **MCP registration is exactly 3 edits in `server.ts`.** `packages/cli/src/mcp/server.ts`: (1) import block around `:52-55` (`runSkillDefinition, handleRunSkill, createSkillDefinition, handleCreateSkill`); (2) `TOOL_DEFINITIONS` array at `:277` (push `docsPublishDefinition`, cf. `runSkillDefinition` at `:290`); (3) `TOOL_HANDLERS` record at `:388` (add `docs_publish: handleDocsPublish as ToolHandler`, cf. `run_skill: handleRunSkill as ToolHandler` at `:401`). `ToolHandler` type declared at `:270`.
- **MANDATORY capability declaration or a test fails.** `packages/cli/src/mcp/tool-capability-declarations.ts:33-143` is the authoritative per-tool capability map; a new tool with no entry fails `packages/cli/tests/commands/mcp-list-capabilities.test.ts`. Add `docs_publish: { scopes: ['write'], network: true }` (write = drafts/attach, network = Atlassian REST — mirrors `manage_roadmap: { scopes: ['write'], network: true }` at `:141` and `subscribe_webhook` at `:140`). Header docstring (`:1-30`) documents the write/network signal derivation.
- **Playwright is absent today; add it as an optional peer only.** `packages/cli/package.json` has NO `playwright` anywhere. The optional-peer pattern is `@harness-engineering/intelligence` at `peerDependencies` (`:62-64`) + `peerDependenciesMeta.<pkg>.optional: true` (`:65-69`). Add `playwright` to BOTH blocks; do NOT add it to `dependencies` (`:34-61`) — a hard dep would force a browser download on every `pnpm install`. `render/verify.ts` guards `await import('playwright')` in try/catch and returns `degraded: 'playwright-not-installed'` when it throws.
- **Docs are generated from the BUILT program + tool definitions.** `scripts/generate-docs.mjs`: `cli-commands.md` walks `program.commands`, `mcp-tools.md` uses `getToolDefinitions()`/`TOOL_DEFINITIONS` (`:188`), `skills-catalog.md` loads `agents/skills/claude-code` (`:542`). A prior full `build` is REQUIRED. The MCP→CLI cross-link map `toolToCliCommand` is at `:207-221` (e.g. `run_skill: 'harness skill run'` at `:219`); optionally add `docs_publish: 'harness docs-publish'`.
- **Current skill state (created by the sibling contract-adapter plan; this plan SUPERSEDES and deletes it).** `agents/skills/claude-code/docs-publish/` and `docs-publish-confluence/` exist; symlinks exist under `agents/skills/{codex,cursor,gemini-cli}/{docs-publish,docs-publish-confluence}` (all `120000` → `../claude-code/<skill>`); command files exist at `.claude-plugin/commands/{docs-publish,docs-publish-confluence}.md` and `.cursor-plugin/commands/{docs-publish,docs-publish-confluence}.md`. `proposal-pitch/skill.yaml:48-49` currently declares `depends_on: [docs-publish]`; `proposal-pitch/SKILL.md` currently references "the `docs-publish` contract" throughout (`:3, :10, :40, :45, :63, :78, :90, :91, :97, :116`). ALL of these must change.
- **`generate:plugin` write-mode is DESTRUCTIVE in a worktree.** Per repo memory, `generate:plugin:all` (`package.json:42`) prunes each `commands/` dir. `generate:plugin:check` (`package.json:43`) is READ-ONLY and is the acceptance gate. Reconcile by `git rm`-ing the 4 stale command files + hand-verifying, OR a one-shot write for claude+cursor then keeping only the intended delta — NEVER a blind write-mode run. `[checkpoint:human-verify]` gates this step.
- **Changeset is gated.** `check:changesets` (`package.json:47`, `BASE_REF=origin/main node scripts/check-changesets.mjs`) diffs `packages/<pkg>/src` and requires a `.changeset/*.md` with front-matter `'@harness-engineering/cli': minor` (single quotes) — any literal `*` in prose escaped as `\*`.
- **Node/format/arch hazards.** Repo requires Node 22 (native `better-sqlite3` ABI); if any command throws `MODULE_NOT_FOUND`/ABI, `nvm use 22` and retry — never `--no-verify`. `pnpm format:check` (`package.json:18`) is prettier over `**/*.{ts,tsx,md,json}`. `.harness/arch/baselines.json` must stay byte-identical to `origin/main` (allowance file only for a real regression); restore from `origin/main` if it drifts.
- **CLI test location.** `packages/cli/tests/` (e.g. `tests/commands/`, `tests/mcp/tools/`). New unit tests go under `packages/cli/tests/docs-publish/`. `mcp-list-capabilities.test.ts` lives at `packages/cli/tests/commands/mcp-list-capabilities.test.ts`.

## Observable Truths (Acceptance Criteria)

1. `packages/cli/src/docs-publish/interface.ts` exports `DocsPublishConnector`, `DocsPublishResult<T>`, `AttachMediaResult` (union incl. `{ status: 'manual-step-required'; instructions; verifyWith }`), `VerifyRenderResult` (with `imagesLoaded/mediaCardErrors/mediaSingleCount/mediaGroupCount/degraded?/failures/ok`), and the four op input types; the four invariants (drafts-only, verify-render-before-done, authoritative-read-back, stored≠rendered) are present as doc comments. Typechecks.
2. `resolveDocsPublishConnector(config: HarnessConfig): Result<DocsPublishConnector, CLIError>` returns `Err` (clear "add a docsPublish block" message) when `config.docsPublish` is absent, `Err` naming the valid connector set when the name is unknown, and `Ok(connector)` otherwise — never throws. A `Record<string, factory>` registry maps `'confluence'` → `ConfluenceConnector`.
3. `packages/cli/src/config/schema.ts` accepts `docsPublish: { connector: string; config?: Record<string, unknown> }`; a `harness.config.json` carrying the block parses; an absent block is valid (optional).
4. `ConfluenceConnector implements DocsPublishConnector` with an injectable `HttpClient` (default `withRetry(fetch)`); `draft`/`pageTree` return `DocsPublishResult` with a `confirmedByReadBack` flag; `attachMedia` returns `{ status: 'manual-step-required', instructions, verifyWith }` where `instructions` preserves the osascript/FormData recipe + the three traps verbatim; the draft/publish race notes are code comments; nothing publishes.
5. `packages/cli/src/docs-publish/connectors/adf.ts` always emits a `media-single` ADF node and NEVER `media-group`; a `media-inline` helper exists.
6. `packages/cli/src/docs-publish/render/verify.ts` runs Playwright via a guarded `await import('playwright')` and returns `{ ok:false, degraded:'playwright-not-installed', ... }` when the import throws.
7. `harness docs-publish draft|attach-media|verify-render|page-tree` all run (each resolves config → resolves connector → runs op → prints JSON/human → exits `SUCCESS`/`VALIDATION_FAILED`/`ERROR`); the command is discovered into `_registry.ts` by `generate-barrel-exports`.
8. `docs_publish` MCP tool is registered (import + `TOOL_DEFINITIONS` + `TOOL_HANDLERS` in `server.ts`) and declared `{ scopes:['write'], network:true }` in `tool-capability-declarations.ts`; `pnpm exec vitest run tests/commands/mcp-list-capabilities.test.ts` passes.
9. `packages/cli/package.json` lists `playwright` in `peerDependencies` + `peerDependenciesMeta.playwright.optional=true` and NOT in `dependencies`; `pnpm install` pulls no browser.
10. Unit tests under `packages/cli/tests/docs-publish/` pass with NO network: resolver graceful degradation (absent block, unknown connector, happy path), adf media-single serialization (asserts `mediaSingle`, never `mediaGroup`), attachMedia manual-step shape (recipe + traps in `instructions`), verifyRender `degraded:'playwright-not-installed'` when the import is mocked to throw.
11. The two `docs-publish*` skills are removed: `agents/skills/claude-code/{docs-publish,docs-publish-confluence}` deleted, the 6 platform symlinks removed, the 4 plugin command files removed; `docs/reference/skills-catalog.md` no longer lists either.
12. `proposal-pitch/skill.yaml` has no `docs-publish` in `depends_on` (removed or `[]`); `proposal-pitch/SKILL.md` repoints render-stills/publish-drafts to invoke `harness docs-publish <op>` / the `docs_publish` MCP tool, keeps all 5 phases + 6 gates, keeps its domain-specific Rationalizations, names no vendor; `harness skill validate proposal-pitch` EXIT 0 and it stays `type: rigid`.
13. `.changeset/*.md` present (`'@harness-engineering/cli': minor`); `npx turbo run build`, `pnpm typecheck`, cli `test:coverage`, `pnpm generate:barrels:check`, `pnpm generate:plugin:check`, `pnpm format:check` all green; `.harness/arch/baselines.json` byte-identical to `origin/main`; regenerated `cli-commands.md` + `mcp-tools.md` + `skills-catalog.md` committed.

## File Map

- CREATE `packages/cli/src/docs-publish/interface.ts`
- CREATE `packages/cli/src/docs-publish/resolver.ts`
- CREATE `packages/cli/src/docs-publish/connectors/adf.ts`
- CREATE `packages/cli/src/docs-publish/connectors/confluence.ts`
- CREATE `packages/cli/src/docs-publish/render/verify.ts`
- CREATE `packages/cli/src/docs-publish/index.ts`
- MODIFY `packages/cli/src/config/schema.ts` (+ `docsPublish` block)
- CREATE `packages/cli/src/commands/docs-publish/index.ts`
- CREATE `packages/cli/src/commands/docs-publish/draft.ts`
- CREATE `packages/cli/src/commands/docs-publish/attach-media.ts`
- CREATE `packages/cli/src/commands/docs-publish/verify-render.ts`
- CREATE `packages/cli/src/commands/docs-publish/page-tree.ts`
- CREATE `packages/cli/src/mcp/tools/docs-publish.ts`
- MODIFY `packages/cli/src/mcp/server.ts` (3 edits: import, TOOL_DEFINITIONS, TOOL_HANDLERS)
- MODIFY `packages/cli/src/mcp/tool-capability-declarations.ts` (+ `docs_publish` entry)
- MODIFY `packages/cli/package.json` (+ `playwright` optional peer)
- CREATE `packages/cli/tests/docs-publish/resolver.test.ts`
- CREATE `packages/cli/tests/docs-publish/adf.test.ts`
- CREATE `packages/cli/tests/docs-publish/confluence.test.ts`
- CREATE `packages/cli/tests/docs-publish/verify.test.ts`
- DELETE `agents/skills/claude-code/docs-publish/` and `agents/skills/claude-code/docs-publish-confluence/`
- DELETE (symlinks) `agents/skills/{codex,cursor,gemini-cli}/docs-publish` and `.../docs-publish-confluence` (6 total)
- DELETE `.claude-plugin/commands/{docs-publish,docs-publish-confluence}.md`, `.cursor-plugin/commands/{docs-publish,docs-publish-confluence}.md`
- MODIFY `agents/skills/claude-code/proposal-pitch/skill.yaml` (remove `depends_on`, repoint phase descriptions)
- MODIFY `agents/skills/claude-code/proposal-pitch/SKILL.md` (invoke CLI/MCP surface; drop "docs-publish contract" references; name no vendor)
- REGEN (auto) `packages/cli/src/commands/_registry.ts` (via `generate-barrel-exports`)
- REGEN `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, `docs/reference/skills-catalog.md`
- OPTIONAL MODIFY `scripts/generate-docs.mjs` (add `docs_publish: 'harness docs-publish'` to `toolToCliCommand`)
- CREATE `.changeset/docs-publish-connector.md`

## Phase 1 — Connector module → surfaces → skill deletion → gates

Single cohesive phase. Types/interface/config land before consumers (CLI/MCP); skill deletion + proposal-pitch edit + tests + docs regen come after code compiles. Order is load-bearing: the resolver imports the interface, the connectors implement it, the CLI/MCP surfaces call the resolver, and the docs regen requires a prior build.

### Task 1: Author the `DocsPublishConnector` interface + result types + invariants

**Depends on:** none | **Files:** `packages/cli/src/docs-publish/interface.ts`

Create `interface.ts` from the spec Technical Design shape (proposal.md:142-174). Include:

- `export interface DocsPublishConnector { readonly name: string; draft(input: DraftInput): Promise<DocsPublishResult<DraftHandle>>; attachMedia(input: AttachMediaInput): Promise<AttachMediaResult>; verifyRender(input: VerifyRenderInput): Promise<VerifyRenderResult>; pageTree(input: PageTreeInput): Promise<DocsPublishResult<PageTreeResult>>; }` — mirror the `readonly name` idiom from `ConnectorInterface.ts:19-23`.
- `export type DocsPublishResult<T> = { ok: true; value: T; confirmedByReadBack: boolean } | { ok: false; error: string };` (never-throw structured result, per proposal.md:171-172).
- `export type AttachMediaResult = { status: 'manual-step-required'; instructions: string; verifyWith: string } | { status: 'unsupported'; reason: string };` (proposal.md:154-157).
- `export interface VerifyRenderResult { ok: boolean; imagesLoaded: number; mediaCardErrors: number; mediaSingleCount: number; mediaGroupCount: number; degraded?: 'playwright-not-installed'; failures: string[]; }` (proposal.md:159-168).
- Input types: `DraftInput`, `DraftHandle`, `AttachMediaInput`, `VerifyRenderInput`, `PageTreeInput`, `PageTreeResult` (author minimal fields the ops need — page id/title/parent/body for draft; page id + asset descriptor for attachMedia; url/page id for verifyRender; parent + ordered children for pageTree).
- Re-export the `HttpClient` type shape (define a local `export type HttpClient = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; text(): Promise<string>; json(): Promise<unknown> }>;` mirroring `ConnectorInterface.ts:4-7`, extended with `text()` for read-back).
- Doc comments encoding the four invariants (proposal.md:111-115): drafts-only, verify-render-before-done, authoritative-read-back-over-optimistic-success, stored≠rendered.

Do NOT `import type` from any connector (avoid a cycle). Verify: `pnpm --filter @harness-engineering/cli exec tsc --noEmit` compiles this file (it will still fail on not-yet-created consumers — that is expected until Task 6).

### Task 2: Add the `docsPublish` block to the config schema

**Depends on:** none | **Files:** `packages/cli/src/config/schema.ts`

Add, inside `HarnessConfigSchema` (`:908`) alongside `design: DesignConfigSchema.optional()` (`:964`):

```ts
/** Docs-publish connector selection (`harness docs-publish`) */
docsPublish: z
  .object({ connector: z.string(), config: z.record(z.unknown()).default({}) })
  .optional(),
```

No new type export is required (`HarnessConfig = z.infer<...>` at `:1084` picks it up automatically). Verify: the `docsPublish` field appears on the inferred `HarnessConfig` type; `tsc --noEmit` on schema.ts is clean.

### Task 3: Author `adf.ts` (media-single serialization; never media-group)

**Depends on:** none | **Files:** `packages/cli/src/docs-publish/connectors/adf.ts`

Create ADF helpers (proposal.md:200-201, Decisions §7):

- `export function mediaSingle(attrs: { id: string; collection?: string; width?: number; height?: number }): AdfNode` — returns a `{ type: 'mediaSingle', attrs: { layout }, content: [{ type: 'media', attrs: { type: 'file', id, collection, width, height } }] }` node. NEVER a `mediaGroup`.
- `export function mediaInline(attrs: { id: string; collection?: string }): AdfNode` — the media-inline chip helper.
- A doc comment stating the invariant: this module emits `mediaSingle` (figure form) exclusively; `mediaGroup` (thumbnail-strip form) is never emitted because it is the wrong render intent for a proposal figure.
- Define a minimal `AdfNode` type locally.

Verify: `tsc --noEmit` clean; a grep of the file for `mediaGroup` finds it ONLY in the "never" comment, never in a returned node.

### Task 4: Author the resolver + connector registry (graceful degradation)

**Depends on:** Task 1, Task 2 | **Files:** `packages/cli/src/docs-publish/resolver.ts`

Mirror `SyncManager` (name-keyed map, graceful-on-unknown, `:9/:27/:34`) and `makeBackendResolver` (absent → graceful, `backend-resolver.ts:27-34`):

```ts
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { CLIError, ExitCode } from '../utils/errors.js';
import type { HarnessConfig } from '../config/schema.js';
import type { DocsPublishConnector } from './interface.js';
import { ConfluenceConnector } from './connectors/confluence.js';

type ConnectorFactory = (config: Record<string, unknown>) => DocsPublishConnector;

const REGISTRY: Record<string, ConnectorFactory> = {
  confluence: (config) => new ConfluenceConnector(config),
};

export function resolveDocsPublishConnector(
  config: HarnessConfig
): Result<DocsPublishConnector, CLIError> {
  const block = config.docsPublish;
  if (!block) {
    return Err(
      new CLIError(
        'docsPublish not configured — add a "docsPublish" block ({ connector, config }) to harness.config.json',
        ExitCode.VALIDATION_FAILED
      )
    );
  }
  const factory = REGISTRY[block.connector];
  if (!factory) {
    return Err(
      new CLIError(
        `Unknown docs-publish connector "${block.connector}". Valid connectors: ${Object.keys(REGISTRY).join(', ')}`,
        ExitCode.VALIDATION_FAILED
      )
    );
  }
  return Ok(factory(block.config ?? {}));
}
```

Never throws. Verify: `tsc --noEmit` compiles (needs Task 5's `confluence.ts` to exist — author a stub first if needed, then complete in Task 5).

### Task 5: Author `ConfluenceConnector` (mechanics preserved in code)

**Depends on:** Task 1, Task 3 | **Files:** `packages/cli/src/docs-publish/connectors/confluence.ts`

Mirror `JiraConnector` (`:68-75`, injectable `HttpClient` default `withRetry(fetch)`, per-op try/catch → structured result, no throws). Implement `class ConfluenceConnector implements DocsPublishConnector { readonly name = 'confluence'; constructor(config: Record<string, unknown>, httpClient?: HttpClient) {...} }` with:

- **`draft`** — create/update a Confluence page in DRAFT state via REST (`POST/PUT /wiki/rest/api/content?status=draft`), returning `DocsPublishResult<DraftHandle>` with `confirmedByReadBack` set only after an authoritative GET. Code comments document the draft/publish race: pending-edit-not-fork, stale-editor clobber, tiny-link timing (proposal.md:186-188). Never publishes.
- **`attachMedia`** — returns `{ status: 'manual-step-required', instructions, verifyWith }` (proposal.md:189-194). `instructions` preserves VERBATIM the osascript + FormData recipe: scratch-file JS, `atob`→`File`→`FormData`→`POST /wiki/rest/api/content/{id}/child/attachment?status=draft` with header `X-Atlassian-Token: nocheck`, plus the THREE traps — (1) no large base64 through osascript params, (2) never the `127.0.0.1` literal (use the real host), (3) verify with an authoritative GET. `verifyWith` names the GET/verifyRender check. Preserve the recipe both as the `instructions` payload AND as a code comment block.
- **`verifyRender`** — delegate to `render/verify.ts` (Task 6): drive Playwright to assert `naturalWidth > 0` (imagesLoaded), zero `media-card-error` nodes, count `mediaSingle` vs `mediaGroup` (proposal.md:195-196).
- **`pageTree`** — create children under a draft parent; sidebar order via `PUT /wiki/rest/api/content/{id}/move/{before|after|append}/{target}`; preserve `data-local-id` on retained nodes across full-body round-trips (proposal.md:197-198). Use `adf.ts` for any media node emission.

Injectable `HttpClient` so tests need no network. Verify: `tsc --noEmit` clean.

### Task 6: Author `render/verify.ts` (lazy Playwright, guarded degradation)

**Depends on:** Task 1 | **Files:** `packages/cli/src/docs-publish/render/verify.ts`

Implement `export async function verifyRender(input: VerifyRenderInput): Promise<VerifyRenderResult>` (proposal.md:99-101, Decision §4). Guard the optional peer:

```ts
let pw: typeof import('playwright');
try {
  pw = await import('playwright');
} catch {
  return {
    ok: false,
    imagesLoaded: 0,
    mediaCardErrors: 0,
    mediaSingleCount: 0,
    mediaGroupCount: 0,
    degraded: 'playwright-not-installed',
    failures: [
      'Install playwright to enable render-verify: pnpm add -D playwright && npx playwright install chromium',
    ],
  };
}
```

On success, launch a headless browser, load the page, and assert: every `img` has `naturalWidth > 0` (imagesLoaded), zero `[data-media-card-error]` / `.media-card-error` nodes (mediaCardErrors must be 0), count `[data-node-type="mediaSingle"]` (mediaSingleCount) vs `mediaGroup` (mediaGroupCount, expected 0). `ok = mediaCardErrors === 0 && imagesLoaded > 0 && mediaGroupCount === 0`. Verify: `tsc --noEmit` clean (playwright types resolved via the peer; if types are missing, use `await import('playwright')` with a local minimal type or `// @ts-expect-error` guarded import — but prefer the peer types).

### Task 7: Author the barrel `index.ts`

**Depends on:** Task 1, Task 4, Task 5, Task 6 | **Files:** `packages/cli/src/docs-publish/index.ts`

Re-export the public surface: `export * from './interface.js'; export { resolveDocsPublishConnector } from './resolver.js'; export { ConfluenceConnector } from './connectors/confluence.js'; export * from './connectors/adf.js'; export { verifyRender } from './render/verify.js';`. Verify: `tsc --noEmit` clean.

### Task 8: Author the `docs-publish draft` subcommand

**Depends on:** Task 7 | **Files:** `packages/cli/src/commands/docs-publish/draft.ts`

Mirror `check-docs.ts` (`runX(): Promise<Result<..,CLIError>>` + `.action` resolving config/output-mode, `process.exit(...)`). Implement `runDocsPublishDraft(options): Promise<Result<DraftResult, CLIError>>` that: `resolveConfig(options.configPath)` → on `!ok` return it; `resolveDocsPublishConnector(config)` → on `!ok` return it; call `connector.draft(input)`; map the `DocsPublishResult` to a `Result<_, CLIError>`. Export `createDraftCommand(): Command` (`new Command('draft')`, options for page id/title/parent/body-file, `.action` prints JSON via `--json` or human via `OutputFormatter`, `process.exit(ExitCode.SUCCESS | VALIDATION_FAILED | ERROR)`). Verify: `tsc --noEmit` clean.

### Task 9: Author `attach-media`, `verify-render`, `page-tree` subcommands

**Depends on:** Task 7 | **Files:** `packages/cli/src/commands/docs-publish/attach-media.ts`, `verify-render.ts`, `page-tree.ts`

Each mirrors Task 8's shape (`runX` + `createXCommand`):

- `attach-media.ts` — calls `connector.attachMedia(input)`; when `status==='manual-step-required'`, prints the `instructions` + `verifyWith` (human) or the full JSON (`--json`), exits `SUCCESS` (surfacing a manual step is not a failure).
- `verify-render.ts` — calls `connector.verifyRender(input)`; exits `SUCCESS` when `ok`, `VALIDATION_FAILED` when `!ok` (incl. `degraded`), prints the counts + failures.
- `page-tree.ts` — calls `connector.pageTree(input)`; exits per `DocsPublishResult.ok`.

Verify: `tsc --noEmit` clean.

### Task 10: Author the command group `index.ts`

**Depends on:** Task 8, Task 9 | **Files:** `packages/cli/src/commands/docs-publish/index.ts`

Mirror `skill/index.ts:16-27`:

```ts
import { Command } from 'commander';
import { createDraftCommand } from './draft';
import { createAttachMediaCommand } from './attach-media';
import { createVerifyRenderCommand } from './verify-render';
import { createPageTreeCommand } from './page-tree';

export function createDocsPublishCommand(): Command {
  const command = new Command('docs-publish').description(
    'Publish docs to a configured provider (draft-first)'
  );
  command.addCommand(createDraftCommand());
  command.addCommand(createAttachMediaCommand());
  command.addCommand(createVerifyRenderCommand());
  command.addCommand(createPageTreeCommand());
  return command;
}
```

The `export function createDocsPublishCommand(` signature is what `generate-barrel-exports` scans for. Verify: `tsc --noEmit` clean (do NOT hand-edit `_registry.ts` — Task 17 regenerates it).

### Task 11: Author the `docs_publish` MCP tool

**Depends on:** Task 7 | **Files:** `packages/cli/src/mcp/tools/docs-publish.ts`

Mirror `tools/skill.ts:15-39` + `:41-159`. Export:

```ts
export const docsPublishDefinition = {
  name: 'docs_publish',
  description:
    'Publish docs to a configured provider (draft-first): draft, attach-media, verify-render, page-tree.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      op: {
        type: 'string',
        enum: ['draft', 'attach-media', 'verify-render', 'page-tree'],
        description: 'Operation to run',
      },
      path: { type: 'string', description: 'Project root path for config resolution' },
      // ...op-specific fields (pageId, title, parent, body, url, assetPath, children)
    },
    required: ['op'],
  },
};

export async function handleDocsPublish(input: {
  op: string;
  path?: string;
  [k: string]: unknown;
}) {
  // resolveConfig → resolveDocsPublishConnector → dispatch on op → resultToMcpResponse(Ok/Err)
}
```

Dispatch on `input.op` to the connector op; return via `resultToMcpResponse` (`isError: true` on Err / not-configured). Verify: `tsc --noEmit` clean.

### Task 12: Register the MCP tool in `server.ts` (3 edits)

**Depends on:** Task 11 | **Files:** `packages/cli/src/mcp/server.ts`

Exactly three edits (grounding cites the anchors): (1) add `import { docsPublishDefinition, handleDocsPublish } from './tools/docs-publish.js';` near the skill import block (`:52-55`); (2) add `docsPublishDefinition` to the `TOOL_DEFINITIONS` array (`:277`, cf. `runSkillDefinition` at `:290`); (3) add `docs_publish: handleDocsPublish as ToolHandler,` to the `TOOL_HANDLERS` record (`:388`, cf. `run_skill` at `:401`). Verify: `tsc --noEmit` clean.

### Task 13: Add the MCP capability declaration (mandatory)

**Depends on:** Task 12 | **Files:** `packages/cli/src/mcp/tool-capability-declarations.ts`

Add `docs_publish: { scopes: ['write'], network: true },` to `TOOL_CAPABILITY_DECLARATIONS` (`:33-143`) in the network section alongside `manage_roadmap` (`:141`). Rationale comment: `// drafts/attaches (write) via Atlassian REST (network)`. Do NOT edit `tool-tiers.ts` (full-only is correct for a write+network tool). Verify: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/mcp-list-capabilities.test.ts` passes.

### Task 14: Declare `playwright` as an optional peer

**Depends on:** none | **Files:** `packages/cli/package.json`

Mirror the `@harness-engineering/intelligence` optional-peer pattern (`:62-69`). Add to `peerDependencies`: `"playwright": "^1.48.0"` (or the repo's current major); add to `peerDependenciesMeta`: `"playwright": { "optional": true }`. Do NOT add it to `dependencies` (`:34-61`). Verify: `pnpm install` at repo root succeeds and pulls no browser binary; `git diff packages/cli/package.json` shows changes only in the two peer blocks.

### Task 15: Unit tests — resolver, adf, attachMedia shape, verifyRender degradation

**Depends on:** Task 7 | **Files:** `packages/cli/tests/docs-publish/resolver.test.ts`, `adf.test.ts`, `confluence.test.ts`, `verify.test.ts`

Author vitest suites (all with an injectable `HttpClient` mock — NO network):

- `resolver.test.ts` — (a) absent `docsPublish` block → `Err` with the "add a docsPublish block" message; (b) unknown connector name → `Err` listing valid connectors; (c) `{ connector: 'confluence' }` → `Ok` with a `ConfluenceConnector` (`.name === 'confluence'`).
- `adf.test.ts` — `mediaSingle(...)` returns a node with `type === 'mediaSingle'` and NEVER `mediaGroup`; assert `JSON.stringify(node)` does not contain `"mediaGroup"`.
- `confluence.test.ts` — `attachMedia(...)` returns `status: 'manual-step-required'`; assert `instructions` contains the recipe markers (`X-Atlassian-Token`, `FormData`, `attachment?status=draft`) AND the three traps (base64/params, `127.0.0.1`, authoritative GET); assert `draft` never issues a publish call (inspect the mock HttpClient calls — no `status=current` promotion).
- `verify.test.ts` — mock `await import('playwright')` to throw (e.g. `vi.mock('playwright', () => { throw new Error('not installed'); })` or inject an import that rejects) → `verifyRender` returns `{ ok:false, degraded:'playwright-not-installed', failures:[...] }`.

Verify: `pnpm --filter @harness-engineering/cli exec vitest run tests/docs-publish` passes.

### Task 16: Build the CLI (required before barrel + doc regen)

**Depends on:** Task 10, Task 13, Task 14 | **Files:** (build output only)

Run `npx turbo run build` (full — doc regen walks the BUILT program). If a `MODULE_NOT_FOUND`/ABI error appears, `nvm use 22` and retry; never `--no-verify`. Verify: build exits 0; `pnpm --filter @harness-engineering/cli exec tsc --noEmit` is clean across the whole package.

### Task 17: Regenerate barrel exports (`_registry.ts`)

**Depends on:** Task 16 | **Files:** `packages/cli/src/commands/_registry.ts` (auto)

Run `pnpm run generate-barrel-exports`. Verify: `_registry.ts` now imports/exports `createDocsPublishCommand`; `pnpm run generate:barrels:check` exits 0. Do NOT hand-edit `_registry.ts`.

### Task 18: Delete the two `docs-publish*` skills (dirs + symlinks + command files)

**Depends on:** none | **Files:** `agents/skills/claude-code/docs-publish/`, `agents/skills/claude-code/docs-publish-confluence/`, 6 platform symlinks, 4 plugin command files

`git rm -r`:

- `agents/skills/claude-code/docs-publish` and `agents/skills/claude-code/docs-publish-confluence`
- `agents/skills/{codex,cursor,gemini-cli}/docs-publish` and `agents/skills/{codex,cursor,gemini-cli}/docs-publish-confluence` (6 symlinks)
- `.claude-plugin/commands/docs-publish.md`, `.claude-plugin/commands/docs-publish-confluence.md`
- `.cursor-plugin/commands/docs-publish.md`, `.cursor-plugin/commands/docs-publish-confluence.md`

Verify: `git status` shows all 12 paths staged for deletion; `find agents/skills -name 'docs-publish*'` returns nothing.

### Task 19: Re-edit `proposal-pitch` to invoke the CLI/MCP surface

**Depends on:** Task 18 | **Files:** `agents/skills/claude-code/proposal-pitch/skill.yaml`, `agents/skills/claude-code/proposal-pitch/SKILL.md`

- `skill.yaml`: remove the `depends_on: [docs-publish]` block entirely (`:48-49`) or set `depends_on: []`; repoint the `render-stills` (`:36-38`) and `publish-drafts` (`:39-41`) phase descriptions from "the docs-publish contract" to "the `harness docs-publish` CLI command / `docs_publish` MCP tool"; keep all 5 phases, `type: rigid`, `tier: 2`, `platforms: [claude-code]`; update the top `description` (`:3`) to drop "Composes the docs-publish contract".
- `SKILL.md`: replace every "the `docs-publish` contract" / "configured provider adapter" reference (`:3, :10, :40, :45, :63, :78, :90, :91, :97, :116`) with an instruction to invoke `harness docs-publish <op>` (or the `docs_publish` MCP tool) for the mechanics. Keep the 5 phases + all 6 gates (drafts-only, render-verify, epistemic labels, defects-tracked, no customer data, no public hosting), keep the domain-specific Rationalizations table, name NO vendor (no `confluence`/`atlassian`/`adf`).

Verify: `harness skill validate proposal-pitch` EXIT 0 (validate BY NAME to avoid unrelated skills); grep the body for `docs-publish` contract-references and vendor tokens → none remain except the CLI command name `harness docs-publish`.

### Task 20: `[checkpoint:human-verify]` Reconcile plugin command files + regenerate docs

**Depends on:** Task 16, Task 17, Task 18, Task 19 | **Files:** `docs/reference/{cli-commands,mcp-tools,skills-catalog}.md`, plugin command dirs, OPTIONAL `scripts/generate-docs.mjs`

**STOP — destructive-step checkpoint.** Do NOT run write-mode `generate:plugin:all` (it prunes worktree `commands/` dirs). The 4 stale plugin command files were already `git rm`-ed in Task 18; confirm no new `docs-publish*` command files need creating (the skills are deleted, so none should exist). Then:

1. (Optional) add `docs_publish: 'harness docs-publish',` to the `toolToCliCommand` map in `scripts/generate-docs.mjs:207-221` for the MCP→CLI cross-link.
2. Run `pnpm run generate-docs` (requires the Task 16 build): regenerates `cli-commands.md` (walks `program.commands` → adds `docs-publish`), `mcp-tools.md` (adds `docs_publish`), `skills-catalog.md` (drops both deleted skills).

Present to the human: the `git diff --stat` of `docs/reference/` + plugin dirs. Wait for confirmation that the plugin reconciliation is correct before proceeding. Verify: `pnpm run generate:plugin:check` exits 0; `cli-commands.md` lists `docs-publish`, `mcp-tools.md` lists `docs_publish`, `skills-catalog.md` lists neither `docs-publish` nor `docs-publish-confluence`.

### Task 21: Write the changeset

**Depends on:** Task 16 | **Files:** `.changeset/docs-publish-connector.md`

Create with front-matter (single quotes, exact):

```md
---
'@harness-engineering/cli': minor
---

Add a config-driven docs-publish connector (`harness.config.json` `docsPublish` block) with a Confluence implementation, a `harness docs-publish` CLI command, and a `docs_publish` MCP tool. Remove the two docs-publish\* skills; `proposal-pitch` now invokes the connector surface.
```

Note the escaped `docs-publish\*` (literal `*` must be escaped for `check:changesets`). Verify: `pnpm check:changesets` exits 0.

### Task 22: `[checkpoint:human-verify]` Final gate sweep + commit

**Depends on:** Task 15, Task 20, Task 21 | **Files:** (verification + commit only)

Run the full Verification section below. `[checkpoint:human-verify]` BEFORE the commit: present the complete `git status` + gate results. On confirmation, stage and commit (do NOT push unless asked): `git add -A && git commit -m "feat(cli): docs-publish connector + Confluence impl + CLI/MCP surface; delete docs-publish skills"`. If a pre-commit hook reformats or mutates `.harness/arch/baselines.json`, restore the baseline from `origin/main` (byte-identical) and re-stage; never `--no-verify`.

## Verification

Run from repo root (Node 22 — `nvm use 22` if any ABI/`MODULE_NOT_FOUND` error appears; never `--no-verify`):

```bash
# 1. Build FIRST (doc regen walks the built program)
npx turbo run build

# 2. Typecheck + unit tests (injectable HttpClient — no network)
pnpm --filter @harness-engineering/cli exec tsc --noEmit
pnpm --filter @harness-engineering/cli exec vitest run tests/docs-publish
pnpm --filter @harness-engineering/cli exec vitest run tests/commands/mcp-list-capabilities.test.ts
pnpm --filter @harness-engineering/cli run test:coverage

# 3. CLI surface exists and runs (all four subops resolve config → connector → op)
node packages/cli/dist/bin/harness.js docs-publish --help
node packages/cli/dist/bin/harness.js docs-publish draft --help
node packages/cli/dist/bin/harness.js docs-publish attach-media --help
node packages/cli/dist/bin/harness.js docs-publish verify-render --help
node packages/cli/dist/bin/harness.js docs-publish page-tree --help

# 4. Generated artifacts reconciled
pnpm run generate-barrel-exports && pnpm run generate:barrels:check
pnpm run generate-docs
pnpm run generate:plugin:check     # READ-ONLY gate — must exit 0

# 5. Skill still valid (by name)
harness skill validate proposal-pitch

# 6. Skills/symlinks/command files gone
test -z "$(find agents/skills -name 'docs-publish*')" && echo "skills removed"
test ! -e .claude-plugin/commands/docs-publish.md && echo "claude cmd removed"

# 7. Changeset + format + arch baseline
pnpm check:changesets
pnpm format:check
git diff --stat origin/main -- .harness/arch/baselines.json    # must print NOTHING

# 8. Repo-wide health
harness validate
harness check-deps
```

Expected: build 0; `tsc --noEmit` clean; all vitest suites pass; the five `--help` invocations print (docs-publish is registered); `generate:barrels:check` + `generate:plugin:check` exit 0; `generate-docs` leaves `cli-commands.md`/`mcp-tools.md`/`skills-catalog.md` updated (docs-publish CLI + docs_publish tool present, both deleted skills absent); `harness skill validate proposal-pitch` EXIT 0; the two find/test guards echo their success lines; `check:changesets` + `format:check` clean; the arch-baseline diff prints nothing; `harness validate` + `harness check-deps` pass.

## Checkpoints

- **Task 20** `[checkpoint:human-verify]` — before the (never blind) plugin reconciliation; confirm the `docs/reference/` + plugin-dir diff and that `generate:plugin:check` is 0.
- **Task 22** `[checkpoint:human-verify]` — before commit; confirm the full gate sweep and `git status`.

## Notes

- **Ordering is load-bearing:** interface + schema (Tasks 1-2) → adf/resolver/connector/verify/barrel (Tasks 3-7) → CLI + MCP surfaces + capability + peer (Tasks 8-14) → build (Task 16) → barrels (Task 17) → skill deletion + proposal-pitch edit (Tasks 18-19) → docs regen + reconcile (Task 20) → changeset (Task 21) → gate + commit (Task 22). Tests (Task 15) can run as soon as the barrel (Task 7) exists.
- **Never-throw everywhere:** the resolver returns `Err`, connector ops return `DocsPublishResult`/`AttachMediaResult`/`VerifyRenderResult`, verifyRender degrades — matching the graph-connector and agent-backend idioms cited in Grounding.
- **This plan supersedes the sibling `2026-08-07-docs-publish-contract-adapter-plan.md`** (whose artifacts are present in the worktree and are DELETED here by Task 18).
