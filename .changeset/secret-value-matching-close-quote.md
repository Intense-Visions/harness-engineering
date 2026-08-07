---
'@harness-engineering/core': patch
---

Extract secret values to the matching close quote, so shell env plumbing stops
reporting as a hardcoded secret.

The reference-vs-literal guard added for the `${{ secrets.X }}` false positive
works, but the value handed to it was truncated. Both extractors used a
character class excluding _both_ quote types — `["']([^"']{8,})` in the
review-tier detector and `['"]([^'"]*)['"]` in `extractQuotedSecretValue` — and
neither understood backslash escapes, so any value containing an inner quote
came back as a fragment:

```sh
GITHUB_TOKEN="$(sed -n 's/^GITHUB_TOKEN=//p' .env)"   # -> $(sed -n
GITHUB_TOKEN="${GITHUB_TOKEN#\"}"                     # -> ${GITHUB_TOKEN#\
```

Neither fragment parses as a command substitution or a brace expansion, so
`isReferenceOnlySecretValue` saw literal residue and reported `critical`. Only
values with no inner quote (`"${TOKEN:-}"`) were suppressed correctly — which is
why the workflow-YAML class looked fixed while the shell class was not.

Extraction is now quote-type aware and escape aware, so the value runs to the
matching close quote. The closing quote stays optional in the review-tier
pattern, so an unterminated string is still scanned rather than skipped.

Verified against a real `.husky/pre-push`: 5 findings → 0. Literal secrets still
fire, including a literal containing an escaped quote.

Refs Capillary/capwell#1372, Capillary/capwell#1216.
