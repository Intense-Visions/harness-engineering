---
'@harness-engineering/core': patch
---

The per-module dependency-depth check now reads its limit from the object form that
`harness.config.json` uses (`"dependency-depth": { "max": 7 }`). Before this it only
accepted a bare number, so the object form resolved to no limit and no module could ever
report a violation. The bare-number form still works. The rule description also names
the configured limit again ("must not exceed 7") instead of the generic text.

On this repo the live limit of 7 now reports 16 modules over it, as arch **warnings**.
