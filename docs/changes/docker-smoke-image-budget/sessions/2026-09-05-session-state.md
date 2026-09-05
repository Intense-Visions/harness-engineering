# Session state: docker/smoke-test image-size budget remediation

**Fleet:** cicd-fleet · **Item:** R2a · **Date:** 2026-09-05 · **Pipeline:** harness-debugging
**Branch:** `fleet/cicd-smoke-image-budget` · **Base:** `origin/main` @ `5cd661d74`

## Trigger

Release run `33965602127`, job `101306280873` (`docker / smoke-test`), sha `851a5e4e`.
Cause classification: **real-failure** (not flake, not infra).

Three deterministic assertion failures. This session addresses **one** of them; the other two are a
distinct root cause and ship separately as `fleet/cicd-container-startup`.

| #   | Assertion                                             | This session        |
| --- | ----------------------------------------------------- | ------------------- |
| 1   | `Orchestrator image size — 815MB exceeds 800MB limit` | **in scope**        |
| 2   | `CLI --version — Expected semver, got: ''`            | out of scope (PR-B) |
| 3   | `MCP stdio initialize — Expected serverInfo, got: ''` | out of scope (PR-B) |

## Phase log

- **INVESTIGATE** — located the assertion at `scripts/docker-smoke-test.sh:153-166`; read the
  observed sizes from the run; established via `Dockerfile:107-112` that the orchestrator stage is
  `cli` + an apt layer, so the 815/727 split is structurally expected rather than anomalous.
- **ANALYZE** — `git log` on the constant surfaced `aeb815856`, which raised it 400 -> 800 against a
  then-max of 774MB. Headroom at that time: 3.4%.
- **HYPOTHESIZE** — H1 (unintended content in the orchestrator image) rejected: the 88MB
  orchestrator/cli delta is fully accounted for by `git` + `curl`. H2 (budget set with no headroom,
  crossed by ordinary growth) confirmed.
- **FIX** — raised `MAX_IMAGE_SIZE_MB` 800 -> 1000 with an inline comment recording the observation
  the budget was set against and the escalation rule for any future raise.

## Human decisions carried into this session

- **F1 -> (b)** raise the budget; do **not** slim the image. The reservation (815MB is genuinely
  large, and the `cli` stage's dependency-closure install is the real lever) is recorded as a stated
  tradeoff in the plan and in the budget comment, not re-litigated.
- **F2 -> (b)** split the size-budget change and the container-startup fix into two PRs off `main`.
- **F3 -> (b)** do **not** fix the smoke test's `2>/dev/null` stderr swallowing here; the
  observability gap is filed separately.

## Verification

- `grep -c '^MAX_IMAGE_SIZE_MB=1000$' scripts/docker-smoke-test.sh` -> `1`
- Diff touches one assignment plus comments; `check_image_size` still called for all four images.
- No assertion weakened or deleted.

## Status

`resolved` — session record at `.harness/debug/active/docker-smoke-image-budget.md` (gitignored path;
mirrored here because `.harness/debug/` is excluded by `.gitignore:49`).
