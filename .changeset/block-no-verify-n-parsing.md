---
'@harness-engineering/cli': patch
---

fix(hooks): `block-no-verify` now parses `git commit -n` per command segment. A `-n` that belongs to a later chained command (`echo -n`, `head -n 3`, `grep -n`) no longer blocks a legitimate commit, and aggregated short-option clusters containing `n` (`-nm`, `-an`, `-anm`) are now blocked. Value-taking options consume their cluster remainder (`-mn x` is message "n", allowed), non-commit git subcommands (`git log -n 3`) are never blocked, and arguments after `--` are treated as pathspecs. (#2147)
