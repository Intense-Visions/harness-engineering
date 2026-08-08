---
'@harness-engineering/cli': minor
---

Add a `docs-publish` code connector configured via `harness.config.json`. Introduces a `DocsPublishConnector` interface (operations: draft, attach-media, verify-render, page-tree) with a config-driven resolver that degrades gracefully when no connector is configured, a Confluence implementation (page CRUD + sidebar move via Atlassian REST, ADF media-single serialization, Playwright-based render verification), a `harness docs-publish <op>` CLI command, and a `docs_publish` MCP tool. The headless-impossible attachment upload is modeled as a typed manual-step result the pipeline surfaces to the human. Playwright is an optional peer dependency loaded lazily. The former `docs-publish` and `docs-publish-confluence` skills are removed; `proposal-pitch` now invokes the connector surface.
