# Design-Pipeline Prior Art

> The bar to beat. Every reference here informs at least one design-pipeline sub-project; the orchestrator (#5) must compose them into something more capable than any single competitor.

## How to use this document

Each reference carries a one-line "what to learn from it" hook so brainstorm sessions can absorb the bar in minutes. Tags map references to the sub-projects they inform:

- `[#1d]` detect-design-drift
- `[#1a]` align-design-system
- `[#2]` audit-component-anatomy
- `[#3]` audit-brand-compliance
- `[#4]` `harness check-design` verifier
- `[#5]` pipeline orchestrator
- `[#0]` brand-guidelines source-of-truth decision
- `[polish]` aesthetic / craft bar

All URLs verified at time of authoring. Items older than 2023 flagged `[legacy]`.

This list is living. When you encounter a new prior-art reference during brainstorming or implementation, add it here in the appropriate tier. When a reference becomes obsolete or we surpass it, leave it but annotate.

---

## Tier 1: Must-beat references

The 12 references most directly competitive with what we're building.

1. **VoltAgent/awesome-design-md** — https://github.com/VoltAgent/awesome-design-md — Plain-text design systems (9 fixed sections: theme, palette+roles, typography, components+states, layout, elevation, do/don'ts, responsive, agent-prompt-guide) authored for AI agents to read. Already the closest analog to our DESIGN.md schema — beat its schema by adding brand-voice and asset-rules blocks. `[#0][#3][polish]`

2. **pbakaus/impeccable + impeccable.style** — https://github.com/pbakaus/impeccable / https://impeccable.style/docs/polish/ — 23 `/impeccable *` commands (audit, polish, craft, shape, live), PRODUCT.md + DESIGN.md context files, 29 deterministic anti-pattern rules (purple gradients, nested cards, low-contrast). The reference pipeline already in the wild — our value-add is structural drift detection + codemod align, not just LLM critique. `[#1d][#1a][#3][#5][polish]`

3. **emilkowalski/skill — emil-design-eng** — https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md — Ten-section design-eng SKILL.md (philosophy, animation decision framework, spring physics, component principles, transforms, clip-path, gesture, perf, a11y, review checklist). Authoritative reference for SKILL.md shape and review-checklist density — beat with measurable, AST-backed checks instead of prose heuristics. `[#2][#5]`

4. **alchaincyf/huashu-design** — https://github.com/alchaincyf/huashu-design — 20 design philosophies across 5 schools + a 5-dimension critique (philosophical coherence, hierarchy, craft, function, innovation) producing radar chart + Keep/Fix/Quick-wins. Steal the multi-dimensional review-rubric pattern for `harness check-design` report output. `[#4][#5]`

5. **W3C DTCG Design Tokens Format Module (2025.10)** — https://www.designtokens.org/tr/drafts/format/ — First stable spec for `$value`/`$type`/`$description`/`$extensions`. Mandatory baseline: detector and align must parse and emit DTCG-conformant tokens or we're already losing to Style Dictionary v4. `[#1d][#1a][#4][#0]`

6. **@lapidist/design-lint** — https://lapidist.net/articles/2025/introducing-lapidist-design-lint/ — Open-sourced Aug 2025; flags hex codes outside token palette, arbitrary pixel margins, raw `<button>` with ad-hoc styles, deprecated tokens; `--fix` auto-rewrites renamed tokens. Direct competitor to detect-design-drift; our edge is graph-aware blast-radius and the convergence verifier. `[#1d][#1a][#4]`

7. **Atlassian eslint-plugin-design-system** — https://atlassian.design/components/eslint-plugin-design-system/ — Production rules: `ensure-design-token-usage`, `use-tokens-typography`, `no-deprecated-design-token-usage`. The most complete published rule catalog — port the rule shape (severity tiers, autofix metadata) into our DesignConstraintAdapter. `[#1d][#4]`

8. **ARIA Authoring Practices Guide (APG)** — https://www.w3.org/WAI/ARIA/apg/ — Each pattern documents required parts + keyboard interactions + role/state/property contracts. The cleanest published component-anatomy spec — adopt their per-component "About / Anatomy / Keyboard / WAI-ARIA Roles, States, and Properties" header schema verbatim for anatomy audit. `[#2]`

9. **Open UI (WICG) component specifications** — https://open-ui.org/ / https://github.com/openui/open-ui — Defines anatomy → behavior → events as the formal sequence for a component spec. Open UI's `anatomy` field is the precise shape we should require in DESIGN.md and validate in audit-component-anatomy. `[#2][#0]`

10. **Radix Primitives anatomy docs** — https://www.radix-ui.com/primitives/docs/overview/introduction — Compound Root/Trigger/Content/Portal + data-state attributes as a publish-quality anatomy contract. The cleanest production anatomy reference (vs APG's spec-grade) — use as the canonical "what parts a component must expose" target. `[#2]`

11. **Mailchimp Content Style Guide** — https://styleguide.mailchimp.com/voice-and-tone/ — Voice constant + tone matrix per emotional context, with concrete do/don't pairs. The gold standard structured brand-voice doc — model brand-guidelines schema's `voice` and `tone_by_context` keys after it. `[#3][#0]`

12. **Frontify Brand Intelligence + MCP** — https://www.frontify.com/en/blog/frontify-mcp — Brand guidelines exposed as a machine-readable MCP server (AI queries voice/assets/rules in real time). Strategic threat: the pipeline must produce a brand source-of-truth queryable the same way, or LLMs will route around us. `[#0][#3]`

---

## Tier 2: Strong influences

13. **anthropics/skills** — https://github.com/anthropics/skills — Canonical SKILL.md/YAML-frontmatter format + progressive-loading architecture; our skills must match. `[#5]`

14. **Style Dictionary v4** — https://styledictionary.com/info/dtcg/ — First-class DTCG support, `type` over CTI structure, composite-token transforms. Reference transform pipeline architecture for align-design-system codemods. `[#1a][#4]`

15. **MetaMask eslint-plugin-design-tokens** — https://github.com/MetaMask/eslint-plugin-design-tokens — `color-no-hex` style rules with specific config patterns; concrete config-shape model. `[#1d][#4]`

16. **Tokens Studio + Penpot native DTCG** — https://tokens.studio/blog/tokens-studio-penpot-bringing-native-open-standard-design-tokens-to-everyone — First open-source design tool with W3C tokens + `$extensions` round-tripping. Sets the "tokens move between tools without lock-in" bar for #0/#1. `[#1d][#0]`

17. **Hypermod / codemod design system migrations** — https://www.hypermod.io/blog/7-automating-design-system-evolution — Production patterns for context-aware token replacement (e.g. injecting focus tokens only on focusable elements). Direct prior art for align-design-system AST transforms. `[#1a]`

18. **Atlassian "Migrate to tokens" guide + codemods** — https://atlassian.design/tokens/migrate-to-tokens/ — Real-world phased migration playbook with codemod + lint convergence — model for #5 phase ordering. `[#1a][#5]`

19. **React Aria Components — anatomy diagrams** — https://react-aria.adobe.com/ — Per-component anatomy diagram + Parts API table; cleanest visual anatomy doc — adopt diagram format in `check-design` reports. `[#2]`

20. **Ariakit composable primitives** — https://ariakit.org/ — State-driven separation of state from rendering; reference for anatomy-part-with-state model in #2. `[#2]`

21. **Shopify Polaris — Voice and Tone** — https://polaris.shopify.com/content/voice-and-tone — Per-situation tone matrix, "start sentences with verbs," concrete merchant-voice rules. Schema reference for context-keyed tone rules in DESIGN.md voice block. `[#3][#0]`

22. **Atlassian Design — Voice and tone** — https://atlassian.design/foundations/content/voice-tone — "Tell people what they need to know, get out of the way" framing + writing-style sub-pages. Useful counter-style to Mailchimp for brand-rule diversity testing. `[#3]`

23. **IBM Carbon — Writing style** — https://carbondesignsystem.com/guidelines/content/writing-style/ — Sentence-case rule, ≤25-word sentence cap, error-message economy. Pluggable numeric rules ideal for #3 lint checks. `[#3]`

24. **GitHub Primer — Content** — https://primer.style/foundations/content/ — Reading-level target (7th grade or below), no "click here", forbidden-phrase list. Most lint-ready brand-voice doc — port forbidden-phrase list directly. `[#3]`

25. **Carbon Empty States pattern** — https://carbondesignsystem.com/patterns/empty-states-pattern/ — Required parts: heading, body, visual, action. Adopt as canonical 4-part anatomy contract for empty state in #2. `[#2]`

26. **Atlassian Empty State component** — https://atlassian.design/components/empty-state/ — Documents header/description/illustration/primary-action slots with required vs optional. Reference for marking anatomy parts as required in our schema. `[#2]`

27. **PatternFly Empty State** — https://www.patternfly.org/components/empty-state/design-guidelines/ — Variant taxonomy (no data / no results / error / permission-denied). Useful prior art for variant-aware anatomy audits. `[#2]`

28. **Material Design 3 — Content design** — https://m3.material.io/foundations/content-design/style-guide/word-choice — Per-word choice rubric with conversational/second-person rules. Use word-choice table as a brand-voice lint fixture. `[#3]`

29. **Salesforce Lightning — Voice and Tone** — https://www.lightningdesignsystem.com/guidelines/voice-and-tone/ — Enterprise voice + conversation-design overlay. Reference for handling enterprise tone in brand schemas. `[#3]`

30. **ESLint multi-pass autofix + circular-fix detection** — https://eslint.org/docs/latest/use/troubleshooting/circular-fixes — Canonical fixpoint architecture: apply fixes, re-lint, halt on cycle. Exact precedent for #4 convergence verifier — copy the cycle-detection invariant. `[#4][#5]`

31. **Storybook Visual Tests addon + Chromatic** — https://storybook.js.org/docs/writing-tests/visual-testing — Local-loop tightening (run-on-demand in Storybook, reconcile with CI via git history). Pattern for keeping #4 verifier fast enough to rerun after every align batch. `[#4]`

32. **Nx Task Pipeline + Local Generators** — https://nx.dev/docs/concepts/task-pipeline-configuration / https://nx.dev/docs/extending-nx/local-generators — Dependency-ordered phases + standardized generator scaffolds. Architectural reference for #5 phase wiring (FRESHEN → DETECT → FIX → AUDIT → FILL → REPORT). `[#5]`

33. **Bazel build phases (loading/analysis/execution) + Nix derivations** — https://bazel.build/extending/rules — Hermetic, idempotent phased build precedent; reproducibility bar for design-pipeline phase outputs. `[#5]`

34. **Stark — accessibility audit suite** — https://www.getstark.co/figma/ — Contrast ratios, color-blindness sim, focus-order check, AI alt text. Reference for the audit-modal UX that designers already expect; align our `check-design` report copy to match. `[polish][#2]`

35. **Knapsack vs Supernova vs zeroheight (2026 comparison)** — https://www.knapsack.cloud/blog/knapsack-vs-zeroheight-choosing-a-design-system-that-supports-scale — Current competitive landscape for design-system-as-a-platform. Frame Harness as code-native equivalent of these doc-native platforms. `[#0][#5]`

36. **fiberplane drift documentation linter** — https://fiberplane.com/blog/drift-documentation-linter/ — Tree-sitter + git anchoring to detect doc drift. Adapt anchoring pattern for component-to-DESIGN.md drift in #1d. `[#1d]`

37. **getdesign.md — per-brand DESIGN.md analyses (Vercel, Stripe, etc.)** — https://getdesign.md/ — 50+ brand systems analyzed in DESIGN.md format. Test fixture corpus for the orchestrator's freshen+report phases. `[#0][polish]`

---

## Tier 3: Adjacent / context

38. **Vercel Geist** — https://vercel.com/geist/introduction — Polish bar for typography + monochrome system. `[polish]`
39. **Linear design language** — https://linear.app/method — Density + keyboard-first polish reference. `[polish]`
40. **Apple Human Interface Guidelines** — https://developer.apple.com/design/human-interface-guidelines/ — Foundations/Patterns/Components/Technologies taxonomy. `[polish][#2]`
41. **shadcn/ui registry** — https://ui.shadcn.com/docs/registry — JSON registry-item schema; precedent for our component-anatomy schema. `[#2][#0]`
42. **Vercel Academy — Anatomy of a Primitive** — https://vercel.com/academy/shadcn-ui/anatomy-of-a-primitive — Teaching-grade anatomy decomposition. `[#2]`
43. **VoltAgent/awesome-claude-design** — https://github.com/VoltAgent/awesome-claude-design — Sibling repo of awesome-design-md; 68 systems, useful contrast. `[#0]`
44. **zephyrwang6/brand-design-md** — https://github.com/zephyrwang6/brand-design-md — 62-brand Claude skill; alternative DESIGN.md shape. `[#0]`
45. **Stripe Apps design patterns** — https://docs.stripe.com/stripe-apps/patterns — Component-composition patterns reference. `[#2][polish]`
46. **Stripe Elements Appearance API** — https://docs.stripe.com/elements/appearance-api — Constrained-theme tokens — model for safe brand-controlled customization. `[#0]`
47. **v0 by Vercel** — https://v0.dev — Frontend-only generator using shadcn/ui; competitive target for align quality. `[#1a][polish]`
48. **Lovable / bolt.new** — https://lovable.dev / https://bolt.new — Full-stack AI builders; understand to differentiate (we govern, they generate). `[polish]`
49. **Material Design 1 Writing** — https://m1.material.io/style/writing.html `[legacy]` — Original content-design source still cited. `[#3]`
50. **w3c/aria-practices (APG GitHub)** — https://github.com/w3c/aria-practices — Source MD for APG; parseable for fixtures. `[#2]`
51. **Open UI working mode** — https://open-ui.org/working-mode/ — How specs progress from research → draft → standard. Useful for our brand-rule lifecycle. `[#0]`
52. **BackstopJS / Reg-suit / Percy** — https://percy.io/blog/visual-regression-testing-tools — Visual-regression precedent; convergence comes from baseline-update + re-shoot cycle. `[#4]`
53. **Anthropic Skills: Complete Guide PDF** — https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf — Authoring conventions. `[#5]`
54. **VoltAgent/awesome-agent-skills** — https://github.com/VoltAgent/awesome-agent-skills — 1000+ skill index; competitive scan for design-eng skill gap. `[#5]`
55. **DTCG community-group repo** — https://github.com/design-tokens/community-group — Spec source + open issues; track for breaking changes. `[#0]`
56. **Tokens Studio plugin tools** — https://tokens.studio/plugin-tools — Figma-side token authoring patterns. `[#0]`
57. **Hermes / Codux / Penpot Plus** — https://penpot.app — Adjacent code-aware design tools; differentiation context. `[polish]`
58. **MUI codemod package** — https://www.npmjs.com/package/@mui/codemod — Production migration-codemod packaging pattern. `[#1a]`
59. **jscodeshift** — https://github.com/facebook/jscodeshift — AST transform toolkit underlying most design codemods. `[#1a]`
60. **NN/g — Designing Empty States** — https://www.nngroup.com/articles/empty-state-interface-design/ — Research-grade rationale behind anatomy parts. `[#2]`

---

## Notable gaps (these are opportunities)

- **No published design-eng SKILL.md other than `emilkowalski/skill`, `alchaincyf/huashu-design`, and `pbakaus/impeccable` could be located.** Three is the entire field — significant signal that the niche is wide open and our 5-part pipeline has no head-to-head competitor.
- **No open-source convergence verifier specifically for design drift.** ESLint has cycle detection; design-lint has `--fix` but no documented fixpoint guarantee. `harness check-design` can be first-class here.
- **No machine-readable brand-voice schema in wide use.** Mailchimp/Polaris/Carbon/Primer are prose docs. Frontify's MCP is the only structured-brand-as-API offering, and it's vendor-locked. Strong opportunity to publish an open brand-rules schema as part of #0.
- **No published anatomy-audit tool.** Storybook test-runner has a11y addon and Chromatic catches visual diffs, but nothing audits "this component lacks an error-state slot." #2 has the cleanest blue-ocean field of the five sub-projects.
- **No design-pipeline orchestrator in the wild.** Impeccable is the closest (23 commands, but human-invoked individually). Composing FRESHEN/DETECT/FIX/AUDIT/FILL/REPORT into a single convergent pipeline appears unbuilt — directly mirrors harness-docs-pipeline's lead position.
- **DTCG `$extensions` brand-rules vendor prefix is unclaimed.** Could publish `$extensions.harness.brand` as a de-facto extension if we move first.

---

## Per-sub-project quick reference

When entering a brainstorming session, load these first:

| Sub-project                      | Tier-1 references to read first |
| -------------------------------- | ------------------------------- |
| #0 brand-guidelines decision     | #1, #5, #11, #12, #41           |
| #1d detect-design-drift          | #2, #5, #6, #7, #36             |
| #1a align-design-system          | #2, #6, #7, #14, #17            |
| #2 audit-component-anatomy       | #3, #8, #9, #10, #19, #25       |
| #3 audit-brand-compliance        | #2, #11, #12, #21, #23, #24     |
| #4 harness check-design verifier | #6, #7, #14, #30, #31           |
| #5 pipeline orchestrator         | #2, #3, #4, #13, #32, #33       |
