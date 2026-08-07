# Enforcing Pre/Post-Deploy Gate + Rollback Wiring

> Upgrade `harness-deployment` from a Tier-3 advisory prose guide to a Tier-2 enforcing
> pre/post-deploy **gate** with an exit-code contract, backed by a pure core engine and a
> `harness check-deployment` CLI command. Verifies deployment-readiness criteria derived from the
> skill's existing DETECT logic, **blocks** (non-zero exit) on unambiguous incident-causing
> violations, **advises** on maturity gaps, and **abstains loudly** on repos with no deployment
> config. Wires the gate's rollback-path requirement to the existing `harness-rollback` post-ship
> circuit breaker.

**Keywords:** deployment, enforcing-gate, exit-code-contract, rollback-wiring, secrets-hygiene,
promotion-gate, graceful-abstention, ci-cd, meticulous-verifier

**Tracks issue:** GitHub #712 — "Extend enforcement past ship (deployment + operations)".
This spec implements **Half (A) only** (deployment gate + rollback wiring). Half (B) — an
operations skill that pulls live production signals (incidents, monitoring) into the knowledge
graph — is **deferred by owner decision**: it needs real production-signal sources the owner will
supply later. No ops-signal ingestion, incident/monitoring data, or signal sources are built here.

---

## Overview and Goals

Today the harness lifecycle stops *enforcing* the moment code ships. `harness-deployment` is a
Tier-3 `advisory-guide` — a prose walkthrough (DETECT → ANALYZE → DESIGN → VALIDATE) that produces
recommendations but has no exit-code authority and cannot block a merge or a deploy. Its
`## Gates` section already *names* the hard rules ("No production deploy without staging
validation", "No long-lived credentials in pipelines", "No deploy without rollback") but nothing
mechanically enforces them.

This change turns those named gates into a real enforcing gate, mirroring how the harness already
implements rule-based enforcing gates (`check-arch`, `check-deps` / `enforce-architecture`,
`check-vocabulary`): a pure core engine + a `harness check-*` CLI command with a documented
exit-code contract, driven by `harness.config.json`, and a skill whose `cognitive_mode` becomes
`meticulous-verifier` at `tier: 2`.

**Goals:**

1. A `harness check-deployment` command that verifies deployment readiness and **exits non-zero on
   hard violations**, so it can gate a merge / a deploy in CI.
2. Block-vs-advise criteria derived from the skill's existing DETECT logic, split into a small,
   defensible **hard-block** set and a broader **advisory** set.
3. **Loud abstention** on repos with no deployment configuration — never a false green, never a
   hard fail of a repo that does not deploy.
4. A concrete **rollback-wiring seam** connecting the gate to `harness-rollback`.
5. The `harness-deployment` skill upgraded to reflect enforcement, retaining its advisory
   DETECT/ANALYZE/DESIGN guidance as the human-facing context around the mechanical gate.

**Non-goals (out of scope):**

- Half (B): operations signal ingestion (incidents, monitoring → knowledge graph). Deferred.
- Executing a deploy or a rollback. The gate verifies a rollback *path exists*; it never deploys
  and never merges a revert (`harness-rollback` stays propose-only, a human merges).
- Replacing platform-native deploy tooling or linting deep pipeline semantics beyond the readiness
  criteria below.

## Decisions Made

- **D1 — Shape: a `check-*` CLI command backed by a pure core engine, not a new MCP tool.** This
  is the established enforcing-gate shape (`check-arch`, `check-deps`, `check-vocabulary`). It
  avoids MCP-registry churn and gives CI a direct exit-code contract. The skill invokes the command
  rather than reimplementing detection. *Rationale: consistency with every existing rule-based gate;
  the skill body must never reimplement the mechanical check (a Red-Flag pattern).*

- **D2 — Four-value exit-code contract reusing the existing `ExitCode` enum.**
  `0 SUCCESS` (config detected, no hard violations), `1 VALIDATION_FAILED` (≥1 hard violation),
  `2 ERROR` (internal/misconfig), `3 ZERO_DENOMINATOR` (no deployment config detected → abstained).
  *Rationale: `ExitCode.ZERO_DENOMINATOR` already exists precisely for "the gate examined NOTHING —
  abstained, not passed, must never read as green." Reusing it makes graceful degradation
  doctrine-aligned rather than bespoke.*

- **D3 — A small, non-arbitrary hard-block set; everything else advises.** This is the key design
  decision and was evaluated as a potential fork ("what should HARD-block a deploy?"). It is **not**
  a genuine fork: the harness doctrine already answers it. `check-arch` hard-fails only
  *error-severity threshold breaches* (non-waivable) and treats everything else as the softer diff;
  `outcome-eval` blocks only a *high-confidence* NOT_SATISFIED. Applying the same
  "block only the unambiguous, incident-causing violations" principle to deployment yields three
  hard blocks and pushes maturity gaps to advisory (see Technical Design). *Rationale: a large
  hard-block set produces false blocks and trains users to disable the gate; a doctrine-aligned
  minimal set is enforceable and trusted.*

- **D4 — Secret leakage is non-waivable; other hard rules are severity-overridable via config.**
  `DEPLOY-SEC001` (hardcoded/long-lived credential in a pipeline file or committed env file) can
  never be downgraded — it mirrors `check-arch`'s non-waivable error-severity breach and the
  repo's opted-in secrets-and-injection constraint pack. The other two hard rules
  (`DEPLOY-RB001`, `DEPLOY-ENV001`) may be downgraded to advisory via `deployment.rules` for repos
  where the concept genuinely does not apply (e.g. an intentionally single-environment service).
  *Rationale: graceful degradation needs an escape hatch, but a security leak is never a judgment
  call.*

- **D5 — Rollback wiring is a path-existence *verification*, not an invocation.** The gate's
  `DEPLOY-RB001` requires that a rollback path exists, satisfied by any of: a `rollback` block in
  `harness.config.json` (the `harness-rollback` circuit breaker is wired), a revert/rollback
  workflow or `deploy/rollback` script, or a documented rollback runbook. On failure the message
  points at `harness-rollback` and explains the complementarity: **check-deployment = pre-ship
  readiness (can we roll back?); harness-rollback = post-ship execution (open the revert PR when a
  signal/eval fires).** *Rationale: the two skills form the pre/post-ship pair the issue calls for,
  connected by a config seam (`rollback`) both already read — no new coupling surface.*

- **D6 — The gate is standalone + opt-in, not forced into the default `ci check` orchestrator.**
  It ships as its own command and is documented for CI use; projects opt in via `deployment.enabled`
  and by adding it to their workflow. *Rationale: silently adding a new blocking gate to the default
  orchestrator would hard-fail unrelated repos (including this one) on first upgrade — a breaking
  change disguised as a feature.*

- **D7 — Retain the advisory prose (DETECT/ANALYZE/DESIGN) in the skill body.** Enforcement adds an
  `ENFORCE` phase and flips `cognitive_mode`/`tier`; it does not delete the human-facing guidance,
  which is the context a human needs when the gate blocks. *Rationale: the mechanical gate answers
  "does it pass?"; the prose answers "how do I fix it?".*

- **D8 — `DEPLOY-SEC001` reuses the existing security secret-scanner, not new patterns.** The core
  security module already ships a secret detector (`packages/core/src/security/rules/secrets.ts`)
  and, critically, `packages/core/src/security/secret-reference.ts`, which discriminates a genuine
  hardcoded secret from an env-var *reference* (`${{ secrets.X }}`, `process.env.X`) — the exact
  false-positive guard a pipeline/env-file scan needs. The deploy engine runs that detector over the
  discovered CI/CD and env files rather than reinventing regexes. *Rationale: feasibility + fidelity
  — the leak-vs-reference distinction is subtle and already solved; duplicating it would drift.*

## Assumptions

- **Runtime:** Node.js (LTS) with filesystem access; the core engine reads config and pipeline
  files via injected IO, mirroring `packages/core/src/architecture/` (no direct `process`/network).
- **Git-aware env-file detection:** a committed environment file is judged by its tracked/known
  location (e.g. `.env.production`); the gate does not read secrets from files git ignores.
- **Secret fidelity:** secret detection is only as precise as the reused
  `packages/core/src/security` scanner; the `secret-reference.ts` discriminator keeps env-var
  references from reading as leaks.

## Technical Design

### Block-vs-advise criteria (the gate's authority contract)

**HARD violations — block, exit `1 VALIDATION_FAILED`:**

| Code           | Fires when                                                                                                                                                                 | Waivable?                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `DEPLOY-SEC001`| A hardcoded secret or long-lived cloud credential appears in a CI/CD pipeline file, or a committed environment file (`.env.production`, etc.) contains live secret values. | **No** — non-waivable (D4).       |
| `DEPLOY-RB001` | A deployment target is detected but **no rollback path** is wired (no `rollback` config, no revert/rollback workflow or script, no documented runbook).                    | Yes → advisory via `rules` (D4).  |
| `DEPLOY-ENV001`| A **production** deploy is reachable with **no promotion/approval gate** — deploy-to-prod triggered directly (e.g. on push) with no environment protection, no manual approval, and no prior staging/promotion job. | Yes → advisory via `rules` (D4).  |

**SOFT violations — advise, exit `0 SUCCESS` (surfaced, non-blocking):**

| Code            | Fires when                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY-STAGE001`| Recommended pre-deploy check stages are missing (security scan, smoke tests, post-deploy verification).            |
| `DEPLOY-ENV002` | Weak environment separation (shared **non-secret** config across environments) that is not an outright leak.        |
| `DEPLOY-HC001`  | No post-deploy health check wired for a deploy target.                                                               |
| `DEPLOY-PERF001`| Pipeline structure smells (serial stages that could parallelize, missing dependency/build caching).                 |

**ABSTAIN — exit `3 ZERO_DENOMINATOR`:** no CI/CD config, no deploy scripts, and no `deployment`
config detected. Emits a loud "No deployment configuration detected; deploy gate not applicable
(abstained)." message. Never green, never a hard fail. When `deployment.enabled === false`, the
gate short-circuits to `0 SUCCESS` with a note (explicit opt-out, distinct from abstention).

**Error / edge cases:**

- A missing or malformed `harness.config.json` (or an unreadable config) → exit `2 ERROR` with the
  parse error surfaced verbatim; the gate never guesses config.
- A pipeline file that exists but is unparseable (invalid YAML) → the file still counts as a
  detected deployment surface (so the repo does not silently abstain), and a `DEPLOY-STAGE001`-class
  advisory notes the unparseable file; the gate does not crash on a single bad file.
- A repo with `deployment` config present but no CI/CD files and no deploy scripts is still a
  configured intent to deploy → the gate evaluates rules it can (e.g. rollback-path presence)
  rather than abstaining.

Detection reuses the skill's existing DETECT catalog: CI/CD config discovery
(`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`, `bitbucket-pipelines.yml`,
`azure-pipelines.yml`, `deploy/`, `scripts/deploy*`), environment-file discovery, secret scanning,
and deployment-topology extraction.

### Core engine — `packages/core/src/deployment/`

Pure, injected-IO functions (no direct `process`/network), mirroring `architecture/`:

- `detectDeploymentSurface(root, fsPort)` → `DeploymentSurface` — CI/CD files, env files,
  detected environments, whether a production deploy target exists, discovered rollback signals.
- `evaluateDeploymentGate(surface, config)` → `DeploymentGateResult` — pure classifier applying the
  block/advise/abstain rules above. Shape:

  ```ts
  interface DeploymentFinding {
    code: string;              // e.g. "DEPLOY-SEC001"
    severity: 'hard' | 'soft';
    file?: string;
    detail: string;
    remediation: string;       // human-facing fix, references harness-rollback for DEPLOY-RB001
  }
  interface DeploymentGateResult {
    status: 'pass' | 'blocked' | 'abstained' | 'disabled';
    findings: DeploymentFinding[];
    hardViolations: DeploymentFinding[];
    softViolations: DeploymentFinding[];
    detectedEnvironments: string[];
    rollbackPathPresent: boolean;
  }
  ```

- `deriveExitCode(result)` → maps `status` to the `ExitCode` contract (D2).

### CLI command — `packages/cli/src/commands/check-deployment.ts`

`harness check-deployment` registered in `_registry.ts`. Options mirror `check-arch`:
`--json` (full `DeploymentGateResult`), `--findings-json` (trailing findings-contract line via
`formatFindingsContract`), plus global config/output flags. The action resolves config, runs the
engine, prints a readiness report, and `process.exit`s per `deriveExitCode`.

### Config — `packages/cli/src/config/schema.ts`

```ts
export const DeploymentGateConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // Per-code severity override. 'off' downgrades a hard rule to advisory.
  // DEPLOY-SEC001 ignores 'off' (non-waivable, D4).
  rules: z.record(z.string(), z.enum(['error', 'warn', 'off'])).optional(),
});
```

Wired onto `HarnessConfigSchema` as `deployment: DeploymentGateConfigSchema.optional()`.

### Skill upgrade — `agents/skills/claude-code/harness-deployment/`

- `skill.yaml`: `cognitive_mode: advisory-guide → meticulous-verifier`; `tier: 3 → 2`; add the
  `harness check-deployment` CLI entry and an `enforce` phase; add `on_pre_merge` trigger.
- `SKILL.md`: add a leading **ENFORCE** phase describing the gate, its exit-code contract, and the
  block-vs-advise table; retain DETECT/ANALYZE/DESIGN/VALIDATE as advisory context; update `## Gates`
  to state the mechanical contract; wire the rollback seam (D5); refresh the domain-specific
  `## Rationalizations to Reject` for the enforcing posture (parity-validator requirement). No
  internal roadmap/PR/issue numbers appear in the shipped skill body.

## Integration Points

- **Entry Points:** new CLI command `harness check-deployment`; new core module
  `packages/core/src/deployment/` with a barrel export; upgraded `harness-deployment` skill (new
  `enforce` phase).
- **Registrations Required:** register `createCheckDeploymentCommand` in
  `packages/cli/src/commands/_registry.ts`; export the deployment engine from the core barrel;
  add `DeploymentGateConfigSchema` + `deployment` field to `HarnessConfigSchema`; regenerate
  `docs/reference/cli-commands.md`; changeset (`'@harness-engineering/cli': minor`). No new MCP tool
  → no MCP registry / tool-count changes.
- **Documentation Updates:** regenerate `docs/reference/cli-commands.md`; note the gate + its
  exit-code contract in the deployment skill body; AGENTS.md deployment mention if present.
- **Architectural Decisions:** **D2 (exit-code contract incl. loud abstention)** and **D5 (rollback
  wiring as path-verification, not invocation)** warrant an ADR — both define durable cross-skill
  contracts (the abstention semantics and the deploy↔rollback seam) future work will depend on.
  D3's hard-block set is captured in this spec and the skill body; it does not need a separate ADR.
- **Knowledge Impact:** new concepts — "enforcing deploy gate", "deployment readiness criteria",
  "loud abstention (ZERO_DENOMINATOR)", and the "pre-ship gate ↔ post-ship rollback" relationship
  between `harness-deployment` and `harness-rollback`.

## Success Criteria

1. `harness check-deployment` exists, is registered, and appears in regenerated
   `docs/reference/cli-commands.md`.
2. On a repo with a leaked secret in a pipeline/env file, the gate reports `DEPLOY-SEC001` and
   exits `1`; the finding cannot be downgraded by `deployment.rules`. A pipeline that references a
   secret via `${{ secrets.X }}` / `process.env.X` (not a hardcoded value) does **not** trip
   `DEPLOY-SEC001` (env-var reference is not a leak, per D8).
3. On a repo with a deploy target but no rollback path, the gate reports `DEPLOY-RB001`, exits `1`,
   and its remediation references `harness-rollback`.
4. On a repo with a direct-to-production deploy and no promotion/approval gate, the gate reports
   `DEPLOY-ENV001` and exits `1`.
5. On a repo with deployment config and only soft findings, the gate exits `0` and lists the
   advisories.
6. On a repo with **no** deployment configuration, the gate exits `3` (ZERO_DENOMINATOR) with a
   loud abstention message — never `0`, never `1`.
7. `deployment.enabled: false` short-circuits to exit `0` with an explicit opt-out note.
8. `deployment.rules: { "DEPLOY-ENV001": "off" }` downgrades that rule to advisory; the same
   override on `DEPLOY-SEC001` is ignored.
9. The `harness-deployment` skill reports `cognitive_mode: meticulous-verifier`, `tier: 2`, an
   `enforce` phase, a domain-specific `## Rationalizations to Reject`, and `harness skill validate`
   exits `0`.
10. Half (B) (ops-signal ingestion) is **not** built: no incident/monitoring ingestion code, no
    new production-signal sources.

## Implementation Order

- **Phase 1 — Core engine + config + tests.** `packages/core/src/deployment/` (detect + evaluate +
  exit-code mapping) with unit tests over fixtures for every criterion (hard, soft, abstain,
  disabled, non-waivable secret, severity override). `DeploymentGateConfigSchema` + `deployment`
  wiring. Barrel export.
- **Phase 2 — CLI command + wiring + docs.** `check-deployment.ts`, `_registry.ts` registration,
  `--json`/`--findings-json`, exit-code contract; regenerate `docs/reference/cli-commands.md`;
  changeset.
- **Phase 3 — Skill upgrade + ADR.** `skill.yaml` + `SKILL.md` (ENFORCE phase, rollback seam,
  rationalizations); ADR capturing D2 + D5; `harness skill validate` → 0.
