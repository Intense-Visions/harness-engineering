---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(validate): MCP `validate_project`, `harness validate` and `harness ci check` now reach one verdict on missing AGENTS.md sections (#2669)

A missing required AGENTS.md section (`Project Overview`, `Repository Structure`, `Development Workflow`) was a blocking error in MCP `validate_project`, invisible to `harness validate`, and a warning in `harness ci check`. All surfaces now derive the finding from one shared core verdict, `agentsMapSectionFindings`, at one severity — `warning`: reported, never flipping `valid`. MCP `validate_project` reports it under a new `warnings` array instead of `errors`, and `harness validate` now surfaces it as a warning-severity `agentsMap` issue. Broken AGENTS.md links are unchanged.

Every scaffold template's AGENTS.md (`base`, `go-base`, `java-base`, `python-base`, `rust-base`) now carries the required sections, so a freshly initialised project passes harness's own section check.
