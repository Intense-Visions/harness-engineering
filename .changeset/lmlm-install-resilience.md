---
'@harness-engineering/orchestrator': minor
'@harness-engineering/local-models': minor
'@harness-engineering/types': minor
---

fix(lmlm): resilient model installs — resumable pulls, restart recovery, and lineage scoring

Three follow-ups to the async operator install (#775):

- **Resumable pulls.** `OllamaInstallAdapter` gains opt-in retry-with-resume
  (`maxPullRetries` / `pullRetryBackoffMs` / `pullRetryMaxBackoffMs`; the
  orchestrator enables 5). A multi-GB `ollama pull` that loses its `/api/pull`
  stream mid-download — most often the host sleeping mid-install — re-issues the
  pull (ollama resumes from cached blobs) instead of dead-ending in an error. The
  budget counts consecutive non-progressing attempts, so any forward byte progress
  resets it; a canceled request or a missing model still fails fast.

- **Restart recovery.** A model add/swap approval marks its proposal `installing`
  (new `ModelProposalStatus`) for the duration of the pull. If the orchestrator
  restarts mid-download, startup finds the `installing` proposals and re-drives them
  — `onApproveModelProposal` is idempotent, so ollama resumes the pull (or no-ops if
  it already finished) and progress streams to a reconnecting dashboard. The status
  reverts to `open` on a retryable failure, and the approve route rejects a
  re-approve while `installing`.

- **Lineage score interpolation.** A candidate with no direct benchmark used to
  floor to `score: 0` while labelled `evidence: 'interpolated'` (a misnomer), so real
  models like `Qwen/Qwen3-8B-GGUF` showed "score 0 · interpolated" and churned the
  pool once installed. The ranker now infers a score from same-series siblings by
  parameter count (linear in size, clamped to the measured range, dampened by `'low'`
  benchmark confidence so it never outranks a direct measurement); only a series with
  no measured sibling still scores 0.
