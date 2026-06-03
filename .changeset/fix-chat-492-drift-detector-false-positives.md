---
'@harness-engineering/core': patch
---

Reduce `harness cleanup --type drift` false positives on ADR-heavy projects (chat-492):

- Inline-reference extractor now rejects BCP-47 locale codes (`vi`, `cs`, `pt-BR`, `zh-Hant-CN`) and file-name backticks (`AGENTS.md`, `harness.config.json`, `.gitignore`) so they no longer surface as "symbol not found" drift.
- API-signature drift detection skips refs inside forward-looking docs by default: `docs/architecture/`, `docs/decisions/`, `docs/proposals/`, `docs/adr/`. These describe intended future code and shouldn't drift-check against the current codebase. Configurable via `DriftConfig.forwardLookingPaths`.
- Markdown link parser splits `file.md#anchor` before the file-existence check, eliminating false-positive structure drift on anchor links. When the file exists, the anchor is validated against the target file's GFM-slugged headings — surfacing as `link-anchor` context with `medium` confidence so real typos (e.g. em-dash slug mistakes) still get caught.
