# Roadmap Status Reconcile

## Problem

The roadmap auto-done automation is supposed to flip a shard to `Status: done`
when its linked GitHub issue closes. It had fallen behind: many shards whose
work is genuinely shipped (their linked issue is **CLOSED / COMPLETED**) were
still sitting at `Status: planned` (a couple at `in-progress`).

### Why the auto-done gap happens (External-ID vs PR-number mismatch)

Each shard carries an `**External-ID:**` of the form
`github:Intense-Visions/harness-engineering#NNN`, where `NNN` is the **issue**
number. Work usually merges via a **pull request** whose number is different
from the issue number. The auto-done path keys off the merge/PR signal, so when
the closing PR number does not line up with the shard's issue-numbered
External-ID, the automation never fires and the shard is left stranded at
`planned` even though the issue is closed. This mismatch pattern has been
observed repeatedly and is the root cause of the drift reconciled here.

## Authoritative signal

An item is DONE **iff its linked GitHub issue is CLOSED.** We do not infer
done-ness from keyword or PR guessing. Each non-done shard's External-ID issue
number was resolved and its live state fetched from the GitHub API (a single
batched GraphQL query over all referenced issues). Only shards whose issue came
back `state = CLOSED` were flipped; every one of those also carried
`stateReason = COMPLETED`.

## What was done

- Enumerated all shards in `docs/roadmap.d/*.md` (excluding `_meta.md` and any
  already `Status: done`): 86 non-done shards.
- Batch-checked all 86 linked issues against the GitHub API. 28 were CLOSED; the
  rest OPEN (including some REOPENED). No issue numbers were missing or errored.
- Flipped exactly those **28** shards to `**Status:** done` in place — only the
  Status field was touched, no other frontmatter or body field.
- Regenerated `docs/roadmap.md` deterministically via
  `harness roadmap regen`. The aggregate done-count went from 22 to 50 (+28).

Scope discipline: OPEN issues were left untouched. No shard was flipped on a
guess. The `manage_roadmap` MCP tool and `harness roadmap sync` were deliberately
avoided (known writeback bugs that can dup-create issues / abort batches); shard
markdown was edited directly.

## Flipped shards (slug — issue#)

| Shard                                                                                                           | Issue | Prior status |
| --------------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| add-per-skill-capability-declarations                                                                           | #558  | planned      |
| adopt-the-article-s-framing-in-docs-standard-principles-md                                                      | #554  | planned      |
| adopter-facing-git-hook-installer-for-roadmap-aggregate-regeneration                                            | #688  | planned      |
| audit-and-cap-the-pre-commit-skip-list                                                                          | #529  | planned      |
| auto-wire-standalone-drift-and-audit-pipelines-on-prs                                                           | #664  | planned      |
| bug-roadmap-harness-roadmap-sync-never-stamps-last-synced-on-success                                            | #1037 | planned      |
| bug-roadmap-sync-writeback-resolves-shards-by-title-slug-not-frontmatter-slug-silently-aborting-the-whole-batch | #1036 | planned      |
| build-harness-offboarding-skill-symmetric-to-onboarding                                                         | #562  | planned      |
| craft-pipeline-sub-project-2-docs-craft                                                                         | #376  | planned      |
| craft-pipeline-sub-project-4-code-craft                                                                         | #379  | planned      |
| craft-pipeline-sub-project-8-cli-ergonomics                                                                     | #383  | planned      |
| document-the-article-s-failure-pattern-checklist                                                                | #555  | planned      |
| graduate-pre-merge-brief-to-adopter-template-ruleset                                                            | #732  | planned      |
| invert-readme-lede-to-lead-with-the-article-s-binary-question                                                   | #553  | planned      |
| maintenance-checks-need-a-standard-machine-parseable-findings-contract                                          | #691  | in-progress  |
| make-pre-push-test-coverage-gate-deterministic-isolate-parallel-unsafe-tests                                    | #620  | planned      |
| nfr-elicitation-in-planning                                                                                     | #581  | planned      |
| owned-files-declaration-in-plans-tasks                                                                          | #601  | planned      |
| pin-mcp-server-version-in-plugin-install-document-trust-model                                                   | #557  | planned      |
| promote-5-domain-skills-from-advisory-to-load-bearing-checks                                                    | #547  | planned      |
| question-file-interview-mode                                                                                    | #582  | planned      |
| reframe-principles-md-around-why-what-how-three-layer-model                                                     | #568  | planned      |
| require-adr-for-operational-policy-changes                                                                      | #565  | planned      |
| sharded-roadmap-archive-done-rows-into-docs-roadmap-d-archive                                                   | #695  | planned      |
| skill-provider-freshness                                                                                        | #1066 | planned      |
| strengthen-telemetry-consent-surface                                                                            | #559  | planned      |
| strip-internal-roadmap-pr-references-from-shipped-skills-artifacts                                              | #1059 | planned      |
| wire-outcome-eval-into-the-lifecycle-as-an-automatic-spec-satisfaction-gate                                     | #662  | in-progress  |

## Left untouched

The other 58 non-done shards had OPEN linked issues and were left as-is. No
shards had missing or erroring issue numbers.
