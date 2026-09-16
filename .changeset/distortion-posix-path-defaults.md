---
'@harness-engineering/cli': patch
---

Spell `distortion`'s path defaults as POSIX literals so the generated CLI reference
is the same on every platform.

`DEFAULT_INPUT`, `DEFAULT_MODEL_OUT` and `REFINEMENT_EVENTS` were built with
`path.join('.harness', 'metrics', …)`. The first two are option defaults, so they are
printed in `--help` and embedded verbatim in `docs/reference/cli-commands.md` — and a
Windows regeneration emitted `.harness\metrics\…` where a Linux one emitted
`.harness/metrics/…`, failing the reference-docs drift gate for whoever regenerated
second.

Node's fs accepts forward slashes on Windows, so the spelling is fixed at the source
rather than teaching the doc generator to normalise separators, which would have to
tell a path from any other backslash in the text.

No behaviour change: the same files are read and written.
