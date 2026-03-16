# Framework Research Round 3: New Entrants & Landscape Scan

**Date:** 2026-03-15
**Scope:** 2 known targets (gstack, gsd-2) + landscape scan yielding 8 additional frameworks

---

## Executive Summary

10 frameworks were researched across two known targets and a wide landscape scan. **GSD v2 warrants deeper analysis** — its context pipeline architecture and deterministic/LLM split contain battle-tested patterns with documented failure modes. The remaining frameworks are surface-level sufficient with extractable patterns.

The landscape scan found 21 candidates, of which 8 were analyzed (HIGH or MEDIUM relevance). The field has shifted notably since Round 2: spec-driven development is now mainstream (Kiro, Composio), MCP-based context delivery is emerging as a standard (Augment, Goose), and AI code review has matured into a distinct category (CodeRabbit, Qodo).

### Top 5 Patterns Worth Adopting

| Pattern | Source | Effort | Impact |
|---------|--------|--------|--------|
| Deterministic-vs-LLM responsibility split | GSD v2 | Low | High |
| 1:1 code-to-context ratio for reviews | CodeRabbit | Low | High |
| Change-type-aware review workflows | Qodo | Medium | High |
| Cognitive-mode separation in skills | gstack | Low | Medium |
| Just-in-Time context filtering per phase | Composio | Medium | High |

---

## 1. gstack (Garry Tan)

**Summary:** gstack is an open-source collection of 8 Claude Code slash-command skills created by Garry Tan (Y Combinator President/CEO) that reframe the AI coding assistant as a team of specialized roles — CEO, engineering manager, staff engineer, release engineer, QA lead, and retrospective facilitator. It targets experienced Claude Code users who want consistent, high-rigor workflows rather than generic responses. Released March 2026, it includes a compiled Playwright browser binary as its most technically novel component.

**Key Innovations:**
- Explicit cognitive-mode switching via role-based skills — each slash command activates a distinct "brain" (e.g., `/plan-ceo-review` for founder-level product thinking, `/review` for paranoid staff-engineer auditing), enforcing the principle that "planning is not review, review is not shipping"
- Persistent headless browser daemon — compiled Playwright binary (~58MB) runs a long-lived Chromium process over localhost HTTP, preserving cookies, localStorage, and login state across commands with 100-200ms execution after ~3s cold start
- Full shipping automation — `/ship` orchestrates git sync, test suite execution, push, and PR creation as a single atomic workflow
- Diff-aware QA — `/qa` analyzes git diffs to identify affected pages/routes, tests only what changed, produces health scores and accumulated screenshot reports
- Cookie import from real browsers via macOS Keychain extraction

**Adoptable Patterns:**

1. **Cognitive-mode separation in skill definitions.** gstack's strongest idea is that each skill should embody a single, named cognitive stance — not just "do X task" but "think like role Y." Harness skills could adopt explicit `## Cognitive Mode` frontmatter or a structured `persona` field in skill metadata that declares the reasoning style (e.g., "adversarial reviewer," "product strategist," "documentation pedant"), making the agent's thinking frame mechanically specified rather than implied.

2. **Phased workflow orchestration.** gstack defines a canonical flow: plan → engineer → code → review → ship → QA → retro. Harness could formalize a `workflow` construct — a sequence of skills with defined handoff points and artifact expectations between phases — allowing users to define pipelines like `plan-skill → implement-skill → lint-skill → review-skill` with typed intermediate outputs using the existing Result<T,E> pattern.

3. **Accumulated QA artifacts.** gstack persists QA reports in `.gstack/qa-reports/` and retro snapshots in `.context/retros/` for trend tracking across sessions. Harness could adopt a standardized `.harness/artifacts/` directory convention with typed artifact schemas (test reports, lint summaries, review findings) that skills read from and write to, enabling cross-skill state without databases.

4. **Diff-aware skill targeting.** Rather than running QA against an entire project, gstack scopes testing to git-diff-affected areas. Harness's linter-gen and eslint-plugin packages could expose a `changedFiles()` utility that any skill can call to scope its work to what actually changed, reducing token usage and improving relevance.

**Skip:** Persistent browser daemon (requires compiled Playwright binary and platform-specific builds — violates "no runtime requirements beyond Node.js"), macOS Keychain cookie extraction (platform-specific, security-sensitive), Greptile integration (external SaaS dependency), Conductor parallel execution (requires external orchestrator), `/retro` team analytics with per-person metrics (harness targets individual developer workflow, not team management).

**Verdict:** Surface-level sufficient — gstack's core innovation is packaging role-based prompting into Claude Code's skill system with a browser runtime. The cognitive-mode and phased-workflow patterns are directly adoptable, but the implementation is Markdown prompt files with no programmatic enforcement, which harness already surpasses with its linter-based mechanical constraints.

**Sources:** [GitHub: garrytan/gstack](https://github.com/garrytan/gstack), [SitePoint](https://www.sitepoint.com/gstack-garry-tan-claude-code/), [MarkTechPost](https://www.marktechpost.com/2026/03/14/garry-tan-releases-gstack-an-open-source-claude-code-system-for-planning-code-review-qa-and-shipping/), [TurboDocx](https://www.turbodocx.com/blog/garry-tan-gstack), [Product Hunt](https://www.producthunt.com/products/gstack)

---

## 2. GSD v2 (gsd-build/gsd-2)

**Summary:** GSD v2 is a complete rewrite of the original GSD prompt framework, transforming it from a set of meta-prompts for Claude Code into a standalone TypeScript CLI built on the Pi SDK that directly controls agent sessions programmatically. Where v1 was a prompt-injection layer relying on the host agent's context window, v2 is a full agent runtime with its own model registry, event system, extension architecture, native Rust performance modules, and multi-provider support (20+ LLM providers). It targets developers who want autonomous milestone-scale coding with walk-away reliability.

**Key Innovations (New in v2):**
- Standalone agent runtime (Pi SDK foundation) — GSD owns the agent loop, tool executor, session manager, and compaction engine, giving it programmatic control over context clearing, session branching, model switching, and crash recovery
- Deterministic orchestrator / LLM reasoning split — TypeScript state machines handle workflow transitions, context assembly, file operations, and task scheduling deterministically; the LLM handles only understanding, reasoning, and code generation
- Context pipeline with hook system — formal 6-stage pipeline (input → skill expansion → before_agent_start → turn loop with context event → tool execution → agent_end) where extensions can intercept, transform, filter, or inject messages at each stage
- Branchless worktree architecture (v2.14.0) — eliminated slice branches after they caused ~582 lines of merge/conflict code and persistent loop-detection bugs; all work commits sequentially on a single `milestone/<MID>` branch with squash-merge to main
- Native Rust engine (v2.10.0+) — N-API modules for grep (ripgrep), glob, process management, AST search (ast-grep, 38+ languages), HTML-to-markdown, streaming JSON parsing, and diff generation
- Multi-provider model routing per phase — different models for different workflow phases (e.g., Opus for planning, Sonnet for execution, Flash for research)
- 17 bundled extensions including subagent dispatch, MCP integration, browser tools, and voice
- Research depth calibration — three-tier system (deep/targeted/light) matching effort to complexity
- Parallel tool calling (v2.12.0) — tools from a single assistant message execute concurrently

**Adoptable Patterns:**

1. **Deterministic-vs-LLM responsibility split.** GSD v2 rigorously separates what TypeScript code handles (state transitions, context assembly, file validation, test execution, scheduling) from what the LLM handles (intent understanding, architectural reasoning, code generation, debugging). Harness could formalize this as a design principle in its standard: any operation expressible as if-else should be enforced mechanically (which harness already does via eslint-plugin and linter-gen), and skills/personas should be explicit about which decisions are LLM judgment calls vs. deterministic enforcement.

2. **Staged context pipeline with typed injection points.** GSD v2's 6-stage context pipeline with strict semantics about what can be modified at each stage is a powerful pattern. Harness could adopt a similar formalization in its skill/persona system: define explicit lifecycle hooks where context can be injected or filtered, with typed contracts for what each hook receives and returns. This would make skills composable with predictable context behavior.

3. **Token budget allocation by category.** GSD v2 prescribes explicit token budgets per category (15% system prompt, 5% manifest, 20% task spec, 40% active code, 10% interfaces, 10% reserve) with intelligent summarization when budgets are exceeded. Harness could adopt this as a constraint in its context engineering guidance — providing a recommended token budget template or as a skill that assembles context within budget limits.

4. **Error taxonomy with routing.** GSD v2 classifies errors into 7 categories (syntax/type, logic, design, performance, security, environment, flaky tests) with different context assembly strategies for each. Harness could implement this as a diagnostic skill: when an agent encounters an error, classify it first, then route to the appropriate resolution strategy rather than dumping everything into the LLM.

5. **Branchless worktree isolation.** The hard-won lesson — slice branches created 582+ lines of merge/conflict code and persistent bugs, while sequential commits on a single branch within an isolated worktree eliminated the entire category of problems. Harness could document this as an operational pattern: for agent-driven work, prefer worktree-per-milestone with sequential commits over branch-per-task, and squash-merge to main.

6. **Phase-aware prompt assembly.** GSD v2 swaps system prompt layers based on the current phase (planning gets decomposition/interface/risk context; execution gets implementation/testing context; debugging gets diagnosis/hypothesis context). Harness personas could adopt this more explicitly — rather than static persona definitions, have phase-variant prompt sections that activate based on the current task type.

7. **Cascading summarization at state transitions.** GSD v2 compresses context at every phase transition using dedicated summarization calls (not self-summarization by the working agent), with cascading ratios: task summaries → milestone summaries → phase summaries at 5:1 compression. Harness could provide a summarization skill implementing this pattern, ensuring long-running sessions maintain fidelity without context rot.

**Skip:** Multi-provider model registry and OAuth credential management (harness delegates auth to the host agent), native Rust N-API engine modules (massive build complexity with platform-specific binaries), voice transcription and browser automation extensions (out of scope), real-time TUI dashboard (harness operates within the host agent's UI), remote questions via Slack/Discord (cloud service dependencies), full agent loop ownership (harness enhances existing agents rather than replacing them).

**Verdict:** Warrants deeper analysis — GSD v2's context pipeline architecture, deterministic/LLM split, error taxonomy routing, and branchless worktree ADR contain concrete, battle-tested patterns (with documented failure modes across 40+ releases) that directly inform harness's context engineering and mechanical constraint enforcement approach.

**Sources:** [GitHub: gsd-build/gsd-2](https://github.com/gsd-build/gsd-2), [gsd.build](https://gsd.build), [CHANGELOG](https://github.com/gsd-build/gsd-2/blob/main/CHANGELOG.md), [ADR-001: Branchless Worktree Architecture](https://github.com/gsd-build/gsd-2/blob/main/docs/ADR-001-branchless-worktree-architecture.md), [Context & Hooks docs](https://github.com/gsd-build/gsd-2/tree/main/docs/context-and-hooks), [Pi SDK docs](https://github.com/gsd-build/gsd-2/tree/main/docs/what-is-pi)

---

## 3. Kiro (AWS)

**Summary:** Kiro is an agentic IDE from AWS built on Code OSS (VS Code's open-source base) that implements spec-driven development through a structured three-phase workflow: requirements (using EARS syntax), technical design, and task decomposition. Free during public preview; pricing will range from $0-$39/month at GA.

**Key Innovations:**
- EARS (Easy Approach to Requirements Syntax) for structured requirement capture that constrains ambiguity before code generation
- Three-phase spec workflow enforced by the IDE: stories with acceptance criteria → design doc → implementation tasks, each phase gates the next
- Automated hooks that trigger on file changes (auto-update specs when code changes, auto-run tests on implementation)
- One-command project init generating specs, design docs, and deployment-ready scaffolding

**Adoptable Patterns:**

1. **EARS-style requirement syntax.** EARS provides a structured grammar for acceptance criteria: "When [trigger], the system shall [response]" / "While [state], the system shall [behavior]". Harness could adopt a simplified EARS template in its spec/planning skills — a section in the SKILL.md that enforces EARS patterns for acceptance criteria, reducing ambiguous requirements.

2. **File-change hooks for spec-code synchronization.** Kiro's automated hooks detect when implementation files change and trigger spec updates. Harness could implement a lightweight hook pattern in its linter or as a skill that validates spec-code alignment — checking that implementation changes are reflected in corresponding spec documents.

3. **Phase-gated project initialization.** Kiro's `project init` generates requirements, design, and tasks in sequence before any code. Harness's template system could adopt a similar phased init where templates enforce "generate spec first, validate spec, then scaffold code."

**Skip:** AWS service lock-in (harness is cloud-agnostic), IDE-as-platform model (harness is editor-agnostic), tiered pricing model, VS Code fork maintenance burden.

**Verdict:** Surface-level sufficient — EARS requirement syntax and file-change hooks are concrete, implementable patterns that align with harness's spec-first and mechanical enforcement philosophy.

**Sources:** [kiro.dev](https://kiro.dev/), [TheNewStack](https://thenewstack.io/aws-kiro-testing-an-ai-ide-with-a-spec-driven-approach/), [Kiro Specs Docs](https://kiro.dev/docs/specs/), [Caylent: First Impressions](https://caylent.com/blog/kiro-first-impressions), [Martin Fowler: SDD Tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)

---

## 4. Composio Agent Orchestrator

**Summary:** Open-sourced in February 2026, this is a TypeScript-based framework (40K lines, 3,288 tests) for orchestrating parallel coding agents. Each agent gets its own git worktree, branch, and PR. The orchestrator decomposes tasks, monitors progress, and handles CI failures autonomously. Notably self-built by agents.

**Key Innovations:**
- Planner/Executor separation preventing "greedy" single-loop decision-making
- Just-in-Time context management — only feeds relevant tool definitions for the current task
- Git worktree isolation per parallel agent
- Structured error recovery with specific error-handling branches

**Adoptable Patterns:**

1. **Just-in-Time context filtering.** Only providing relevant tool definitions per task step is a powerful context engineering pattern. Harness skills could dynamically narrow the context window based on the current phase — during "implement" phase, only surface implementation-related tools and files; during "review" phase, only surface testing and linting tools. Implementable as a context-shaping utility in the core package.

2. **Planner/Executor separation in skill design.** Skills involving multi-step work could explicitly separate the planning phase (output a task list) from the execution phase (work the list), with a validation gate between them. Prevents "greedy" execution where the agent starts coding before fully understanding scope.

3. **Structured error branching.** Rather than generic "retry on failure," route specific error types to specific recovery handlers. Harness's Result<T,E> pattern already supports typed errors — extending this to skills with error-specific recovery branches (lint failure → auto-fix, type error → investigation, test failure → debug skill) would be a natural evolution.

**Skip:** Parallel agent swarms (harness targets single-agent workflows), git worktree orchestration at framework level, self-building agents (interesting but not reproducible), 17-plugin architecture (too heavy).

**Verdict:** Surface-level sufficient — Just-in-Time context filtering and Planner/Executor separation are the two high-value patterns.

**Sources:** [GitHub: ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator), [Composio Blog](https://composio.dev/blog/the-self-improving-ai-system-that-built-itself), [MarkTechPost](https://www.marktechpost.com/2026/02/23/composio-open-sources-agent-orchestrator-to-help-ai-developers-build-scalable-multi-agent-workflows-beyond-the-traditional-react-loops/)

---

## 5. Goose (Block)

**Summary:** Open-source (Apache 2.0) AI agent from Block (Square/Cash App) written in Rust, designed as an extensible agent framework where all capabilities are delivered through MCP extensions. Runs locally with any LLM supporting tool calling. Both CLI and desktop interfaces.

**Key Innovations:**
- Extension-first architecture — all capabilities (file editing, terminal, web scraping, memory) are MCP servers, making the agent a thin orchestration layer
- Dual-interface pattern — Desktop GUI and CLI share identical core configuration
- Built-in memory extension persisting context across sessions
- Model-agnostic with multi-model configuration

**Adoptable Patterns:**

1. **Thin agent core with capability extensions.** Goose's architecture where the agent is just an orchestration loop and ALL tools come through MCP extensions is an elegant separation. Harness could make its skill system more modular — skills declare tool dependencies as MCP-compatible interfaces rather than embedding tool logic, making skills portable across agent runtimes.

2. **Built-in memory extension pattern.** Harness could formalize its memory/learnings pattern as a structured memory skill with defined read/write interfaces — similar to how Goose treats memory as just another MCP extension with clear APIs.

3. **Configuration-driven interface adaptation.** Harness could ensure skill definitions and linter configs are interface-agnostic — working identically whether invoked from Claude Code CLI, an MCP server, or a future IDE integration.

**Skip:** Desktop GUI (harness is CLI/editor-focused), Rust implementation (harness is TypeScript), fully autonomous execution model (harness emphasizes human-in-the-loop), 1,700+ MCP server ecosystem (too broad).

**Verdict:** Surface-level sufficient — extension-first architecture and memory patterns are valuable conceptual models, but Goose targets a different audience.

**Sources:** [GitHub: block/goose](https://github.com/block/goose), [Goose Architecture](https://block.github.io/goose/docs/goose-architecture/), [Block Introduces Goose](https://block.xyz/inside/block-open-source-introduces-codename-goose)

---

## 6. CodeRabbit

**Summary:** AI code review platform processing 13M+ pull requests across 2M+ repositories. Uses multi-agent architecture where specialized agents examine code from different perspectives. SOC2 Type II certified. Free for open-source.

**Key Innovations:**
- 1:1 code-to-context ratio — for every line of code reviewed, equal weight of surrounding context (tickets, dependencies, past PRs, learnings)
- Learning from team feedback — tracks thumbs-up/thumbs-down and adapts future reviews
- Multi-perspective agent review — separate agents for security, logic, style, architecture
- CLI mode integrating with AI coding agents for pre-commit review

**Adoptable Patterns:**

1. **1:1 code-to-context ratio as a review principle.** Review quality depends on providing equal context weight alongside the code being reviewed. Harness's code-review skill could adopt this explicitly: when reviewing a diff, gather an equal token budget of context (related files, specs, recent changes, test coverage) before invoking review.

2. **Feedback-loop learnings for review calibration.** A review-learnings file where the human records which findings were useful vs. noise, and the review skill consults this to calibrate focus areas. Aligns with harness's documentation-first approach.

3. **Pre-commit CLI review integration.** A `pre-commit-review` skill or git hook integration that runs linting + AI review before allowing a commit — enforcing quality gates mechanically.

**Skip:** Multi-agent parallel review architecture (single agent), SaaS/hosted model, Jira/ticket integration, per-review pricing.

**Verdict:** Surface-level sufficient — 1:1 context ratio and feedback-loop learnings are concrete, implementable patterns.

**Sources:** [coderabbit.ai](https://www.coderabbit.ai/), [CodeRabbit Docs](https://docs.coderabbit.ai/), [Context Engineering Blog](https://www.coderabbit.ai/blog/context-engineering-ai-code-reviews), [Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/how-coderabbit-built-its-ai-code-review-agent-with-google-cloud-run)

---

## 7. Qodo

**Summary:** Multi-agent code integrity platform (formerly CodiumAI) focused on testing, review, and quality across the SDLC. Achieved highest F1 score (60.1%) on real-world AI code review benchmarks. Offers 15+ agentic review workflows. Cross-language, cross-framework testing generation.

**Key Innovations:**
- Code integrity as a unified concept — testing, review, and quality gates as one interconnected system
- 15+ agentic review workflows selected based on change type (new feature, bug fix, refactor)
- Context engine reasoning about impact across services, not just single files
- Benchmark-driven development with published F1/precision/recall metrics

**Adoptable Patterns:**

1. **Change-type-aware review workflows.** Select different review workflows based on change type. The code-review skill could accept a change-type parameter and apply different checklists: refactor review focuses on behavioral equivalence; feature review focuses on spec alignment and edge cases; bug fix review focuses on regression prevention.

2. **Code integrity as unified concept.** An `integrity` meta-skill chaining test generation, lint checking, and AI review into a single "integrity check" workflow with a unified pass/fail report.

3. **Benchmark-driven quality metrics for skills.** Define measurable quality metrics for harness skills — what percentage of issues does the review skill catch vs. miss? Creates a feedback loop for skill improvement.

**Skip:** SaaS platform model, IDE plugin architecture, enterprise deployment, cross-repo service graph.

**Verdict:** Surface-level sufficient — change-type-aware review selection and unified integrity concept are the highest-value patterns.

**Sources:** [qodo.ai](https://www.qodo.ai/), [Qodo 2.0 Blog](https://www.qodo.ai/blog/introducing-qodo-2-0-agentic-code-review/), [Qodo Benchmark Blog](https://www.qodo.ai/blog/how-we-built-a-real-world-benchmark-for-ai-code-review/)

---

## 8. Augment Code Context Engine

**Summary:** Commercial semantic codebase indexer maintaining live understanding of entire codestacks across repos, services, and git history. Available as an MCP server for Claude Code, Cursor, and Zed. Claims 30-80% quality improvements when added to existing agents. Indexes up to 500K files.

**Key Innovations:**
- Semantic indexing understanding meaning and relationships, not just text matching
- Context Lineage — indexes recent commits including message, author, timestamp, and changed files
- MCP-based delivery making it agent-agnostic
- 70%+ performance improvement across different agents

**Adoptable Patterns:**

1. **Context-as-MCP-service pattern.** Harness's MCP server package could expose codebase context (skill definitions, linter rules, project structure) as MCP resources any agent can consume — making harness's context available beyond Claude Code.

2. **Commit history as context layer.** Skills involving review or implementation could automatically include recent commit history for affected files — "here are the last 5 commits touching this area" gives the agent temporal awareness.

3. **Relationship-aware file discovery.** A skill or utility maintaining a dependency map (using TypeScript's module resolution or import analysis) that surfaces related files when a skill needs to understand impact.

**Skip:** 500K-file enterprise scale, commercial SaaS model, cross-repo indexing, proprietary semantic engine.

**Verdict:** Surface-level sufficient — MCP-as-context-service and commit-history-as-context are the two transferable insights.

**Sources:** [augmentcode.com/context-engine](https://www.augmentcode.com/context-engine), [Context Engine MCP](https://www.augmentcode.com/product/context-engine-mcp), [Context Lineage Blog](https://www.augmentcode.com/blog/announcing-context-lineage)

---

## 9. Claude Code Skill Factory

**Summary:** Open-source toolkit for generating production-ready SKILL.md files, slash commands, and hooks at scale. Includes 5 interactive guide agents, 8 slash commands, reference implementations, and factory prompt templates. Targets developers creating their own skills.

**Key Innovations:**
- Meta-skill pattern — skills that generate other skills
- Interactive Q&A-based generation asking 5-7 questions, producing a complete SKILL.md
- Hook Factory generating pre/post-tool execution hooks with installation and validation
- Slash Command Factory through structured questionnaire

**Adoptable Patterns:**

1. **Skill scaffolding via interactive questionnaire.** Harness's CLI could include a `harness create-skill` command walking the user through a questionnaire (what does this skill do? what files does it read? what validation does it need?) and generating a properly structured skill with frontmatter, instructions, and test stubs.

2. **Hook generation as first-class concern.** Harness could formalize hook generation as part of skill creation: every skill template includes optional pre-execution validation (e.g., "verify spec exists") and post-execution validation (e.g., "run linter after code generation").

**Skip:** Quantity-over-quality approach (generating skills at "scale" risks dilution), dependency on Claude Code's specific skill format (harness has its own architecture), non-coding skills (content research, social media — outside scope).

**Verdict:** Surface-level sufficient — interactive skill scaffolding and hook generation patterns are useful for developer experience, but the Skill Factory is prompt templates rather than a framework.

**Sources:** [GitHub: alirezarezvani/claude-code-skill-factory](https://github.com/alirezarezvani/claude-code-skill-factory)

---

## 10. Product Manager Skills

**Summary:** Open-source collection of 46 product management skills for AI agents by Dean Peters, built on established PM methodologies (Teresa Torres' Opportunity Solution Trees, Geoffrey Moore's positioning, Amazon's Working Backwards). Works with Claude Code, Codex, ChatGPT, and any agent that reads structured markdown.

**Key Innovations:**
- Domain-specific skill library extending AI agents into non-coding workflows using SKILL.md format
- Interactive advisors — skills that ask questions and guide decisions rather than executing tasks
- Battle-tested methodology encoding translating well-known PM frameworks into structured agent skills
- Multi-week workflow orchestration

**Adoptable Patterns:**

1. **Upstream skill categories.** Skills don't have to be limited to code execution. Harness could create an "upstream" category for pre-implementation work: requirements validation, spec review, acceptance criteria generation — extending the human-architect philosophy with better planning tools.

2. **Interactive advisor pattern.** Instead of skills that just execute, advisor skills ask diagnostic questions and guide the human to a decision. Harness could adopt this for architectural decisions — an "architecture-advisor" skill that asks questions about the problem space and helps the human architect make informed choices before specifying work.

3. **Methodology-as-skill encoding.** Taking established methodologies (TDD, refactoring recipes, debugging protocols) and encoding them as structured skills with explicit step sequences, rather than leaving methodology choice to the agent's discretion.

**Skip:** Non-engineering focus (PM skills outside core domain), multi-week workflow timelines, dependency on external PM tools, breadth over depth (46 skills risks dilution).

**Verdict:** Surface-level sufficient — interactive advisor pattern and methodology-as-skill encoding are the highest-value takeaways.

**Sources:** [GitHub: deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills)

---

## Landscape Scan: Full Triage List

| # | Name | Relevance | Status |
|---|------|-----------|--------|
| 1 | Kiro (AWS) | HIGH | Analyzed above |
| 2 | Composio Agent Orchestrator | HIGH | Analyzed above |
| 3 | Goose (Block) | HIGH | Analyzed above |
| 4 | CodeRabbit | HIGH | Analyzed above |
| 5 | Qodo | HIGH | Analyzed above |
| 6 | Augment Code Context Engine | MEDIUM | Analyzed above |
| 7 | Claude Code Skill Factory | MEDIUM | Analyzed above |
| 8 | Product Manager Skills | MEDIUM | Analyzed above |
| 9 | Greptile | MEDIUM | Partial overlap with CodeRabbit; AI code review with codebase graph indexing |
| 10 | Roo Code | LOW | IDE extension, no novel framework patterns |
| 11 | Aider | LOW | Mature tool, no new patterns for harness |
| 12 | Zencoder / Zenflow | LOW | Closed-source enterprise product |
| 13 | Emergent | LOW | Targets no-code users, opposite philosophy |
| 14 | SkillsMP | LOW | Directory/marketplace, not a framework |
| 15 | levnikolaevich/claude-code-skills | LOW | Skill collection, not a framework |
| 16 | Agenta | LOW | LLMOps SaaS, not agent-first dev |
| 17 | LangGraph | LOW | General agent framework, not coding-specific |
| 18 | CrewAI | LOW | General agent framework, not coding-specific |
| 19 | Microsoft Agent Framework | LOW | Enterprise platform, not coding-workflow specific |
| 20 | AGENTS.md (open standard) | LOW | Standard/spec, harness already uses AGENTS.md |
| 21 | Cursor Rules (.mdc) | LOW | IDE-specific config, covered via Cursor P/W/J in Round 2 |

---

## Cross-Framework Analysis

### Common Themes

1. **Spec-driven development has gone mainstream.** Kiro (AWS), Composio, and gstack all enforce "spec before code" as a core workflow. In Round 2, this was an emerging pattern (Turbo Flow, Cursor); now it's table stakes. Harness's documentation-first approach was ahead of the curve.

2. **Context engineering is the new frontier.** GSD v2's token budget allocation, CodeRabbit's 1:1 context ratio, Composio's JIT context filtering, and Augment's semantic indexing all converge on the same insight: the quality of what you put IN the context window matters more than the model you use. This validates harness's context engineering principle.

3. **Deterministic guardrails around LLM freedom.** GSD v2's deterministic/LLM split, Kiro's EARS constraints, Qodo's typed review workflows, and harness's own linter enforcement all point toward the same architecture: use code (not prompts) to constrain what the LLM can do, and let the LLM handle only what requires judgment.

4. **MCP as the integration standard.** Goose, Augment, GSD v2, and multiple others have converged on MCP as the way to expose and consume agent capabilities. Harness's mcp-server package is well-positioned.

5. **Review and integrity are distinct from generation.** CodeRabbit, Qodo, gstack, and Composio all treat code review as a specialized discipline requiring different context, different reasoning modes, and different validation criteria than code generation. This supports harness's separation of concerns in skills.

### New Themes Not Seen in Rounds 1 or 2

1. **Token budget allocation as a quantifiable constraint.** GSD v2 and CodeRabbit both assign specific percentages of the context window to specific types of content. Prior rounds identified "context engineering" conceptually but didn't quantify it.

2. **Change-type-aware routing.** Qodo and GSD v2's error taxonomy both route to different workflows based on the TYPE of input, not just its presence. Prior rounds focused on phase gates (is there a spec?) but not content-aware routing.

3. **Skill factories and meta-skills.** The Skill Factory and PM Skills demonstrate that skills can generate other skills — a level of meta-abstraction not present in prior rounds.

4. **Interactive advisors.** PM Skills' advisor pattern (ask questions to guide decisions) is distinct from executor patterns (do the thing) seen in prior rounds.

### What Harness Already Does Better

- **Mechanical constraint enforcement** — Still unique. No other framework uses linters and type systems to enforce architectural constraints. Kiro has file-change hooks but no programmatic enforcement.
- **Lean footprint** — GSD v2 grew into a full agent runtime with Rust N-API modules; gstack ships a 58MB Playwright binary; Goose is a Rust binary. Harness remains pure TypeScript/Node.js.
- **Human-architect model** — Validated again. Composio's Planner/Executor split and Kiro's spec-first workflow both confirm that human-directed planning + AI execution produces better results than fully autonomous agents.
- **Unified types/core/cli/eslint stack** — No other framework has a coherent type system flowing from shared types through a core library into both CLI tooling and ESLint rules.

---

## Consolidated Adoptable Patterns (Priority Order)

Deduplicated against Rounds 1 and 2. Only NEW patterns not previously identified are listed.

**High priority (low effort, high impact):**

| # | Pattern | Source | Notes |
|---|---------|--------|-------|
| 1 | Deterministic-vs-LLM responsibility split | GSD v2 | Formalize as a design principle: if it's if-else, enforce mechanically |
| 2 | 1:1 code-to-context ratio for reviews | CodeRabbit | Quantifiable heuristic for review skill context assembly |
| 3 | Cognitive-mode separation in skills | gstack | Add persona/cognitive-mode field to skill metadata |
| 4 | Commit history as context layer | Augment | Include recent commits for affected files in review/implement skills |
| 5 | Feedback-loop learnings file | CodeRabbit | Review-learnings file calibrating review focus areas |

**Medium priority (medium effort, medium-high impact):**

| # | Pattern | Source | Notes |
|---|---------|--------|-------|
| 6 | Change-type-aware review workflows | Qodo | Different review checklists per change type |
| 7 | Just-in-Time context filtering | Composio | Narrow context window per phase |
| 8 | EARS requirement syntax | Kiro | Structured acceptance criteria in spec skills |
| 9 | Planner/Executor separation in skills | Composio | Split planning from execution with validation gate |
| 10 | Token budget allocation by category | GSD v2 | Explicit % allocation per context type |
| 11 | Error taxonomy with routing | GSD v2 | Classify errors, route to appropriate handler |
| 12 | Skill scaffolding CLI | Skill Factory | `harness create-skill` with questionnaire |
| 13 | Pre-commit review hook | CodeRabbit | Lint + AI review gate before commit |

**Lower priority (conceptual or higher effort):**

| # | Pattern | Source | Notes |
|---|---------|--------|-------|
| 14 | Phase-aware prompt assembly | GSD v2 | Swap prompt layers based on current phase |
| 15 | Unified integrity gate | Qodo | Test + lint + review as one check |
| 16 | Phased workflow orchestration | gstack | Typed pipeline of skills with handoff artifacts |
| 17 | Context-as-MCP-service | Augment, Goose | Expose harness context via MCP resources |
| 18 | Interactive advisor pattern | PM Skills | Decision-guiding skills for architects |
| 19 | Methodology-as-skill encoding | PM Skills | Encode TDD/debugging protocols as structured skills |
| 20 | Cascading summarization | GSD v2 | Dedicated summarization at phase transitions |
| 21 | File-change hooks for spec-code sync | Kiro | Validate spec-code alignment on change |
| 22 | Diff-aware skill targeting | gstack | Scope skill work to changed files only |
| 23 | Accumulated artifacts directory | gstack | `.harness/artifacts/` with typed schemas |
| 24 | Branchless worktree guidance | GSD v2 | Document as operational pattern for agent-driven work |

---

## Feature Roadmap Addendum: Three Rounds Synthesized

This section merges the highest-priority adoptable patterns from ALL three research rounds into concrete "build next" recommendations for harness engineering, ordered by suggested implementation sequence.

### Near-Term (Next Sprint)

These are low-effort, high-impact changes that can be implemented quickly:

| # | Recommendation | Source Round(s) | What to Build |
|---|----------------|-----------------|---------------|
| 1 | **Formalize deterministic-vs-LLM split** | R3 (GSD v2) | Add to `docs/standard/principles.md` as a 7th principle. Update skill templates to include a `## Deterministic Checks` section listing what the skill enforces mechanically before/after LLM invocation. No code change needed — this is a documentation and convention change. |
| 2 | **Mechanical "done" criteria** | R2 (Cursor) | Add a `verify` skill that runs `pnpm test && pnpm lint && pnpm typecheck` as a binary pass/fail gate. Skills that produce code should invoke this as a final step. Implement as a simple shell script wrapper. |
| 3 | **1:1 context ratio in review skill** | R3 (CodeRabbit) | Update the code-review skill/persona to explicitly gather context equal to the diff size before reviewing. Add guidance: "For every N lines of diff, read N lines of surrounding context (related files, specs, recent commits)." |
| 4 | **Cognitive-mode field in skill metadata** | R3 (gstack) | Add an optional `cognitive_mode` field to skill.yaml schema (e.g., "adversarial-reviewer", "constructive-architect", "meticulous-implementer"). Update `@harness-engineering/types` with the new field. |
| 5 | **Commit history in review context** | R3 (Augment) | Update the code-review skill to include `git log --oneline -5 -- <affected-files>` output as part of its context assembly. |
| 6 | **Review feedback learnings file** | R3 (CodeRabbit) | Document a `.harness/review-learnings.md` convention where teams record which review findings are useful vs. noise. Review skill reads this file if present. |

### Medium-Term

These require more design work but have significant impact:

| # | Recommendation | Source Round(s) | What to Build |
|---|----------------|-----------------|---------------|
| 7 | **Change-type-aware review** | R3 (Qodo) | Extend the code-review skill to accept a `--type` flag (feature/bugfix/refactor) and apply different checklists. Create 3 review templates. |
| 8 | **Checkpoint-based context handoff** | R2 (Turbo Flow, Gas Town) | Define a `.harness/handoff.md` schema that skills write at phase boundaries: what was done, what was discovered, what's blocked, test results. |
| 9 | **Phase gates** | R2 (Turbo Flow, Cursor) | Add a linter rule (via linter-gen) that validates: "implementation tasks cannot start until a spec file exists and passes schema check." |
| 10 | **EARS requirement syntax** | R3 (Kiro) | Add an EARS template section to the spec/planning skills. Provide examples in getting-started guide. |
| 11 | **Error taxonomy skill** | R3 (GSD v2) | Create a diagnostic skill that classifies errors (syntax, logic, design, performance, security, environment, flaky) and routes to the appropriate resolution approach. |
| 12 | **Token budget guidance** | R3 (GSD v2) | Document recommended token budget allocations in the context engineering principle. Optionally, implement as a utility function in core that assembles context within budget. |
| 13 | **Skill scaffolding CLI command** | R3 (Skill Factory) | Add `harness create-skill` to the CLI package — interactive questionnaire producing a complete skill.yaml + SKILL.md. |
| 14 | **Anti-pattern log** | R2 (Turbo Flow) | Define a `.harness/anti-patterns.md` convention. Skills append when they hit dead ends. Subsequent skill invocations read before starting. |

### Longer-Term

These are larger architectural changes or conceptual shifts:

| # | Recommendation | Source Round(s) | What to Build |
|---|----------------|-----------------|---------------|
| 15 | **Staged context pipeline** | R3 (GSD v2) | Design a formal skill lifecycle with typed injection points (pre-execution, per-turn, post-execution). Would require changes to how skills are invoked. |
| 16 | **Unified integrity gate** | R3 (Qodo) | Meta-skill chaining test generation + lint + type-check + AI review into a single "integrity check" with unified report. |
| 17 | **Workflow orchestration** | R3 (gstack) | Typed pipeline construct allowing users to define skill chains with handoff artifacts. Uses Result<T,E> for inter-skill communication. |
| 18 | **Context-as-MCP-service** | R3 (Augment, Goose) | Extend the MCP server to expose harness context (skills, rules, project structure) as MCP resources consumable by any agent. |
| 19 | **Interactive advisor skills** | R3 (PM Skills) | Create advisor-pattern skills for architectural decisions — question-driven skills that help humans make informed choices before specifying agent work. |
| 20 | **JIT context filtering** | R3 (Composio) | Context-shaping utility in core that narrows available tools/files based on current workflow phase. |

### Implementation Dependencies

```
Near-term items (1-6) have no dependencies — implement in any order.

Medium-term:
  7 (change-type review) depends on → 3 (review context ratio)
  9 (phase gates) depends on → linter-gen package (exists)
  11 (error taxonomy) standalone
  13 (skill scaffolding) depends on → 4 (cognitive-mode field)

Longer-term:
  15 (context pipeline) informs → 20 (JIT context filtering)
  16 (integrity gate) depends on → 2 (done criteria) + 7 (change-type review)
  17 (workflow orchestration) depends on → 8 (handoff schema)
```

### Summary

Across three rounds of research (12 frameworks in Rounds 1-2, 10 in Round 3), the field has converged on a set of patterns that harness engineering is uniquely positioned to implement:

1. **Context engineering is the differentiator** — not model choice, not agent count, not tool breadth. Token budgets, context ratios, and JIT filtering are the frontier.
2. **Mechanical enforcement remains harness's moat** — no other framework combines linters, type systems, and skill-based behavioral guidance into a unified system.
3. **The human-architect model is validated** — every successful framework converges on "humans plan, agents execute" or suffers from quality problems when they don't.
4. **The near-term roadmap is clear** — 6 low-effort changes that compound: formalize the deterministic/LLM split, add mechanical "done" criteria, improve review context, and establish feedback loops.
