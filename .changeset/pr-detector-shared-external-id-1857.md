---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): route PRDetector External-ID parsing through the core authority (#1857)

`PRDetector` defined its own `parseExternalId` around a verbatim copy of the
**pre-#1843** pattern `/^github:([^/]+)\/([^#]+)#(\d+)$/`, so the two-layer hardening
that #1854 landed in `@harness-engineering/core` never reached this consumer. That file
documents itself as the "single source of truth ... so the `github:owner/repo#NNN` shape
can never drift" — a claim that was already false at this call site.

The parsed `owner`/`repo` are interpolated into an authenticated
`gh pr list --repo <owner>/<repo>`. Two things bound the exposure and are stated rather
than overstated: the value travels through `execFile` **argv**, not a shell string, so
this is not command injection, and `gh` performs its own `--repo` validation. This is a
drift defect with a latent security dimension, not a second exploitable instance of
#1843.

`parseExternalId` now delegates to core's, and `githubRepoPath` is applied at both
`--repo` argv sinks — `hasOpenPRForExternalId` and the public `fetchOpenPRClosures` —
immediately before the value is built, because core's sink check deliberately never
consults the regex, so loosening it again cannot silently re-open the traversal.

The tightening is deliberately BREAKING for External-IDs GitHub itself could never have
issued; that trade was made and accepted in #1843/#1854 and is propagated here rather
than re-decided. `PRDetector`'s documented fail-open contract is unchanged: a rejected
External-ID degrades on exactly the path an unparseable one already took — `false` from
`hasOpenPRForExternalId`, `null` from `fetchOpenPRClosures`, a `logger.debug` line at the
pre-existing level, no throw, and no candidate newly blocked.
