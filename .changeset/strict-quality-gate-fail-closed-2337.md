---
'@harness-engineering/cli': patch
---

The strict-profile `strict-quality-gate` hook no longer reports a pass when it has no
verdict. A formatter that times out (classified with the new `reason: 'timeout'` on
`infra-error` results) and a hook stdin that cannot be read now block with exit 2 instead
of failing open. Under load, a `gofmt` kill at the 10s timeout used to look identical to
"tool not installed", so a genuine violation was allowed through.

A missing or unparseable formatter still fails open. `strict-quality-gate` and
`quality-warner` now read stdin through the shared `read-hook-stdin.js` reader, and the
installer ships it alongside them. The formatter spawn timeout can be overridden with
`HARNESS_FORMAT_CHECK_TIMEOUT_MS`.
