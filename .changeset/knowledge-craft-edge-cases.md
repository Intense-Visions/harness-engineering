---
'@harness-engineering/cli': patch
---

fix(knowledge-craft): harden discovery and critique-validation edge cases

Three latent bugs found by the bug-fleet hunt over `packages/cli/src/knowledge-craft/`:

- Discovery gated `.md` case-sensitively (`endsWith('.md')`) while the README
  exclusion right below it was case-insensitive, so a `NOTES.MD` entry was
  silently skipped. The extension gate is now case-insensitive to match.
- `maxFiles` guarded only `null`/`undefined`, so a negative value hit JS
  negative-index `slice` semantics and silently dropped trailing entries
  (`maxFiles: -1` scanned all but the last file). A negative / non-finite cap
  now falls back to the default; `maxFiles: 0` still caps to zero.
- The critique parser rejected only truly-empty messages, so a whitespace-only
  `message` became a finding with an unusable body. It is now trimmed before the
  non-empty check.
