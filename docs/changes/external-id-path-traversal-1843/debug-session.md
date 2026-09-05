# Debug Session: External-ID path traversal into authenticated api.github.com sink (#1843)

Status: resolved
Resolved: 2026-09-05
Started: 2026-09-05
Error: Not a thrown error — a security defect (CWE-22 / CWE-20 / CWE-441).
`parseExternalId` accepts an External-ID whose `owner`/`repo` captures contain `/`, `..`
and `?`, and callers splice those captures unencoded into
`${apiBase}/repos/${owner}/${repo}/issues/${n}/...` on a request carrying
`Authorization: Bearer <token>`. WHATWG URL normalization collapses the dot segments,
so the credentialed request lands on an attacker-chosen path.

## Investigation Log

### Step 2 — read the defect precisely

`packages/core/src/roadmap/external-id.ts:12` @ 5cd661d74:
const EXTERNAL_ID_RE = /^github:([^/]+)\/([^#]+)#(\d+)$/;
`[^/]+` (owner) admits `.`, `..`, `?`; `[^#]+` (repo) additionally admits `/`.
Neither capture is length-bounded or grammar-checked against GitHub's own
owner/repo name rules.

### Step 3 — reproduced consistently (verbatim regex + verbatim URL template, node 22)

    ESCAPED   github:x/../../../user/emails?#1
        -> https://api.github.com/user/emails?/issues/1/assignees
    ESCAPED   github:a/../../../applications/CLIENTID/token?#1
        -> https://api.github.com/applications/CLIENTID/token?/issues/1/assignees
    ESCAPED   github:o/../../../user/repos?#1
        -> https://api.github.com/user/repos?/issues/1/assignees
    contained github:Intense-Visions/harness-engineering#1843
        -> https://api.github.com/repos/Intense-Visions/harness-engineering/issues/1843/assignees

3 of 4 probes escape `/repos/`. Deterministic — no intermittency. The trailing `?`
truncates the intended `/issues/<n>/assignees` suffix into a query string.

### Step 4 — recent changes

`external-id.ts` has exactly one commit: 863df8f6c (#684). The regex was permissive from
introduction; this is not a regression, it is an original defect.

### Step 6 — data flow, backward from the sink

Source: the `- **External-ID:**` field of any `docs/roadmap.d/*.md` shard (fleet-written,
PR-contributable) -> roadmap store -> adapter method -> `parseExternalId` ->
`${parsed.owner}/${parsed.repo}` -> `fetchWithRetry` / `GitHubHttp.request` with
`Authorization: Bearer ${token}`.

Ten sinks interpolate the parsed captures:
packages/core/src/roadmap/adapters/github-issues.ts 325, 353, 475, 502, 555
packages/core/src/roadmap/tracker/adapters/github-issues.ts 190, 355, 479, 573, 588
All ten sit inside `try { ... } catch { return Err(...) }`, so a rejection at the sink
degrades to the same `Err` contract the `if (!parsed)` guard already produces.

Two of the ten (tracker `fetchById`:190 and `update`:355) happen to be shielded by an
incidental `parsed.owner !== this.owner` equality check. The other eight are not — every
sink in `roadmap/adapters/github-issues.ts` is unshielded, as are tracker
`fetchRawLabels`:479, `appendHistory`:573 and `fetchHistory`:588.

## Uncertainty Surfacing

- Assumption (authorized): tightening the regex is BREAKING and was explicitly authorized
  by the human at the fleet CONFIRM gate; the compatibility-migration check was considered
  and deliberately dropped. A shard-rejection sweep is required as a _report_, not a gate.
- Deferrable: `parseRepoParts` (config-derived `this.owner`/`this.repo`) is operator-supplied
  config rather than PR-contributable content, so it is a different trust tier. Not in scope.
- Deferrable: `packages/orchestrator/src/core/pr-detector.ts:43` re-implements its own
  parse; it feeds no authenticated path sink. Noted, not in scope.

## Hypotheses

H1: The credentialed request's path is attacker-chosen because (a) `EXTERNAL_ID_RE`
accepts owner/repo values GitHub could never issue, and (b) no sink re-validates or
percent-encodes before interpolation.
Prediction: with the verbatim regex + verbatim template, a crafted External-ID yields a
resolved URL whose pathname does not start with `/repos/`.
Test: the repro script above.
Result: CONFIRMED — 3 of 4 probes escape.

## Resolution

Root cause: `EXTERNAL_ID_RE` at `packages/core/src/roadmap/external-id.ts:12` defined the
canonical External-ID format as `^github:([^/]+)\/([^#]+)#(\d+)$`. Those captures are
"everything up to the next delimiter", not GitHub's owner/repo name grammar, so `.`, `..`,
`?` and (for repo) `/` all parsed. Ten adapter sinks then interpolated the captures,
unencoded, into a path on a request carrying the operator's token. The primitive is
method + path control against `api.github.com` with an ambient credential — not
exfiltration to an attacker host, since `apiBase` is a fixed literal.

Fix (both layers, per the human's answer to F1):

1. Regex tightened to owner `[A-Za-z0-9][A-Za-z0-9-]{0,38}` / repo `[A-Za-z0-9._-]{1,100}`,
   plus an explicit `isDotSegment` guard in `parseExternalId` — necessary because
   `encodeURIComponent` does not encode `.`, so `..` survives both the character class and
   the encoding (the lesson #1842 learned the hard way).
2. New `githubRepoPath(owner, repo)` re-asserts and percent-encodes at the sink. It never
   consults the regex, so it still holds if the regex is loosened again. Called at all ten
   call sites immediately before URL construction; all ten already sat inside
   `try { ... } catch { return Err(...) }`, so a rejection degrades to the same `Err`
   contract the `if (!parsed)` guard produced.

Regression test: `packages/core/tests/roadmap/external-id-path-traversal.test.ts`
before fix: 69 failed | 11 passed (80)
after fix: 80 passed (80)
revert-and-fail (`git stash push -- packages/core/src`, test kept): 69 failed | 11 passed
— test verified to catch the bug.

Shard sweep (reported, not gated — breaking was authorized): the shipped validation was
run over all 282 `docs/roadmap.d/*.md` shards. 280 carry a real External-ID, 2 carry an
em-dash placeholder, and **0 are rejected**. A repo-wide scan of 538 distinct
`github:...#N` literals rejects only the 7 attack probes this test introduces plus
`docs/changes/strategy-init-gateway/proposal.md:69` `github:...#543`, which is a prose
ellipsis, not a live External-ID.

Learnings:

- "The one regex that defines the format" is a security boundary the moment any consumer
  splices its captures into a credentialed URL. A delimiter-negation character class
  (`[^/]+`, `[^#]+`) is a parser, not a validator.
- Fixing one call site (#1842) while leaving the format authority permissive inverts the
  intent: the hardened copy becomes the exception. Fix the authority, then re-assert at
  the sinks.
- `encodeURIComponent` is not a traversal defence on its own — it leaves `.` untouched, so
  bare dot segments need their own rejection.
