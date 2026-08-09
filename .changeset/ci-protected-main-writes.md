---
'@harness-engineering/cli': patch
---

Fix CI's two paths for landing housekeeping commits on a protected `main`.

`roadmap-auto-done.yml` declared `permissions: pull-requests: read`, but its branch-protection fallback calls `gh pr create` with the built-in `GITHUB_TOKEN`. That call failed with `Resource not accessible by integration (createPullRequest)` _after_ the branch had already been pushed, so every merge into a protected branch stranded a `chore/auto-done-pr*` branch and silently dropped its roadmap flip. The fallback was added without widening the permission, so it had never once succeeded — 58 stranded branches had accumulated, spanning a long run of merges.

`release.yml`'s "Promote golden build reference state" step pushed straight to `main` with no fallback at all, so it failed on every publish with `GH013: Changes must be made through a pull request`. The packages had already gone out by that point, so releases went red _after_ shipping and the golden reference manifest never advanced. It now uses the same retry-then-scope-guarded-self-approved-PR path as auto-done, with the diff guard pinned to `.harness/golden/manifest.json`.

Branch protection is unchanged; both paths land through auditable, scope-checked PRs.
