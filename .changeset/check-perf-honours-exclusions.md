---
'@harness-engineering/cli': patch
---

`harness check-perf` now analyses the same files as `harness cleanup` and a clean CI checkout.
It honours `entropy.excludePatterns` (#2077), which `cleanup` already threaded into the same
analyzer, so a directory a project explicitly excluded (generated code, a bundled cache) no longer
fails the perf gate. It also skips every path git ignores (#2331), asking git itself so nested
`.gitignore` files and `.git/info/exclude` apply; a gitignored build directory in a local working
tree no longer makes the same commit fail locally and pass in CI. Tracked files under an ignored
path are still analysed, and a directory outside a git repository is analysed as before.
