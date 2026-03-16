# Framework Research Round 3: Design Spec

**Date:** 2026-03-15
**Goal:** Pattern mining + feature roadmap input from new and emerging AI development frameworks
**Output:** `docs/research/framework-research-round-3.md`

---

## Research Scope & Targets

### Known Targets

1. **gstack** (garrytan/gstack) — Garry Tan's framework. Details unknown; full analysis required.
2. **gsd-2** (gsd-build/gsd-2) — GSD v2 evolution. Round 1 covered GSD v1 extensively; this research focuses on what's new/changed in v2.

### Landscape Scan Criteria (Wide Net)

Categories to scan:
- Agent-first dev toolkits and context engineering frameworks
- AI code review and constraint enforcement tools
- Prompt management and skill/rule platforms
- Agentic IDE extensions and autonomous coding agents

Inclusion criteria:
- Gained meaningful traction since mid-March 2026, or was missed in prior rounds
- Relevant to harness engineering's problem space

Exclusion criteria:
- Frameworks already covered in Round 1 (Spec Kit, BMAD, GSD v1, Superpowers, Ralph Loop)
- Frameworks already covered in Round 2 (Claude Flow/Ruflo, Gas Town, Turbo Flow, Devika, Tessl, Cursor P/W/J, OpenSpec)

---

## Per-Framework Analysis Template

Each framework gets the same structure used in Round 2:

1. **Summary** — What it is, who it targets, scale/maturity
2. **Key Innovations** — What's genuinely novel or well-executed
3. **Adoptable Patterns** — Concrete patterns harness could adopt, with implementation ideas
4. **Skip List** — What doesn't fit harness philosophy, with reasoning
5. **Verdict** — "Surface-level sufficient" or "warrants deeper analysis"
6. **Sources** — Links to repos, docs, articles

---

## Output Document Structure

Single file: `docs/research/framework-research-round-3.md`

### Sections

1. **Executive Summary** — Top findings, framework count, top 5 adoptable patterns table
2. **Per-Framework Analysis** — gstack, gsd-2, and each landscape scan find (using template above)
3. **Cross-Framework Analysis**
   - Common themes across Round 3 frameworks
   - New themes not seen in Rounds 1 or 2
   - What harness already does better
4. **Consolidated Adoptable Patterns** — All new patterns from this round, priority-ranked by effort (low/medium/high) and impact (low/medium/high), deduplicated against Rounds 1 and 2
5. **Feature Roadmap Addendum: Three Rounds Synthesized** — Merges high-priority patterns from all three research rounds into concrete "build next" recommendations for harness, with effort/impact scoring and suggested implementation order

---

## Research Methodology

### Parallel Execution

Three research agents run concurrently:

- **Agent 1: gstack deep-dive** — Repo analysis (README, docs, source structure, design philosophy), web search for articles/discussions
- **Agent 2: gsd-2 deep-dive** — Repo analysis focused on delta from GSD v1 (already covered in Round 1), new capabilities, architectural changes
- **Agent 3: Landscape scan** — Web search for new/emerging frameworks across all scan categories, triage by relevance, surface-level analysis of each viable find

### Synthesis

After all agents return:
- Merge findings into single document
- Deduplicate patterns against Rounds 1 and 2
- Build cross-framework analysis
- Construct roadmap addendum from all three rounds

### Quality Bar

- Each framework gets an honest verdict — no inflating importance
- Adoptable patterns must be concrete enough to implement (not just conceptual observations)
- Skip lists are explicit about *why* something doesn't fit harness philosophy
- Roadmap addendum only includes patterns that survived deduplication against all 22 prior research entries (5 from Round 1, 7 from Round 2)

---

## Prior Research Context

### Round 1 (Deep Dives)
Spec Kit, BMAD Method, GSD, Superpowers, Ralph Loop

### Round 2 (Surface Analysis, 2026-03-14)
Claude Flow/Ruflo, Gas Town, Turbo Flow, Devika, Tessl, Cursor P/W/J, OpenSpec
- 14 adoptable patterns identified
- Top 4: mechanical "done" criteria, checkpoint handoffs, phase gates, anti-pattern logs

### Round 3 (This Research)
gstack, gsd-2, + landscape scan (estimated 4-8 additional frameworks)
