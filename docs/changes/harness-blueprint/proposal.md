# Spec: harness:blueprint — Automated Architectural Learning

**Status:** Proposal
**Date:** March 24, 2026
**Keywords:** pedagogy, knowledge-graph, interactive-docs, onboarding, visualization

## 1. Overview & Goals

New developers often struggle to build a mental model of a complex codebase. Existing documentation is often stale, fragmented, or purely reference-oriented. While Harness provides excellent tools for _agents_ to understand code, it lacks a high-signal, interactive "onboarding" experience for humans that is both visually engaging and technically accurate.

**Goals:**

- **Automate Onboarding:** Generate a self-contained, interactive HTML "blueprint" of any codebase.
- **Architectural Accuracy:** Use the Harness Knowledge Graph to derive the "teaching order" (dependencies first) and identify critical paths.
- **Interactive Learning:** Include code-to-English translations, "what breaks" impact exercises, and quizzes derived from actual code relationships.
- **Zero Friction:** One command (`harness:blueprint`) produces a shareable, offline-first artifact.

---

## 2. Decisions Made (Rationale)

- **Output Format: Single HTML File.**
  - _Rationale:_ High "wow" factor, zero setup for the consumer, and easy sharing (Slack/Email). Since it's a generated artifact, the lack of Git-diffability is acceptable.
- **Scope: General-Purpose Skill.**
  - _Rationale:_ Every project managed by Harness should benefit from automated learning, not just Harness itself.
- **Depth: Deep Graph Integration.**
  - _Rationale:_ This is the "Harness Moat." Using the graph for pedagogical ordering and impact analysis makes the content categorically better and more accurate than a standalone LLM scan.
- **Strategy: Pedagogical-First (Approach 2).**
  - _Rationale:_ Focuses on structured learning and reading comprehension over flashy but potentially cluttered 3D graph visualizations. Incorporates graph data "under the hood" to verify claims and generate exercises.

---

## 3. Technical Design

### 3.1 Input & Discovery

- **Command:** `harness:blueprint [path]`
- **Graph Prerequisite:** Requires a populated graph (`harness ingest`). If the graph is missing, the skill will prompt the user to run ingestion first or offer a "Lightweight" fallback using file-system heuristics.
- **Context Discovery:** Query the graph for:
  - **Leaf Nodes:** Utility files with zero inbound dependencies (start of the course).
  - **Hubs:** Highly-coupled files (critical architectural concepts).
  - **Entry Points:** Main exports, CLI bins, or API controllers (end of the course).

### 3.2 Syllabus Generation (LLM + Graph)

The skill generates a JSON "Syllabus" that maps graph nodes to pedagogical modules:

- **Module 1: Foundations** (Leaf nodes/Utils)
- **Module 2: Core Logic** (Mid-level services)
- **Module 3: Interaction Surface** (APIs/UI)
- **Module 4: Cross-Cutting Concerns** (Security, Logging, Observability)

### 3.3 Content Synthesis Engine

For each module, the LLM generates:

- **"Code Translation":** High-level logic explanation side-by-side with code blocks.
- **"Graph Insights":** Automated Callouts: _"This function is a central hub used by 15 other modules."_
- **"Impact Lab":** An interactive widget that lets the user "toggle" a change and see a list of affected files (data provided by `mcp_harness_get_impact`).
- **"Knowledge Check":** 3-5 multiple-choice questions derived from actual function signatures and type definitions.

### 3.4 The Blueprint Viewer (Frontend)

- **Tech:** Single HTML file using a bundled CSS/JS "player" (modern Vanilla CSS + Alpine.js or similar lightweight lib).
- **Design System Integration:** The generator shall attempt to query the project's design tokens (via `harness:design-tokens` if available) to skin the viewer. It will use the project's brand colors, typography, and spacing for a seamless "at home" feel.
- **Features:**
  - **Progress Tracking:** LocalStorage-based (persistent across sessions).
  - **Code Playground:** Read-only code blocks with syntax highlighting and "explain this line" tooltips.
  - **Mini-Graph:** A localized D3 visualization for each module showing its immediate neighbors.

---

## 4. Success Criteria

- **Completeness:** When the user runs `harness:blueprint`, the system shall generate a single HTML file containing at least 4 modules covering the entire project scope.
- **Accuracy:** If the graph contains dependency information, the modules shall be ordered from lowest dependency (foundations) to highest (entry points).
- **Interactivity:** The generated HTML shall include at least one "Impact Lab" exercise per module that correctly lists downstream dependencies.
- **Performance:** The generation process shall complete in under 3 minutes for a mid-sized (50k LOC) codebase.

---

## 5. Implementation Order

1. **Phase 1: The Shell.** Create the static HTML/CSS/JS template for the viewer with placeholder data.
2. **Phase 2: Graph Integration.** Implement the "Syllabus" generator that translates graph topology into a module list.
3. **Phase 3: Content Generation.** Build the LLM pipeline for "Code-to-English" and "Quiz" generation.
4. **Phase 4: Impact Lab.** Wire up the `mcp_harness_get_impact` data into the HTML export.
5. **Phase 5: Refinement.** Add branding, polish transitions, and optimize file size.
