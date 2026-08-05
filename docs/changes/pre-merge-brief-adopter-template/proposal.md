# Graduate pre-merge-brief to an adopter template + ruleset

## Problem

The senior-facing pre-merge brief (`harness pre-merge-brief`) runs today only on
harness's own dogfood — as a step inside the required-review dogfood workflow.
Adopters who install `@harness-engineering/cli` have the command but no
first-class, `harness init`-rendered artifact wiring it into their CI. The
required-review gate already made this jump: it graduated from a dogfood workflow
to a discoverable, opt-in `ci-required-review` template. The pre-merge brief
should follow the same path so adopters can opt in with one `harness init` render
and a documented, admin-applied ruleset for the eventual gate.

## Approach

Mirror the `ci-required-review` graduation exactly. Ship a standalone,
discoverable named template directory, rendered by the existing `TemplateEngine`
with no engine or schema change:

- `templates/ci-pre-merge-brief/pre-merge-brief.yml.hbs` — a `pull_request`
  workflow whose single `pre-merge-brief` job runs `harness review-ci --out`
  (continue-on-error) then `harness pre-merge-brief --from … --comment`, upserting
  a single sticky senior-facing PR comment.
- `templates/ci-pre-merge-brief/pre-merge-brief.ruleset.json` — a GitHub ruleset
  marking the `pre-merge-brief` check as a required status check, targeting
  `~DEFAULT_BRANCH`. Applied manually by a repo admin (deferred), for the eventual
  acknowledgment gate.
- `templates/ci-pre-merge-brief/template.json` — registers the directory as the
  opt-in named template `ci-pre-merge-brief` (no `level`/`framework`), so
  `TemplateEngine.listTemplates()` discovers it and `harness init` can render it.
- `templates/ci-pre-merge-brief/README.md` — adopter documentation (generic; no
  harness-internal roadmap/PR/issue numbers).

The template variables (`runner`, `blockOn`, `baseBranch`) and the GitHub-Actions
`${{ … }}` per-line escaping match the `ci-required-review` template so the two
stay maintainable together.

## Why it is safe for a plain adopter CI

`harness pre-merge-brief` has no daemon, signal-provider, or agent-runner
dependency. Every section (diff, review verdict, Signal status, outcome-eval,
guardian, "worth your eyes") degrades independently to an "unavailable" line when
its input is absent, and the command always exits 0. All dependencies are bundled
in the published CLI. The brief is informational; gating on the review verdict
remains the `ci-required-review` template's job (this workflow's `review-ci` step
is `continue-on-error`).

## Known limitation (out of scope)

The review-verdict section is fed by handing the `review-ci --out` artifact to
`pre-merge-brief --from`. At present `review-ci --out` writes the bare verdict
object, while `pre-merge-brief`'s `readReview` expects a `{ verdict: … }`-wrapped
`CiReviewResult`; when the shapes do not match, the review section renders
"unavailable" and every other section still populates. Aligning that
producer/consumer artifact contract is a separate change to the two commands and
is intentionally not bundled into this template graduation.

## Acceptance criteria

1. A new `templates/ci-pre-merge-brief/` directory ships the workflow template,
   ruleset, `template.json`, and README.
2. `TemplateEngine.listTemplates()` discovers `ci-pre-merge-brief` as a named
   template with no `level`/`framework` (proven by test).
3. Rendering `pre-merge-brief.yml.hbs` with `runner`/`blockOn`/`baseBranch`
   produces valid YAML whose `pre-merge-brief` job: runs `review-ci --out`
   (continue-on-error) and `pre-merge-brief --from … --comment`; diffs
   `origin/${{ github.base_ref }}...HEAD`; declares `contents: read` +
   `pull-requests: write`; and preserves every `${{ … }}` expression verbatim
   (no `\{{` artifact).
4. The workflow job name and the ruleset's `required_status_checks[].context`
   are the identical literal `pre-merge-brief` (proven by test).
5. The rendered/shipped template and README contain no harness-internal
   roadmap/PR/issue numbers.
