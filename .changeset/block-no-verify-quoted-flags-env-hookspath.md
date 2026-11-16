---
'@harness-engineering/cli': patch
---

block-no-verify hook: tokenize each command the way the shell does, so a quoted flag (`git commit "-n"`, `'--no-verify'`) is still caught while a quoted commit message (`-m "use -n here"`) is still treated as a value; and block `core.hooksPath` set through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_<n>` or `GIT_CONFIG_PARAMETERS` on a hook-running git command (#2147).
