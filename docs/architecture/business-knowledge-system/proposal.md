# Proposal: Business Knowledge System

**Date:** 2026-04-21
**Topic:** Multi-level business knowledge integrated into the harness graph and context system

---

## Option A: Graph-Native Knowledge with Manual Authoring + Pipeline Validation

**Summary:** Business knowledge as first-class graph nodes authored in `.harness/knowledge/` markdown files, ingested by a new BusinessKnowledgeIngestor, validated by `/harness:knowledge-pipeline`.

**How it works:**

1. Teams author structured markdown files organized by domain
2. BusinessKnowledgeIngestor parses into `business_fact`, `business_concept`, `business_narrative` nodes
3. Skills consume via existing `gather_context` + `Assembler` mechanisms
4. Knowledge pipeline detects drift, gaps, contradictions via convergence loop

**Pros:** Highest quality, lowest technical risk, follows proven ADR pattern, clear ownership
**Cons:** High authoring burden, cold start problem, adoption risk, no connector leverage
**Effort:** Medium (4-6 weeks)
**Risk:** Medium (adoption)
**Best when:** Team has strong documentation culture and ADR discipline

---

## Option B: Connector-Fed Knowledge with Extraction Layer + Auto-Gleaning

**Summary:** Enhanced connectors extract business knowledge from Jira/Slack/Confluence + code signal extractors + KnowledgeLinker second-pass + human enrichment for gaps.

**How it works:**

1. Enhance connectors: raise truncation limits, extract comments/custom fields/hierarchy
2. Code extractors: test descriptions, enum/constants, validation rules, API paths
3. KnowledgeLinker post-processing: cluster, promote, cross-link extracted knowledge
4. Human enrichment for strategic knowledge that can't be auto-extracted
5. Knowledge pipeline validates combined knowledge base

**Pros:** Low authoring burden, bootstraps from existing data, continuous enrichment, progressive value
**Cons:** Noise/false positives, confidence calibration, higher complexity, needs API keys
**Effort:** Large (8-12 weeks)
**Risk:** Medium-High (noise/calibration)
**Best when:** Rich Jira/Slack/Confluence usage, want fast bootstrap

---

## Option C: Multimodal Knowledge Hub — Full Spectrum Ingestion

**Summary:** Everything in Option B + visual knowledge ingestion (diagram-as-code, vision model, design tool APIs) + unified knowledge ontology.

**How it works:**

1. All of Option B
2. Diagram-as-code ingestion (Mermaid/PlantUML/D2 → graph nodes)
3. Vision model analysis of image attachments from external systems
4. Design tool connectors (Figma, Miro APIs)
5. Unified ontology with cross-source deduplication and contradiction detection
6. Most comprehensive knowledge pipeline with visual re-analysis and coverage scoring

**Pros:** Most complete coverage (~85%), diagrams become queryable, cross-source validation
**Cons:** Highest complexity, vision model costs, accuracy variability, long timeline
**Effort:** Very Large (16-24 weeks)
**Risk:** High (scope/accuracy)
**Best when:** Heavy reliance on visual artifacts, long-term strategic investment

---

## Comparison Matrix

| Criterion            | Option A  |  Option B   |  Option C   |
| -------------------- | :-------: | :---------: | :---------: |
| Knowledge quality    |  Highest  |   Medium    | Medium-High |
| Authoring burden     |   High    |     Low     |   Lowest    |
| Cold start time      |   Weeks   |    Days     |    Days     |
| Knowledge coverage   |   ~40%    |    ~70%     |    ~85%     |
| Technical complexity |    Low    | Medium-High |  Very High  |
| Effort to build      | 4-6 weeks | 8-12 weeks  | 16-24 weeks |
| Risk                 |  Medium   | Medium-High |    High     |
| Visual knowledge     |   None    |    None     |    Full     |

---

## Recommendation

**Option B (Connector-Fed + Extraction)** — solves cold start, leverages existing infrastructure, incrementally deliverable, naturally evolves into Option C.

**Option B+** variant: Add diagram-as-code parsing from Option C (low-cost, high-value). Effort: 10-14 weeks.

**Awaiting human decision before proceeding to ADR.**
