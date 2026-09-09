---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(provenance): shape gate + `harness provenance` reader for the `Harness-*` commit trailer

The governed provenance trailer had an emitter and no readers. This adds both.

`harness provenance <sha>` parses and prints the trailer for a commit (defaults
to `HEAD`), in a readable key/value block or as JSON. A commit that carries no
trailer is reported honestly — `no provenance trailer on <sha>`, exit 3 — never
as a silent empty success. An unresolvable ref exits 2 with a message naming it.

`harness provenance --check [--range <range>]` is the CI-callable shape gate: for
every commit that DOES carry a `Harness-Run` trailer it validates the required
keys, a known schema version, an intact `<skill>@<version>`, and the absence of
duplicated keys, exiting 1 on a malformed trailer. It always prints the counts it
examined, so "nothing to validate" can never read as "validated everything". It
is wired as an advisory PR job.

Core gains `validateProvenanceTrailer` and `collectProvenanceTrailerEntries`. The
latter is the single scanner for the trailer grammar, now shared by
`parseProvenanceTrailer` and the validator, so a second parser cannot drift from
the emitter. `parseProvenanceTrailer`'s behaviour is unchanged.

The gate deliberately does NOT require a commit to carry a trailer: commits
without one are reported as unclaimed and skipped. Defining which commits are
"agent-authored", and whether presence should block or warn, remains open.
