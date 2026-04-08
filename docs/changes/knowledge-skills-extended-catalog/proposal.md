# Knowledge Skills: Extended Catalog & `related_skills` Traversal

**Keywords:** knowledge-skills, extended-catalog, related-skills-traversal, framework-verticals, library-verticals, domain-verticals, parallel-import, progressive-disclosure

## Overview

This spec defines the catalog and implementation structure for **27 knowledge skill verticals** that extend the infrastructure introduced in `docs/changes/knowledge-skills-schema-enrichment/proposal.md`. No schema, dispatcher, or injection changes are required — all infrastructure is already in place. This work is purely additive: new skills plus one capability wire-up.

The catalog spans three vertical families, each independently parallelizable:

- **Framework family** (10 slices): Next.js, NestJS, Angular, SvelteKit, Nuxt, Astro, tRPC, TanStack Query, Prisma, Drizzle
- **Library family** (4 slices): Zod, Redux Toolkit, XState, State Management (incl. Zustand)
- **Domain family** (14 slices): TypeScript, Testing, Node.js, GoF patterns, Security/OWASP, Resilience, Observability, CSS/Tailwind, GraphQL, Event-driven (incl. WebSocket/real-time), Microservices, Accessibility, Mobile/React Native, State Management

Plus one capability: **`related_skills` traversal** — wire up the graph already encoded in the schema so injected skills surface their neighbors as secondary recommendations.

### Prerequisite

This spec depends on `docs/changes/knowledge-skills-schema-enrichment/proposal.md` **Phase A completion** (schema, dispatcher, progressive disclosure, and hybrid injection infrastructure). No content phases may begin until Phase A of that spec is verified passing.

### Goals

1. Agents working in any of 27 major technology domains gain contextual knowledge alongside behavioral capabilities
2. Framework-specific slices are triggered with very high precision (config file globs: `next.config.*`, `angular.json`, `schema.prisma`)
3. Each vertical family ships in parallel — no cross-family dependencies
4. `related_skills` traversal turns the knowledge graph into live navigation — one injected pattern surfaces adjacent ones as secondary recommendations
5. All slices follow the same import mechanics established in Phase B/C of the parent spec (technology-prefixed names, `metadata.upstream`, `## Instructions` / `## Details` split)

### Non-Goals

- Any schema or dispatcher changes (all infrastructure is complete)
- Remix (unstable — React Router v7 migration in progress; revisit post-stabilization)
- Hono (deferred — edge patterns still solidifying; revisit after ecosystem matures)
- New import CLI tooling (remains a one-time-script approach per parent spec ADR-001)
- Cross-family dependency ordering — each slice is independently plannable and executable

## Decisions

| #   | Decision                          | Choice                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                     |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `related_skills` traversal timing | Phase A (before content phases)                                                                                                                                                                                                                                                                            | Low effort, immediately useful — every subsequent slice benefits from graph walking on day one                                                                |
| 2   | Parallelization unit              | Vertical family (not individual slice)                                                                                                                                                                                                                                                                     | Families are fully independent; slices within a family share naming conventions and `related_skills` links, so light coordination within a family is valuable |
| 3   | Framework slice granularity       | One slice per framework                                                                                                                                                                                                                                                                                    | Each framework has distinct enough patterns, triggers, and sources to warrant its own directory namespace and skill set                                       |
| 4   | Express / Fastify disposition     | Absorbed into Node.js slice                                                                                                                                                                                                                                                                                | Patterns are generic Node.js patterns; no framework-specific triggers sufficient to separate them                                                             |
| 5   | Zustand disposition               | Absorbed into State Management slice                                                                                                                                                                                                                                                                       | Pattern set too thin to stand alone; Zustand-specific patterns are a sub-section of the broader state management domain                                       |
| 6   | WebSocket / real-time disposition | Absorbed into Event-driven slice                                                                                                                                                                                                                                                                           | Real-time connection patterns are a natural sub-section of event-driven architecture                                                                          |
| 7   | Remix disposition                 | Skipped this cycle                                                                                                                                                                                                                                                                                         | Merging into React Router v7 — importing now would require immediate re-import; revisit post-stabilization                                                    |
| 8   | Hono disposition                  | Deferred                                                                                                                                                                                                                                                                                                   | Ecosystem too early; edge patterns still solidifying                                                                                                          |
| 9   | Naming convention                 | Family-prefixed (`next-`, `nestjs-`, `angular-`, `svelte-`, `astro-`, `nuxt-`, `trpc-`, `tanstack-`, `prisma-`, `drizzle-`, `zod-`, `redux-`, `xstate-`, `state-`, `ts-`, `test-`, `node-`, `gof-`, `owasp-`, `resilience-`, `otel-`, `css-`, `graphql-`, `events-`, `microservices-`, `a11y-`, `mobile-`) | Consistent with existing `react-`, `js-`, `vue-` convention from parent spec                                                                                  |
| 10  | Source strategy                   | One-time import with `metadata.upstream` provenance                                                                                                                                                                                                                                                        | Deferred import CLI means manual import per slice; `metadata.upstream` preserves future sync capability                                                       |
| 11  | Platform replication              | All slices replicated to `gemini-cli` and `cursor`                                                                                                                                                                                                                                                         | Consistent with React/JS/Vue import in parent spec                                                                                                            |
| 12  | Auto-injection cap                | 3 knowledge skills per dispatch                                                                                                                                                                                                                                                                            | Bounds worst-case context token impact (~6K tokens) regardless of catalog size; excess high-scorers demoted to recommendations                                |
| 13  | Traversal recommendation cap      | 10 entries per traversal pass                                                                                                                                                                                                                                                                              | Prevents cosmetic noise from densely-connected graph; one hop only (not recursive)                                                                            |

## Technical Design

### `related_skills` Traversal (Phase A)

Single change in `packages/cli/src/skill/dispatcher.ts`, in the `suggest()` function, after populating `autoInjectKnowledge`:

```typescript
// After auto-inject list is built, walk related_skills for each injected skill
for (const injectedSkill of result.autoInjectKnowledge) {
  const entry = index.get(injectedSkill.name);
  if (!entry?.relatedSkills) continue;
  for (const relatedName of entry.relatedSkills) {
    const related = index.get(relatedName);
    if (!related) continue;
    const alreadySurfaced =
      result.autoInjectKnowledge.some((s) => s.name === relatedName) ||
      result.knowledgeRecommendations.some((r) => r.name === relatedName);
    if (!alreadySurfaced) {
      result.knowledgeRecommendations.push({
        ...related,
        score: 0.45, // floor — secondary recommendation
        reason: `related to auto-injected ${injectedSkill.name}`,
      });
    }
  }
}
// Cap traversal results
result.knowledgeRecommendations = result.knowledgeRecommendations.slice(0, 10);
```

Also add auto-injection cap immediately before the traversal block:

```typescript
// Cap auto-injection at 3 knowledge skills; demote excess to recommendations
if (result.autoInjectKnowledge.length > 3) {
  const demoted = result.autoInjectKnowledge.slice(3);
  result.autoInjectKnowledge = result.autoInjectKnowledge.slice(0, 3);
  result.knowledgeRecommendations.unshift(...demoted);
}
```

No schema changes. One new test case added to dispatcher test suite: "auto-injected skill with `related_skills` surfaces neighbors as secondary recommendations; deduplication works; caps enforced."

### Knowledge Skill Catalog

Each slice follows the same structure established in the parent spec:

```
agents/skills/claude-code/
  <prefix>-<pattern-name>/
    skill.yaml
    SKILL.md
```

Replicated to `gemini-cli/` and `cursor/`.

#### Wave 1 — Framework Family (10 slices, parallel)

| Slice          | Prefix      | Est. Skills | Key `paths` triggers                                    | `related_skills` links          |
| -------------- | ----------- | ----------- | ------------------------------------------------------- | ------------------------------- |
| Next.js        | `next-`     | 18–22       | `next.config.*`, `**/app/**`, `**/pages/**`             | `react-*`, `tanstack-*`, `ts-*` |
| NestJS         | `nestjs-`   | 15–18       | `nest-cli.json`, `**/*.module.ts`, `**/*.controller.ts` | `node-*`, `ts-*`, `owasp-*`     |
| Angular        | `angular-`  | 14–16       | `angular.json`, `**/*.component.ts`, `**/*.service.ts`  | `ts-*`, `state-*`, `a11y-*`     |
| SvelteKit      | `svelte-`   | 12–15       | `svelte.config.*`, `**/*.svelte`                        | `ts-*`, `css-*`                 |
| Nuxt           | `nuxt-`     | 10–12       | `nuxt.config.*`, `**/composables/**`                    | `vue-*`, `ts-*`                 |
| Astro          | `astro-`    | 10–12       | `astro.config.*`, `**/*.astro`                          | `react-*`, `vue-*`, `svelte-*`  |
| tRPC           | `trpc-`     | 8–10        | `**/trpc/**`, `**/router.ts`                            | `next-*`, `ts-*`, `zod-*`       |
| TanStack Query | `tanstack-` | 10–12       | `**/queries/**`, `queryClient.ts`                       | `react-*`, `next-*`, `state-*`  |
| Prisma         | `prisma-`   | 10–12       | `schema.prisma`, `**/prisma/**`                         | `node-*`, `ts-*`, `nestjs-*`    |
| Drizzle        | `drizzle-`  | 8–10        | `drizzle.config.*`, `**/schema.ts`                      | `node-*`, `ts-*`                |

#### Wave 2 — Library Family (4 slices, parallel)

| Slice            | Prefix    | Est. Skills | Key `paths` triggers                  | `related_skills` links           |
| ---------------- | --------- | ----------- | ------------------------------------- | -------------------------------- |
| Zod              | `zod-`    | 8–10        | `**/*.schema.ts`, `z.object` presence | `ts-*`, `trpc-*`, `nestjs-*`     |
| Redux Toolkit    | `redux-`  | 10–12       | `**/*.slice.ts`, `store.ts`           | `react-*`, `next-*`, `state-*`   |
| XState           | `xstate-` | 8–10        | `**/*.machine.ts`, `createMachine`    | `state-*`, `react-*`             |
| State Management | `state-`  | 8–10        | `**/store/**`, `**/reducers/**`       | `react-*`, `redux-*`, `xstate-*` |

#### Wave 3 — Domain Family (14 slices, parallel)

| Slice               | Prefix           | Est. Skills | Key `paths` triggers                                    | `related_skills` links                      |
| ------------------- | ---------------- | ----------- | ------------------------------------------------------- | ------------------------------------------- |
| TypeScript          | `ts-`            | 18–22       | `**/*.ts`, `tsconfig.json`                              | all framework slices                        |
| Testing             | `test-`          | 15–18       | `**/*.test.*`, `vitest.config.*`, `playwright.config.*` | `ts-*`, framework slices                    |
| Node.js             | `node-`          | 12–15       | `**/server/**`, `**/routes/**`, `**/*.mjs`              | `nestjs-*`, `ts-*`, `events-*`              |
| GoF Patterns        | `gof-`           | 20–23       | `**/*.ts` (broad)                                       | `ts-*`, `nestjs-*`, `angular-*`             |
| Security/OWASP      | `owasp-`         | 10–12       | `**/auth/**`, `**/security/**`, `**/middleware/**`      | `nestjs-*`, `node-*`                        |
| Resilience          | `resilience-`    | 8–10        | `**/services/**`, `**/clients/**`                       | `microservices-*`, `events-*`, `node-*`     |
| Observability       | `otel-`          | 10–12       | `**/instrumentation/**`, `@opentelemetry/*`             | `node-*`, `nestjs-*`, `microservices-*`     |
| CSS/Tailwind        | `css-`           | 10–12       | `tailwind.config.*`, `**/*.css`, `**/*.module.css`      | `react-*`, `svelte-*`, `next-*`             |
| GraphQL             | `graphql-`       | 10–12       | `**/*.graphql`, `**/resolvers/**`                       | `node-*`, `nestjs-*`, `ts-*`                |
| Event-driven        | `events-`        | 10–12       | `**/events/**`, `**/queues/**`, `**/socket/**`          | `node-*`, `microservices-*`, `resilience-*` |
| Microservices       | `microservices-` | 12–15       | `**/services/**`, `**/gateway/**`                       | `events-*`, `resilience-*`, `otel-*`        |
| Accessibility       | `a11y-`          | 8–10        | `**/*.tsx`, `**/*.html`, `**/*.vue`                     | `react-*`, `angular-*`, `svelte-*`          |
| Mobile/React Native | `mobile-`        | 10–12       | `**/*.native.*`, `app.json`, `**/screens/**`            | `react-*`, `ts-*`, `state-*`                |

#### Skill Count Summary

| Phase     | Description                | Slices          | Est. Skills [ESTIMATE]  |
| --------- | -------------------------- | --------------- | ----------------------- |
| Phase A   | `related_skills` traversal | 1 (code change) | —                       |
| Phase B   | Framework family           | 10              | 105–125                 |
| Phase C   | Library family             | 4               | 34–42                   |
| Phase D   | Domain family              | 14              | 145–177                 |
| Phase E   | Integration validation     | —               | —                       |
| **Total** |                            | **28**          | **~285–345 [ESTIMATE]** |

#### Performance Profile

Adding ~285–345 knowledge skills grows the searchable index from ~81 to ~385–445 entries [ESTIMATE: ~200KB additional index data]. Key bounds:

- **Token impact**: auto-injection capped at 3 skills × ~2K tokens = ~6K tokens worst case. `related_skills` traversal surfaces names only (not content), adding negligible token cost.
- **Scoring cost**: pure in-memory glob matching, no file I/O. Sub-millisecond per skill at this scale.
- **Broad-trigger risk**: Skills with `**/*.ts` paths (`ts-*`, `gof-*`) match nearly every TypeScript repo. The `paths` dimension is capped at 0.20 weight — a paths match alone cannot reach the 0.7 auto-inject threshold without co-firing keyword or stack signals.

#### File Layout Example

```
agents/skills/claude-code/
  next-app-router/
    skill.yaml
    SKILL.md
  next-server-components/
    skill.yaml
    SKILL.md
  nestjs-module-pattern/
    skill.yaml
    SKILL.md
  ts-conditional-types/
    skill.yaml
    SKILL.md
  ...

agents/skills/gemini-cli/        # replicated
agents/skills/cursor/            # replicated
```

## Success Criteria

### Phase A: `related_skills` Traversal

1. When a knowledge skill is auto-injected, its `related_skills` entries appear in `knowledgeRecommendations` if not already surfaced
2. Traversal is one hop only — `related_skills` of recommendations are not walked
3. Already-surfaced skills (auto-injected or already recommended) are not duplicated
4. Surfaced related skills carry `score: 0.45` and `reason: "related to auto-injected <name>"`
5. `related_skills` traversal adds no entries when the injected skill has no `related_skills`
6. Recommendation list from traversal capped at 10 entries per dispatch pass
7. Auto-injection capped at 3 knowledge skills per dispatch — excess high-scorers prepended to `knowledgeRecommendations`

### Phase B: Framework Family (all 10 slices)

8. All ~105–125 framework skills exist with correct technology prefix
9. Each skill passes schema validation: `type: 'knowledge'`, no `phases`, no `tools`, `state.persistent: false`
10. Each skill has `metadata.upstream` pointing to its source document
11. Each skill's `paths` globs are verified by spot-check: for each slice, at least one representative repo with that framework present surfaces the skill, and one repo without the framework does not — performed during execution phase as a manual gate before merge
12. `related_skills` references resolve — no dangling references to non-existent skill names
13. All 10 slices replicated to `gemini-cli` and `cursor` platforms

### Phase C: Library Family (all 4 slices)

14. All ~34–42 library skills exist with correct prefix
15. Schema validation passes for all library skills
16. `zod-*` skills activate when `*.schema.ts` or `z.object` presence is detected alongside `zod` stack signal
17. `xstate-*` skills activate when `*.machine.ts` or `createMachine` presence is detected
18. All 4 slices replicated across platforms

### Phase D: Domain Family (all 14 slices)

19. All ~145–177 domain skills exist with correct prefix
20. Broad-trigger domain skills (`ts-*`, `gof-*`, `a11y-*`) do not auto-inject on paths match alone — keyword or stack signal co-firing required to reach 0.7
21. `test-*` skills activate against `*.test.*` and `*.spec.*` but not against production source files in isolation
22. `owasp-*` skills activate against `**/auth/**`, `**/security/**`, `**/middleware/**` alongside security-domain keywords
23. All 14 slices replicated across platforms

### Performance Guardrails (all phases)

24. `scoreSkill()` over a 400-entry mock index completes in <50ms [ESTIMATE: based on in-memory glob analysis, not yet benchmarked — establish actual baseline in Phase A]
25. Full index build for 400-skill catalog completes in <5s [ESTIMATE — establish actual baseline in Phase A]
26. No regression in existing behavioral skill dispatch quality — existing Tier 1/2 recommendation scores unchanged (verified by existing dispatcher test suite)

### Cross-cutting

27. `harness validate` passes with full catalog present
28. No existing behavioral skill dispatch is affected — Tier 1/2 skills remain unindexed and always-loaded

## Implementation Order

### Phase A: `related_skills` Traversal

_Prerequisite for all content phases. Single engineer, ~1 day._

1. Add auto-injection cap (N=3) to `suggest()` in `dispatcher.ts`
2. Add traversal logic — walk `related_skills` of auto-injected skills, surface as secondary recommendations with `score: 0.45`
3. Add recommendation cap (10 entries) after traversal
4. Unit tests: traversal fires, deduplication works, caps enforced, empty `related_skills` no-ops
5. Establish performance baselines: `scoreSkill()` over 400-entry mock index, full index build time

### Phase B: Framework Family _(10 slices in parallel)_

**B1 — React ecosystem** (coordinate `related_skills` links across these three)

- Next.js (~18–22 skills)
- TanStack Query (~10–12 skills)
- tRPC (~8–10 skills)

**B2 — Angular ecosystem**

- Angular (~14–16 skills)

**B3 — Vue ecosystem**

- Nuxt (~10–12 skills)

**B4 — Svelte ecosystem**

- SvelteKit (~12–15 skills)

**B5 — Multi-framework**

- Astro (~10–12 skills)

**B6 — Backend**

- NestJS (~15–18 skills)
- Prisma (~10–12 skills)
- Drizzle (~8–10 skills)

Each group: import skills with prefix and full harness enrichment → set `paths`, `related_skills`, `stack_signals`, `keywords` → replicate to `gemini-cli` and `cursor` → spot-check gate (SC#11).

### Phase C: Library Family _(4 slices in parallel)_

- Zod (~8–10 skills)
- Redux Toolkit (~10–12 skills)
- XState (~8–10 skills)
- State Management / Zustand (~8–10 skills)

Each slice: import with prefix → enrich → replicate → verify `related_skills` links to Phase B skills resolve correctly.

### Phase D: Domain Family _(14 slices in parallel)_

**D1 — Language & testing**

- TypeScript patterns (~18–22 skills)
- Testing patterns (~15–18 skills)
- Node.js patterns (~12–15 skills)

**D2 — Architecture**

- GoF Design patterns (~20–23 skills)
- Microservices patterns (~12–15 skills)
- Event-driven patterns incl. WebSocket (~10–12 skills)

**D3 — Production concerns**

- Security/OWASP (~10–12 skills)
- Resilience patterns (~8–10 skills)
- Observability/OpenTelemetry (~10–12 skills)

**D4 — UI & client**

- CSS/Tailwind (~10–12 skills)
- Accessibility/WCAG (~8–10 skills)
- Mobile/React Native (~10–12 skills)

**D5 — Data**

- GraphQL patterns (~10–12 skills)

Each group: import with prefix → enrich → replicate → verify broad-trigger skills do not cross 0.7 threshold on paths match alone.

### Phase E: Integration Validation

_After all content phases complete._

1. Full `harness validate` against 400-skill catalog
2. Regression: existing behavioral skill dispatch scores unchanged
3. End-to-end spot-checks across 5 representative project types (Next.js, NestJS, Angular, SvelteKit, Node.js API)
4. Performance gate: verify against baselines established in Phase A

## Related Documents

- [Knowledge Skills Category & Schema Enrichment](../knowledge-skills-schema-enrichment/proposal.md) — parent spec; Phase A of that spec is a prerequisite
