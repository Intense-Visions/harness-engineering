---
type: business_concept
domain: architecture
tags: [adr, decisions, knowledge, architecture]
---

# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records for the project. ADRs capture significant technical and architectural decisions along with their context and consequences.

## Format

Every ADR is a Markdown file with YAML frontmatter followed by three required sections:

```yaml
---
number: NNNN
title: <decision title>
date: YYYY-MM-DD
status: accepted | superseded | deprecated
tier: small | medium | large
source: <spec path or session slug>
supersedes: <prior ADR number, if any>
---
```

### Required Sections

- **Context** -- What situation prompted this decision? What constraints existed?
- **Decision** -- What was decided and why?
- **Consequences** -- What follows from this decision (positive, negative, and neutral)?

## Numbering Scheme

- Numbers are sequential, 4-digit, zero-padded: `0001`, `0002`, `0003`, etc.
- File names follow the pattern: `NNNN-<slug>.md` (e.g., `0001-tiered-integration-rigor.md`)
- To find the next number, scan this directory for existing ADR files and increment the highest number by 1. If no ADRs exist, start at `0001`.
- Never reuse a number, even if the ADR is deprecated or superseded.

## Status Values

| Status       | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `accepted`   | Active decision that governs current architecture                   |
| `superseded` | Replaced by a newer ADR (set `supersedes` field in the replacement) |
| `deprecated` | No longer relevant; kept for historical context                     |

## Creating a New ADR

1. Scan this directory for existing files to determine the next number.
2. Create a file named `NNNN-<slug>.md` where `NNNN` is the next sequential number and `<slug>` is a lowercase, hyphenated summary (e.g., `0003-use-graph-for-context`).
3. Fill in the YAML frontmatter with all required fields.
4. Write the Context, Decision, and Consequences sections.
5. Commit the ADR alongside the code it documents -- ADRs are reviewable in PRs.

## Pipeline Ingestion

ADR files in this directory are automatically ingested by the knowledge pipeline as `decision` graph nodes. The pipeline:

- Parses YAML frontmatter for metadata (number, status, tier, source)
- Extracts the body text for content
- Creates `decided` edges to code nodes mentioned in the body
- Tracks `superseded` and `deprecated` status in node metadata
