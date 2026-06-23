# Harness Ideate

> Pre-brainstorm ideation. Generates candidate ideas, critiques each against its strongest objection, and ranks them by `(impact × confidence) ÷ effort`. Writes a single ranked artifact to `docs/ideation/<slug>-YYYY-MM-DD.md`. **Produces ranked ideation, not specs** — brainstorming consumes the output.

## When to Use

- Before brainstorming, when the feature to design has not yet been selected
- When the user asks "what should we build next in area X?" and there are several plausible answers
- When a single domain (auth, pulse reports, onboarding…) has 5–10 candidate ideas worth comparing
- After updating `STRATEGY.md` and wanting to surface candidates aligned with the new tracks
- NOT when the feature is already selected — go straight to `harness-brainstorming`
- NOT for ranking existing roadmap items — that is `harness-roadmap-pilot`'s job
- NOT for generating specs, plans, or code — this skill writes one ideation artifact and stops
- NOT for refreshing `STRATEGY.md` — that is `harness-strategy`'s job

## Process

**Prompt the human in plain text** — every confirmation and selection in this skill (`Proceed? (y/n)`, post-critique selection, etc.) is plain text only. Do not elevate to `AskUserQuestion`: natural headers like "Confirm inputs" exceed its 12-char cap and option lists routinely exceed its 4-option cap, rendering the call as ERR.

### Iron Law

**The skill produces exactly ONE ranked artifact per run, at `docs/ideation/<slug>-YYYY-MM-DD.md`, and NEVER produces a spec, plan, ADR, or code.** If the user wants a spec from a ranked idea, they invoke `harness-brainstorming` next — that is the contract.

---

### Phase 1: GROUND — Read STRATEGY.md and Confirm the Topic

1. **Resolve the focus argument.** If the user passed `--focus` (or supplied a one-line topic in the conversation), use it verbatim. Otherwise ask:

   ```
   What is the ideation topic? One short line (e.g., "onboarding for plugin-only users",
   "lateral review depth", "pulse-report follow-up routing").
   ```

   Capture the answer; do not proceed without one.

2. **Resolve the count.** Default to 10 if `--count` is unset. Clamp silently to `[5, 25]` (`<5` is too few to rank meaningfully; `>25` loses signal). Proceed with the clamped value.

3. **Read `STRATEGY.md` (grounding).** Call `read_strategy({ path: process.cwd() })` on the harness MCP server — it returns `{ present, valid, doc?, error? }` and runs validation + parsing inside the server so the project does not need `@harness-engineering/core` installed.

   Three cases:
   - **`{ present: false }`:** print one line — `STRATEGY.md not present — ranking will use impact × confidence ÷ effort only; no strategy-alignment tiebreaker`. Continue.
   - **`{ present: true, valid: true, doc }`:** capture `doc.sections` for `Target problem`, `Our approach`, `Who it's for`, and `Tracks`. These four sections drive the strategy-alignment tiebreaker in Phase 4.
   - **`{ present: true, valid: false, error }`:** print `error` verbatim and continue without strategy grounding. Do NOT block; this skill is not the place to repair `STRATEGY.md`. Suggest `/harness:strategy` as a follow-up.

   Fallback for environments without the MCP server: `node -e "import('@harness-engineering/core').then(m => m.validateStrategy(process.cwd()).then(r => console.log(JSON.stringify(r))))"` — only works when `@harness-engineering/core` is resolvable from the project's `node_modules`.

4. **Confirm the topic.** Before generating, surface a 2-line summary:

   ```
   Topic: <focus>
   Count: <N>
   Strategy grounding: <enabled|disabled — reason>
   ```

   Ask: `Proceed with these inputs? (y/n)`. Wait for confirmation.

---

### Phase 2: GENERATE — Produce Candidate Ideas

Generate exactly N candidate ideas. Each idea is a structured object with the following fields:

| Field        | Type                    | Description                                                                                                              |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `premise`    | string (1 sentence)     | What this idea is, in one declarative sentence. Not aspirational — what the change IS, not what we hope it achieves.     |
| `persona`    | string (1 sentence)     | Target persona segment (specific, not "developers"). If STRATEGY.md is present, prefer phrasing from its `Who it's for`. |
| `complexity` | `low \| medium \| high` | Rough engineering complexity estimate.                                                                                   |
| `key_risk`   | string (1 sentence)     | The single biggest reason this idea might fail or not be worth doing. Used in Phase 3 as the seed for critique.          |
| `impact`     | `low \| medium \| high` | How much this matters if it works. Mapped to `1/2/3` for ranking.                                                        |
| `confidence` | `low \| medium \| high` | How confident we are that we can pull it off. Mapped to `1/2/3` for ranking.                                             |
| `effort`     | `low \| medium \| high` | Engineering effort to deliver. Mapped to `1/2/3` for ranking.                                                            |

**Generation rules:**

- **Spread the complexity surface.** Aim for at least one `low` and one `high` complexity idea; resist clustering everything as `medium`.
- **Resist near-duplicates.** Two ideas with the same `premise` are one idea. If two ideas only differ by a parameter ("X for web" vs "X for mobile"), collapse them into a single idea with a parametric premise.
- **Be honest about effort.** A `low`-effort idea must be plausibly implementable in <1 sprint by one engineer. If you find yourself defaulting everything to `medium`, slow down and re-estimate one extreme.
- **When STRATEGY.md is present**, at least 60% of ideas should plausibly serve a current track in `Tracks`. Stretch ideas outside the tracks are allowed and useful, but the majority anchors in.

Present the N candidates as a numbered list. Each line is 2-3 sentences max:

```
1. [Premise]. Persona: [...]. Complexity: medium. Key risk: [...]. Impact/Confidence/Effort: M/M/L.
2. [Premise]. Persona: [...]. Complexity: low.    Key risk: [...]. Impact/Confidence/Effort: H/L/L.
...
```

---

### Phase 3: CRITIQUE — Identify and Address Strongest Objections

For each candidate, surface the **single strongest objection** — the best argument against doing this idea. The seed is `key_risk` from Phase 2, but the critique should sharpen it (one paragraph, not one sentence):

```
Idea 3: [Premise].
  Strongest objection: [...]. Most likely failure mode: [...]. What would need to be true
  for this objection to NOT hold: [...].
```

After all N critiques are presented, ask the user:

```
Which objections do you want to answer (vs. accept as a downside)?
Options:
  - all   — I'll address every objection
  - none  — accept all critiques as known downsides
  - <list of numbers, e.g., "1, 3, 7">
```

For each idea the user elects to answer, ask: `For idea N, what makes the objection wrong or addressable?` Capture the user's one-paragraph answer. If the user cannot answer convincingly, leave the objection standing (this is a signal — it lowers the idea's ranking).

Critique answers do NOT change the impact/confidence/effort scores from Phase 2. They feed into the rationale shown alongside each ranked idea in Phase 5.

---

### Phase 4: RANK — Score and Order

For each candidate, compute `base_score = (impact × confidence) ÷ effort` using the `low|medium|high → 1|2|3` mapping documented in `references/scoring.md`. Higher is better; range is `[≈0.33, 9.0]`.

**Strategy-alignment tiebreaker.** When `STRATEGY.md` was grounded in Phase 1, compute an alignment bonus per candidate:

```
alignment_bonus =
  (premise plausibly advances a Tracks bullet ? 0.5 : 0)
+ (premise/persona references Target problem or Our approach ? 0.25 : 0)
```

Maximum bonus `+0.75`. The bonus is **bounded**: it is applied only when the absolute difference between two adjacent candidates' base scores is `≤ 0.05`. Outside that tie window, the base score wins and the bonus is recorded for transparency but does NOT change rank order. See `references/scoring.md` for the full contract (including the worked example and the boundary with `harness-roadmap-pilot`'s identical tiebreaker shape).

Sort by final score descending. Stable on ties (preserve generation order so the user can find the original list).

---

### Phase 5: WRITE — Persist the Ranked Artifact

1. **Compute the slug.** Kebab-case the focus argument; lowercase; collapse whitespace and `[^a-z0-9-]` into `-`; trim leading/trailing `-`; truncate to **≤30 characters**. Example: `"onboarding for plugin-only users"` → `onboarding-for-plugin-only-use`.

2. **Compute today's date** as `YYYY-MM-DD` (UTC).

3. **Compute the output path.** `docs/ideation/<slug>-<YYYY-MM-DD>.md`. If that path already exists (same focus, same day), append a 6-character lowercase hex suffix derived from `sha1(focus + iso_timestamp).slice(0, 6)`:

   ```
   docs/ideation/onboarding-for-plugin-only-use-2026-06-02.md         # first run
   docs/ideation/onboarding-for-plugin-only-use-2026-06-02-a3f9b2.md  # collision
   ```

4. **Render the artifact.** Frontmatter + ranked list. See ranking math in `references/scoring.md`. Required fields:

   ```markdown
   ---
   topic: <focus argument verbatim>
   generated_at: <ISO 8601 timestamp>
   strategy_grounded: <true | false>
   strategy_path: <STRATEGY.md path if grounded, else null>
   count_requested: <N>
   count_generated: <N>
   ranking_formula: '(impact × confidence) ÷ effort; strategy-alignment tiebreaker (max +0.75) applied only when |Δbase_score| ≤ 0.05'
   ---

   # Ideation: <focus>

   ## Inputs

   - Topic: <focus>
   - Generated: <ISO timestamp>
   - Strategy grounding: <enabled | disabled with one-line reason>

   ## Ranked candidates

   ### 1. <premise> — score: <final>

   - Persona: <...>
   - Complexity: <low|medium|high>
   - Impact / Confidence / Effort: <H/M/L> — base score <X.XX>
   - Strategy alignment: <none | +0.25 persona | +0.5 track:<name>> — final score <Y.YY>
   - Strongest objection: <one paragraph>
   - Objection answered: <yes/no — if yes, one paragraph rebuttal>

   ### 2. ...
   ```

5. **Write the file.** Create `docs/ideation/` if it does not exist. Write via the standard `Write` tool — no Node one-liner is required here; the content is generated by the skill, not user-supplied prose with shell-escape hazards.

6. **Print the handoff.** Three lines:

   ```
   Ideation artifact written: docs/ideation/<slug>-<date>.md
   Top pick: <#1 premise> — score <Y.YY>
   Next: invoke /harness:brainstorming <feature> to take a candidate into a spec, OR /harness:roadmap to enqueue picks for later.
   ```

---

## Harness Integration

- **Harness MCP tools consumed by this skill** (canonical execution path — no project-local `@harness-engineering/core` required):
  - `read_strategy({ path })` — Phase 1 grounding oracle. Returns `{ present, valid, doc?, error? }` (the server runs `validateStrategy` + `parseStrategyDoc` + `asStrategyDoc` internally).
- **`@harness-engineering/core`** (only directly relevant when the MCP server is unavailable):
  - `validateStrategy(cwd)`, `parseStrategyDoc(raw)` + `asStrategyDoc(parsed)`, `StrategyDocSchema`, `REQUIRED_STRATEGY_SECTIONS`.
- **Boundary with `harness-strategy`** — strategy WRITES `STRATEGY.md`; ideate READS it. Ideate never modifies `STRATEGY.md` and never offers to repair an invalid one (suggest `/harness:strategy` and continue without grounding).
- **Boundary with `harness-brainstorming`** — ideate produces a ranked artifact at `docs/ideation/`; brainstorming produces a spec at `docs/changes/<feature>/proposal.md`. They have non-overlapping output locations (Decision 5 of the strategic-anchor proposal). Ideate's artifact may be cited as an input in a brainstorming spec; brainstorming's spec is NEVER auto-derived from ideate's artifact.
- **Boundary with `harness-roadmap-pilot`** — ideate generates fresh candidates; roadmap-pilot prioritizes existing roadmap entries. If a user wants ranking-only over the existing roadmap, that is roadmap-pilot, not ideate.

## Success Criteria

- Exactly one artifact is written per run, at `docs/ideation/<slug>-<YYYY-MM-DD>.md`. No spec, plan, ADR, or code is produced.
- The artifact contains exactly the number of candidates the user requested (after clamping to `[5, 25]`).
- Every candidate has all 7 fields populated (premise, persona, complexity, key_risk, impact, confidence, effort).
- Each candidate has a strongest-objection paragraph; objections the user elected to answer have a rebuttal paragraph.
- Ranking is by `(impact × confidence) ÷ effort` with the 1/2/3 mapping. Strategy-alignment bonus is applied only when STRATEGY.md is present AND the absolute base-score delta is ≤ 0.05.
- When `STRATEGY.md` is absent or invalid, the skill completes without error and the artifact's frontmatter records `strategy_grounded: false`.
- The output filename collision rule (6-char hex suffix on same-day re-run for the same focus) produces a stable, deterministic suffix from `sha1(focus + iso_timestamp)`.
- The artifact's frontmatter explicitly states the ranking formula so a future reader can reproduce the order.

## Examples

### Example: With STRATEGY.md (grounded, 10 candidates)

```
User: /harness:ideate --focus "pulse-report follow-up routing"

Phase 1:
  Topic confirmed: "pulse-report follow-up routing"
  Count: 10
  STRATEGY.md detected — grounding enabled.
  Tracks read: ["pulse-reports", "compound-engineering", "feedback-loops"]
  Who-it's-for read: "engineering teams adopting harness"

Phase 2 (excerpt):
  1. Auto-assign followups to the on-call rotation. Persona: on-call engineer.
     Complexity: medium. Key risk: rotation data may be stale. I/C/E: H/M/M.
  ...
  10. Email-digest weekly pulse for distributed teams. Persona: async-first eng.
     Complexity: low. Key risk: duplicates Slack. I/C/E: M/L/L.

Phase 3:
  User selects "answer 1, 4, 7"; provides three one-paragraph rebuttals.

Phase 4 (ranking, excerpt):
  - Idea 1 base score: (H=3 × M=2) ÷ M=2 = 3.00
    Idea 7 base score: 2.97 (|Δ| = 0.03 ≤ 0.05 — alignment window applies)
    Idea 1 alignment: track match "pulse-reports" (+0.5) + persona match (+0.25) = +0.75 → final 3.75
    Idea 7 alignment: track match "feedback-loops" (+0.5) → final 3.47
    Idea 4 base score: 2.50 (|Δ vs idea 1| = 0.50 > 0.05 — alignment recorded but not applied)

Phase 5:
  Write docs/ideation/pulse-report-follow-up-routin-2026-06-02.md
  Top pick: "Auto-assign followups to the on-call rotation" — score 3.50
  Next: invoke /harness:brainstorming "Pulse Followup Routing" to take this into a spec.
```

### Example: Without STRATEGY.md (no grounding, 5 candidates)

- Phase 1: `read_strategy` returns `{ present: false }`. Strategy grounding disabled; skill prints the one-line note and continues.
- Phase 2: 5 candidates generated. No track-alignment guidance applies; coverage of complexity surface remains a rule.
- Phase 4: ranking uses `(impact × confidence) ÷ effort` only. No tiebreaker bonus is added.
- Phase 5: artifact frontmatter has `strategy_grounded: false` and `strategy_path: null`. Handoff still routes the user to brainstorming.

### Example: Slug collision (same focus, same day)

- Run 1: writes `docs/ideation/onboarding-for-plugin-only-use-2026-06-02.md`.
- Run 2 (same `--focus`, same day): destination collides. Skill computes `sha1("onboarding for plugin-only users" + "2026-06-02T15:21:04Z").slice(0,6)` → `a3f9b2`. Writes `docs/ideation/onboarding-for-plugin-only-use-2026-06-02-a3f9b2.md`. Both files coexist.

## Gates

- **One artifact per run, exactly.** A second write on the same run violates the Iron Law.
- **Never modify `STRATEGY.md`.** Even on present-but-invalid: surface the error and continue without grounding. Repair is `/harness:strategy`'s job.
- **Never derive a spec from ideate's artifact automatically.** Brainstorming is human-confirmed; ideate's output is an INPUT to brainstorming, not a replacement.
- **Never produce 0 ideas.** Clamping enforces `N ≥ 5`. If the model would generate near-duplicates to reach N, prefer fewer-but-distinct over more-but-redundant — re-prompt within the skill to diversify.
- **The strategy-alignment tiebreaker is bounded.** Maximum bonus is `+0.75` (`0.5 + 0.25`) and only applies when `|Δbase_score| ≤ 0.05`. The bonus must NEVER override a clear base-score winner.

## Escalation

- **User wants the artifact converted to a spec automatically.** Refuse; cite the Iron Law. Offer `/harness:brainstorming "<top-pick title>"` as the next step.
- **STRATEGY.md is present but invalid.** Print the validation error verbatim; do not block. Suggest `/harness:strategy` and continue with `strategy_grounded: false`.
- **User insists on `N > 25`.** Clamp to 25 and inform; offer to chain a second run with a different focus argument.
- **User insists every idea is `medium` on all three axes.** Push back once: "If everything is medium, ranking is uninformative — what is your highest-impact vs. highest-confidence outlier?" If they decline to differentiate, write the artifact anyway with a frontmatter `quality_flag: undifferentiated` note.
- **Output directory cannot be created.** Surface the filesystem error verbatim. Do not silently write to a fallback path.
