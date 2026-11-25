---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat: the review provenance stamp in `harness pre-merge-brief` (shift-left pipeline fidelity, unit 4 of 5).

`harness pre-merge-brief` gains a **Review provenance** section between the review verdict and the Signal status. It reads the stamp `harness review-provenance render` printed into the PR body and shows it as stated in the PR body, not verified: the section always opens by saying so, because the PR author writes the body and the receipts it would be checked against are machine-local. It keeps only rows and notes the renderer can write and counts the lines it left out; it shows a body the reader did not read as `conflicting`, `too-large` or `ambiguous` (with its reason), never as "no pipeline review recorded" and never as a pass; it prints "unavailable" when the PR body could not be read; and it adds a line when the PR head is not the commit the stamp's `final-all` row passed at. `--pr <number>` names the PR to read and comment on (default: the number in `GITHUB_REF`, else the current branch's PR) and takes only a positive decimal number: anything else, or a malformed `refs/pull/` ref, exits 1 and nothing is read or posted. The brief is cut at a line end, with a mark, when it is longer than 60,000 characters. The required-review workflow and the `ci-pre-merge-brief` template pass `--pr`.

Core adds `renderParsedStamp` and `stampHeadNotice` next to `parseProvenanceStamp`; the CLI adds the PR reader (`defaultPrReader`, `resolvePrNumber`) to `review-receipts/io`.
