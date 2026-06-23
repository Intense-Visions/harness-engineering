---
title: Optional canary Integration for harness Test Skills
status: proposed
created: 2026-06-23
keywords: canary, test-advisor, test-craft, optional-dependency, graceful-degradation, adapter, json-contract, portability
depends_on:
  - 'PR #501 (canary skill dispatch in test-advisor audit mode)'
---

# Optional canary Integration for harness Test Skills

## Overview

harness's test surface — `harness-test-advisor`'s Coverage Audit mode and `test-craft` — currently dispatches canary skills opportunistically at runtime (established by PR #501) with **no guarantee canary is installed** and **no programmatic consumption** of its output. The agent reads dispatched prose; harness code sees nothing.

This feature adds canary as an **optional, gracefully-degrading dependency**. A single `CanaryAdapter` boundary execs `canary-test-cli` (via its npm wrapper), parses structured JSON output into harness types, and feeds remediation results back into the test skills. When canary is absent, the skills fall back to today's behavior with a one-line install nudge — never an error.

canary (`canary-test-cli`) is a Python-first (95%) AI test-generation agent distributed via an npm wrapper, pipx, volta, and a Claude Code plugin. harness is a portable TypeScript/pnpm monorepo with a multi-client portability mandate. The optional/graceful design reconciles those two facts.

### Goals (in scope)

1. **Guaranteed availability where it matters** — test skills detect canary presence and behave predictably whether present or absent.
2. **Bundled-install UX** — `canary-test-cli` declared as an `optionalDependency` (precedent: `packages/graph`), so install is one opt-in step, with no forced Python toolchain.
3. **Deeper integration** — harness code parses canary's JSON output rather than only the agent reading dispatched prose.
4. **Portability preserved** — no global Python/canary requirement; CI and non-test surfaces unaffected.

### Non-goals (YAGNI)

- A generic multi-provider test-remediation interface (Approach B from brainstorming) — noted as a future consideration only.
- Making canary required anywhere outside the test skills.
- Re-implementing any canary capability in TypeScript.

### STRATEGY.md grounding

- Advances **Multi-client portability** (`STRATEGY.md#tracks`) by keeping the dependency optional and CI Python-free.
- Advances **Ceiling-raising via LLM judgment** (the test-craft family) by routing test-quality remediation through canary.

## Decisions made

| #   | Decision                                                                                                                                     | Rationale                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| D1  | **Optional dependency with graceful degradation** (not required)                                                                             | Preserves multi-client portability and keeps CI green without a Python runtime; test skills detect absence and nudge.  |
| D2  | **npm wrapper `canary-test-cli` as the channel** (not pipx/volta/plugin)                                                                     | harness already lives in npm/pnpm; `npx canary-test-cli` avoids forcing a Python toolchain on the TS audience.         |
| D3  | **Single `CanaryAdapter` boundary module** — skills never exec the CLI directly                                                              | Mockable seam for tests; one place to absorb canary flag/output drift.                                                 |
| D4  | **Structured JSON contract** — adapter execs `canary-test-cli --json` and parses into harness types                                          | Enables deeper integration (programmatic consumption vs. agent reading prose). **Provisional until Phase 0 spike.**    |
| D5  | **Adapter lives in `packages/intelligence/src/adapters/canary.ts`** following the existing `github`/`jira`/`linear`/`manual` adapter pattern | Precedented home for external-tool adapters; `optionalDependencies` precedent in a sibling package (`packages/graph`). |
| D6  | **Scope limited to the test surface** (`harness-test-advisor` audit mode, `test-craft`)                                                      | YAGNI — no global coupling; canary is only relevant to test generation/review.                                         |
| D7  | **Approach B (generic provider interface) deferred**                                                                                         | Speculative generality against a single known provider; revisit only if a second test-remediation tool appears.        |

## Technical design

> **[IMPORTANT]** All canary CLI flag/output shapes below are `[UNVERIFIED]` pending the Phase 0 spike. They encode the _intended_ contract; the spike confirms or corrects them before implementation proceeds.

### File layout

```
packages/intelligence/
  src/adapters/
    canary.ts          # new — CanaryAdapter boundary
    index.ts           # export canary adapter (barrel)
  package.json         # + optionalDependencies: { "canary-test-cli": "^<pinned>" }
agents/skills/claude-code/harness-test-advisor/SKILL.md   # audit path → adapter + degrade nudge
agents/skills/claude-code/test-craft/SKILL.md             # remediation path → adapter (if applicable)
```

### Adapter surface (`canary.ts`)

Mirrors the existing `github`/`jira`/`linear`/`manual` adapter shape:

```ts
export interface CanaryProbe {
  status: 'available' | 'degraded';
  version?: string;
  reason?: string; // why degraded: not-installed | exec-failed | bad-output
}

export interface CanaryAdapter {
  probe(): Promise<CanaryProbe>; // version check, cached per run
  writeTest(input: WriteTestInput): Promise<CanaryResult>; // canary-write-test --json
  reviewTest(input: ReviewTestInput): Promise<CanaryResult>; // canary-review-test --json
  pickFramework(input: FrameworkInput): Promise<FrameworkRecommendation>;
}
```

- **Exec:** `execFile('npx', ['canary-test-cli', '<subcmd>', '--json', …])` (precedent: `packages/cli/src/mcp/tools/*`). Args array only — no shell string interpolation.
- **Parse:** JSON → typed result; on parse failure or non-zero exit, return `{ status: 'degraded', reason }` rather than throwing.
- **Degradation contract:** every method is total — never throws on canary-absence; callers branch on `status`.

### Skill wiring (`harness-test-advisor` audit mode)

- INVENTORY / QUALITY REVIEW / GAP REPORT phases call `probe()` once. If `degraded`, the skill prints today's behavior plus a one-line "install `canary-test-cli` to enable automated remediation" nudge (no hard stop).
- If `available`, GAP REPORT remediation calls `writeTest`/`reviewTest` and renders parsed findings inline.

### Install mechanism (D2)

`optionalDependencies` in `packages/intelligence/package.json` (precedent: `packages/graph/package.json`). `optional` means a failed install (e.g., no Python under the wrapper) never breaks `pnpm install`.

### Phase 0 spike (gate)

Run `canary-test-cli` locally and confirm: (a) a `--json`/structured mode exists for the three subcommands, (b) the npm wrapper runs without a separate Python install — or document the actual requirement, (c) capture real output schemas to replace the `[UNVERIFIED]` types above. No production code merges until this resolves.

## Integration points

### Entry Points

- New module `packages/intelligence/src/adapters/canary.ts` (+ barrel export in `adapters/index.ts`).
- Modified skill playbooks: `harness-test-advisor` (audit mode), and `test-craft` if its remediation path consumes canary.
- No new CLI command or MCP tool in this iteration (skill-driven; adapter is a library surface). A future external call site would justify an MCP tool wrapper — out of scope now.

### Registrations Required

- Barrel regeneration for `packages/intelligence` (`generate:barrels` / `generate:barrels:check`).
- `optionalDependencies` entry in `packages/intelligence/package.json` + `pnpm-lock.yaml` update.
- Plugin artifacts regenerate via `generate:plugin` only if SKILL.md text changes surface to clients. No skill-tier change.

### Documentation Updates

- `AGENTS.md` — note the optional canary integration on the test surface and the degrade behavior.
- `harness-test-advisor/SKILL.md` — extend the audit playbook (already touched by PR #501) with the adapter path + install nudge.
- README / skills-catalog only if a skill description changes materially.

### Architectural Decisions

- **D1 (optional + graceful degrade)** warrants a standalone ADR — it sets the precedent pattern for how harness takes on cross-ecosystem (Python) tools without compromising portability; future tool integrations will cite it.
- D3/D4 (adapter boundary + JSON contract) are implementation choices, not standalone ADRs.

### Knowledge Impact

- New convention node: "external test-remediation tools integrate via an optional, gracefully-degrading adapter behind a JSON contract." Links to the test-craft family and the portability track.

## Success criteria

1. **Spike resolved** — Phase 0 produces a documented canary CLI contract (confirmed `--json` mode for the three subcommands, or corrected approach; wrapper runtime requirement recorded). The `[UNVERIFIED]` tags in the technical design are removed.
2. **Graceful absence** — When `canary-test-cli` is not installed, the test-advisor audit shall complete with today's output plus an install nudge, and shall not throw or exit non-zero. (Test: canary stubbed absent.)
3. **Programmatic consumption** — When canary is available, the adapter shall return parsed, typed results (not raw prose). (Test: structured fields asserted against a fixed canary JSON fixture.)
4. **Total adapter contract** — every adapter method returns `available|degraded`; no method throws on canary-absence or malformed output. (Unit tests: mocked `execFile` — success, non-zero exit, bad JSON.)
5. **Install is non-breaking** — If the `optionalDependency` fails to install, `pnpm install` shall still succeed.
6. **Portability intact** — `harness validate`, typecheck, lint, and non-test surfaces pass with canary absent; no new dependency violations (`harness check-deps`).
7. **Boundary respected** — only `canary.ts` references `canary-test-cli`; an architecture/grep check asserts no other module execs the CLI directly.

## Implementation order

- **Phase 0 — Spike (gate).** Run `canary-test-cli` locally; confirm/correct the JSON contract for `canary-write-test`, `canary-review-test`, `canary-pick-framework`; record the wrapper's runtime requirement. Output: finalized adapter types. No production code merges until this resolves.
- **Phase 1 — Adapter core.** Implement `packages/intelligence/src/adapters/canary.ts` (`probe` + three methods), the total degradation contract, and barrel export. Unit tests with mocked `execFile` (present / absent / non-zero / bad-JSON). Add the `optionalDependency`.
- **Phase 2 — Skill wiring.** Wire the `harness-test-advisor` audit path (and `test-craft` if applicable) to call `probe()` → adapter, with the degrade nudge. Update contract tests if skill behavior text is asserted.
- **Phase 3 — Docs, ADR, knowledge.** Write the D1 ADR (optional gracefully-degrading cross-ecosystem adapter pattern), update `AGENTS.md`, add the knowledge node. Regenerate barrels/plugin artifacts.
- **Phase 4 — Validation.** `harness validate`, `check-deps`, typecheck/lint/test green with canary both present and absent; boundary check passes.

**Dependency:** sequences after PR #501 merges (it owns the canary skill-dispatch this feature deepens).
