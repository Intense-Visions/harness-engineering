# Harness vs Everything Claude Code: Full Comparative Analysis

> Research document — no adoption decisions made yet. Pure analysis of patterns, strengths, and gaps.

**Date:** 2026-03-29
**Source:** https://github.com/affaan-m/everything-claude-code (v1.9.0)

---

## Executive Summary

Everything Claude Code (ECC) and Harness Engineering solve overlapping problems from different philosophical positions. ECC is a **practitioner's toolkit** — 10+ months of daily use distilled into markdown templates, shell hooks, and prompt recipes. Harness is an **engineering framework** — typed packages, graph-based analysis, mechanical enforcement, and structured skill pipelines.

Neither is strictly better. Each has areas where the other is significantly stronger. This document maps all 12 comparison dimensions with concrete evidence.

---

## Dimension 1: Hook Lifecycle System

### ECC Approach

28 hooks across 7 lifecycle events (PreToolUse, PostToolUse, PostToolUseFailure, PreCompact, SessionStart, Stop, SessionEnd). All routed through a central dispatcher (`run-with-flags.js`) with:

- **Three profile tiers** (minimal/standard/strict) controlling which hooks fire
- **Flag-gated activation** via `ECC_HOOK_PROFILE` env var
- **Dual execution modes**: modern (in-process `run()` export, ~50-100ms faster) and legacy (stdin/stdout IPC)
- **Exit code convention**: 0 = allow, 2 = block tool call, other = error (fail-open)
- **1MB stdin cap** with truncation detection; security hooks block on truncated input

Notable hooks:
| Hook | Event | Behavior | Problem Solved |
|------|-------|----------|----------------|
| `block-no-verify` | PreToolUse:Bash | Block | Prevents `--no-verify` on git commands |
| `auto-tmux-dev` | PreToolUse:Bash | Transform | Rewrites dev server commands to run in tmux |
| `pre:commit-quality` | PreToolUse:Bash | Block/Warn | Staged file scanning, secret detection, commit message validation, linting |
| `pre:config-protection` | PreToolUse:Write/Edit | Block | Prevents weakening linter/formatter configs (25+ protected filenames) |
| `pre:mcp-health-check` | PreToolUse:_ | Block | Probes MCP servers before calls, exponential backoff on failure, disk-persisted state |
| `pre:insaits-security` | PreToolUse:Bash/Write/Edit | Block | External AI security monitor integration (opt-in) |
| `pre:governance-capture` | PreToolUse:Bash/Write/Edit | Log | Detects and logs governance events (secrets, policy violations, destructive commands) |
| `post:quality-gate` | PostToolUse:Edit/Write | Warn | Auto-linting after edits (Biome, Prettier, gofmt, Ruff) |
| `post:edit:format` | PostToolUse:Edit | Transform | Auto-formats JS/TS after edits |
| `stop:cost-tracker` | Stop:_ | Log | Tracks token costs per model to JSONL metrics file |
| `stop:desktop-notify` | Stop:_ | Side-effect | macOS notification when Claude responds |
| `pre:observe` / `post:observe` | Pre/PostToolUse:_ | Log (async) | Captures all tool use for continuous learning |
| `session:start` | SessionStart | Setup | Restores session, detects package manager and project type |
| `pre:compact` | PreCompact | Log | Saves state before context compaction |

### Harness Approach

Three distinct hook layers exist but are internal infrastructure, not user-facing automation:

1. **Workspace hooks** (`packages/orchestrator/src/workspace/hooks.ts`): afterCreate, beforeRun, afterRun, beforeRemove — shell commands with timeouts
2. **Skill lifecycle hooks** (`packages/types/src/index.ts`): preExecution, perTurn, postExecution — context transformers in the skill pipeline
3. **Orchestrator events** (`packages/orchestrator/src/types/events.ts`): Tick, WorkerExit, AgentUpdate, RetryFired, StallDetected — data-driven event model

### Gap Analysis

| Capability               | ECC                                | Harness                                                   | Gap          |
| ------------------------ | ---------------------------------- | --------------------------------------------------------- | ------------ |
| PreToolUse blocking      | 12 hooks with matchers             | None                                                      | **Critical** |
| PostToolUse automation   | 7 hooks (format, lint, typecheck)  | None                                                      | **High**     |
| Session lifecycle        | Start/End with state restore       | None at CLI level                                         | **High**     |
| PreCompact state save    | Yes                                | None                                                      | **Medium**   |
| Cost tracking            | Per-model JSONL metrics            | Token budget allocation exists but no tracking            | **Medium**   |
| MCP health monitoring    | Proactive with exponential backoff | None                                                      | **Medium**   |
| Profile-gated activation | 3 tiers                            | None                                                      | **Medium**   |
| Config protection        | 25+ protected files                | Architecture enforcement via linter (different mechanism) | **Low**      |

### Assessment

ECC's hook system is its strongest differentiator. It provides **runtime enforcement** — blocking dangerous operations before they happen. Harness's enforcement is **build-time/analysis-time** via linters and graph analysis. These are complementary, not competing, but harness has no equivalent to "block `--no-verify` before the command runs."

The profile system (minimal/standard/strict) is a pragmatic design that lets users control the tradeoff between safety and speed. Harness has no equivalent knob.

---

## Dimension 2: Rules System

### ECC Approach

34 rule files in a two-layer model:

- **10 common rules** (`rules/common/`): agents, code-review, coding-style, development-workflow, git-workflow, hooks, patterns, performance, security, testing
- **12 language-specific directories** (`rules/<language>/`), each with 5 files: coding-style, hooks, patterns, security, testing

Rules are installed to `~/.claude/rules/` and loaded automatically by Claude Code's native `.claude/rules/` mechanism. Language files use YAML frontmatter with `paths:` arrays (e.g., `"**/*.ts"`) for file-scoped activation.

**Key characteristics:**

- ~60% of rules contain **hard, mechanically enforceable thresholds** (80% coverage, <50 line functions, <800 line files, <4 nesting levels, conventional commits)
- ~40% is **soft guidance** requiring judgment ("code is readable," "proper error handling")
- Deliberate redundancy — the 80% coverage requirement appears in 3 rule files, ensuring it fires regardless of which file is active
- Agent-centric — 6 of 10 common files reference specific agents by name, defining WHEN to dispatch
- Common rules set thresholds; language rules provide the mechanical implementation (e.g., coding-style.md says "immutability"; TypeScript extends with `Readonly<T>` and spread operators)
- Auto-generated guardrails file captures observed patterns from repo history

### Harness Approach

Constraints are enforced through three mechanisms:

1. **`harness.config.json`** — layered architecture with forbidden imports, circular dep limits, complexity thresholds
2. **Security rules registry** (`packages/core/src/security/rules/registry.ts`) — categorized security checks with severity levels
3. **Standards documentation** (`docs/standard/`) — principles.md (41KB), implementation.md (33KB), kpis.md
4. **Skill gates** — each skill defines hard gates in SKILL.md that halt execution on violation
5. **AGENTS.md** — 400+ line knowledge map with conventions, patterns, and module boundaries

### Gap Analysis

| Capability                 | ECC                                       | Harness                                                   | Gap                    |
| -------------------------- | ----------------------------------------- | --------------------------------------------------------- | ---------------------- |
| Always-on agent guidelines | 34 rule files auto-loaded                 | Standards in docs, conventions in AGENTS.md               | **Medium**             |
| Language-specific rules    | 12 languages × 5 files                    | Language-aware templates but no runtime rules             | **Medium**             |
| File-scoped activation     | YAML `paths:` frontmatter                 | N/A                                                       | **Medium**             |
| Hard thresholds            | Inline in rules (80% coverage, <50 lines) | In harness.config.json (complexity: 15, circular-deps: 0) | **Parity**             |
| Mechanical enforcement     | Rules are guidance; hooks enforce         | Linters enforce; config is source of truth                | **Parity (different)** |
| Architectural constraints  | None                                      | Layered dependency model, forbidden imports               | **Harness stronger**   |
| Graph-based analysis       | None                                      | Dependency graphs, impact analysis, test selection        | **Harness stronger**   |

### Assessment

Different philosophies. ECC's rules are **advisory text injected into LLM context** — they rely on the model following instructions. Harness's constraints are **mechanically enforced by tools** — violations fail builds, not just guidelines. ECC has broader coverage (12 languages); harness has deeper enforcement (architectural layers, graph analysis).

The two approaches are complementary. Rules could steer agent behavior toward patterns that linters then verify.

---

## Dimension 3: Command System

### ECC Approach

60+ slash commands as pure markdown files in `commands/`. Each is a **prompt template** — no executable code, no state management, no tool restrictions. They are the "UI layer" injected into LLM context when the user types `/command-name`.

Taxonomy:

- **Workflow** (~12): plan, tdd, build-fix, code-review, verify, quality-gate, e2e
- **Session** (4): save-session, resume-session, checkpoint, sessions
- **Orchestration** (~7): loop-start, loop-status, orchestrate, multi-plan, multi-execute
- **Language-specific** (~15): go-build, go-test, go-review, rust-_, kotlin-_, cpp-\*, python-review
- **Learning** (~7): learn, learn-eval, evolve, instinct-import/export, skill-create
- **Utility** (~10): compact, context-budget, model-route, prompt-optimize

Key insight: commands are **separate from and lighter than** agents and skills. An agent has identity and tool permissions. A skill has structured domain knowledge. A command is just a checklist that steers the LLM.

### Harness Approach

Slash commands are **generated from skills** via `packages/cli/src/slash-commands/`. Every skill produces a corresponding slash command. There is no concept of a command that isn't backed by a full skill.

The generation system:

- Reads `skill.yaml` files → renders to `.claude/commands/*.md` and `.gemini/commands/*.md`
- Two-way sync with orphan detection
- Platform parity via shared source

### Gap Analysis

| Capability                 | ECC                             | Harness                                                                 | Gap                  |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| Lightweight commands       | 60+ markdown-only commands      | All commands are full skill invocations                                 | **Medium**           |
| Language-specific commands | 15+ (go-build, rust-test, etc.) | None                                                                    | **Medium**           |
| Session commands           | save/resume/checkpoint          | Session state via .harness/sessions/ (programmatic, not command-driven) | **Low**              |
| Command aliasing           | None                            | None                                                                    | **Parity**           |
| Generation from source     | Manual markdown files           | Auto-generated from skill.yaml                                          | **Harness stronger** |
| Platform consistency       | Manual per-platform             | Auto-synced across platforms                                            | **Harness stronger** |

### Assessment

ECC's separation of commands from skills is pragmatic — many operations don't need a full skill pipeline. Harness's approach is more principled (single source of truth) but loses the ability to have quick, disposable prompt templates.

The question is whether harness needs lightweight commands or whether its skill system already serves that purpose adequately.

---

## Dimension 4: Installation Profiles

### ECC Approach

Three-layer manifest system:

1. **Profiles** (5): core, developer, security, research, full — named bundles of modules
2. **Modules** (19): atomic content units with `id`, `kind`, `paths[]`, `targets[]`, `dependencies[]`, `cost` (light/medium/heavy), `stability` (stable/beta)
3. **Components** (32): user-facing selection surface mapping to modules

Profiles are additive layers on a shared core (6 modules). Module dependency graph prevents orphaned installations. Cost metadata indicates context-window impact. Multi-target support filters by AI coding tool.

Install pipeline: CLI → request normalization → module resolution → target planning → operation planning → execution → state persistence. Lifecycle tools: list-installed, doctor, repair, uninstall.

Currently mid-transition from shell-based monolith to Node.js manifest system. Many language components still resolve to the same mega-module.

### Harness Approach

- **Template-based scaffolding**: 21 templates (base, basic, intermediate, advanced, 15 language/framework-specific)
- **Per-skill installation**: `harness install <skill>` from npm registry with semver, dependency resolution, lockfile
- **No profile bundling**: each skill installed independently

### Gap Analysis

| Capability                   | ECC                           | Harness                               | Gap                  |
| ---------------------------- | ----------------------------- | ------------------------------------- | -------------------- |
| Curated profiles             | 5 personas (core → full)      | None                                  | **Medium**           |
| Module dependency resolution | Yes, with `dependencies[]`    | Yes, via `depends_on` in skill.yaml   | **Parity**           |
| Multi-target filtering       | 5 AI tools                    | 2 platforms (claude-code, gemini-cli) | **Low**              |
| Install state management     | doctor/repair/uninstall       | Lockfile-based                        | **Low**              |
| Cost metadata                | light/medium/heavy per module | None                                  | **Low**              |
| Template scaffolding         | None                          | 21 templates with auto-detection      | **Harness stronger** |
| Registry distribution        | Manual copy + manifests       | npm registry with semver              | **Harness stronger** |

### Assessment

ECC's profiles solve onboarding friction — "I'm a Python developer, give me the right stuff." Harness's per-skill install is more granular but requires users to know what they need. Profiles are a UX layer that could sit on top of harness's existing registry.

---

## Dimension 5: Security Scanning

### ECC Approach

Two components:

**1. Security Guide** — Comprehensive threat documentation:

- CVE-2025-59536 (CVSS 8.7): pre-trust code execution via hooks
- CVE-2026-21852: API key exfiltration via `ANTHROPIC_BASE_URL` override
- MCP consent abuse, memory poisoning (Microsoft research), supply chain via skills (Snyk ToxicSkills: 36% of 3,984 public skills had prompt injection)
- Defensive recommendations: sandboxing, path restriction, approval boundaries, observability, kill switches, memory hygiene

**2. AgentShield** (`ecc-agentshield`, 251 stars) — 102 rules across 5 categories:

- Secrets detection (14 patterns: Anthropic, OpenAI, AWS, Google, Stripe, GitHub, Slack, JWTs, DB strings, private keys)
- Permission audit (10 rules: wildcard access, missing deny lists, destructive ops)
- Hook analysis (34 rules: command injection, data exfiltration, error suppression, reverse shells, clipboard exfil)
- MCP server security (23 rules: shell MCPs, typosquatting, hardcoded secrets, auto-approve, binding 0.0.0.0)
- Agent config review (25 rules: unrestricted tools, prompt injection surface, hidden Unicode, URL execution, time bombs, DAN patterns)

Runtime confidence classification distinguishes active config from templates/examples. A-F grading with 0-100 scores. Auto-fix mode. Opus pipeline for adversarial analysis.

### Harness Approach

- **Heuristic security agent** (`packages/core/src/review/agents/security-agent.ts`): 4 detectors — eval/Function(), hardcoded secrets, SQL concatenation, shell interpolation
- **Security config** in harness.config.json with rule-level severity and exclusion patterns
- **Integrated into ReviewPipeline** with CWE IDs, OWASP categories, confidence levels, remediation steps
- **harness:security-scan** skill for lightweight mechanical scanning

### Gap Analysis

| Capability                       | ECC                                       | Harness                                         | Gap                  |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------- | -------------------- |
| Secret patterns                  | 14 specific patterns                      | Generic regex for api_key/secret/password/token | **Medium**           |
| Agent config auditing            | 25 rules for CLAUDE.md/hooks/MCP          | None                                            | **High**             |
| Hook security analysis           | 34 rules (injection, exfil, suppression)  | N/A (no hooks to audit)                         | **N/A**              |
| MCP server security              | 23 rules                                  | None                                            | **Medium**           |
| Threat documentation             | CVEs, attack surfaces, Microsoft research | None                                            | **Medium**           |
| CWE/OWASP mapping                | None (rules are custom categories)        | Yes, findings include CWE IDs                   | **Harness stronger** |
| Graph-based analysis             | None                                      | Dependency + impact graphs inform scope         | **Harness stronger** |
| Integration with review pipeline | Standalone scanner                        | Part of multi-phase ReviewPipeline              | **Harness stronger** |
| Data-flow analysis               | None (pattern-based)                      | None (pattern-based)                            | **Parity**           |

### Assessment

ECC has **broader pattern coverage** (102 rules vs 4 detectors) and uniquely addresses **agent configuration security** (auditing CLAUDE.md, hooks, and MCP configs for vulnerabilities). Harness has **deeper integration** (CWE mapping, graph-scoped analysis, multi-phase review pipeline) but much narrower pattern coverage.

The agent config auditing gap is notable — as harness generates more configuration files (AGENTS.md, skill.yaml, slash commands), validating those configs for security becomes increasingly important.

---

## Dimension 6: Continuous Learning

### ECC Approach

Full feedback loop:

1. **Observation** — hooks capture 100% of tool use to `observations.jsonl` (project-scoped via git remote hash)
2. **Pattern detection** — background Haiku agent analyzes observations every 5 min (min 20 observations). Detects: user corrections, error resolutions, repeated workflows, tool preferences
3. **Instinct creation** — atomic learned behaviors stored as YAML with confidence scoring (0.3 → 0.85 based on observation count, +0.05 confirm, -0.1 contradict, -0.02/week decay)
4. **Evolution** (`/evolve`) — clusters instincts into skills, commands, or agents
5. **Promotion** — cross-project instincts with confidence >= 0.8 in 2+ projects graduate to global
6. **Manual extraction** (`/learn-eval`) — holistic verdict system (Save/Improve/Absorb/Drop) replacing numeric scoring

Session persistence via `/save-session` captures structured state (what worked, what didn't, what hasn't been tried, decisions made, exact next step).

### Harness Approach

- **Two-tier learning loading** (`packages/core/src/state/learnings.ts`): session-scoped + global, token-budgeted (1000 tokens default), recency + keyword relevance scoring
- **Pattern analysis** (`analyzeLearningPatterns()`): groups by `[skill:X]` and `[outcome:Y]` tags, identifies patterns where 3+ entries share same tag
- **Pruning** (`pruneLearnings()`): keeps 20 most recent, archives to monthly files
- **Generalizability check** (`isGeneralizable()`): promotes gotcha/decision/observation outcomes to global; keeps success in session
- **Session tracking**: 41+ proposal directories with state.json, handoff.json, phase tracking
- **16KB learnings.md** with consistent tagging

### Gap Analysis

| Capability                   | ECC                                              | Harness                             | Gap                  |
| ---------------------------- | ------------------------------------------------ | ----------------------------------- | -------------------- |
| Automated observation        | Hooks capture all tool use                       | No automated capture                | **High**             |
| Background pattern detection | Haiku agent every 5 min                          | Manual tagging only                 | **High**             |
| Confidence scoring           | Multi-factor (count, confirm, contradict, decay) | Binary (generalizable or not)       | **Medium**           |
| Evolution to artifacts       | Instincts → skills/commands/agents               | No evolution pipeline               | **High**             |
| Cross-project promotion      | Automatic at confidence >= 0.8                   | isGeneralizable() for outcome types | **Medium**           |
| Token-budgeted retrieval     | Not mentioned                                    | Yes, greedy algorithm with budget   | **Harness stronger** |
| Relevance scoring            | Not mentioned                                    | Keyword overlap scoring (0-1)       | **Harness stronger** |
| Session state structure      | Markdown templates                               | Typed JSON with schema versioning   | **Harness stronger** |
| Project isolation            | Git remote hash scoping                          | Session-scoped directories          | **Parity**           |

### Assessment

ECC has a **full automated feedback loop** — from observation to instinct to evolved artifact. Harness has **better retrieval and scoring** but relies on manual entry. The observation → pattern detection → instinct pipeline is ECC's most innovative feature. The evolution step (instincts becoming skills) closes the loop in a way harness doesn't.

---

## Dimension 7: Language Specialization

### ECC Approach

- 12 language-specific rule sets (5 files each = 60 files)
- Language-specific agents: typescript-reviewer, python-reviewer, go-reviewer, rust-reviewer, kotlin-reviewer, cpp-reviewer, java-reviewer, flutter-reviewer
- Language-specific build error resolvers: kotlin, go, rust, cpp, pytorch
- Language-specific commands: go-build, go-test, go-review, rust-build, rust-test, kotlin-build, cpp-build, python-review
- Framework skills: django-patterns, springboot-patterns, laravel-patterns, kotlin-ktor-patterns, react-patterns, nextjs-patterns

### Harness Approach

- 21 language-specific templates with framework detection (nextjs, express, django, fastapi, gin, axum, spring-boot, etc.)
- Template metadata includes `detect[]` arrays for auto-detection
- `tooling` field in templates declares package manager, linter, formatter, build tool, test runner
- Skills and agents are language-agnostic

### Gap Analysis

| Capability                 | ECC                             | Harness                                                 | Gap                  |
| -------------------------- | ------------------------------- | ------------------------------------------------------- | -------------------- |
| Language-specific agents   | 8 reviewers + 5 error resolvers | None                                                    | **Medium**           |
| Language-specific rules    | 60 files across 12 languages    | None                                                    | **Medium**           |
| Language-specific commands | 15+                             | None                                                    | **Medium**           |
| Framework scaffolding      | None                            | 21 templates with auto-detection                        | **Harness stronger** |
| Tooling detection          | Package manager only            | Full tooling stack (PM, linter, formatter, build, test) | **Harness stronger** |

### Assessment

ECC provides **language-aware runtime guidance** (rules loaded when editing .py files, Python-specific reviewer). Harness provides **language-aware project setup** (correct tooling detected and configured). These serve different lifecycle phases — ECC helps during development, harness helps during project initialization.

---

## Dimension 8: Cost and Token Optimization

### ECC Approach

- Explicit model selection matrix: Haiku (exploration, $0.80/$4.00 per 1M), Sonnet (main dev, $3/$15), Opus (complex reasoning, $15/$75)
- Token budget capping at 10,000 thinking tokens (vs default 31,999)
- Context compaction guidance ("compact at 50% at logical breakpoints")
- `/compact` reminder hook every ~50 tool calls
- Cost tracking hook writes per-response JSONL metrics with USD estimates
- `/context-budget` and `/model-route` commands
- Module cost metadata (light/medium/heavy) in install manifests

### Harness Approach

- `contextBudget()` function with 6-category allocation (systemPrompt 15%, projectManifest 5%, taskSpec 20%, activeCode 40%, interfaces 10%, reserve 10%)
- Graph density-aware reallocation based on codebase node counts
- Model tier configuration (fast/standard/strong) per project
- Token budget enforcement in learning retrieval (1000 token default)
- Size budget detection for entropy monitoring

### Gap Analysis

| Capability                 | ECC                      | Harness                                                 | Gap                  |
| -------------------------- | ------------------------ | ------------------------------------------------------- | -------------------- |
| Per-response cost tracking | JSONL with USD estimates | None                                                    | **Medium**           |
| Compaction guidance        | Hook reminder + command  | None                                                    | **Low**              |
| Model selection matrix     | User-facing with $/token | Config-driven tiers (no cost visibility)                | **Low**              |
| Context budget allocation  | Manual guidance          | Programmatic 6-category with density-aware reallocation | **Harness stronger** |
| Graph-aware budgeting      | None                     | Adjusts ratios based on codebase node counts            | **Harness stronger** |

### Assessment

ECC gives **users visibility into costs**. Harness gives **agents better context allocation**. Both are valuable; they serve different audiences (human cost awareness vs. machine context efficiency).

---

## Dimension 9: Multi-Platform Support

### ECC Approach

5 platforms: Claude Code, Cursor, Codex, OpenCode, Kiro. Each module declares `targets[]` and the install system filters accordingly. Per-target adapters handle platform-specific file placement.

### Harness Approach

2 platforms: Claude Code, Gemini CLI. Skills symlinked between platforms (same inode). Unified MCP server. Platform field in skill.yaml. Auto-generation of slash commands per platform.

### Gap Analysis

| Capability         | ECC                       | Harness                                | Gap                  |
| ------------------ | ------------------------- | -------------------------------------- | -------------------- |
| Platform count     | 5                         | 2                                      | **Low**              |
| Symlink dedup      | Manual copy-based         | Symlinks (elegant, zero-sync overhead) | **Harness stronger** |
| MCP unification    | Platform-specific configs | Single MCP server for all platforms    | **Harness stronger** |
| Command generation | Manual per-platform       | Auto-generated from skill source       | **Harness stronger** |

### Assessment

ECC supports more platforms but with more maintenance overhead (copies). Harness supports fewer platforms but with a more maintainable architecture (symlinks, generation). Adding platforms to harness would be straightforward given the existing infrastructure.

---

## Dimension 10: Agent Organization

### ECC Approach

30+ agents as individual markdown files in `agents/`. Each defines: role, responsibilities, tools used, activation triggers, severity/priority frameworks, anti-patterns.

### Harness Approach

12 personas in `agents/personas/` as YAML files defining: name, role, skills, commands, triggers, config, outputs. Agents are composition of skills, not standalone entities.

### Gap Analysis

| Capability               | ECC                                  | Harness                                                  | Gap                             |
| ------------------------ | ------------------------------------ | -------------------------------------------------------- | ------------------------------- |
| Agent count              | 30+                                  | 12 personas                                              | **Low** (quality over quantity) |
| Language-specific agents | 13 (8 reviewers + 5 error resolvers) | None                                                     | **Medium**                      |
| Agent composition        | Standalone entities                  | Personas compose skills                                  | **Harness stronger**            |
| Agent orchestration      | Manual delegation                    | Full orchestrator with event system, workspace isolation | **Harness stronger**            |
| Sub-agent delegation     | TaskTool for parallel work           | Worktree-based isolation                                 | **Harness stronger**            |

### Assessment

Harness's agent model is architecturally superior (composition over enumeration, orchestration, workspace isolation). ECC's advantage is breadth — more specialized roles, especially for language-specific tasks.

---

## Dimension 11: Documentation and Onboarding

### ECC Approach

- Shortform guide: practical daily-use strategies
- Longform guide: detailed token economics, memory persistence patterns
- Security guide: threat landscape with CVEs
- Skill development guide (18.3KB): how to create skills
- Selective install architecture doc (25.9KB): modular installation
- COMMANDS-QUICK-REF.md: all 60+ commands at a glance

### Harness Approach

- `docs/standard/` (principles 41KB, implementation 33KB, KPIs)
- `docs/guides/` (18 guides: getting-started, day-to-day-workflow, agent-worktree-patterns, skill-marketplace, etc.)
- `docs/api/` and `docs/reference/` for technical docs
- `docs/changes/` (76+ design proposals)
- `docs/plans/` (198+ implementation plans)
- VitePress-based documentation site
- `harness:onboarding` skill

### Gap Analysis

| Capability             | ECC                                 | Harness                          | Gap                  |
| ---------------------- | ----------------------------------- | -------------------------------- | -------------------- |
| Practitioner guides    | Shortform + longform from real use  | 18 how-to guides                 | **Low**              |
| Security documentation | CVEs, threat model, attack surfaces | None dedicated                   | **Medium**           |
| Quick reference        | COMMANDS-QUICK-REF.md               | None                             | **Low**              |
| Design documentation   | Architecture doc                    | 76+ change proposals, 198+ plans | **Harness stronger** |
| Interactive onboarding | None                                | Dedicated onboarding skill       | **Harness stronger** |
| Documentation site     | None                                | VitePress-based                  | **Harness stronger** |

### Assessment

ECC has better **practitioner-oriented content** (guides from daily use, security threat documentation). Harness has better **architectural documentation** (specs, plans, structured guides).

---

## Dimension 12: Plugin and Distribution

### ECC Approach

- `.claude-plugin/` manifest (plugin.json, marketplace.json) for Claude Code plugin marketplace
- `npm` package for AgentShield
- Manual installation scripts for the main toolkit

### Harness Approach

- npm registry client querying `@harness-skills/*` namespace
- Semver resolution, tarball download, YAML validation, dependency tracking
- Lockfile management (`skills-lock.json`)
- Private registry support via `.npmrc`
- `harness install`, `harness skill search`, `harness uninstall` commands

### Gap Analysis

| Capability            | ECC                              | Harness                                        | Gap                  |
| --------------------- | -------------------------------- | ---------------------------------------------- | -------------------- |
| Plugin marketplace    | Yes (.claude-plugin/)            | None                                           | **Low**              |
| npm registry          | AgentShield only                 | Full skill registry infrastructure             | **Harness stronger** |
| Dependency resolution | Module dependencies in manifests | Transitive dependency resolution               | **Harness stronger** |
| Lockfile              | Install state tracking           | Deterministic lockfile with integrity hashing  | **Harness stronger** |
| Search/discovery      | None                             | `harness skill search` with platform filtering | **Harness stronger** |

### Assessment

Harness has significantly stronger distribution infrastructure. ECC's plugin marketplace entry is a nice-to-have for discoverability but not a technical advantage.

---

## Summary: Strength Map

| Dimension                  | Stronger    | Margin                                                          |
| -------------------------- | ----------- | --------------------------------------------------------------- |
| 1. Hook lifecycle          | **ECC**     | Large                                                           |
| 2. Rules system            | Mixed       | ECC: breadth; Harness: enforcement depth                        |
| 3. Command system          | Mixed       | ECC: lightweight commands; Harness: generated from source       |
| 4. Installation profiles   | **ECC**     | Small                                                           |
| 5. Security scanning       | Mixed       | ECC: pattern breadth + agent config; Harness: integration depth |
| 6. Continuous learning     | Mixed       | ECC: automated feedback loop; Harness: retrieval quality        |
| 7. Language specialization | **ECC**     | Medium                                                          |
| 8. Cost/token optimization | Mixed       | ECC: user visibility; Harness: machine allocation               |
| 9. Multi-platform          | **Harness** | Medium                                                          |
| 10. Agent organization     | **Harness** | Large                                                           |
| 11. Documentation          | Mixed       | ECC: practitioner; Harness: architectural                       |
| 12. Distribution           | **Harness** | Large                                                           |

### Where Harness is Clearly Stronger

- Architectural enforcement (layered deps, graph analysis)
- Agent orchestration (multi-agent, workspace isolation, event system)
- Skill pipeline (typed, phased, gated)
- Distribution infrastructure (npm registry, lockfiles, search)
- Schema validation (Zod with refinement, boundary enforcement)
- Cross-platform architecture (symlinks, unified MCP, generation)

### Where ECC is Clearly Stronger

- Runtime hook enforcement (PreToolUse blocking, PostToolUse automation)
- Language-specific guidance (12 languages × 5 rule files + dedicated agents)
- Automated learning pipeline (observation → instinct → evolution)
- Agent configuration security auditing (102 rules)
- Cost visibility (per-response tracking with USD estimates)

### Where Neither is Strong

- Data-flow security analysis (both are pattern-based)
- Cross-session conflict detection
- Dynamic cost-sensitive model routing
