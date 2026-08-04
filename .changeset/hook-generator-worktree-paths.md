---
'@harness-engineering/cli': patch
---

fix(cli): generated hook commands resolve the main checkout, not the worktree cwd

`harness hooks init` and `harness hooks add` generated settings.json hook
commands of the form `node "$(git rev-parse --show-toplevel)/.harness/hooks/<name>.js"`.
That form has two production failure modes (seen in real repos, 2026-07-31):

1. **Linked worktree.** `--show-toplevel` returns the _worktree_ root, where the
   machine-local, gitignored `.harness/` does not exist → `MODULE_NOT_FOUND` on
   every tool call. Because the failure is non-blocking, the verify-bypass
   blocker and quality gate **silently stop protecting worktree sessions** —
   gates report as hook errors instead of running. With agent-per-worktree
   workflows, most agent work goes ungated.
2. **Non-repo cwd.** `git rev-parse` fails and spams
   `fatal: not a git repository` on every tool call.

Both generators now share a `buildHookCommand(name)` helper that emits:

```sh
g="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0; f="$(dirname "$g")/.harness/hooks/<name>.js"; [ -f "$f" ] || exit 0; exec node "$f"
```

`--git-common-dir` resolves to the **main** checkout even from a linked
worktree, so gates run (and protect) against the main repo's `.harness`; the
`|| exit 0` guards make the hook a silent no-op outside a repo or on a machine
without `.harness`; and `exec node` preserves the hook's blocking exit code (2).

Already-onboarded repos keep the old pattern until they re-run `harness hooks
init` — a `harness doctor` migration check is worth a follow-up.
