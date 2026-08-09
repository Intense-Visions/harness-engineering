# Session State: release-docker-workflow-call

**Item:** Release workflow's `docker` job never starts on a real publish
**Branch:** `fix/release-docker-workflow-call` · **Base SHA:** `143b27628d983ac768abdb02f0f05e1a64ce7f17`
**Skill:** `harness-workflow-audit` (phases: inventory, mechanical, judgment, report)
**Date:** 2026-08-09

## Phase Ledger

| Phase      | Status   | Outcome                                                                                                                             |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| inventory  | complete | 2 workflows in scope; triggers, jobs, permissions, concurrency groups and `uses:` refs recorded.                                    |
| mechanical | complete | M1/M2/M3/M5/M6 clean. M4 produced the error-severity concurrency-deadlock finding.                                                  |
| judgment   | complete | J2 confirms a wired-but-never-fired gate. J1 raised a low-severity interpolation warning (not fixed — scope). J3/J4 not applicable. |
| report     | complete | Findings ranked; one error carrying a concrete patch, applied as the remediation.                                                   |

## Decisions

1. **Audit scoped to `release.yml` + `docker.yml`** rather than all 21 workflow files. The skill
   explicitly supports single-workflow scoping with all phases still running, and the remediation
   mandate for this item is single-defect.
2. **Fixed the callee, not the caller.** `release.yml`'s concurrency group is correct for a
   top-level workflow. The collision is a property of the callee evaluating
   `${{ github.workflow }}` in the caller's context, so the change belongs in `docker.yml`.
3. **Literal prefix `docker-`** chosen over any expression-derived name, so the group cannot
   collide with a caller under any trigger.
4. **`cancel-in-progress: false` retained** — a container publish should not be cancelled midway,
   and changing it is not implicated by the root cause.
5. **No `secrets: inherit` added.** `GITHUB_TOKEN` reaches called workflows automatically; adding
   inherit would broaden secret exposure for no benefit.
6. **J1 interpolation warning left unfixed**, to keep the change a single-cause remediation.

## Constraints Honoured

- The `Docker` workflow was **not** triggered. `build-push-action` runs with `push: true` and a
  `latest` tag, so any dispatch would publish real images to the org registry. No
  `gh workflow run` was issued.
- No image backfill performed.
- Nothing merged; no issues closed.
- No unrelated already-green failures touched.

## Evidence Register

- Run `31323256027`: `conclusion=failure`, `total_count=2`, jobs `ci-gate:success`,
  `release:success`, `updated_at` 16:19:07Z vs `release` completion 16:19:05Z.
- Eight-run comparison: every other Release run reports `total_count=3` with `docker:skipped`,
  including runs where `release` itself failed.
- Release job log: `publishedPackages` array expanded, CLI version `11.1.1`; epilogue logs
  `Set output 'published'` and `Set output 'version'`.
- Repo assets verified present: all four Dockerfile targets, `scripts/docker-smoke-test.sh`,
  `scripts/assert-diff-scope.mjs`; tag glob matches 352 tracked tags.

## Open Questions / Residual Risk

- The literal GitHub dispatch-error string could not be retrieved — run-level dispatch errors are
  not exposed via the REST API and no annotation is attached to the check suite. Diagnosis rests
  on four converging lines of evidence rather than a quoted error.
- The publish path stays unproven until the next real release; a PR branch cannot trigger it.

## Environment Notes

- `mcp__harness__run_skill` and `mcp__harness__manage_state` are both broken in this environment:
  the MCP bundle imports `dist/state-events-N3XCOJK3.js` while the installed package ships
  `dist/state-events-TV76F42L.js`. The `harness` CLI itself works. The skill's documented
  fallback (read SKILL.md and follow its workflow directly) was used.
- `harness skill run harness-workflow-audit` reports `Skill not found` — the skill ships as a
  Claude Code skill under `dist/agents/skills/` but is not in the CLI's runnable registry.
- Gitignored `.harness/` runtime state (`sessions/`, `state.json`) is absent in a fresh worktree
  and cannot land on a branch, so this session state is committed as a durable document instead.
