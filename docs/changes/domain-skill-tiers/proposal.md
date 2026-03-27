# Domain Skill Tiers & Catalog System

> Three-tier skill loading with intelligent dispatch, searchable catalog, and 30 new domain skills covering backend, infrastructure, reliability, testing, and soft domains.

**Keywords:** skill-tiers, catalog, dispatcher, context-preservation, domain-skills, search-skills, stack-detection, lazy-loading, skill-index

## Overview

Harness currently registers all 49 bundled skills as slash commands in every session regardless of relevance. As the skill library grows (68+ with new domain skills, plus community contributions), this wastes context and creates noise.

This spec introduces:

1. **Three-tier skill loading** — 23 always-loaded slash commands (workflow + maintenance), 44+ catalog-only skills discoverable on demand, and dependency-only skills that are invisible plumbing
2. **Searchable skill catalog** — A merged index of bundled + community skills, queryable via `search_skills` tool, with hash-based staleness checks
3. **Intelligent dispatcher** — When workflow skills start, a dispatcher analyzes task + stack signals and proactively suggests relevant catalog skills
4. **30 new domain skills** — Full SKILL.md + skill.yaml definitions covering backend, infrastructure, reliability, auth, compliance, testing, soft domains, data engineering, ML/AI, and mobile

## Decisions

| #   | Decision                                                    | Rationale                                                                                                                                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Hybrid loading: auto-detect + manual override               | Smart defaults via stack detection, user control via `harness.config.json`                                                                                         |
| 2   | Two-tier registry: core slash commands + searchable catalog | Mirrors existing deferred-tool pattern in Claude Code                                                                                                              |
| 3   | Merged index: bundled + community                           | Unified discovery, local and fast, no network dependency                                                                                                           |
| 4   | Hash-based staleness check on every query                   | Laziest correct approach — no watchers, no hooks, rebuild is sub-100ms                                                                                             |
| 5   | Three tiers + events + dependencies                         | Tier 1 (7 workflow), Tier 2 (16 maintenance), Tier 3 (44+ catalog), event-triggered, dependency-only                                                               |
| 6   | Intelligent dispatcher at workflow start                    | Ships with Approach 1, not as fast-follow. Keyword + stack-signal scoring, top 3 suggestions                                                                       |
| 7   | 30 new domain skills with full content                      | Backend (5), Infrastructure (5), Reliability (3), Auth & Compliance (2), Feature Mgmt (1), Advanced Testing (7), Soft Domains (3), Data (2), ML/AI (1), Mobile (1) |
| 8   | Roles-informed taxonomy                                     | Skills mapped to frontend dev, backend dev, DevOps/SRE, QA, architect, security eng, PM, DX, data eng, ML eng, mobile dev                                          |
| 9   | Five invocation patterns                                    | Human-initiated workflow, human-initiated maintenance, agent-discovered domain, event-triggered, dependency-only                                                   |

## Technical Design

### Skill Metadata Extensions

Each `skill.yaml` gains new fields:

```yaml
tier: 3 # 1 = workflow, 2 = maintenance, 3 = catalog
internal: false # true = dependency-only, never surfaced
keywords: # Searchable terms for catalog discovery
  - database
  - migration
  - schema
stack_signals: # File patterns indicating project relevance
  - 'prisma/schema.prisma'
  - 'migrations/'
```

### Tier Classification

**Tier 1 — Workflow (7 slash commands, always loaded):**

| Skill                 | Purpose                 |
| --------------------- | ----------------------- |
| harness-brainstorming | Ideation entry point    |
| harness-planning      | Work decomposition      |
| harness-execution     | Task implementation     |
| harness-autopilot     | Autonomous loop         |
| harness-tdd           | Test-driven development |
| harness-debugging     | Systematic debugging    |
| harness-refactoring   | Safe restructuring      |

**Tier 2 — Maintenance (16 slash commands, always loaded):**

| Skill                        | Purpose                      |
| ---------------------------- | ---------------------------- |
| harness-integrity            | Unified quality gate         |
| harness-verify               | Quick pass/fail gate         |
| harness-code-review          | AI-powered review            |
| harness-release-readiness    | Ship readiness audit         |
| harness-docs-pipeline        | Documentation health         |
| harness-codebase-cleanup     | Tech debt cleanup            |
| harness-enforce-architecture | Layer boundary checks        |
| harness-detect-doc-drift     | Stale doc finder             |
| harness-cleanup-dead-code    | Unused code removal          |
| harness-dependency-health    | Structural health            |
| harness-hotspot-detector     | Risk area detection          |
| harness-security-scan        | Quick security check         |
| harness-perf                 | Performance budgets          |
| harness-impact-analysis      | "What breaks if I change X?" |
| harness-test-advisor         | "What tests should I run?"   |
| harness-soundness-review     | Spec/plan validation         |

**Tier 3 — Catalog (44+ skills, `search_skills` only):**

All domain skills (existing + 30 new). See New Skill Definitions section.

**Event-triggered (configured in hooks, no slash command):**

| Event            | Skills                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| on_pr            | code-review, enforce-architecture, i18n, impact-analysis, test-advisor, perf |
| on_commit        | pre-commit-review, verify, git-workflow, validate-context-engineering        |
| on_milestone     | release-readiness, hotspot-detector, dependency-health, security-scan        |
| on_task_complete | verify                                                                       |

**Dependency-only (internal: true, invisible):**

| Skill                                | Invoked By                                  |
| ------------------------------------ | ------------------------------------------- |
| harness-align-documentation          | docs-pipeline                               |
| harness-validate-context-engineering | docs-pipeline, check-mechanical-constraints |
| harness-check-mechanical-constraints | integrity                                   |
| harness-parallel-agents              | release-readiness, codebase-cleanup         |
| harness-state-management             | Internal state tracking                     |
| harness-knowledge-mapper             | docs-pipeline                               |

### Skills Index

Location: `.harness/skills-index.json`

```json
{
  "version": 1,
  "hash": "<sha256-of-skill-dir-mtimes>",
  "generatedAt": "<ISO 8601>",
  "skills": {
    "<skill-name>": {
      "tier": 3,
      "description": "<one-line>",
      "keywords": ["<term>"],
      "stackSignals": ["<glob>"],
      "cognitiveMode": "<mode>",
      "phases": ["<phase-name>"],
      "source": "bundled|community"
    }
  }
}
```

Only Tier 3 and community skills are indexed. Tier 1, 2, and dependency-only skills are loaded directly and don't need catalog discovery.

### `search_skills` Tool

Always available in every session. The agent calls it with natural language or keywords:

```
search_skills("database migration safety")
→ Returns top 5 matches ranked by keyword + stack signal relevance
```

**Ranking algorithm:**

1. Keyword match score: skill keywords intersected with query terms
2. Stack signal boost: if `.harness/stack-profile.json` exists and signals match
3. Source priority: bundled > community for tie-breaking

**Return format:**

```json
{
  "results": [
    {
      "name": "harness-database",
      "description": "Schema design, migrations, ORM patterns, migration safety checks",
      "keywords": ["database", "migration", "schema", "ORM", "prisma"],
      "phases": ["detect", "analyze", "advise", "validate"],
      "score": 0.87,
      "source": "bundled"
    }
  ]
}
```

The agent can then load the full SKILL.md for any result.

### Hash-Based Staleness Check

On every `search_skills` call:

1. Hash the skill directories (file mtimes, not content — fast)
2. Compare against `hash` field in `skills-index.json`
3. If different: rebuild index, then return results
4. If same: return cached results immediately

Rebuild scans all skill.yaml files across bundled + community directories. Sub-100ms even with 100+ skills.

### Stack Profile

Generated on `harness init` or first `search_skills` call. Written to `.harness/stack-profile.json`:

```json
{
  "generatedAt": "<ISO 8601>",
  "signals": {
    "prisma/schema.prisma": true,
    "Dockerfile": true,
    ".github/workflows/": true,
    "k8s/": false,
    "terraform/": false
  },
  "detectedDomains": ["database", "containerization", "deployment"]
}
```

Regenerated on staleness check if project structure has changed.

### Intelligent Dispatcher

**Fires when:** Any Tier 1 workflow skill starts (brainstorming, planning, execution, autopilot, tdd, debugging, refactoring).

**Does not fire for:** Tier 2 maintenance skills (developer already knows what they want).

**Scoring function:**

```
score = (0.5 * keywordMatchRatio) + (0.3 * stackSignalMatchRatio) + (0.2 * recencyBoost)
```

- `keywordMatchRatio`: matched keywords / total query terms
- `stackSignalMatchRatio`: matched stack signals / total skill signals
- `recencyBoost`: 1.0 if agent touched matching files in last 5 tool calls, else 0.0

**Thresholds:**

- Minimum confidence: 0.4
- Maximum suggestions: 3
- Deduplicate against already-loaded skills

**Output (injected into workflow skill context):**

```markdown
---
## Suggested Domain Skills
Based on your task and project stack, these catalog skills may be relevant:
- **harness-database** — Schema design, migrations, ORM patterns
- **harness-api-design** — REST, GraphQL, gRPC, OpenAPI specs

To load a skill: call search_skills("<skill-name>") for full details.
---
```

### Configuration Override

In `harness.config.json` at project root:

```json
{
  "skills": {
    "alwaysSuggest": ["harness-database", "harness-observability"],
    "neverSuggest": ["harness-chaos"],
    "tierOverrides": {
      "harness-i18n": 2,
      "harness-roadmap": 3
    }
  }
}
```

- `alwaysSuggest`: Always include in dispatcher suggestions when it fires
- `neverSuggest`: Never suggest, even if signals match
- `tierOverrides`: Promote or demote skills between tiers

### Cross-Platform Support (Claude Code + Gemini CLI)

The tier system and catalog are platform-agnostic. Both Claude Code and Gemini CLI connect to the same harness MCP server, which hosts the `search_skills` tool.

**Platform-specific considerations:**

| Aspect                 | Claude Code                           | Gemini CLI                                              |
| ---------------------- | ------------------------------------- | ------------------------------------------------------- |
| Slash command format   | Markdown (.md) with frontmatter       | TOML (.toml) with inline content                        |
| Tool names in results  | `Read`, `Bash`, `Grep`                | `read_file`, `run_shell_command`, `search_file_content` |
| Skill content delivery | File reference (agent reads SKILL.md) | Inline in TOML (full content embedded)                  |
| Deferred tool pattern  | Native (ToolSearch)                   | Not available — uses MCP `search_skills` instead        |

**How it works on each platform:**

1. **Slash command generation** (`harness generate-slash-commands`): The existing `normalize.ts` already filters by platform. Add a tier filter: only generate for Tier 1 + 2 skills. Both platforms get the same 23 slash commands in their respective formats.

2. **`search_skills` MCP tool**: Registered once in the MCP server. Both platforms call it identically. Returns platform-appropriate tool names using the existing `GEMINI_TOOL_MAP` from `packages/cli/src/agent-definitions/generator.ts`:

   ```json
   // Claude Code response
   { "name": "harness-database", "tools": ["Read", "Bash", "Grep"] }

   // Gemini CLI response (same query, platform detected from caller)
   { "name": "harness-database", "tools": ["read_file", "run_shell_command", "search_file_content"] }
   ```

3. **Dispatcher**: Injects suggestions into skill context the same way on both platforms. The suggestion text is platform-agnostic (just skill names and descriptions).

4. **Platform parity tests**: The existing `agents/skills/tests/platform-parity.test.ts` test suite ensures skill content is identical across platforms. The new `tier`, `keywords`, and `stack_signals` fields in skill.yaml are platform-independent metadata — parity is preserved.

5. **Skill loading after discovery**: When the agent finds a relevant catalog skill via `search_skills`, it loads the skill using the existing `run_skill` MCP tool. This already handles platform differences (Claude Code reads SKILL.md as a file, Gemini CLI receives inline content).

**No platform-specific branching is needed** in the tier system, index, or dispatcher. Platform differences are handled at the edges (slash command generation and MCP response formatting) using existing infrastructure.

## New Skill Definitions

30 new skills organized into 10 categories. Full skill.yaml + SKILL.md definitions are in `skills/` subdirectory.

### Backend & Data (5)

| Skill                                                      | Description                                             | Cognitive Mode         | Type  |
| ---------------------------------------------------------- | ------------------------------------------------------- | ---------------------- | ----- |
| [harness-api-design](skills/harness-api-design/)           | REST, GraphQL, gRPC, OpenAPI specs, versioning          | advisory-guide         | rigid |
| [harness-database](skills/harness-database/)               | Schema design, migrations, ORM patterns, safety checks  | advisory-guide         | rigid |
| [harness-event-driven](skills/harness-event-driven/)       | Message queues, event sourcing, CQRS, sagas             | constructive-architect | rigid |
| [harness-caching](skills/harness-caching/)                 | Cache strategies, invalidation, distributed caching     | advisory-guide         | rigid |
| [harness-data-validation](skills/harness-data-validation/) | Schema validation, data contracts, boundary enforcement | meticulous-verifier    | rigid |

### Infrastructure & Ops (5)

| Skill                                                                    | Description                                       | Cognitive Mode      | Type  |
| ------------------------------------------------------------------------ | ------------------------------------------------- | ------------------- | ----- |
| [harness-deployment](skills/harness-deployment/)                         | CI/CD pipelines, blue-green, canary, environments | advisory-guide      | rigid |
| [harness-containerization](skills/harness-containerization/)             | Dockerfile review, K8s manifests, registries      | meticulous-verifier | rigid |
| [harness-infrastructure-as-code](skills/harness-infrastructure-as-code/) | Terraform, CloudFormation, Pulumi patterns        | advisory-guide      | rigid |
| [harness-observability](skills/harness-observability/)                   | Structured logging, metrics, tracing, alerting    | advisory-guide      | rigid |
| [harness-secrets](skills/harness-secrets/)                               | Vault integration, rotation, env-var hygiene      | meticulous-verifier | rigid |

### Reliability (3)

| Skill                                                          | Description                                         | Cognitive Mode          | Type  |
| -------------------------------------------------------------- | --------------------------------------------------- | ----------------------- | ----- |
| [harness-incident-response](skills/harness-incident-response/) | Runbooks, postmortems, SLO/SLA tracking             | diagnostic-investigator | rigid |
| [harness-resilience](skills/harness-resilience/)               | Circuit breakers, rate limiting, bulkheads, retries | advisory-guide          | rigid |
| [harness-load-testing](skills/harness-load-testing/)           | Stress testing, capacity planning, k6/Artillery     | meticulous-verifier     | rigid |

### Auth & Compliance (2)

| Skill                                            | Description                                | Cognitive Mode      | Type  |
| ------------------------------------------------ | ------------------------------------------ | ------------------- | ----- |
| [harness-auth](skills/harness-auth/)             | OAuth2, JWT, RBAC/ABAC, session management | advisory-guide      | rigid |
| [harness-compliance](skills/harness-compliance/) | SOC2, HIPAA, GDPR, audit trails            | meticulous-verifier | rigid |

### Feature Management (1)

| Skill                                                  | Description                                   | Cognitive Mode | Type  |
| ------------------------------------------------------ | --------------------------------------------- | -------------- | ----- |
| [harness-feature-flags](skills/harness-feature-flags/) | Flag lifecycle, A/B testing, gradual rollouts | advisory-guide | rigid |

### Advanced Testing (7)

| Skill                                                          | Description                                               | Cognitive Mode         | Type  |
| -------------------------------------------------------------- | --------------------------------------------------------- | ---------------------- | ----- |
| [harness-e2e](skills/harness-e2e/)                             | Playwright/Cypress/Selenium, page objects, flakiness      | meticulous-implementer | rigid |
| [harness-integration-test](skills/harness-integration-test/)   | Service boundary testing, contract validation             | meticulous-verifier    | rigid |
| [harness-test-data](skills/harness-test-data/)                 | Factories, fixtures, test DB lifecycle, isolation         | advisory-guide         | rigid |
| [harness-visual-regression](skills/harness-visual-regression/) | Screenshot diffing, baseline management                   | meticulous-verifier    | rigid |
| [harness-mutation-test](skills/harness-mutation-test/)         | Stryker, mutation scoring, test quality                   | adversarial-reviewer   | rigid |
| [harness-property-test](skills/harness-property-test/)         | fast-check/hypothesis, generative testing, shrinking      | constructive-architect | rigid |
| [harness-chaos](skills/harness-chaos/)                         | Fault injection, failure scenarios, resilience validation | adversarial-reviewer   | rigid |

### Soft Domains (3)

| Skill                                                | Description                                           | Cognitive Mode         | Type  |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------------------- | ----- |
| [harness-ux-copy](skills/harness-ux-copy/)           | Microcopy, error messages, voice/tone guides          | advisory-guide         | rigid |
| [harness-dx](skills/harness-dx/)                     | README audits, API doc generation, example validation | advisory-guide         | rigid |
| [harness-product-spec](skills/harness-product-spec/) | User stories, EARS acceptance criteria, PRD           | constructive-architect | rigid |

### Data Engineering (2)

| Skill                                                  | Description                                             | Cognitive Mode       | Type  |
| ------------------------------------------------------ | ------------------------------------------------------- | -------------------- | ----- |
| [harness-data-pipeline](skills/harness-data-pipeline/) | ETL/ELT patterns, data quality checks, pipeline testing | meticulous-verifier  | rigid |
| [harness-sql-review](skills/harness-sql-review/)       | Query optimization, index analysis, N+1 detection       | adversarial-reviewer | rigid |

### ML/AI (1)

| Skill                                    | Description                                                 | Cognitive Mode | Type  |
| ---------------------------------------- | ----------------------------------------------------------- | -------------- | ----- |
| [harness-ml-ops](skills/harness-ml-ops/) | Model serving, experiment config, prompt eval, ML pipelines | advisory-guide | rigid |

### Mobile (1)

| Skill                                                      | Description                                                     | Cognitive Mode | Type  |
| ---------------------------------------------------------- | --------------------------------------------------------------- | -------------- | ----- |
| [harness-mobile-patterns](skills/harness-mobile-patterns/) | Platform lifecycle, permissions, deep linking, store submission | advisory-guide | rigid |

## Existing Skill Reclassification

Every existing skill is reclassified into the tier system:

| Skill                                | Current   | New Tier   | Notes                      |
| ------------------------------------ | --------- | ---------- | -------------------------- |
| harness-brainstorming                | slash cmd | Tier 1     | Workflow entry             |
| harness-planning                     | slash cmd | Tier 1     | Workflow phase             |
| harness-execution                    | slash cmd | Tier 1     | Workflow phase             |
| harness-autopilot                    | slash cmd | Tier 1     | Autonomous loop            |
| harness-tdd                          | slash cmd | Tier 1     | Implementation method      |
| harness-debugging                    | slash cmd | Tier 1     | Reactive workflow          |
| harness-refactoring                  | slash cmd | Tier 1     | Restructuring workflow     |
| harness-integrity                    | slash cmd | Tier 2     | Unified gate               |
| harness-verify                       | slash cmd | Tier 2     | Quick gate                 |
| harness-code-review                  | slash cmd | Tier 2     | Review gate                |
| harness-release-readiness            | slash cmd | Tier 2     | Release audit              |
| harness-docs-pipeline                | slash cmd | Tier 2     | Doc health                 |
| harness-codebase-cleanup             | slash cmd | Tier 2     | Cleanup orchestrator       |
| harness-enforce-architecture         | slash cmd | Tier 2     | Layer checks               |
| harness-detect-doc-drift             | slash cmd | Tier 2     | Stale doc finder           |
| harness-cleanup-dead-code            | slash cmd | Tier 2     | Dead code removal          |
| harness-dependency-health            | slash cmd | Tier 2     | Structural health          |
| harness-hotspot-detector             | slash cmd | Tier 2     | Risk areas                 |
| harness-security-scan                | slash cmd | Tier 2     | Quick security             |
| harness-perf                         | slash cmd | Tier 2     | Perf budgets               |
| harness-impact-analysis              | slash cmd | Tier 2     | Change impact              |
| harness-test-advisor                 | slash cmd | Tier 2     | Test selection             |
| harness-soundness-review             | slash cmd | Tier 2     | Spec validation            |
| harness-design                       | slash cmd | Tier 3     | Domain: design             |
| harness-design-system                | slash cmd | Tier 3     | Domain: design             |
| harness-design-web                   | slash cmd | Tier 3     | Domain: design             |
| harness-design-mobile                | slash cmd | Tier 3     | Domain: design             |
| harness-accessibility                | slash cmd | Tier 3     | Domain: a11y               |
| harness-i18n                         | slash cmd | Tier 3     | Domain: i18n               |
| harness-i18n-workflow                | slash cmd | Tier 3     | Domain: i18n               |
| harness-i18n-process                 | slash cmd | Tier 3     | Domain: i18n               |
| harness-security-review              | slash cmd | Tier 3     | Domain: security (deep)    |
| harness-perf-tdd                     | slash cmd | Tier 3     | Domain: performance        |
| harness-diagnostics                  | slash cmd | Tier 3     | Domain: debugging          |
| harness-git-workflow                 | slash cmd | Tier 3     | Domain: release            |
| harness-roadmap                      | slash cmd | Tier 3     | Domain: project mgmt       |
| harness-pre-commit-review            | slash cmd | Tier 3     | Domain: quality            |
| harness-skill-authoring              | slash cmd | Tier 1     | Meta: extending framework  |
| harness-onboarding                   | slash cmd | Tier 1     | Meta: developer onboarding |
| initialize-harness-project           | slash cmd | Tier 1     | Meta: project setup        |
| add-harness-component                | slash cmd | Tier 1     | Meta: project modification |
| harness-align-documentation          | slash cmd | Dependency | Invoked by docs-pipeline   |
| harness-validate-context-engineering | slash cmd | Dependency | Invoked by docs-pipeline   |
| harness-check-mechanical-constraints | slash cmd | Dependency | Invoked by integrity       |
| harness-parallel-agents              | slash cmd | Dependency | Invoked by orchestrators   |
| harness-state-management             | slash cmd | Dependency | Internal plumbing          |
| harness-knowledge-mapper             | slash cmd | Dependency | Invoked by docs-pipeline   |

## Implementation Order

### Phase 1: Tier Infrastructure (foundation — must ship first)

1. Extend `SkillMetadataSchema` with `tier`, `internal`, `keywords`, `stack_signals` fields
2. Add tier field to all 49 existing skill.yaml files
3. Modify slash-command registration to filter by tier (only Tier 1 + 2)
4. Implement `search_skills` tool with index building and hash-based staleness
5. Implement stack profile generation
6. Implement dispatcher (scoring function + context injection on Tier 1 skill start)
7. Add `skills` section to `harness.config.json` schema (alwaysSuggest, neverSuggest, tierOverrides)

### Phase 2: Backend & Data Skills (5 skills)

- harness-api-design
- harness-database
- harness-event-driven
- harness-caching
- harness-data-validation

### Phase 3: Infrastructure & Ops Skills (5 skills)

- harness-deployment
- harness-containerization
- harness-infrastructure-as-code
- harness-observability
- harness-secrets

### Phase 4: Reliability + Auth & Compliance + Feature Mgmt Skills (6 skills)

- harness-incident-response
- harness-resilience
- harness-load-testing
- harness-auth
- harness-compliance
- harness-feature-flags

### Phase 5: Advanced Testing Skills (7 skills)

- harness-e2e
- harness-integration-test
- harness-test-data
- harness-visual-regression
- harness-mutation-test
- harness-property-test
- harness-chaos

### Phase 6: Soft Domains + Data + ML/AI + Mobile Skills (7 skills)

- harness-ux-copy
- harness-dx
- harness-product-spec
- harness-data-pipeline
- harness-sql-review
- harness-ml-ops
- harness-mobile-patterns

## Success Criteria

- Slash command count reduced from 49 to 23 (Tier 1 + Tier 2)
- `search_skills` returns relevant results for domain queries in under 100ms
- Dispatcher suggests relevant skills when workflow skills start with domain-specific tasks
- All 30 new skills pass `harness skill validate`
- All 30 new skills have full SKILL.md with required sections: When to Use, Process, Harness Integration, Success Criteria, Examples, Gates, Escalation
- Skills index rebuilds correctly when skills are added, removed, or modified
- `harness.config.json` tier overrides correctly promote/demote skills
- Community skills appear in catalog alongside bundled skills after install
- Stack profile correctly detects project technologies from file patterns
- No regression in existing skill functionality after tier reclassification
