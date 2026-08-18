---
'@harness-engineering/cli': minor
---

feat(mcp): add `manage_adr` tool for programmatic ADR CRUD. Exposes Architecture Decision Records (`docs/knowledge/decisions/NNNN-<slug>.md`) as a structured MCP tool with create / read / update / list actions, symmetric to `manage_roadmap`. `create` allocates the next collision-free ADR number (`max(existing)+1`, zero-padded) — the scheme required by the known number-collision defect (#1323) — and writes a well-formed record with Context/Decision/Consequences sections at `status: proposed` by default. `read` resolves by number, slug, or filename; `update` patches frontmatter and body sections without ever reusing a number. Until now ADRs were only reachable through skill-mediated prose (`adr-fleet`, `architecture-advisor`).
