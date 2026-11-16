---
'@harness-engineering/cli': patch
---

autonomy-guard: block `harness autonomy set` raises that evaded the hook's word matcher — options placed between `autonomy` and `set` (`autonomy --verbose set trusted`), brace-expanded words (`{set,}`, `{autonomy,}`), redirections glued to a word (`set</dev/tty`), and arguments appended at runtime by `xargs` / `parallel`. Each previously raised autonomy end to end through `script(1)`. A lowering with a separate stderr redirect (`... supervised --session s 2>/dev/null`) is no longer falsely blocked.
