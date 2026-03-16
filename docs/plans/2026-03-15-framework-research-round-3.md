# Framework Research Round 3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research new AI development frameworks (gstack, gsd-2, + landscape scan), extract adoptable patterns, and synthesize a feature roadmap addendum from all three research rounds.

**Architecture:** Three parallel research agents (gstack deep-dive, gsd-2 deep-dive, landscape scan), followed by sequential synthesis into a single output document at `docs/research/framework-research-round-3.md`.

**Tech Stack:** Web research, GitHub repo analysis, markdown documentation

**Spec:** `docs/specs/2026-03-15-framework-research-round-3-design.md`

---

## Chunk 1: Parallel Research

### Task 1: gstack deep-dive (Agent 1)

**Files:**
- Reference: `docs/research/framework-research-round-2.md` (for format consistency)
- Reference: `docs/specs/2026-03-15-framework-research-round-3-design.md` (for analysis template)

- [ ] **Step 1: Fetch and analyze the gstack repository**

Read the repo at https://github.com/garrytan/gstack — README, directory structure, key source files, configuration files, documentation. Understand what it is, who it targets, and its design philosophy.

- [ ] **Step 2: Web search for context**

Search for articles, blog posts, discussions, tweets, or videos about gstack by Garry Tan or others. Understand the motivation and reception.

- [ ] **Step 3: Write analysis using the per-framework template**

Produce a markdown section covering:
1. **Summary** — What it is, who it targets, scale/maturity
2. **Key Innovations** — What's genuinely novel or well-executed
3. **Adoptable Patterns** — Concrete patterns harness could adopt, with implementation ideas specific to harness
4. **Skip List** — What doesn't fit harness philosophy, with reasoning
5. **Verdict** — "Surface-level sufficient" or "warrants deeper analysis"
6. **Sources** — All URLs consulted

Return the complete markdown section.

---

### Task 2: gsd-2 deep-dive (Agent 2)

**Files:**
- Reference: `docs/research/framework-research-round-2.md` (for format consistency)
- Reference: `docs/specs/2026-03-15-framework-research-round-3-design.md` (for analysis template)

- [ ] **Step 1: Fetch and analyze the gsd-2 repository**

Read the repo at https://github.com/gsd-build/gsd-2 — README, directory structure, key source files, configuration files, documentation. Focus on what's new/changed vs GSD v1.

GSD v1 context (from Round 1): Goal-backward 3-level verification, persistent state, debug session persistence, codebase mapping. The analysis should focus on the DELTA — what v2 adds, changes, or removes.

- [ ] **Step 2: Web search for context**

Search for articles, blog posts, discussions about GSD v2 evolution. Understand what motivated the rewrite/upgrade.

- [ ] **Step 3: Write analysis using the per-framework template**

Produce a markdown section covering:
1. **Summary** — What it is, who it targets, how it differs from v1
2. **Key Innovations** — What's new in v2 specifically
3. **Adoptable Patterns** — New patterns not already captured from v1, with implementation ideas
4. **Skip List** — What doesn't fit, with reasoning
5. **Verdict** — "Surface-level sufficient" or "warrants deeper analysis"
6. **Sources** — All URLs consulted

Return the complete markdown section.

---

### Task 3: Landscape scan (Agent 3)

**Files:**
- Reference: `docs/research/framework-research-round-2.md` (for format consistency)
- Reference: `docs/specs/2026-03-15-framework-research-round-3-design.md` (for analysis template and exclusion list)

- [ ] **Step 1: Search for new frameworks across all categories**

Run web searches across these categories:
- Agent-first dev toolkits and context engineering frameworks
- AI code review and constraint enforcement tools
- Prompt management and skill/rule platforms
- Agentic IDE extensions and autonomous coding agents

Search queries should include terms like: "agentic development framework 2026", "AI coding agent toolkit", "context engineering framework", "AGENTS.md framework", "claude code skills framework", "AI dev workflow", "spec-driven development tool", "AI code review tool 2026", "prompt management platform", "agentic IDE".

- [ ] **Step 2: Triage candidates**

From search results, build a candidate list. For each candidate:
- Name and URL
- One-line description
- Relevance score (high/medium/low) to harness engineering's problem space

Exclude frameworks already covered:
- Round 1: Spec Kit, BMAD, GSD v1, Superpowers, Ralph Loop
- Round 2: Claude Flow/Ruflo, Gas Town, Turbo Flow, Devika, Tessl, Cursor P/W/J, OpenSpec
- Round 3 known targets: gstack, gsd-2 (handled by other agents)

- [ ] **Step 3: Analyze high and medium relevance candidates**

For each viable candidate (aim for 4-8 frameworks), produce a per-framework analysis:
1. **Summary** — What it is, who it targets, scale/maturity
2. **Key Innovations** — What's genuinely novel
3. **Adoptable Patterns** — Concrete patterns for harness
4. **Skip List** — What doesn't fit, with reasoning
5. **Verdict** — "Surface-level sufficient" or "warrants deeper analysis"
6. **Sources** — All URLs consulted

Return all framework sections as markdown, plus the full triage list (including rejected candidates with rejection reasons).

---

## Chunk 2: Synthesis and Document Assembly

### Task 4: Assemble the research document

**Files:**
- Create: `docs/research/framework-research-round-3.md`
- Reference: `docs/research/framework-research-round-2.md` (for format, cross-framework themes, existing patterns)

- [ ] **Step 1: Collect all agent outputs**

Gather the complete markdown sections from Tasks 1, 2, and 3.

- [ ] **Step 2: Write the Executive Summary**

Summarize:
- Total frameworks analyzed
- Top findings
- Top 5 adoptable patterns table (pattern, source framework, effort, impact)

- [ ] **Step 3: Assemble Per-Framework Analysis sections**

Place gstack and gsd-2 first, then landscape scan finds in order of relevance/interest.

- [ ] **Step 4: Write Cross-Framework Analysis**

Cover:
- Common themes across Round 3 frameworks
- New themes not seen in Rounds 1 or 2 (compare against Round 2's cross-framework themes: persistent state, mechanical verification, phase gates, structured handoffs, swarm dead-end)
- What harness already does better

- [ ] **Step 5: Write Consolidated Adoptable Patterns**

List all new patterns from Round 3, deduplicated against:
- Round 1 adopted patterns (constitution/principles, cross-artifact validation, scale-adaptive intelligence, goal-backward verification, persistent state, debug persistence, codebase mapping, rigid workflows, subagent dispatch, verification discipline, fresh context per iteration, append-only learnings, AGENTS.md as knowledge base, task sizing)
- Round 2's 14 patterns (mechanical done criteria, checkpoint handoffs, tagged learnings, skip-AI-for-deterministic, session continuity, phase gates, anti-pattern logs, specs/changes separation, structured handoffs, delta-spec format, skill scoring, internal monologue, keyword accumulation, error budgets, CDLC maturity model)

Priority-rank by effort (low/medium/high) and impact (low/medium/high).

- [ ] **Step 6: Write Feature Roadmap Addendum**

Synthesize high-priority patterns from ALL three rounds into concrete "build next" recommendations:
- Each recommendation should name the pattern, source framework(s), what it means concretely for harness, effort estimate, and impact estimate
- Order by suggested implementation sequence (dependencies first, quick wins early)
- Group into near-term (next sprint), medium-term, and longer-term

- [ ] **Step 7: Review and finalize**

Read the complete document end-to-end. Check:
- All sections present per spec
- No duplicate patterns across consolidated list
- Sources are complete
- Verdicts are honest
- Roadmap addendum is actionable, not hand-wavy

- [ ] **Step 8: Commit**

```bash
git add docs/research/framework-research-round-3.md
git commit -m "docs: add framework research round 3 — gstack, gsd-2, and landscape scan"
```

---

## Chunk 3: Memory and Reference Updates

### Task 5: Update project memory

**Files:**
- Modify: `/Users/cwarner/.claude/projects/-Users-cwarner-Projects-harness-engineering/memory/reference_competitor_frameworks.md`
- Modify: `/Users/cwarner/.claude/projects/-Users-cwarner-Projects-harness-engineering/memory/project_future_framework_research.md`
- Modify: `/Users/cwarner/.claude/projects/-Users-cwarner-Projects-harness-engineering/memory/MEMORY.md`

- [ ] **Step 1: Update competitor frameworks reference**

Add Round 3 frameworks to `reference_competitor_frameworks.md` following the existing format (framework name, dash, key patterns adopted/extracted, skip rationale).

- [ ] **Step 2: Update future framework research project memory**

Update `project_future_framework_research.md` to reflect Round 3 completion. Remove any frameworks from the "to research" list that were covered. Note the roadmap addendum as the actionable output.

- [ ] **Step 3: Verify MEMORY.md index**

Ensure all memory files are properly indexed. Add any new memory files if created.
