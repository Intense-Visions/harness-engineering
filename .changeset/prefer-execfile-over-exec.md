---
'@harness-engineering/eslint-plugin': patch
---

Add prefer-execfile-over-exec ESLint rule — flags child_process exec/execSync
calls made with a string command (shell invocation) and steers toward
execFile/execFileSync with an argument array. Registered in the recommended
(warn) and strict (error) configs.
