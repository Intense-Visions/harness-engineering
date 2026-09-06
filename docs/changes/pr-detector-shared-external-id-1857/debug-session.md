# Debug Session: pr-detector inlines a third copy of the External-ID regex

Status: resolved
Started: 2026-09-06
Issue: https://github.com/Intense-Visions/harness-engineering/issues/1857
Base SHA: c1ca02ba2
Error/symptom: `packages/orchestrator/src/core/pr-detector.ts` defines its own
`parseExternalId` around the **pre-#1843** pattern `/^github:([^/]+)\/([^#]+)#(\d+)$/`,
so the hardening PR #1854 landed in `packages/core/src/roadmap/external-id.ts` does not
reach this consumer. `github:x/../../../user/emails?#1` still parses here to
`owner="x"`, `repo="../../../user/emails?"`.

## Investigation Log

### Phase 1 — INVESTIGATE (read-only)

**What failed, exactly.** Not a crash — a silently divergent validator. The core file's
own docblock (`external-id.ts:2-8`) claims it is the "Single source of truth for the
format ... consumers import these instead of inlining the regex, so the
`github:owner/repo#NNN` shape can never drift". That claim is false on `main` today:
`pr-detector.ts:43` is a fourth consumer that was never brought under the rule.

**Divergence, verified at base SHA `c1ca02ba2`:**

    core/src/roadmap/external-id.ts:36 (post-#1854, authoritative)
      /^github:([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#(\d+)$/
      + isDotSegment() guard          (layer 1)
      + githubRepoPath(owner, repo)   (layer 2, sink-side, never consults the regex)

    orchestrator/src/core/pr-detector.ts:44 (pre-#1843, stale copy)
      /^github:([^/]+)\/([^#]+)#(\d+)$/
      (no dot-segment guard, no sink defence)

**Where the parsed values go.** Traced forward from the parser to every consumer.
`parseExternalId` has four usages in the file — `:81`, `:234`, `:248`, `:269` — feeding
two distinct argv sinks, both AUTHENTICATED `gh` invocations:

- `hasOpenPRForExternalId` (`:81` → `:85-87`)
  `exec('gh', ['pr','list','--repo', ` + "`${parsed.owner}/${parsed.repo}`" + `, ...])`
- `fetchOpenPRClosures(owner, repo)` (`:185` → `:193-195`)
  `exec('gh', ['pr','list','--repo', ` + "`${owner}/${repo}`" + `, ...])`
  This one is PUBLIC and takes raw `owner`/`repo`, so it is a sink in its own right
  and cannot assume the caller parsed the pair.

**Bounding the security claim (recorded so it is not overstated).** The value travels
through `execFile` **argv**, not a shell string — this is not command injection. `gh`
also performs its own `--repo` validation downstream. So this is a **drift defect with a
latent security dimension**, not a second exploitable instance of #1843.

**Reproduced consistently** (3/3 runs) — see Phase 4.

**Recent changes.** `git log` confirms this is not a regression introduced by #1854;
`pr-detector.ts` carried the inlined copy since it was written. #1854 tightened the
authority and thereby _created_ the divergence rather than causing a behaviour change
here.

**Assumption (surfaced, not buried).** `parseExternalId` is part of `PRDetector`'s
public surface: `packages/orchestrator/tests/orchestrator-pr-guard.test.ts:319-330`
calls `detector.parseExternalId(...)` directly. Deleting the method outright would break
an external caller, so a thin delegating wrapper is kept.

**Deferrable (noted, NOT in scope).** Two further divergent copies exist on `main`:
`packages/dashboard/src/server/routes/actions.ts:301` and
`packages/dashboard/src/client/components/roadmap/utils.ts:30`. A third, unrelated-format
inline lives at `packages/cli/src/commands/install.ts:102`. Out of scope for #1857.

### Phase 2 — ANALYZE

**Working examples.** Five call sites in
`packages/core/src/roadmap/adapters/github-issues.ts` and five more in
`.../tracker/adapters/github-issues.ts` all `import { parseExternalId, githubRepoPath }`
and apply BOTH layers: parse, then assert at the sink immediately before building the
path. `packages/core/src/rework/rework.ts:14` does the same for the parse layer.
Read in full. The pattern is uniform: parse → null-check → `githubRepoPath` at the
argv/URL construction point → null-check → build.

**The difference.** `pr-detector.ts` differs from every working example in exactly one
structural respect: it owns a private validator instead of importing the shared one, and
consequently has no layer-2 sink assertion at all. Nothing else differs — same format,
same intent, same downstream shape.

**Wiring pre-checked.** `packages/orchestrator/package.json` already depends on
`@harness-engineering/core` (`workspace:*`) and `src/` already imports from it
(`orchestrator.ts:18`, `types/orchestrator-context.ts:2`, …), so no new dependency and
no architecture-layer violation. `parseExternalId` / `githubRepoPath` are already
exported (`core/src/roadmap/index.ts:68`, re-exported by `core/src/index.ts:134`), so no
`scripts/generate-core-barrel.mjs` allowlist edit is needed.

## Hypotheses

**H1 (single, falsifiable).** The permissive behaviour is caused solely by the inlined
stale regex and the absence of a sink assertion — not by anything else in the class.

_Prediction:_ replacing the method body with a delegation to core's `parseExternalId`,
and inserting `githubRepoPath` at both `--repo` argv sinks, makes the traversal payload
rejected at both layers while every currently-accepted legitimate External-ID still
parses and still produces byte-identical argv.

_Test:_ write the regression suite first, run it against the UNMODIFIED file (must
FAIL), then apply the change and re-run (must PASS), and separately re-run the
pre-existing `tests/orchestrator-pr-guard.test.ts` (must stay green, proving no
false rejection and no contract break).

_Result:_ **confirmed.** 7 failed / 6 passed before; 13/13 after; pre-existing suite
26/26 both before and after.

## Resolution

Root cause: `PRDetector.parseExternalId` inlined a verbatim copy of the pre-#1843
External-ID regex instead of importing the `@harness-engineering/core` authority, so
the two-layer hardening added by #1854 was never applied at this consumer, and the
class had no sink-side assertion before interpolating `owner`/`repo` into an
authenticated `gh pr list --repo` argv.

Fix (one change, both of core's stated defences, matching the working examples):

1. `parseExternalId` now delegates to core's `parseExternalId`. Kept as a thin instance
   method rather than deleted, because it is a public surface with an existing external
   caller (`tests/orchestrator-pr-guard.test.ts`).
2. `githubRepoPath(owner, repo)` is applied at BOTH `--repo` argv construction points —
   `hasOpenPRForExternalId` and the public `fetchOpenPRClosures` — immediately before the
   value is built, per the core docblock's instruction that the sink check "deliberately
   never consults `EXTERNAL_ID_RE` ... so that loosening the regex again cannot silently
   re-open the traversal".

Fail-open contract preserved. A now-rejected External-ID degrades on exactly the path an
unparseable one already took: `hasOpenPRForExternalId` returns `false`,
`fetchOpenPRClosures` returns `null` (its existing "check failed" signal, which
`filterCandidatesWithOpenPRs` already treats as fail-open), each logs at the pre-existing
`logger.debug` level. Nothing throws; no candidate is newly blocked. Pinned by tests.

Regression test: `packages/orchestrator/src/core/pr-detector.external-id-1857.test.ts`
(colocated in `src/` — `packages/orchestrator/tests/**` is region-locked by a sibling
unmerged PR in this fleet run; colocated `*.test.ts` under `src/` is an established
convention here, cf. `src/agent/adaptive-router.*.test.ts`, and `vitest.config.mts`
already includes `src/**/*.test.ts`).

Learnings: a "single source of truth" asserted only in a docblock is not enforced. The
claim in `external-id.ts` was already false when it was written. Grep for the format's
shape — not for the helper's name — when auditing whether an authority actually holds.
