---
title: Wire canary into harness-tdd (RED-phase generation) and harness-verify (registry command discovery)
status: proposed
created: 2026-08-07
keywords:
  [
    canary,
    tdd,
    verify,
    framework-registry,
    command-discovery,
    red-phase,
    adapter,
    graceful-degradation,
    detect-and-offer,
  ]
depends_on:
  - 'Canary Adapter (packages/intelligence/src/adapters/canary.ts) + ADR-0039'
  - 'canary_probe / canary_recommend_framework MCP tools'
---

# Wire canary into harness-tdd (RED-phase generation) and harness-verify (registry command discovery)

## Overview

Two small, independent harness→canary wirings that reuse the established Canary Adapter seam (ADR-0039): a total, gracefully-degrading boundary in `packages/intelligence/src/adapters/canary.ts` that execs the deterministic `canary` CLI and is reached by markdown skills only through thin MCP tools. Both wirings degrade to today's behavior when canary is absent — never an error, never a hard dependency.

1. **harness-verify — registry-truth command discovery.** Phase 1 DETECT currently guesses test/lint/typecheck commands from `package.json` / `Makefile` heuristics. Canary's framework registry is an authoritative framework→run-command map with detection metadata (`file_extensions`, `execution_command`, `ci_flags`). Extend the adapter with a `listFrameworks()` method and add one MCP tool that performs deterministic detection + command resolution, so DETECT consults registry truth **before** falling back to heuristics.

2. **harness-tdd — canary-aware RED phase.** The RED-phase "write the failing test" step is freehand and canary-unaware. Add a detect-and-offer branch (the B' pattern): probe canary; when present, offer the generative `/canary-write-test` skill to author the failing test, and `canary_recommend_framework` when no framework is configured. When canary is absent, fall back to today's freehand authoring with a one-line nudge.

### Goals (in scope)

1. **Registry-truth over heuristics** — harness-verify resolves the per-framework run command from canary's registry when canary is available, filling the `{file}` placeholder and appending `ci_flags` in CI contexts.
2. **Canary-aware RED phase** — harness-tdd offers canary generation for the first failing test, and framework recommendation when none is configured.
3. **Graceful degradation everywhere** — both skills behave exactly as today when canary is absent, the binary is missing, or output is malformed.
4. **Reuse and extend one seam** — all new runtime access flows through the single `CanaryAdapter` boundary + thin MCP tools, so the sibling results-ingestion work can add its own method/tool to the same seam without a new integration pattern.

### Non-goals (YAGNI)

- Re-implementing canary's registry, classifier, or generator in TypeScript.
- Making canary required on any surface.
- Wiring canary into lint/typecheck discovery (this iteration is test-command discovery only; the registry is a test-framework map).
- Ingesting canary run history / structured test results (sibling initiative — this proposal only makes the seam reusable for it).

### Assumptions

- **Runtime: Node.js** — the adapter execs via `node:child_process` (`execFile`) through the existing `CanaryExec` seam; no browser/edge runtime.
- **canary availability is environment-dependent** — "available" requires the `canary` bin on PATH and a working native binary (postinstall may be skipped/offline/unsupported-platform per ADR-0039); every path treats absence as the common case.
- **The registry is a test-framework map** — command discovery covers the test command only; lint/typecheck discovery keeps today's heuristics.

### STRATEGY.md grounding

- Advances **Multi-client portability** (`STRATEGY.md#tracks`) — the dependency stays optional; CI and non-test surfaces are unaffected when canary is absent.
- Advances **Full-lifecycle reach** — deepens the design→plan→code→verify loop by grounding both the RED step and the verify gate in an authoritative external source instead of freehand guesses.

## Decisions made

| #   | Decision                                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Runtime access = call the installed canary CLI at runtime through the existing adapter (Option a).** NOT vendoring a pinned `registry.json` (b) and NOT reading a discoverable install path (c).                | The Canary Adapter + MCP-tool boundary (ADR-0039, `docs/knowledge/intelligence/canary-adapter.md`) is the settled, precedented way harness talks to canary. It is total and gracefully-degrading. Vendoring a copy (b) forks the registry and rots silently; probing install paths (c) reinvents the adapter's exec/degrade logic. Option (a) preserves one boundary, one degrade taxonomy, one place to absorb CLI drift. **This is not a genuine fork — precedent makes (a) clearly correct.** |
| D2  | **The seam is reusable for results ingestion**: every new canary capability adds exactly one total adapter method + one thin MCP tool. No new integration pattern.                                                | The sibling results-ingestion work adds a `readHistory()`-style method + tool to the same boundary. Designing D1 as "one method + one tool per capability" makes that additive, not a rewrite.                                                                                                                                                                                                                                                                                                   |
| D3  | **harness-verify gets a dedicated MCP tool `canary_discover_test_command`** (not an extension of `canary_probe`'s payload).                                                                                       | Detection (matching a file against `file_extensions`) and command resolution (filling `{file}`, appending `ci_flags`) are deterministic — they belong in TypeScript, not LLM prose (Principle 7). A dedicated tool keeps `canary_probe` a pure availability check and matches the one-method-one-tool convention.                                                                                                                                                                                |
| D4  | **harness-tdd wiring is skill-body-only** — it reuses `canary_probe`, `canary_recommend_framework`, and the generative `/canary-write-test` plugin skill. No new adapter method.                                  | RED-phase generation is generative (plugin-dispatch path, per ADR-0039's two-surfaces split), and framework recommendation already has an adapter method + MCP tool. tdd needs wiring, not new code.                                                                                                                                                                                                                                                                                             |
| D5  | **tdd wiring follows the detect-and-offer (B') pattern** with `autoCapture` semantics: `prompt` offers, `auto` (autopilot/headless) generates without prompting, `skip` stays freehand silently.                  | The B' pattern (ADR-0021) is harness's codified answer for soft dependencies on another tool's capability. RED-phase canary generation is exactly a soft dependency: richer when present, useful without.                                                                                                                                                                                                                                                                                        |
| D6  | **Adapter schema is permissive**: `execution_command` is nullable; `status`/`tier` are permissive strings; a framework whose command lacks a `{file}` placeholder is treated as a whole-suite command.            | The live registry has `execution_command: null` catalog-tier frameworks (zap, opentelemetry, tosca) and non-`{file}` commands (stryker, backstop, pact). A strict schema would drop the whole array on one unmodeled value — the existing adapter already chose permissive `severity` for the same reason.                                                                                                                                                                                       |
| D7  | **Command resolution never runs the resolved command inside the adapter or tool.** The tool returns the resolved command string; harness-verify's EXECUTE phase runs it under its existing sandbox/timeout rules. | Keeps the boundary read-only (probe/discover), preserves verify's "no side effects during DETECT" contract, and avoids the adapter shelling arbitrary framework runners.                                                                                                                                                                                                                                                                                                                         |

## Technical design

> Contract grounded against the live canary registry (`list_frameworks`, 27 frameworks). Each entry: `name`, `category`, `categories[]`, `languages[]`, `file_extensions[]`, `execution_command` (nullable), `ci_flags[]`, `status`, `capabilities{scaffold,execute,tier}`, `tier`. Placeholders observed: `{file}` (most), `{target}` (zap/semgrep), and commands with no placeholder (stryker/backstop/pact/mutmut).

### File layout

```
packages/intelligence/
  src/adapters/canary.ts        # + listFrameworks(); + CanaryFrameworkInfo zod schema; + resolveTestCommand() pure helper
packages/cli/
  src/mcp/tools/canary.ts       # + canary_discover_test_command tool definition + handler
  src/mcp/tools/canary.test.ts  # + handler tests (available / degraded / no-match)
  src/mcp/<server registration> # register the new tool
agents/skills/claude-code/harness-verify/SKILL.md   # DETECT: registry truth before heuristics
agents/skills/claude-code/harness-tdd/SKILL.md      # RED: detect-and-offer canary generation
docs/knowledge/intelligence/canary-adapter.md       # document the added method + tool + seam-reuse note
AGENTS.md                                           # note the two new wirings
.changeset/*.md                                     # @harness-engineering/cli + intelligence: minor
```

### Adapter surface additions (`canary.ts`)

```ts
// canary frameworks --json  → { frameworks: CanaryFrameworkInfo[] }
// [PLAN-VERIFIED against the live CLI]: the detail objects live directly under `frameworks`;
// there is NO top-level `details[]` key. Parsing `details[]` would make listFrameworks() a
// silent no-op ([]). The adapter parses `frameworks[]` and returns parsed.data.frameworks.
export const canaryFrameworkInfoSchema = z.object({
  name: z.string(),
  languages: z.array(z.string()).default([]),
  file_extensions: z.array(z.string()).default([]),
  execution_command: z.string().nullable().default(null), // catalog-tier frameworks have none
  ci_flags: z.array(z.string()).default([]),
  status: z.string().default(''), // permissive: preferred | supported | commercial | ...
  tier: z.string().default(''), // full | executable | catalog
});
export type CanaryFrameworkInfo = z.infer<typeof canaryFrameworkInfoSchema>;

export interface CanaryAdapter {
  probe(): Promise<CanaryProbe>;
  recommendFramework(prompt: string): Promise<FrameworkRecommendation>;
  reviewTest(path: string, framework?: string): Promise<CanaryFinding[]>;
  listFrameworks(): Promise<CanaryFrameworkInfo[]>; // NEW — [] when unavailable/malformed
}
```

- `listFrameworks()` execs `canary frameworks --json` through the existing `execCanary` seam and zod-parses `frameworks[]` (the detail objects live directly under `frameworks`; there is no `details[]` key — PLAN-VERIFIED against the live CLI); returns `[]` on any degrade (identical taxonomy to the other methods). Total — never throws.
- **Pure resolution helper** `resolveTestCommand(fw: CanaryFrameworkInfo, file: string, opts?: { ci?: boolean }): string | null` — returns `null` when `execution_command` is `null`; otherwise substitutes `{file}` (and leaves non-`{file}` commands as whole-suite commands), appending `ci_flags` (joined) when `opts.ci`. No `{target}`-only security scanners are resolvable to a test command → `null`. Pure and unit-testable, no exec.

### Detection + the new MCP tool (`canary_discover_test_command`)

Input: `{ files?: string[], ci?: boolean }` (files default to a caller-supplied candidate list; the skill passes representative test-file paths it already detected). Behavior:

1. `probe()`; if degraded → `{ status: 'degraded', reason, frameworks: [] }`.
2. `listFrameworks()`; match each input file against a framework's `file_extensions` by **longest-suffix** match (so `login.spec.ts` matches `spec.ts` before `ts`). Prefer `status: preferred` / `tier: full` on ties.
3. For each matched framework, `resolveTestCommand()` → `{ name, command, matchedFiles[] }` (skip frameworks resolving to `null`).
4. Return `{ status: 'available', frameworks: [...] }`.

The tool is total and returns a JSON body the skill branches on — never errors on canary-absence.

### Skill wiring — harness-verify (DETECT)

Phase 1 DETECT gains a leading step: call `canary_discover_test_command` with the detected test files. If `status: available` and a framework command resolves, use it as the **test** command (registry truth). Otherwise fall through to the existing `package.json` / `Makefile` / convention heuristics unchanged. Lint/typecheck discovery is untouched. The degrade path is silent (no nudge — verify is a mechanical gate, not an interactive skill).

### Skill wiring — harness-tdd (RED, detect-and-offer / B')

RED-phase step "Write the test file" gains a detect-and-offer branch:

- Call `canary_probe`. If `degraded` → freehand authoring exactly as today (one-line nudge in `prompt` mode).
- If `available`:
  - If no framework is configured for the target, call `canary_recommend_framework` with a description of the behavior under test and surface the recommendation.
  - Offer `/canary-write-test` to author the failing test. Under `autoCapture: auto` (autopilot/headless) proceed without prompting; under `prompt` offer the B' option set; under `skip` stay freehand.
- The Iron Law is preserved: the canary-authored test MUST be run and observed to FAIL for the right reason before GREEN. Generation source does not change the RED contract.

## Integration points

### Entry Points

- New adapter method `listFrameworks()` + pure `resolveTestCommand()` helper in `packages/intelligence/src/adapters/canary.ts`.
- New MCP tool `canary_discover_test_command` in `packages/cli/src/mcp/tools/canary.ts` (+ server registration).
- Modified skill playbooks: `harness-verify` (DETECT) and `harness-tdd` (RED).

### Registrations Required

- Register `canary_discover_test_command` in the MCP tool registry/router alongside `canary_probe` / `canary_recommend_framework`.
- `pnpm generate:plugin:check` must pass after skill-body edits (skills-only bodies regenerate plugin artifacts).
- No barrel change unless a new export is added to `adapters/index.ts` (methods hang off the existing `CanaryAdapter`).

### Documentation Updates

- `docs/knowledge/intelligence/canary-adapter.md` — add `listFrameworks` to the surface list, document `canary_discover_test_command`, and record the "one method + one tool per capability, reusable for results ingestion" seam note.
- `AGENTS.md` — note the two new wirings and their degrade behavior.

### Architectural Decisions

- **D1 (runtime access via the existing adapter/CLI, not vendored/probed)** does not warrant a new standalone ADR — it is a direct application of ADR-0039. Record the reuse decision in the knowledge node instead.
- D3/D5 are applications of Principle 7 and ADR-0021 (B'); no new ADR.

### Knowledge Impact

- Extend the Canary Adapter concept node with the registry-discovery capability and the reusable-seam contract ("each new canary capability = one total adapter method + one thin MCP tool").

## Risks & open questions

- **[RESOLVED — Phase 0] CLI `frameworks --json` shape.** The plugin MCP `list_frameworks` returns `{frameworks: string[], details: CanaryFrameworkInfo[]}`, but the **CLI** `canary frameworks --json` (what the adapter execs) returns `{frameworks: CanaryFrameworkInfo[]}` — detail objects directly under `frameworks`, no `details[]` key. Verified live against the 27-framework registry. The adapter parses `frameworks[]` with the permissive zod schema (D6) and degrades to `[]` on mismatch.
- **[RISK] Extension collisions.** `spec.ts`/`test.ts` map to both playwright and vitest. Mitigation: longest-suffix match + `preferred`/`full`-tier tie-break; when still ambiguous, return all matches and let verify prefer the project's configured runner (heuristic fallback still available).
- **[RISK] `{target}` / non-`{file}` / null commands.** Security scanners and catalog-tier frameworks have no resolvable per-file test command. Mitigation: `resolveTestCommand()` returns `null` and the tool omits them.

## Success criteria

1. **Graceful absence** — With canary absent (or binary missing / malformed output), `canary_discover_test_command` returns `{ status: 'degraded', frameworks: [] }`, harness-verify DETECT falls back to heuristics, and harness-tdd RED authors freehand. Neither skill throws or exits non-zero. (Tests: adapter `listFrameworks` degrade cases; tool handler degraded case.)
2. **Registry-truth discovery** — With canary available and a `login.spec.ts` present, the tool resolves `npx --yes playwright test login.spec.ts` (with `--reporter=list` appended under `ci: true`). (Tests: handler asserts resolved command against fixture registry.)
3. **Pure resolution** — `resolveTestCommand` fills `{file}`, appends `ci_flags` only under `ci`, and returns `null` for null/`{target}`-only commands. (Unit tests over representative registry entries.)
4. **Total adapter contract** — `listFrameworks()` resolves to a typed array or `[]`; never throws on absence, non-zero exit, or bad JSON. (Unit tests: mocked exec — success, ENOENT, binary-missing, bad-JSON.)
5. **RED contract preserved** — a canary-authored test is still observed to FAIL before GREEN; the Iron Law and "watch it fail" gate are unchanged in the skill body.
6. **Boundary respected** — only `canary.ts` references the `canary` bin; the existing boundary test still passes with the new method.
7. **Portability intact** — `harness validate`, typecheck, lint, and non-test surfaces pass with canary absent; no new dependency violations.

## Implementation order

- **Phase 0 — CLI shape check (gate).** Confirm `canary frameworks --json` emits a `details[]` array shaped like the captured registry contract; finalize the permissive zod schema. If the CLI verb differs, record it and adjust the exec args only.
- **Phase 1 — Adapter core.** Add `listFrameworks()` + `CanaryFrameworkInfo` schema + pure `resolveTestCommand()` to `canary.ts`. Unit tests (present / absent / binary-missing / non-zero / bad-JSON; resolution edge cases). No skill changes yet.
- **Phase 2 — MCP tool.** Add `canary_discover_test_command` (definition + handler + registration) with detection + resolution. Handler tests (available / degraded / no-match / ambiguous-extension).
- **Phase 3 — Skill wiring.** Wire harness-verify DETECT (registry-before-heuristics) and harness-tdd RED (detect-and-offer). Follow the rich skill format; add domain-specific `## Rationalizations to Reject` rows. `harness skill validate` EXIT 0; `pnpm generate:plugin:check` EXIT 0.
- **Phase 4 — Docs, knowledge, changeset, validation.** Update `canary-adapter.md` + `AGENTS.md`, add the changeset, regenerate docs. `harness validate`, `check-deps`, typecheck/lint/test green with canary both present and absent; boundary check passes.
