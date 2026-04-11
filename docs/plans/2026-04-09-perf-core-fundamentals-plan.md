# Plan: Performance Engineering — Phase 1 Core Fundamentals

**Date:** 2026-04-09
**Spec:** docs/changes/knowledge-skills-wave-2/proposal.md
**Estimated tasks:** 17
**Estimated time:** ~85 minutes

## Goal

Create 15 foundational performance engineering knowledge skills covering browser rendering pipeline, Core Web Vitals, JavaScript runtime, memory management, and measurement methodology across all 4 platforms.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^perf-"` is run, 15 directories are listed matching the skill names in this plan.
2. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 15 new skill.yaml files pass SkillMetadataSchema validation.
3. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 15 new SKILL.md files pass the knowledge-type section check (`## Instructions` required).
4. Each SKILL.md contains all 7 spec-required sections: `## When to Use`, `## Instructions`, `## Details`, `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
5. Each SKILL.md is 150-250 lines with at least 2 worked examples from real production systems and at least 3 anti-patterns.
6. When `diff -rq agents/skills/claude-code/perf-critical-rendering-path/SKILL.md agents/skills/gemini-cli/perf-critical-rendering-path/SKILL.md` is run, files are identical (and likewise for all 15 skills across all 4 platforms).
7. Each platform replica's skill.yaml has its `platforms` field set to the correct single-platform value.
8. When `harness validate` is run, validation passes.

## File Map

### CREATE (claude-code) — 30 files in 15 directories

- CREATE agents/skills/claude-code/perf-critical-rendering-path/skill.yaml
- CREATE agents/skills/claude-code/perf-critical-rendering-path/SKILL.md
- CREATE agents/skills/claude-code/perf-dom-parsing/skill.yaml
- CREATE agents/skills/claude-code/perf-dom-parsing/SKILL.md
- CREATE agents/skills/claude-code/perf-style-calculation/skill.yaml
- CREATE agents/skills/claude-code/perf-style-calculation/SKILL.md
- CREATE agents/skills/claude-code/perf-layout-reflow/skill.yaml
- CREATE agents/skills/claude-code/perf-layout-reflow/SKILL.md
- CREATE agents/skills/claude-code/perf-paint-compositing/skill.yaml
- CREATE agents/skills/claude-code/perf-paint-compositing/SKILL.md
- CREATE agents/skills/claude-code/perf-largest-contentful-paint/skill.yaml
- CREATE agents/skills/claude-code/perf-largest-contentful-paint/SKILL.md
- CREATE agents/skills/claude-code/perf-interaction-to-next-paint/skill.yaml
- CREATE agents/skills/claude-code/perf-interaction-to-next-paint/SKILL.md
- CREATE agents/skills/claude-code/perf-cumulative-layout-shift/skill.yaml
- CREATE agents/skills/claude-code/perf-cumulative-layout-shift/SKILL.md
- CREATE agents/skills/claude-code/perf-event-loop/skill.yaml
- CREATE agents/skills/claude-code/perf-event-loop/SKILL.md
- CREATE agents/skills/claude-code/perf-long-tasks/skill.yaml
- CREATE agents/skills/claude-code/perf-long-tasks/SKILL.md
- CREATE agents/skills/claude-code/perf-garbage-collection/skill.yaml
- CREATE agents/skills/claude-code/perf-garbage-collection/SKILL.md
- CREATE agents/skills/claude-code/perf-memory-leaks/skill.yaml
- CREATE agents/skills/claude-code/perf-memory-leaks/SKILL.md
- CREATE agents/skills/claude-code/perf-heap-profiling/skill.yaml
- CREATE agents/skills/claude-code/perf-heap-profiling/SKILL.md
- CREATE agents/skills/claude-code/perf-performance-api/skill.yaml
- CREATE agents/skills/claude-code/perf-performance-api/SKILL.md
- CREATE agents/skills/claude-code/perf-profiling-methodology/skill.yaml
- CREATE agents/skills/claude-code/perf-profiling-methodology/SKILL.md

### CREATE (platform replicas) — 90 files in 45 directories

- CREATE agents/skills/gemini-cli/perf-\*/skill.yaml (15 files, platforms field: `- gemini-cli`)
- CREATE agents/skills/gemini-cli/perf-\*/SKILL.md (15 files, identical to claude-code)
- CREATE agents/skills/cursor/perf-\*/skill.yaml (15 files, platforms field: `- cursor`)
- CREATE agents/skills/cursor/perf-\*/SKILL.md (15 files, identical to claude-code)
- CREATE agents/skills/codex/perf-\*/skill.yaml (15 files, platforms field: `- codex`)
- CREATE agents/skills/codex/perf-\*/SKILL.md (15 files, identical to claude-code)

**Total: 120 files in 60 directories.**

## Skeleton

1. Browser Rendering Pipeline skills in claude-code (~5 tasks, ~25 min)
2. Core Web Vitals skills in claude-code (~3 tasks, ~15 min)
3. JavaScript Runtime skills in claude-code (~2 tasks, ~10 min)
4. Memory skills in claude-code (~2 tasks, ~10 min)
5. Measurement skills in claude-code (~2 tasks, ~10 min)
6. Platform replication (~1 task, ~5 min)
7. Validation (~1 task, ~5 min)

**Estimated total:** 17 tasks, ~85 minutes

## Shared Patterns

### skill.yaml Template

Every skill.yaml in this plan follows the same structure. Only these fields vary per skill:

- `name` — the skill directory name
- `description` — one-line description
- `related_skills` — domain-specific cross-references
- `keywords` — domain-specific terms for dispatcher scoring

All other fields are constant:

```yaml
version: '1.0.0'
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
stack_signals: []
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

### SKILL.md Template

Every SKILL.md follows the established Wave 1 structure. Required sections:

1. `# <Title>` — h1 heading (required by structure.test.ts line 46)
2. `> <description>` — blockquote
3. `## When to Use` — 8-10 bullet points describing trigger scenarios
4. `## Instructions` — numbered procedural steps with code examples (required by structure.test.ts line 61)
5. `## Details` — sub-topics, anti-patterns, real-world examples with specific metrics
6. `## Source` — authoritative references (W3C specs, Chrome docs, research papers)
7. `## Process` — standard 3-step process block
8. `## Harness Integration` — standard knowledge integration block
9. `## Success Criteria` — measurable criteria

Each SKILL.md must be **150-250 lines**, include **at least 2 worked examples** from real production systems with specific metrics, and include **at least 3 anti-patterns**.

### SKILL.md Content Quality Requirements

- **No "use your judgment"** — every principle includes concrete decision procedures with thresholds
- **Framework-agnostic** — teach the underlying browser/runtime model, not React/Vue/Angular specifics
- **PhD-level rigor, practitioner-level accessibility** — include V8 internals, compositor thread architecture, browser process model
- **Specific values** — not "reduce your bundle size" but "Amazon found each 100ms of latency cost 1% of sales; Walmart saw 2% conversion increase per 1s of load time improvement"
- **Anti-patterns describe what bad looks like** — with DevTools screenshots described, specific code patterns, and measurable impact

### Cross-reference Pool

These existing skills should be referenced in `related_skills` where relevant:

- `css-performance-patterns` — CSS-specific perf (reference from rendering pipeline skills)
- `node-performance-profiling` — Node.js profiling (reference from profiling methodology)
- `ts-performance-patterns` — TypeScript perf (reference from JS runtime skills)
- `angular-performance-patterns` — Angular perf (reference from CWV skills)
- `mobile-performance-patterns` — Mobile perf (reference from CWV and rendering skills)
- `test-performance-testing` — Perf testing (reference from measurement skills)
- `otel-performance-insights` — Observability (reference from measurement skills)

---

## Tasks

### Task 1: perf-critical-rendering-path

**Depends on:** none
**Files:** agents/skills/claude-code/perf-critical-rendering-path/skill.yaml, agents/skills/claude-code/perf-critical-rendering-path/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-critical-rendering-path`

2. Create `agents/skills/claude-code/perf-critical-rendering-path/skill.yaml`:

```yaml
name: perf-critical-rendering-path
version: '1.0.0'
description: Browser rendering pipeline — Parse, Style, Layout, Paint, Composite stages and optimization strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-dom-parsing
  - perf-style-calculation
  - perf-layout-reflow
  - perf-paint-compositing
  - perf-largest-contentful-paint
  - css-performance-patterns
stack_signals: []
keywords:
  - critical rendering path
  - rendering pipeline
  - render blocking
  - CSSOM
  - DOM construction
  - first paint
  - pixel pipeline
  - browser rendering
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-critical-rendering-path/SKILL.md` (150-250 lines):
   - Cover: the 5-stage pixel pipeline (Parse HTML to DOM, Parse CSS to CSSOM, Combine to Render Tree, Layout, Paint + Composite), render-blocking vs parser-blocking resources, critical path length/bytes/resources, incremental rendering, streaming HTML
   - Worked examples: How Google.com achieves first paint in <1s by inlining critical CSS (14KB first-flush rule matching TCP initial congestion window), how Shopify reduced CRP from 8 to 3 critical resources by deferring non-essential CSS/JS and saw 50% improvement in Start Render
   - Anti-patterns: render-blocking CSS in `<head>` without media queries (loading print.css blocks rendering on screen), synchronous `<script>` tags without defer/async blocking HTML parser, over-inlining (putting entire CSS framework inline defeats caching), font-display: block causing invisible text during font load
   - Sources: Google Web Fundamentals CRP documentation, W3C Navigation Timing spec, Ilya Grigorik "High Performance Browser Networking"

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-critical-rendering-path knowledge skill`

---

### Task 2: perf-dom-parsing

**Depends on:** none
**Files:** agents/skills/claude-code/perf-dom-parsing/skill.yaml, agents/skills/claude-code/perf-dom-parsing/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-dom-parsing`

2. Create `agents/skills/claude-code/perf-dom-parsing/skill.yaml`:

```yaml
name: perf-dom-parsing
version: '1.0.0'
description: HTML parsing — tokenization, tree construction, speculative parsing, parser-blocking scripts
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-critical-rendering-path
  - perf-style-calculation
  - perf-largest-contentful-paint
stack_signals: []
keywords:
  - HTML parser
  - tokenization
  - tree construction
  - speculative parsing
  - preload scanner
  - parser blocking
  - document.write
  - DOMContentLoaded
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-dom-parsing/SKILL.md` (150-250 lines):
   - Cover: HTML5 parsing algorithm (tokenizer states, tree construction modes), speculative parsing/preload scanner (how browsers look ahead past blocking scripts to discover resources), parser-blocking vs render-blocking distinction, `DOMContentLoaded` vs `load` event timing, `document.write` and why it defeats speculative parsing, chunked HTML delivery and streaming
   - Worked examples: How Chrome's preload scanner discovers images and stylesheets while blocked on a synchronous script (Chrome team reported preload scanner improves page load by ~20%), how eBay's streaming HTML architecture sends first chunk in <100ms by flushing the `<head>` immediately before the backend completes data fetching
   - Anti-patterns: `document.write()` injecting scripts (forces parser restart, Chrome intervenes on 2G), excessive DOM depth (>1500 nodes increases style recalculation cost quadratically), parser-blocking scripts in `<head>` without defer/async, injecting large HTML via `innerHTML` bypassing incremental parsing
   - Sources: HTML Living Standard Section 13 (parsing), Chrome's preload scanner documentation, WebKit blog on speculative parsing

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-dom-parsing knowledge skill`

---

### Task 3: perf-style-calculation

**Depends on:** none
**Files:** agents/skills/claude-code/perf-style-calculation/skill.yaml, agents/skills/claude-code/perf-style-calculation/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-style-calculation`

2. Create `agents/skills/claude-code/perf-style-calculation/skill.yaml`:

```yaml
name: perf-style-calculation
version: '1.0.0'
description: CSS selector matching — specificity costs, style recalculation triggers, selector performance
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-critical-rendering-path
  - perf-layout-reflow
  - css-performance-patterns
stack_signals: []
keywords:
  - style recalculation
  - selector matching
  - specificity
  - CSSOM
  - computed style
  - CSS containment
  - style invalidation
  - recalculate style
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-style-calculation/SKILL.md` (150-250 lines):
   - Cover: how browsers match selectors (right-to-left matching), style invalidation (what triggers recalculation), the cost curve (linear with element count times selector count), CSS containment (`contain: style`), style scope, the Bloom filter optimization in selector matching, reducing Recalculate Style in DevTools
   - Worked examples: How LinkedIn reduced style recalculation from 50ms to 8ms by reducing selector complexity from `.feed .card .content .text p` to `.feed-text` (fewer match candidates), how Facebook uses atomic CSS (Stylex) where each class maps to exactly one property — selector matching becomes O(1) per property instead of O(selectors \* elements)
   - Anti-patterns: universal selectors in compound selectors (`*.active` forces evaluation against every element), deeply nested descendant selectors (`.a .b .c .d .e` triggers expensive tree walks), `:nth-child` on large sibling lists (forces counting), adding/removing classes on `<body>` (invalidates styles for entire document)
   - Sources: Google Developers "Reduce the Scope and Complexity of Style Calculations", Blink style invalidation documentation, CSS Containment spec

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-style-calculation knowledge skill`

---

### Task 4: perf-layout-reflow

**Depends on:** none
**Files:** agents/skills/claude-code/perf-layout-reflow/skill.yaml, agents/skills/claude-code/perf-layout-reflow/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-layout-reflow`

2. Create `agents/skills/claude-code/perf-layout-reflow/skill.yaml`:

```yaml
name: perf-layout-reflow
version: '1.0.0'
description: Layout triggers — forced synchronous layouts, layout thrashing, containment strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-critical-rendering-path
  - perf-style-calculation
  - perf-paint-compositing
  - perf-interaction-to-next-paint
  - css-performance-patterns
stack_signals: []
keywords:
  - layout
  - reflow
  - forced synchronous layout
  - layout thrashing
  - layout containment
  - offsetWidth
  - getBoundingClientRect
  - ResizeObserver
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-layout-reflow/SKILL.md` (150-250 lines):
   - Cover: what triggers layout (geometry changes, DOM mutations, reading layout properties after writes), forced synchronous layout (reading `offsetWidth` after writing `style.width` forces synchronous layout), layout thrashing (read-write-read-write loop in a loop), layout containment (`contain: layout`), `ResizeObserver` as layout-read replacement, layout boundaries, the layout tree vs DOM tree distinction
   - Worked examples: How a Trello-style board suffered 200ms layout thrashing in a drag handler that read `offsetTop` and set `style.top` for each card in a loop — fixed by batching reads then writes (reduced to 4ms), how Google Maps uses `contain: layout` on map tiles to prevent tile updates from triggering full-page layout
   - Anti-patterns: reading `offsetWidth`/`offsetHeight` inside animation loops (forces layout per frame), toggling CSS classes that change geometry on many elements without batching, using `getComputedStyle()` to read layout properties after style changes (forces style+layout), animating `width`/`height`/`top`/`left` instead of `transform` (triggers layout per frame)
   - Sources: Paul Irish's "What forces layout/reflow" gist (comprehensive property list), CSS Containment Module Level 2, Chrome DevTools Layout Shift documentation

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-layout-reflow knowledge skill`

---

### Task 5: perf-paint-compositing

**Depends on:** none
**Files:** agents/skills/claude-code/perf-paint-compositing/skill.yaml, agents/skills/claude-code/perf-paint-compositing/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-paint-compositing`

2. Create `agents/skills/claude-code/perf-paint-compositing/skill.yaml`:

```yaml
name: perf-paint-compositing
version: '1.0.0'
description: Paint layers and compositor — GPU compositing, will-change, layer promotion, paint complexity
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-critical-rendering-path
  - perf-layout-reflow
  - perf-cumulative-layout-shift
  - css-performance-patterns
  - mobile-performance-patterns
stack_signals: []
keywords:
  - paint
  - compositing
  - GPU layers
  - will-change
  - layer promotion
  - compositor thread
  - raster
  - paint complexity
  - transform
  - opacity
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-paint-compositing/SKILL.md` (150-250 lines):
   - Cover: main thread paint vs compositor thread compositing, layer tree construction, what triggers layer promotion (3D transforms, `will-change`, `<video>`, `position: fixed`), compositor-only properties (`transform`, `opacity` — skip layout and paint), paint complexity (gradients, shadows, filters), Layers panel in DevTools, texture upload costs (GPU memory), rasterization (software vs GPU), tiling
   - Worked examples: How Airbnb's parallax scroll went from 15fps to 60fps by switching from `background-position` animation (triggers paint per frame) to `transform: translate3d()` (compositor-only), how a dashboard with 50 `will-change: transform` elements consumed 400MB GPU memory on mobile — fixed by applying `will-change` only during active animation and removing after `transitionend`
   - Anti-patterns: blanket `will-change: transform` on all elements (each promoted layer consumes GPU memory), animating `box-shadow` or `border-radius` (triggers expensive paint operations per frame), excessive layer count (>30 layers on mobile causes texture upload jank), `backface-visibility: hidden` hack applied globally to force GPU compositing
   - Sources: Chrome Compositing documentation, Chromium GPU architecture docs, Surma's "The Anatomy of a Frame" (Google)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-paint-compositing knowledge skill`

---

### Task 6: perf-largest-contentful-paint

**Depends on:** none
**Files:** agents/skills/claude-code/perf-largest-contentful-paint/skill.yaml, agents/skills/claude-code/perf-largest-contentful-paint/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-largest-contentful-paint`

2. Create `agents/skills/claude-code/perf-largest-contentful-paint/skill.yaml`:

```yaml
name: perf-largest-contentful-paint
version: '1.0.0'
description: LCP measurement — root causes, sub-part timing, optimization strategies for the largest visible element
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-critical-rendering-path
  - perf-dom-parsing
  - perf-interaction-to-next-paint
  - perf-cumulative-layout-shift
  - perf-performance-api
  - mobile-performance-patterns
  - angular-performance-patterns
stack_signals: []
keywords:
  - LCP
  - largest contentful paint
  - Core Web Vitals
  - TTFB
  - resource load delay
  - render delay
  - image optimization
  - preload
  - fetchpriority
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-largest-contentful-paint/SKILL.md` (150-250 lines):
   - Cover: what LCP measures (largest image, video poster, text block, or background image in viewport), the 4 LCP sub-parts (TTFB, resource load delay, resource load time, element render delay), good/needs-improvement/poor thresholds (<=2.5s / <=4s / >4s at p75), `fetchpriority="high"` for LCP images, `<link rel="preload">` for hero images, avoiding lazy-loading above-the-fold images, server response time optimization, LCP element candidates and how they change during load
   - Worked examples: How Vodafone improved LCP by 31% (from 4.2s to 2.9s) by preloading the hero image and using `fetchpriority="high"` — detailed sub-part breakdown showing resource load delay dropped from 1.8s to 0.3s, how The Economic Times reduced LCP from 7s to 2.5s by switching from client-side rendering to server-side rendering with streamed HTML
   - Anti-patterns: lazy-loading the LCP image (`loading="lazy"` on hero images delays discovery), LCP element loaded via JavaScript (client-side rendering means LCP waits for JS parse+execute+fetch+render), excessive redirect chains before document (each redirect adds 300-600ms TTFB), unoptimized hero images (6MB PNG when 200KB WebP would suffice)
   - Sources: web.dev LCP documentation, Chrome User Experience Report methodology, Web Vitals JavaScript library source

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-largest-contentful-paint knowledge skill`

---

### Task 7: perf-interaction-to-next-paint

**Depends on:** none
**Files:** agents/skills/claude-code/perf-interaction-to-next-paint/skill.yaml, agents/skills/claude-code/perf-interaction-to-next-paint/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-interaction-to-next-paint`

2. Create `agents/skills/claude-code/perf-interaction-to-next-paint/skill.yaml`:

```yaml
name: perf-interaction-to-next-paint
version: '1.0.0'
description: INP measurement — input delay, processing time, presentation delay, long task attribution
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-event-loop
  - perf-long-tasks
  - perf-largest-contentful-paint
  - perf-cumulative-layout-shift
  - perf-performance-api
  - angular-performance-patterns
stack_signals: []
keywords:
  - INP
  - interaction to next paint
  - Core Web Vitals
  - input delay
  - processing time
  - presentation delay
  - responsiveness
  - event handlers
  - scheduler.yield
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-interaction-to-next-paint/SKILL.md` (150-250 lines):
   - Cover: what INP measures (worst-case interaction latency across the page lifespan — click, tap, keypress), the 3 INP phases (input delay, processing time, presentation delay), good/needs-improvement/poor thresholds (<=200ms / <=500ms / >500ms at p75), how INP replaced FID (FID only measured input delay of first interaction), `scheduler.yield()` for breaking up long processing, event delegation vs per-element handlers, `requestIdleCallback` for deferring non-critical work
   - Worked examples: How Redbus improved INP from 657ms to 164ms by breaking a monolithic click handler into yielding chunks using `scheduler.yield()` — processing time dropped from 400ms to 50ms per yield point, how Tesco reduced INP by 50% by moving analytics event processing from synchronous click handlers to `requestIdleCallback`
   - Anti-patterns: synchronous DOM manipulation in event handlers (forces layout+paint before next frame), heavy computation in input handlers without yielding (blocks main thread for entire processing duration), attaching individual event listeners to hundreds of list items instead of delegating to parent, running `requestAnimationFrame` work inside click handlers (delays the visual update frame)
   - Sources: web.dev INP documentation, Chrome INP attribution API, Web Vitals JavaScript library, Scheduler API specification

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-interaction-to-next-paint knowledge skill`

---

### Task 8: perf-cumulative-layout-shift

**Depends on:** none
**Files:** agents/skills/claude-code/perf-cumulative-layout-shift/skill.yaml, agents/skills/claude-code/perf-cumulative-layout-shift/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-cumulative-layout-shift`

2. Create `agents/skills/claude-code/perf-cumulative-layout-shift/skill.yaml`:

```yaml
name: perf-cumulative-layout-shift
version: '1.0.0'
description: CLS measurement — layout shift sources, impact/distance fractions, prevention strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-layout-reflow
  - perf-paint-compositing
  - perf-largest-contentful-paint
  - perf-interaction-to-next-paint
  - perf-performance-api
  - css-performance-patterns
stack_signals: []
keywords:
  - CLS
  - cumulative layout shift
  - Core Web Vitals
  - layout shift
  - aspect ratio
  - content-visibility
  - font loading
  - image dimensions
  - dynamic content
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-cumulative-layout-shift/SKILL.md` (150-250 lines):
   - Cover: what CLS measures (sum of all unexpected layout shifts, windowed to max session of 5s with 1s gap), good/needs-improvement/poor thresholds (<=0.1 / <=0.25 / >0.25 at p75), layout shift score formula (impact fraction \* distance fraction), what counts as "expected" (within 500ms of user input), common shift sources (images without dimensions, dynamically injected content, web fonts causing FOIT/FOUT, ads/embeds), `aspect-ratio` CSS property, `content-visibility: auto` with `contain-intrinsic-size`
   - Worked examples: How Yahoo! Japan News reduced CLS from 0.3 to 0.02 by reserving space for ad slots with explicit `min-height` and using `aspect-ratio` for images — the ad container shift that moved the article content 200px down was eliminated entirely, how Smashing Magazine eliminated font-swap CLS by using `font-display: optional` with font metric overrides (`ascent-override`, `descent-override`, `line-gap-override`) to match fallback and web font metrics within 2%
   - Anti-patterns: images/videos without `width`/`height` attributes (browser cannot reserve space before load), injecting banners/notifications above existing content (pushes everything down), web fonts with `font-display: swap` and large metric differences from fallback (text reflows on swap), dynamically loading content that changes height of above-the-fold sections
   - Sources: web.dev CLS documentation, Layout Instability API spec, Chrome CrUX methodology

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-cumulative-layout-shift knowledge skill`

---

### Task 9: perf-event-loop

**Depends on:** none
**Files:** agents/skills/claude-code/perf-event-loop/skill.yaml, agents/skills/claude-code/perf-event-loop/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-event-loop`

2. Create `agents/skills/claude-code/perf-event-loop/skill.yaml`:

```yaml
name: perf-event-loop
version: '1.0.0'
description: Event loop architecture — task queues, microtask queue, rendering steps, task prioritization
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-long-tasks
  - perf-interaction-to-next-paint
  - perf-critical-rendering-path
  - ts-performance-patterns
stack_signals: []
keywords:
  - event loop
  - task queue
  - microtask queue
  - macrotask
  - requestAnimationFrame
  - setTimeout
  - Promise
  - queueMicrotask
  - rendering steps
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-event-loop/SKILL.md` (150-250 lines):
   - Cover: event loop processing model (pick task from queue, run to completion, drain microtask queue, optionally render), task sources (setTimeout, I/O, DOM events, MessageChannel), microtask sources (Promise.then, queueMicrotask, MutationObserver), rendering steps (rAF callbacks, style, layout, paint), why microtasks drain completely before rendering (can starve rendering), browser vs Node.js event loop differences, task prioritization (user-blocking > user-visible > background in Scheduler API)
   - Worked examples: How a recursive `queueMicrotask` loop froze the page because microtasks drain completely before yielding to rendering — 10,000 microtasks queued meant the browser could not paint for 2 seconds (fix: use `setTimeout(fn, 0)` or `scheduler.postTask` to yield between chunks), how a React app's `useEffect` cleanup running as a microtask before paint caused visual glitches — the DOM was mutated, then mutated again before the browser could paint the first change
   - Anti-patterns: using `Promise.resolve().then()` for deferral when you mean `setTimeout(fn, 0)` (microtask runs before render, not after), infinite microtask loops (recursive Promise chains block rendering indefinitely), assuming `setTimeout(fn, 0)` fires immediately (minimum 4ms clamp after 5 nested calls in browsers), using `setInterval` for animations instead of `requestAnimationFrame`
   - Sources: HTML Living Standard Section 8.1.7 (event loop processing model), Jake Archibald's "In The Loop" (JSConf 2018), Node.js event loop documentation

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-event-loop knowledge skill`

---

### Task 10: perf-long-tasks

**Depends on:** none
**Files:** agents/skills/claude-code/perf-long-tasks/skill.yaml, agents/skills/claude-code/perf-long-tasks/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-long-tasks`

2. Create `agents/skills/claude-code/perf-long-tasks/skill.yaml`:

```yaml
name: perf-long-tasks
version: '1.0.0'
description: Long task detection — breaking up work, yielding to the main thread, scheduler API, web workers
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-event-loop
  - perf-interaction-to-next-paint
  - perf-profiling-methodology
  - ts-performance-patterns
stack_signals: []
keywords:
  - long task
  - main thread
  - yielding
  - scheduler.yield
  - scheduler.postTask
  - web worker
  - isInputPending
  - time slicing
  - 50ms budget
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-long-tasks/SKILL.md` (150-250 lines):
   - Cover: what constitutes a long task (>50ms on main thread per Long Tasks API), why 50ms matters (16.67ms frame budget at 60fps, with browser overhead ~6ms, leaving ~10ms for JS, but tasks up to 50ms are tolerable for responsiveness), Long Tasks API (`PerformanceObserver` with `entryTypes: ['longtask']`), strategies for breaking up work (time-slicing with `scheduler.yield()`, `scheduler.postTask()`, `requestIdleCallback`, `MessageChannel` trick), Web Workers for CPU-intensive parallel work, `navigator.scheduling.isInputPending()` for cooperative yielding
   - Worked examples: How Google's search results page uses `scheduler.yield()` after each result rendering chunk — 10 results are rendered in 5 chunks of 2, yielding between each chunk so input events can be processed (total time increases from 80ms to 95ms but INP improves from 200ms to 40ms), how a markdown editor moved syntax highlighting to a Web Worker — the main thread sends raw text via `postMessage`, the worker returns highlighted tokens, eliminating a 150ms long task on every keystroke
   - Anti-patterns: processing entire large arrays synchronously (`items.forEach(heavyFn)` on 10,000 items blocks for 500ms), `JSON.parse` of multi-MB payloads on main thread (blocking, non-yieldable), using `requestAnimationFrame` for non-visual work (wastes frame budget), debounce-only approach to responsiveness (debouncing hides the problem but does not fix it — the long task still runs)
   - Sources: Long Tasks API specification, web.dev "Optimize long tasks", Scheduler API specification, Chrome DevTools Performance panel documentation

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-long-tasks knowledge skill`

---

### Task 11: perf-garbage-collection

**Depends on:** none
**Files:** agents/skills/claude-code/perf-garbage-collection/skill.yaml, agents/skills/claude-code/perf-garbage-collection/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-garbage-collection`

2. Create `agents/skills/claude-code/perf-garbage-collection/skill.yaml`:

```yaml
name: perf-garbage-collection
version: '1.0.0'
description: Garbage collection — generational GC, V8 heap architecture, GC pauses, allocation pressure
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-memory-leaks
  - perf-heap-profiling
  - perf-event-loop
  - perf-long-tasks
  - node-performance-profiling
stack_signals: []
keywords:
  - garbage collection
  - GC
  - V8
  - generational GC
  - Scavenge
  - Mark-Sweep
  - Mark-Compact
  - heap
  - allocation pressure
  - GC pause
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-garbage-collection/SKILL.md` (150-250 lines):
   - Cover: generational hypothesis (most objects die young), V8 heap spaces (young generation: semi-space/Scavenge, old generation: Mark-Sweep/Mark-Compact, large object space), minor GC (Scavenge — fast, ~1-5ms, copies survivors to old gen after 2 survivals), major GC (Mark-Sweep-Compact — slower, 10-100ms+, traces from roots), incremental marking (breaks marking into small steps interleaved with JS execution), concurrent marking/sweeping (runs on background threads), Orinoco GC (V8's parallel, concurrent, incremental GC), allocation pressure (high allocation rate triggers frequent minor GCs)
   - Worked examples: How a real-time trading dashboard saw 200ms GC pauses every 10 seconds — profiling revealed 50MB/s allocation rate from creating new price-tick objects on every WebSocket message (fix: object pooling reduced allocation to 2MB/s and GC pauses to <5ms), how a Node.js API server with `--max-old-space-size=4096` experienced 300ms major GC pauses under load — switching to streaming JSON serialization (`JSON.stringify` replacement) reduced peak old-gen usage from 3.8GB to 1.2GB
   - Anti-patterns: creating objects in hot loops (array.map creating new objects at 60fps = 3.6M objects/minute), string concatenation in loops (each `+=` creates a new string, the old one becomes garbage), not reusing arrays/objects across animation frames (allocate-discard pattern triggers constant Scavenge), relying on `--expose-gc` and manual `global.gc()` calls in production
   - Sources: V8 blog "Trash talk: the Orinoco garbage collector", V8 blog "Jank Busters", Chrome DevTools Memory panel documentation, Node.js `--trace-gc` flag documentation

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-garbage-collection knowledge skill`

---

### Task 12: perf-memory-leaks

**Depends on:** none
**Files:** agents/skills/claude-code/perf-memory-leaks/skill.yaml, agents/skills/claude-code/perf-memory-leaks/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-memory-leaks`

2. Create `agents/skills/claude-code/perf-memory-leaks/skill.yaml`:

```yaml
name: perf-memory-leaks
version: '1.0.0'
description: Memory leak patterns — detached DOM, closures, event listeners, timers, WeakRef strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-garbage-collection
  - perf-heap-profiling
  - perf-performance-api
  - node-performance-profiling
stack_signals: []
keywords:
  - memory leak
  - detached DOM
  - closure leak
  - event listener leak
  - WeakRef
  - WeakMap
  - FinalizationRegistry
  - retained size
  - GC root
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-memory-leaks/SKILL.md` (150-250 lines):
   - Cover: the 5 classic leak patterns (detached DOM trees, forgotten event listeners, closures over large scopes, forgotten timers/intervals, global variable accumulation), WeakRef and WeakMap for cache patterns, FinalizationRegistry for cleanup, how to identify leaks in DevTools (3-snapshot technique: snapshot, action, snapshot, action, snapshot — look for growing retained size), Node.js-specific leaks (unremoved `process.on` listeners, accumulating entries in module-level Maps, stream backpressure failures)
   - Worked examples: How Gmail detected detached DOM leaks using automated heap snapshot diffing in CI — each SPA navigation was followed by a snapshot comparison, and any detached DOM node count increase >10 failed the test (caught a leak where removed email rows retained 50MB of DOM nodes via closure references in click handlers), how a Node.js microservice leaked 100MB/hour via a module-level `Map` used as a request cache that was never evicted (fix: replaced with an LRU cache with 1000-entry max and 5-minute TTL)
   - Anti-patterns: storing DOM references in global variables or module-scope Maps (prevents GC of entire subtrees), `addEventListener` without corresponding `removeEventListener` on component unmount (each re-render adds another listener), closures that capture the entire scope when only one variable is needed (especially in event handlers), `setInterval` without cleanup in SPA route changes
   - Sources: Chrome DevTools Memory documentation, "Fixing Memory Leaks in Web Applications" (Google Engineering Blog), Nolan Lawson's "Are your event listeners leaking?" research

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-memory-leaks knowledge skill`

---

### Task 13: perf-heap-profiling

**Depends on:** none
**Files:** agents/skills/claude-code/perf-heap-profiling/skill.yaml, agents/skills/claude-code/perf-heap-profiling/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-heap-profiling`

2. Create `agents/skills/claude-code/perf-heap-profiling/skill.yaml`:

```yaml
name: perf-heap-profiling
version: '1.0.0'
description: Heap profiling — Chrome DevTools heap snapshots, allocation tracking, retained vs shallow size
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-memory-leaks
  - perf-garbage-collection
  - perf-profiling-methodology
  - node-performance-profiling
stack_signals: []
keywords:
  - heap snapshot
  - allocation tracking
  - retained size
  - shallow size
  - dominator tree
  - retaining path
  - Chrome DevTools
  - memory profiling
  - heapdump
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-heap-profiling/SKILL.md` (150-250 lines):
   - Cover: heap snapshot views (Summary, Comparison, Containment, Dominators/Statistics), shallow vs retained size (shallow = object's own memory, retained = memory freed if object is GC'd), retaining paths (the chain from GC root to the object keeping it alive), dominator tree (objects that dominate retention of other objects), allocation timeline (records allocations over time, shows what survived GC), allocation sampling (low-overhead statistical sampling for production), Node.js heap profiling (`--heap-prof`, `v8.writeHeapSnapshot()`, `heapdump` package), interpreting the "Objects allocated between Snapshot 1 and Snapshot 2" comparison view
   - Worked examples: How a team used the 3-snapshot comparison technique to isolate a 2MB/navigation leak in an SPA: Snapshot 1 (baseline), navigate to page, navigate back, Snapshot 2 (first round), navigate to page, navigate back, Snapshot 3 (second round) — comparing Snapshot 2 and 3 showed 2,400 new `HTMLDivElement` objects with retaining paths through a module-level `WeakMap` that was actually a regular `Map` (typo), how a Node.js service used `--heap-prof` with the `--heap-prof-interval` flag to sample production heap allocations at 512KB intervals and identified that 40% of allocations came from `Buffer.from()` in a logging middleware (fix: reused a Buffer pool)
   - Anti-patterns: taking heap snapshots in production without understanding the stop-the-world pause (can be 1-10s for large heaps), comparing snapshots across page reloads instead of within the same session (different object IDs make comparison meaningless), ignoring "system" and "compiled code" entries (they indicate V8 overhead, not application issues), using shallow size to prioritize investigation (retained size is almost always the correct metric)
   - Sources: Chrome DevTools Memory panel documentation, V8 blog "Memory Management Reference", Node.js `--heap-prof` documentation, "Memory Profiling with Chrome DevTools" (Google Developers)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-heap-profiling knowledge skill`

---

### Task 14: perf-performance-api

**Depends on:** none
**Files:** agents/skills/claude-code/perf-performance-api/skill.yaml, agents/skills/claude-code/perf-performance-api/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-performance-api`

2. Create `agents/skills/claude-code/perf-performance-api/skill.yaml`:

```yaml
name: perf-performance-api
version: '1.0.0'
description: Performance Observer and timing APIs — PerformanceEntry types, User Timing, Resource Timing, Navigation Timing
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-largest-contentful-paint
  - perf-interaction-to-next-paint
  - perf-cumulative-layout-shift
  - perf-long-tasks
  - perf-profiling-methodology
  - otel-performance-insights
  - test-performance-testing
stack_signals: []
keywords:
  - Performance API
  - PerformanceObserver
  - User Timing
  - Resource Timing
  - Navigation Timing
  - performance.mark
  - performance.measure
  - PerformanceEntry
  - Server Timing
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-performance-api/SKILL.md` (150-250 lines):
   - Cover: `PerformanceObserver` pattern (observe entry types with buffered flag for entries before observer creation), Navigation Timing Level 2 (`PerformanceNavigationTiming` — domInteractive, domContentLoadedEventEnd, loadEventEnd, TTFB via `responseStart - requestStart`), Resource Timing (`PerformanceResourceTiming` — per-resource fetch timing, `transferSize`, `encodedBodySize`, cross-origin timing restrictions and `Timing-Allow-Origin`), User Timing (`performance.mark()`, `performance.measure()` — custom business metrics), Long Task API (`PerformanceLongTaskTiming`), Element Timing API (`elementtiming` attribute), Server Timing (`Server-Timing` header parsed via `PerformanceResourceTiming.serverTiming`), Layout Instability API, Largest Contentful Paint API
   - Worked examples: How Etsy uses `performance.mark()` to measure time-to-interactive for each product card and sends data to their analytics pipeline — marks at `card-render-start` and `card-render-end` with `performance.measure('card-render', 'card-render-start', 'card-render-end')` aggregated to p50/p95/p99 in Grafana, how Cloudflare uses `Server-Timing` headers to pass backend timing breakdown (DB query time, cache hit/miss, edge processing) through to the browser Performance API so frontend dashboards show full-stack timing without custom telemetry
   - Anti-patterns: polling `performance.getEntriesByType()` instead of using `PerformanceObserver` (misses entries, wastes CPU), forgetting `buffered: true` on observer (misses entries that occurred before observer registration), not clearing marks/measures (performance.clearMarks/clearMeasures — memory accumulates in long-lived SPAs), using `Date.now()` for performance measurement instead of `performance.now()` (1ms resolution vs 5-microsecond resolution, affected by clock skew)
   - Sources: W3C Performance Timeline Level 2, W3C User Timing Level 3, W3C Resource Timing Level 2, W3C Navigation Timing Level 2, MDN Performance API reference

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-performance-api knowledge skill`

---

### Task 15: perf-profiling-methodology

**Depends on:** none
**Files:** agents/skills/claude-code/perf-profiling-methodology/skill.yaml, agents/skills/claude-code/perf-profiling-methodology/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-profiling-methodology`

2. Create `agents/skills/claude-code/perf-profiling-methodology/skill.yaml`:

```yaml
name: perf-profiling-methodology
version: '1.0.0'
description: Systematic profiling workflow — bottleneck identification, measurement discipline, before/after methodology
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
tools: []
paths: []
related_skills:
  - perf-performance-api
  - perf-heap-profiling
  - perf-long-tasks
  - perf-largest-contentful-paint
  - perf-interaction-to-next-paint
  - node-performance-profiling
  - test-performance-testing
  - otel-performance-insights
stack_signals: []
keywords:
  - profiling
  - bottleneck
  - flame chart
  - Chrome DevTools
  - Lighthouse
  - WebPageTest
  - performance budget
  - regression detection
  - performance testing
  - synthetic monitoring
  - RUM
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-profiling-methodology/SKILL.md` (150-250 lines):
   - Cover: the measurement-first principle (never optimize without a baseline), the profiling workflow (1. define the metric, 2. establish baseline with statistical significance, 3. identify bottleneck, 4. hypothesize cause, 5. implement fix, 6. measure again, 7. validate improvement is statistically significant), lab vs field data (Lighthouse/WebPageTest vs CrUX/RUM), flame chart reading (width = time, depth = call stack, self time vs total time), Chrome DevTools Performance panel workflow (enable CPU throttling, record, identify long tasks, drill into call tree), performance budgets (LCP < 2.5s, INP < 200ms, bundle size < 200KB compressed), regression detection in CI (Lighthouse CI, custom `PerformanceObserver` assertions), when to use synthetic monitoring vs RUM
   - Worked examples: How Pinterest's performance team established a rigorous A/B testing protocol for performance changes — every optimization is tested on 1% of traffic for 7 days with p50/p75/p95 latency measured, and only promoted if the improvement is statistically significant at p<0.05 (this caught a "30% improvement" that was actually a 2% improvement once selection bias was removed), how Shopify uses Lighthouse CI in their CI pipeline with per-route performance budgets — any PR that regresses LCP by >200ms or increases bundle size by >10KB fails the build with a detailed comparison report
   - Anti-patterns: optimizing without measuring first ("I bet the problem is X" leads to wasted effort on non-bottlenecks), testing on developer hardware without throttling (MacBook Pro on gigabit fiber is not representative), single-run measurements (performance varies 10-30% between runs, need median of 5+ runs), optimizing p50 when p95 is the real problem (tail latencies affect more users than averages suggest), micro-benchmarking in isolation (optimizing a function from 1ms to 0.1ms means nothing if it is called once during a 3s page load)
   - Sources: Google Lighthouse documentation, WebPageTest documentation, Chrome DevTools Performance panel guide, "How We Made the Web Faster" (Google), Brendan Gregg's Systems Performance methodology

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-profiling-methodology knowledge skill`

---

### Task 16: Replicate all 15 skills to gemini-cli, cursor, codex

**Depends on:** Tasks 1-15
**Files:** 45 directories across 3 platforms (90 files total)

[checkpoint:human-verify] — Verify all 15 claude-code skills exist and look correct before replicating.

1. Run the following replication script:

```bash
#!/bin/bash
SKILLS_BASE="agents/skills"
SOURCE="claude-code"
TARGETS=("gemini-cli" "cursor" "codex")

SKILLS=(
  perf-critical-rendering-path
  perf-dom-parsing
  perf-style-calculation
  perf-layout-reflow
  perf-paint-compositing
  perf-largest-contentful-paint
  perf-interaction-to-next-paint
  perf-cumulative-layout-shift
  perf-event-loop
  perf-long-tasks
  perf-garbage-collection
  perf-memory-leaks
  perf-heap-profiling
  perf-performance-api
  perf-profiling-methodology
)

for TARGET in "${TARGETS[@]}"; do
  for SKILL in "${SKILLS[@]}"; do
    mkdir -p "$SKILLS_BASE/$TARGET/$SKILL"
    # Copy SKILL.md identically
    cp "$SKILLS_BASE/$SOURCE/$SKILL/SKILL.md" "$SKILLS_BASE/$TARGET/$SKILL/SKILL.md"
    # Copy skill.yaml with platform field adjusted
    sed "s/  - claude-code/  - $TARGET/" "$SKILLS_BASE/$SOURCE/$SKILL/skill.yaml" > "$SKILLS_BASE/$TARGET/$SKILL/skill.yaml"
  done
done
```

2. Verify replication:

```bash
# Count: should be 15 per platform
ls agents/skills/gemini-cli/ | grep "^perf-" | wc -l
ls agents/skills/cursor/ | grep "^perf-" | wc -l
ls agents/skills/codex/ | grep "^perf-" | wc -l

# Spot-check SKILL.md parity
diff agents/skills/claude-code/perf-critical-rendering-path/SKILL.md agents/skills/gemini-cli/perf-critical-rendering-path/SKILL.md
diff agents/skills/claude-code/perf-event-loop/SKILL.md agents/skills/cursor/perf-event-loop/SKILL.md
diff agents/skills/claude-code/perf-memory-leaks/SKILL.md agents/skills/codex/perf-memory-leaks/SKILL.md

# Spot-check platform field
grep "platforms" agents/skills/gemini-cli/perf-critical-rendering-path/skill.yaml
grep "platforms" agents/skills/cursor/perf-critical-rendering-path/skill.yaml
grep "platforms" agents/skills/codex/perf-critical-rendering-path/skill.yaml
```

3. Run: `harness validate`
4. Commit: `feat(skills): replicate 15 perf foundation skills to gemini-cli, cursor, codex`

---

### Task 17: Run full validation suite

**Depends on:** Task 16

1. Run schema validation tests:

```bash
npx vitest run agents/skills/tests/structure.test.ts
```

2. Verify all 15 skills pass SkillMetadataSchema:

```bash
npx vitest run agents/skills/tests/schema.test.ts
```

3. Verify SKILL.md section completeness (spot-check 5 skills):

```bash
for skill in perf-critical-rendering-path perf-event-loop perf-largest-contentful-paint perf-memory-leaks perf-profiling-methodology; do
  echo "=== $skill ==="
  for section in "## When to Use" "## Instructions" "## Details" "## Source" "## Process" "## Harness Integration" "## Success Criteria"; do
    grep -c "$section" agents/skills/claude-code/$skill/SKILL.md
  done
done
```

4. Verify line counts (should be 150-250):

```bash
for skill in agents/skills/claude-code/perf-*/SKILL.md; do
  echo "$(wc -l < "$skill") $skill"
done
```

5. Run: `harness validate`
6. Commit: `chore(skills): verify perf foundation skills pass all validation`

---

## Parallelization Notes

- Tasks 1-15 are fully independent and can execute in parallel. Each creates one skill in claude-code.
- Task 16 (replication) must wait for all 15 skills to exist.
- Task 17 (validation) must wait for Task 16.
- Within domains, tasks can be assigned to parallel agents:
  - Agent A: Tasks 1-5 (Browser Rendering Pipeline)
  - Agent B: Tasks 6-8 (Core Web Vitals)
  - Agent C: Tasks 9-11 (JavaScript Runtime + GC)
  - Agent D: Tasks 12-13 (Memory)
  - Agent E: Tasks 14-15 (Measurement)
  - Then Agent A: Task 16 (replication), Task 17 (validation)

## Evidence

- `agents/skills/tests/schema.ts:49-76` — SkillMetadataSchema definition confirms required fields
- `agents/skills/tests/structure.test.ts:20` — Knowledge type only requires `## Instructions` section in tests
- `agents/skills/tests/structure.test.ts:45-47` — SKILL.md must start with `# ` heading
- `agents/skills/claude-code/design-color-harmony/skill.yaml` — Reference knowledge skill format (Wave 1 pattern)
- `agents/skills/cursor/design-color-harmony/skill.yaml:10` — Platform replicas change `platforms` field to match target platform
- Existing related skills confirmed: css-performance-patterns, node-performance-profiling, ts-performance-patterns, angular-performance-patterns, mobile-performance-patterns, test-performance-testing, otel-performance-insights
