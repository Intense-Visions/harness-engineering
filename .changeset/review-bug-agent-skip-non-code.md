---
'@harness-engineering/core': patch
---

The review bug-detection heuristics (division-by-zero, empty-catch) now only
scan code files. They read raw lines and match code patterns, so running them
on non-code files produced false positives — most notably a `/` in a scoped
package name inside a Markdown changeset (`@scope/pkg`) read as a division,
flagging every publishable PR's changeset as "potential division by zero" in
the floor-only (no-LLM) review tier. Gated both detectors to
`.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` via an `isCodeFile` check.
