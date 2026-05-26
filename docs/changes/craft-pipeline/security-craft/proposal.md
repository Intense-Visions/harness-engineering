# security-craft v1

> Tenth (and final) member of the craft-pipeline initiative (#10 of 10). LLM-judgment skill for security posture — the ceiling counterpart to `harness-security-scan` (CVE/OWASP rule-based floor) and `harness-security-reviewer` (procedural review). Threat-modeling-as-skill rather than pattern-matching. Critiques whether a trust boundary is respected or accidentally bridged, where implicit privilege escalation lurks, whether the code defends in depth or just at the gate, whether principle of least authority is honored in shape. Imports shared craft infrastructure from `packages/cli/src/shared/craft/`.

## Overview

**Project:** security-craft (v1)
**Initiative:** craft-pipeline (sub-project #10 of 10 — sixth non-design)
**Date:** 2026-05-26
**Estimated effort:** ~4-5 days, single PR (largest of the post-shared-craft skills due to the AST signal-detection layer)
**Composes with:** harness-security-scan (rule-based floor), harness-security-reviewer (procedural review)

### What this ships

A new skill + CLI command + MCP tool that:

1. Walks source files under `packages/*/src/` (or caller-supplied `--files`).
2. Uses the TS Compiler API to detect **security signals** in each file: HTTP route handlers, middleware, auth checks, `child_process` / `exec` / `eval`, `fs` writes, JWT/cookie/session APIs, SQL/ORM raw queries, network egress.
3. Critiques only files that contain at least one signal (AST-driven targeting). Files with no security-relevant constructs are skipped silently.
4. Invokes an LLM with a curated rubric catalog (8 seed rubrics) biased toward **medium confidence** by default to manage the false-positive risk the roadmap flagged.
5. Emits 3-axis `SecurityFinding`s (tier × impact × confidence per ADR 0019).

### What this does NOT ship

- **No IaC critique.** Dockerfile, k8s YAML, Terraform — different rubric vocabulary; v1.x.
- **No multi-file auth-flow tracing.** Cross-file privilege escalation analysis (handler → middleware → service) requires a graph traversal layer the other craft skills don't have; v1.x once cross-file critique pays for itself elsewhere.
- **No dependency / CVE scanning.** `harness-security-scan` is the rule-based floor; security-craft is judgment-only on source code.
- **No secret detection.** Floor concern (regex/entropy-based); existing scanners cover this.
- **No autofix.** Sibling `align-security` deferred to v2 (the FP risk of automated security rewrites is too high to start there).
- **No B' bootstrap.** Same posture as the rest of the craft family.
- **No graph persistence of findings.** Phase 1 MVP.
- **No vision/deep mode.** Security is text.
- **No path-heuristic fallback.** If AST scan returns zero signals, the file is skipped — no "critique everything under handlers/" loose mode. Tight scoping is part of the FP management strategy.

### What problem this solves

`harness-security-scan` catches known CVEs and pattern-matched OWASP categories — the floor. `harness-security-reviewer` walks procedural review checklists — also floor. Neither says anything about **threat-modeling shape**: is this trust boundary respected? Does the auth check happen before the privilege grant or after? Is the defense in depth or just at the gate? Is the assumed adversary realistic? These are judgment calls a security-aware engineer makes mentally during review, and there's no published tool that tries to bottle them. The roadmap flagged this as the hardest craft to land well because judgment-based security risks both FPs (overcaution paralyzes shipping) and FNs (missed real issues). security-craft mitigates both by (a) AST-driven targeting that only fires on files with security signals, and (b) conservative confidence defaults that de-emphasize uncertain findings per ADR 0019.

## Decisions

| #   | Decision   | Lock                                                     | Rationale                                                                                                                                                                                                                                             |
| --- | ---------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 scope   | **Source code only (TS/JS)**                             | Walk `packages/*/src/`. Excludes IaC, dependency manifests, CI configs (those are floor concerns covered by CVE scanners + image-scanning). Narrowest scope = highest signal-to-noise; matches per-file pattern of knowledge-craft + copy-craft.      |
| 2   | Targeting  | **AST-driven (find handlers/middlewares/security APIs)** | Use TS Compiler API to detect security-relevant constructs in any file: HTTP handlers, middleware, `child_process`/`exec`/`eval`, `fs` writes, JWT/session/cookie APIs, SQL raw queries, network egress. File earns critique only if it has a signal. |
| 3   | FP posture | **Conservative — LLM defaults to medium confidence**     | Rubric prompts bias toward medium confidence; require explicit textual signal for high. Per ADR 0019, low/medium-confidence findings are de-emphasized in reports. Directly mitigates the roadmap's flagged FP risk for judgment-based security.      |

## Scope

### In-scope

- **Source-file walk.** `packages/*/src/**/*.{ts,tsx,js,jsx,mjs,cjs}`. Excludes `node_modules`, `dist`, `coverage`, test files (test code's security shape is different — v1.x).
- **AST signal detection** (`extract/signals.ts`) — for each file, identify:
  - **HTTP handlers** — exported functions with request/response signatures, `app.get/post/...`, decorator-based routes
  - **Middleware** — functions returning `(req, res, next)` shape
  - **Auth/authz APIs** — calls to `jwt.sign/verify`, `bcrypt.hash/compare`, `passport.*`, `req.session`, cookie APIs, role-check helpers
  - **Privileged operations** — `child_process.exec/spawn`, `eval`, `Function()` constructor, `vm.runIn*`, `fs.writeFile*` / `fs.unlink*`
  - **Data egress** — `fetch`, `axios`, `http.request`, `https.request`, `net.connect`
  - **Raw queries** — `db.query`, `db.raw`, template-literal-built SQL, `client.query(\`...${x}...\`)` patterns
- **8 seed rubrics**:
  - `SEC-R001` **trust-boundary-respected** — does the code respect the trust boundary it sits on, or accidentally bridge user-controlled data to a privileged sink?
  - `SEC-R002` **least-authority-honored** — does this code take only the authority it needs, or escalate ambient privilege?
  - `SEC-R003` **defense-in-depth** — is there a layer behind the gate, or does the whole defense ride on one check?
  - `SEC-R004` **assumed-adversary-realistic** — what adversary is this defending against, and does the threat model match the deployment?
  - `SEC-R005` **data-flow-annotated** — when data crosses a trust boundary (untrusted → trusted, low-priv → high-priv), is the crossing visible in the code?
  - `SEC-R006` **fail-closed-not-open** — when the security check fails (network error, missing claim, malformed input), does the code deny or allow?
  - `SEC-R007` **secret-handling-shape** — are secrets passed through the code in a shape that resists logging/serialization (typed, not bare strings)?
  - `SEC-R008` **authz-before-action** — does the authorization check happen BEFORE the privileged action, or is the action visible to an attacker first?
- **3-axis `SecurityFinding`** matching the shared craft shape.
- **CLI:** `harness security-craft`.
- **MCP tool:** `security_craft` (count 79 → 80).
- **4-platform skill markdown.**
- **Conservative-confidence prompt bias** — system prompt explicitly instructs the LLM to default to medium confidence absent strong textual evidence; rubric examples include "high confidence" markers (a specific line, a named anti-pattern, a missing guard).
- **Cross-cutting API:** `critiqueSecurityInFile(file, opts)` for callers that have a file in hand.

### Out-of-scope (v1)

- No IaC critique (v1.x).
- No multi-file auth-flow tracing (v1.x).
- No dependency / CVE scanning (floor — `harness-security-scan`).
- No secret detection (floor — regex/entropy scanners).
- No autofix (`align-security` v2 — FP risk too high to start here).
- No test-file critique (different security shape; v1.x).
- No B' bootstrap.
- No graph persistence of findings.
- No path-heuristic fallback (AST-only signal scoping is part of FP management).

## Inputs

- **Project root path** (CLI / MCP arg).
- **LLM provider** (MockLlmProvider in v1; same posture as the rest of the craft family).

## Outputs

```ts
interface SecurityFinding {
  /** Stable code in SEC-R\d{3} namespace. */
  code: string;
  phase: 'critique';
  tier: 'foundational' | 'polish' | 'aspirational';
  impact: 'small' | 'medium' | 'large';
  confidence: 'high' | 'medium' | 'low';
  target: {
    file: string;
    /** AST signal that triggered this rubric (e.g. 'child_process.exec', 'http-handler'). */
    signal: string;
    /** Line of the signal site for navigation. */
    line: number;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

interface SecurityCraftOutput {
  findings: SecurityFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider: string; model: string; count: number; costUsd: number };
    catalog: { rubricsApplied: string[] };
    counts: {
      filesScanned: number;
      filesSkippedNoSignal: number;
      signalsDetected: number;
    };
    runId: string;
  };
}
```

## Technical Design

### Module layout

```
packages/cli/src/security-craft/
  findings/
    schema.ts                      # SecurityFinding, SecurityCraftOutput
  catalog/
    rubrics/
      trust-boundary-respected.ts  # SEC-R001
      least-authority-honored.ts   # SEC-R002
      defense-in-depth.ts          # SEC-R003
      assumed-adversary-realistic.ts # SEC-R004
      data-flow-annotated.ts       # SEC-R005
      fail-closed-not-open.ts      # SEC-R006
      secret-handling-shape.ts     # SEC-R007
      authz-before-action.ts       # SEC-R008
    index.ts                       # rubric registry
  extract/
    discover.ts                    # walk packages/*/src/, filter source extensions
    signals.ts                     # TS Compiler API signal detector
  phases/
    critique.ts                    # LLM critique loop per (file, signal, rubric)
  index.ts                         # runSecurityCraft + critiqueSecurityInFile
packages/cli/src/mcp/tools/
  security-craft.ts
packages/cli/src/commands/
  security-craft.ts
agents/skills/{4 platforms}/security-craft/
  SKILL.md
  skill.yaml
```

### Signal detection (TS Compiler API)

For each source file:

```ts
export type SignalKind =
  | 'http-handler'
  | 'middleware'
  | 'auth-api'
  | 'privileged-op'
  | 'data-egress'
  | 'raw-query'
  | 'secret-handling';

export interface SecuritySignal {
  kind: SignalKind;
  /** Specific construct: e.g. 'child_process.exec', 'jwt.verify', 'fetch'. */
  marker: string;
  line: number;
}

export function detectSignals(sourceText: string, filePath: string): SecuritySignal[];
```

The detector walks the AST once and emits a signal per relevant construct. Detection rules (one pass, no cross-file resolution):

- `http-handler` — function with `(req, res)` or `(req, res, next)` parameter shape; methods on `Hono`/`express`/`fastify`/`koa` typed instances; `@Get/@Post/...` decorators
- `middleware` — function returning a `(req, res, next) => unknown` arrow
- `auth-api` — call expressions matching `jwt.{sign,verify}`, `bcrypt.{hash,compare}`, `argon2.*`, `passport.*`, `req.session.*`, `res.cookie`, `cookies.set/get`
- `privileged-op` — `child_process.{exec,spawn,execSync,spawnSync,fork}`, `eval`, `new Function`, `vm.runIn*`, `fs.{writeFile,writeFileSync,unlink,unlinkSync,chmod,chown}`
- `data-egress` — `fetch`, `axios.{get,post,put,delete,request}`, `http.request`, `https.request`, `net.connect`
- `raw-query` — `*.query(`, `*.raw(` with template-literal argument; SQL detection is text-based on the string content
- `secret-handling` — variable names matching `/secret|token|password|api[-_]?key|private[-_]?key/i` AND usage in `console.*`, `logger.*`, template-literal interpolation, JSON.stringify

If a file has zero signals → skip critique entirely (track in `summary.counts.filesSkippedNoSignal`).

### Critique phase

For each (file, signal, rubric) triple where the rubric applies to the signal kind:

1. Build prompt with rubric + file path + signal info + a 1500-char window around the signal line (not the whole file — security-critical context is local; cost cap).
2. **System prompt biases confidence:** explicitly instructs the LLM to emit `medium` confidence by default; only emit `high` when a specific anti-pattern or missing guard is visible in the snippet.
3. LLM returns fenced JSON: `null` (rubric doesn't apply / code is fine) OR `{ tier, impact, confidence, message }`.
4. On non-null: emit `SecurityFinding` with `cite.rubricId` (ADR 0020) and `target.signal` populated.

### Rubric-to-signal mapping

Each rubric declares which signal kinds it applies to (the equivalent of spec-craft's `appliesToSections`):

| Rubric                              | Applicable signal kinds                             |
| ----------------------------------- | --------------------------------------------------- |
| `SEC-R001` trust-boundary-respected | http-handler, middleware, raw-query, privileged-op  |
| `SEC-R002` least-authority-honored  | auth-api, privileged-op, http-handler               |
| `SEC-R003` defense-in-depth         | auth-api, http-handler                              |
| `SEC-R004` assumed-adversary        | http-handler, middleware, auth-api                  |
| `SEC-R005` data-flow-annotated      | http-handler, raw-query, data-egress, privileged-op |
| `SEC-R006` fail-closed              | auth-api, middleware, http-handler                  |
| `SEC-R007` secret-handling-shape    | secret-handling                                     |
| `SEC-R008` authz-before-action      | http-handler, privileged-op                         |

This mapping minimizes per-file LLM-call count: a file with one `raw-query` signal only fires R001 and R005, not all 8.

### Cross-cutting API

```ts
export async function runSecurityCraft(input: SecurityCraftInput): Promise<SecurityCraftOutput>;
export async function critiqueSecurityInFile(
  file: string,
  opts?: { source?: string; rubrics?: SecurityRubric[]; provider?: LlmProvider }
): Promise<SecurityFinding[]>;
```

`critiqueSecurityInFile` is invocable on any TS/JS file; callers responsible for scoping.

## Surface area

### CLI

```
harness security-craft [options]
  --files <files...>             Optional file scope (overrides discovery)
  --packages <names...>          Restrict to specific packages under packages/
  --max-files <n>                Cap source-file count (default: 100)
  --max-signals-per-file <n>     Cap per-file signal critique (default: 10)
  --json
  --verbose / --quiet
```

Exit codes:

- `0` — no foundational-tier findings
- `1` — at least one foundational-tier finding
- `2` — crashed

### MCP tool

`security_craft` — count 79 → 80.

### Config

```ts
craft.security: {
  enabled: boolean;             // default true
  maxFiles: number;             // default 100
  maxSignalsPerFile: number;    // default 10
  excludePackages?: string[];   // optional package skip
}
```

(Following the per-craft-skill convention; v1 ships defaults baked into runSecurityCraft, the config block is optional surface for v1.x.)

## Rationalizations to reject

| Rationalization                                                             | Why it's wrong                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Critique every file in packages/\*/src/ to maximize coverage"              | Floods the LLM with files that have no security-relevant constructs — pure cost, zero signal. AST-driven targeting is the FP-management strategy; "more files = more findings" is the wrong loss function.   |
| "Default to high confidence so users take findings seriously"               | Inverts the FP/FN tradeoff. Security findings that are mostly wrong train users to dismiss the report. Conservative defaults preserve trust; users escalate confidence themselves when they see real signal. |
| "Include test-file critique — security in tests matters"                    | Test-file security has a different shape (mocked auth, deliberate insecure setups for negative tests). Same rubrics misfire. v1.x with a dedicated test-security rubric set if signal warrants.              |
| "Add IaC critique under the same skill"                                     | IaC has a different rubric vocabulary (cap-add, hostNetwork, IAM policies, Terraform-state-handling). Mixing surfaces in v1 increases FP rate. Separate sub-skill in v1.x.                                   |
| "Multi-file auth-flow tracing is the most valuable thing — ship it in v1"   | True for value, false for v1 effort. Requires a graph traversal layer the other craft skills don't have; lands as v1.x once the per-file pattern proves itself.                                              |
| "Run all 8 rubrics on every file regardless of signal kind"                 | Per-signal mapping reduces LLM cost by ~3-5x without losing coverage. Rubrics that don't apply to a signal kind would return null anyway; pre-filtering is cheaper.                                          |
| "Use a regex-based detector instead of the TS Compiler API — simpler"       | Regex over source text generates massive FPs (`exec` in a comment, `eval` in a variable name). AST awareness is the same approach naming-craft + copy-craft proved; reuse the muscle.                        |
| "Path-heuristic fallback for files under handlers/ even with no AST signal" | Defeats the FP-management strategy. If the AST doesn't find a signal, the file isn't critique-relevant — the path is incidental. Loose mode lets noise back in.                                              |
| "Use a unified CRAFT-S\d{3} code namespace"                                 | Per-skill (SEC-R\d{3}) keeps debugging local. Convergence to a shared prefix is v2 if it pays off.                                                                                                           |
| "Defer FP posture to runtime config — let users tune"                       | Ships an unsafe default. Conservative-by-default is the right posture for a brand-new judgment-based security skill; v1.x adds `craft.security.confidenceFloor` for users who want to tighten further.       |

## Success criteria

**Signal detection (10)**

1. Detects `http-handler` signals via `(req, res)` and `(req, res, next)` parameter shapes
2. Detects `middleware` signals via `(req, res, next) =>` arrow returns
3. Detects `auth-api` signals for `jwt.{sign,verify}`, `bcrypt.{hash,compare}`, `req.session.*`, `res.cookie`
4. Detects `privileged-op` signals for `child_process.{exec,spawn}`, `eval`, `new Function`, `fs.{writeFile,unlink,chmod}`
5. Detects `data-egress` signals for `fetch`, `axios.*`, `http.request`
6. Detects `raw-query` signals for `*.query(\`SELECT ... ${x}\`)` template literals
7. Detects `secret-handling` signals when secret-named variables flow into `console.*` / `logger.*` / template interpolation
8. Returns [] for files with no security signals
9. Detector is AST-aware (regex matches in comments/string contents don't fire)
10. Each signal carries `kind`, `marker`, `line`

**Catalog + critique (10)**

11. 8 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric)
12. Each rubric declares `appliesToSignals: SignalKind[]`
13. `runSecurityCraft({ path })` walks source files + emits SecurityCraftOutput
14. Per-file critique only fires for rubrics whose `appliesToSignals` includes a detected signal's kind
15. Mock LLM provider's deterministic response produces a valid SecurityFinding
16. Each finding includes `cite.rubricId` (ADR 0020)
17. 3-axis preserved (ADR 0019); confidence defaults to medium when LLM says so
18. `derived.priority` computed via shared/craft
19. LLM `null` response does NOT emit a finding
20. Cost telemetry populated; counts.filesSkippedNoSignal tracked separately from counts.filesScanned

**Conservative confidence (2)**

21. System prompt explicitly biases toward medium confidence; high confidence requires textual evidence
22. Integration test confirms a generic LLM response defaults to medium (not high)

**Cross-cutting (2)**

23. `critiqueSecurityInFile(file, opts)` exported and invocable on any TS/JS file
24. Accepts custom rubric set + provider override

**Surface area (5)**

25. New MCP tool `security_craft` registered (count 79 → 80)
26. New CLI command `harness security-craft`
27. 4-platform skill markdown
28. Auto-doc regenerates with `security_craft` + `security-craft` skill entries
29. Plugin slash-commands pre-generated (`.claude-plugin` + `.cursor-plugin`)

## Long-term trajectory

- **v1.x — IaC critique** with dedicated rubrics (Dockerfile USER, k8s securityContext, Terraform IAM policy shape).
- **v1.x — multi-file auth-flow tracing**: walk handler → middleware → service via graph; rubrics like "handler bypasses middleware that enforces tenant isolation".
- **v1.x — `align-security` sibling FIX skill** for safe-to-apply rewrites (typed-secret wrappers, fail-closed defaults). Aggressive FP safeguards required before enabling.
- **v1.x — test-file security critique** with a test-specific rubric set (deliberate insecure mocks vs accidental ones).
- **v1.x — `craft.security.confidenceFloor`** runtime config so users can tighten the FP posture further if they want.
- **v2 — composes with harness-security-scan** at scan time: CVE findings can carry a security-craft-emitted "shape" rubric for context.
- **v3 — assumed-adversary-as-config**: project declares its threat model (`docs/knowledge/security/threat-model.md`); rubrics critique against the declared model rather than inferring.

## Risks + mitigations

| Risk                                                                                 | Mitigation                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **False positives train users to dismiss the report** (roadmap-flagged primary risk) | Conservative confidence default + AST-driven signal scoping + per-signal rubric mapping. Three independent layers of FP reduction. Honest reporting per ADR 0019 (low-confidence findings de-emphasized); never claim certainty the LLM didn't earn.   |
| **False negatives — real issues missed** (roadmap-flagged secondary risk)            | Accepted v1 tradeoff. Floor (`harness-security-scan`) still catches CVEs and pattern-matched OWASP. v1.x adds multi-file tracing for higher-coverage findings. The goal is "useful findings that compound trust", not "complete coverage".             |
| **AST signal detector over- or under-fires on a specific framework**                 | Detector is rule-list-based — adding/removing a framework's API surface is a 1-line config change. v1 ships baseline coverage (Express, Hono, Fastify, Koa, NestJS-decorator); v1.x adds tRPC, Convex, Cloudflare Workers, Hono RPC, etc.              |
| **Per-signal-line window misses important context**                                  | 1500-char window around the signal is the v1 default — wider than per-claim, narrower than per-file. v1.x adds `--context-window <n>` if signal warrants. Whole-file context blows up cost on large files.                                             |
| **LLM cost balloons on a large codebase**                                            | `maxFiles: 100` default + per-signal rubric mapping + `--packages` scoping. Per-file cost = (signals × applicable rubrics × per-call); typical handler file might fire ~3-5 rubrics, not 8. Cost reported in `summary.llmCalls.costUsd`.               |
| **Overlap with harness-security-reviewer (procedural review)**                       | Security-reviewer walks a checklist; security-craft critiques shape. Different outputs (action-items vs findings); coexist cleanly. v2 orchestrator can compose both.                                                                                  |
| **Overlap with harness-security-scan (CVE rule-based)**                              | Floor vs ceiling. CVE scan finds known patterns; security-craft critiques whether the surrounding code SHAPE invites issues a CVE scanner would miss (e.g., user-controlled string flows to `exec` — not a CVE, but a shape problem). Coexist cleanly. |
| **Test files trigger false alarms (mocked auth, deliberate insecure setups)**        | v1 excludes test files entirely via path filter (`*.test.{ts,tsx,js}`, `*.spec.*`, `tests/**`). v1.x adds dedicated test-security rubrics.                                                                                                             |

## Open questions deferred to implementation

- **Context window size.** v1 ships 1500 chars around the signal line. Tunable if signal warrants.
- **Whether to include source-pair info** (test file's source-under-test) like test-craft does. v1 says no — security-craft critiques the file in isolation. v1.x if it pays.
- **Handling of generated code** (e.g., Prisma client). v1 walks every source file; v1.x adds a generated-code skip list.
- **Handling of frameworks beyond Express/Hono/Fastify/Koa/NestJS.** v1 ships baseline; v1.x adds tRPC / Convex / Cloudflare Workers / Hono RPC.
