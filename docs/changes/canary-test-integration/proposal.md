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

| #   | Decision                                                                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Optional dependency with graceful degradation** (not required)                                                                                                                                                   | Preserves multi-client portability and keeps CI green without a Python runtime; test skills detect absence and nudge.                                                                                                                                                                                                           |
| D2  | **npm wrapper `canary-test-cli` as the channel** (not pipx/volta/plugin); invoked bin is `canary`                                                                                                                  | **[SPIKE-VERIFIED]** The npm package is a thin Node launcher whose `postinstall` downloads a self-contained prebuilt native binary from GitHub Releases — **no Python toolchain needed on the consumer side.** Caveat: needs network + install-scripts at install time; supports only `linux-x64`, `darwin-arm64`, `win32-x64`. |
| D3  | **Single `CanaryAdapter` boundary module** — skills never exec the CLI directly                                                                                                                                    | Mockable seam for tests; one place to absorb canary flag/output drift.                                                                                                                                                                                                                                                          |
| D4  | **Structured JSON contract** — adapter execs the **deterministic** `canary` subcommands with `--json` and parses into harness types                                                                                | **[SPIKE-VERIFIED]** `recommend <prompt> --json` and `review-test <path> --json` exist and emit JSON (schemas below). Deeper integration targets the deterministic CLI; generation/generative-critique stay plugin-dispatch (see D6).                                                                                           |
| D5  | **Adapter lives in `packages/intelligence/src/adapters/canary.ts`** following the existing `github`/`jira`/`linear`/`manual` adapter pattern                                                                       | Precedented home for external-tool adapters; `optionalDependencies` precedent in a sibling package (`packages/graph`).                                                                                                                                                                                                          |
| D6  | **Scope: the deterministic CLI surface only** — `recommend` (framework rec) and `review-test` (static lint). **No `writeTest` adapter method** (no CLI equivalent; generation remains plugin-dispatch via PR #501) | **[SPIKE-VERIFIED]** canary has two surfaces: deterministic CLI (`recommend`/`review-test`/`flake-check`/`heal-test`, no API key) vs. generative plugin skills (`/canary-write-test`, `/canary-review-test`). Only the former is parseable. YAGNI: ship `recommend` + `review-test`; `flake-check`/`heal-test` noted as future. |
| D7  | **Approach B (generic provider interface) deferred**                                                                                                                                                               | Speculative generality against a single known provider; revisit only if a second test-remediation tool appears.                                                                                                                                                                                                                 |
| D8  | **`review-test` (static lint) overlap flagged for human review**                                                                                                                                                   | **[SPIKE-RAISED]** canary `review-test` is a static linter that overlaps harness's own rule-based linters/entropy detectors. `recommend` (framework classification) and the generative plugin skills are the clearly-additive surfaces. Open question — see Risks.                                                              |

## Technical design

> **[SPIKE-VERIFIED 2026-06-23]** The Phase 0 spike ran against `canary-test-cli@5.4.0`. CLI subcommands, `--json` flags, output schemas, and runtime model below are confirmed against the real binary (not assumed).

### File layout

```
packages/intelligence/
  src/adapters/
    canary.ts          # new — CanaryAdapter boundary
    index.ts           # export canary adapter (barrel)
  package.json         # + optionalDependencies: { "canary-test-cli": "^5.4.0" }
agents/skills/claude-code/harness-test-advisor/SKILL.md   # audit path → adapter + degrade nudge
agents/skills/claude-code/test-craft/SKILL.md             # remediation path → adapter (if applicable)
```

### Adapter surface (`canary.ts`)

Mirrors the existing `github`/`jira`/`linear`/`manual` adapter shape. Types below are derived from **real captured output** (parse/validate with zod — see SKILLS.md):

```ts
export interface CanaryProbe {
  status: 'available' | 'degraded';
  version?: string;
  // why degraded: not-installed | binary-missing (postinstall skipped/offline/unsupported-platform)
  //             | exec-failed | bad-output
  reason?: string;
}

// canary recommend "<prompt>" --json
export interface FrameworkRecommendation {
  status: string; // "success"
  test_type: string; // e.g. "e2e_ui"
  framework: string; // e.g. "playwright"
  file_extension: string; // e.g. "spec.ts"
  reasoning: string[];
  alternatives: string[];
}

// canary review-test <path> --json  → array
export interface CanaryFinding {
  file: string;
  line: number;
  rule: string; // e.g. "LINT-005"
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
}

export interface CanaryAdapter {
  probe(): Promise<CanaryProbe>; // `canary version`, cached per run
  recommend(prompt: string): Promise<FrameworkRecommendation>; // canary recommend <prompt> --json
  reviewTest(path: string, framework?: string): Promise<CanaryFinding[]>; // canary review-test <path> --json
  // NOTE: no writeTest() — test generation has no deterministic CLI; it stays plugin-dispatch (PR #501).
}
```

- **Exec:** `execFile('npx', ['-y', 'canary-test-cli', '<subcmd>', …, '--json'])`, or the installed `canary` bin when present (precedent: `packages/cli/src/mcp/tools/*`). Args array only — no shell string interpolation.
- **Parse:** JSON → typed result (zod-validated); on parse failure, non-zero exit, or `"canary binary not found"` (postinstall skipped) → return a `degraded` probe / empty result rather than throwing.
- **Degradation contract:** every method is total — never throws on canary-absence; callers branch on `status`.

### Skill wiring (`harness-test-advisor` audit mode)

- INVENTORY / QUALITY REVIEW / GAP REPORT phases call `probe()` once. If `degraded`, the skill prints today's behavior plus a one-line "install `canary-test-cli` to enable automated remediation" nudge (no hard stop).
- If `available`, GAP REPORT uses `reviewTest` (static lint of existing tests) and `recommend` (framework selection for uncovered files), rendering parsed findings inline. **Generative** remediation (`/canary-write-test`, `/canary-review-test`) remains the plugin-dispatch path from PR #501.

### Install mechanism & runtime model (D2) — [SPIKE-VERIFIED]

`optionalDependencies: { "canary-test-cli": "^5.4.0" }` in `packages/intelligence/package.json` (precedent: `packages/graph/package.json`). `optional` means a failed install never breaks `pnpm install`.

Runtime model confirmed from the tarball: the npm package ships only a Node launcher (`bin/canary.js`) + a `postinstall` (`scripts/install.js`) that **downloads a prebuilt native binary** from `github.com/bop-clocktower/canary/releases/download/v<ver>/canary-<platform>-<arch>` and `chmod 0755`s it. Implications the adapter/CI must handle:

- **No Python needed on the consumer side** — Python is compiled into the released binary.
- **Postinstall is network- and script-dependent.** Under `--ignore-scripts`, offline, or on an **unsupported platform** (only `linux-x64`, `darwin-arm64`, `win32-x64`), the launcher installs but the binary is absent → `canary` exits 1 (`binary not found`). `probe()` MUST classify this as `degraded` (`reason: binary-missing`), identical to not-installed.
- **CI note:** harness CI / Docker must run on a supported platform with scripts enabled for the _available_ path; the _absent_ path must stay green regardless.

### Phase 0 spike (gate) — RESOLVED 2026-06-23

Ran `canary-test-cli@5.4.0`. Confirmed: (a) `--json` exists on the deterministic subcommands `recommend` and `review-test`; (b) the wrapper needs no separate Python install (self-contained native binary via postinstall download; 3 platforms; network+scripts required) — degradation mode documented above; (c) real output schemas captured and encoded in the adapter types above. Correction surfaced: there is **no `write-test` CLI**; the originally-assumed `writeTest`/`pickFramework` names were plugin-skill names, now mapped to the real CLI (`recommend`/`review-test`).

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

## Risks & open questions

- **[OPEN — D8] Static-lint overlap.** canary `review-test` is a static linter (brittle selectors, hardcoded sleeps, missing assertions, magic numbers — e.g. `LINT-005`). harness already ships rule-based linters/entropy detectors. Before building the `reviewTest` path, confirm it is additive rather than redundant. The unambiguously-additive canary surfaces are `recommend` (framework classification) and the **generative** plugin skills. **Decision for the human:** ship `recommend`-only first, or include `review-test` despite overlap?
- **[RISK] Postinstall/platform fragility.** The available path needs network + install-scripts at install time and a supported platform (`linux-x64`/`darwin-arm64`/`win32-x64`). Mitigated by the degradation contract (treat `binary-missing` as `degraded`), but means "available" is environment-dependent.
- **[RISK] CLI drift.** canary subcommand flags / JSON shapes may change across releases. Mitigated by the single adapter boundary (D3), the pinned `^5.4.0`, and zod-validating output (fall to `degraded` on schema mismatch).

## Success criteria

1. **Spike resolved** ✅ (DONE 2026-06-23) — canary CLI contract documented against `canary-test-cli@5.4.0`: `--json` confirmed on `recommend`/`review-test`, runtime model recorded, real schemas encoded in the adapter types. No `[UNVERIFIED]` tags remain.
2. **Graceful absence** — When canary is not installed **or the native binary is missing** (postinstall skipped/offline/unsupported platform), the test-advisor audit shall complete with today's output plus an install nudge, and shall not throw or exit non-zero. (Tests: canary stubbed absent; `bin/canary.js` "binary not found" exit-1 stubbed.)
3. **Programmatic consumption** — When canary is available, the adapter shall return parsed, typed results (not raw prose). (Test: `FrameworkRecommendation` / `CanaryFinding[]` fields asserted against the captured JSON fixtures.)
4. **Total adapter contract** — every adapter method resolves to a typed result or `degraded`; no method throws on canary-absence or malformed output. (Unit tests: mocked `execFile` — success, non-zero exit, bad JSON, binary-missing.)
5. **Install is non-breaking** — If the `optionalDependency` (or its postinstall) fails, `pnpm install` shall still succeed.
6. **Portability intact** — `harness validate`, typecheck, lint, and non-test surfaces pass with canary absent; no new dependency violations (`harness check-deps`).
7. **Boundary respected** — only `canary.ts` references `canary-test-cli`/the `canary` bin; an architecture/grep check asserts no other module execs the CLI directly.

## Implementation order

- **Phase 0 — Spike (gate). ✅ DONE 2026-06-23.** Ran `canary-test-cli@5.4.0`: confirmed `--json` on `recommend`/`review-test`, documented the postinstall native-binary runtime model + platform constraints, captured real schemas, and corrected the CLI mapping (no `write-test` CLI; `recommend` = framework rec). Adapter types finalized in the technical design.
- **Phase 1 — Adapter core.** Implement `packages/intelligence/src/adapters/canary.ts` (`probe` + `recommend` + `reviewTest`, pending the D8 decision), the total degradation contract (incl. `binary-missing`), zod schemas, and barrel export. Unit tests with mocked `execFile` (present / absent / binary-missing / non-zero / bad-JSON). Add the `optionalDependency` (`^5.4.0`).
- **Phase 2 — Skill wiring.** Wire the `harness-test-advisor` audit path (and `test-craft` if applicable) to call `probe()` → adapter, with the degrade nudge. Update contract tests if skill behavior text is asserted.
- **Phase 3 — Docs, ADR, knowledge.** Write the D1 ADR (optional gracefully-degrading cross-ecosystem adapter pattern), update `AGENTS.md`, add the knowledge node. Regenerate barrels/plugin artifacts.
- **Phase 4 — Validation.** `harness validate`, `check-deps`, typecheck/lint/test green with canary both present and absent; boundary check passes.

**Dependency:** sequences after PR #501 merges (it owns the canary skill-dispatch this feature deepens).
