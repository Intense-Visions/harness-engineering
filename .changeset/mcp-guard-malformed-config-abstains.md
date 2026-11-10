---
'@harness-engineering/cli': patch
---

`harness mcp-guard check` no longer reports a present-but-unparseable `.mcp.json` as clean. It now abstains (`abstained: { reason }`, `ok: false`), prints an explicit `ABSTAINED: ... nothing was verified` line, and exits `3` under `--strict` (fail-open `0` by default). A missing `.mcp.json` is unchanged.
