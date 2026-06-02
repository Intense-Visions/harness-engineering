# Harness Ideate — Scoring Reference

Single reference consumed by Phase 4 RANK of `SKILL.md`. The skill never duplicates these numbers inline; it cites this file. Keeping the formula here lets future tweaks land in one place without rewriting every example in `SKILL.md`.

## Base formula

```
base_score = (impact × confidence) ÷ effort
```

Each axis is one of `low`, `medium`, `high`, mapped to a small integer:

| Token    | Numeric |
| -------- | ------- |
| `low`    | 1       |
| `medium` | 2       |
| `high`   | 3       |

The mapping is the SAME for `impact`, `confidence`, and `effort`. Use it everywhere.

### Worked example

```
impact:     high   (3)
confidence: medium (2)
effort:     medium (2)

base_score = (3 × 2) ÷ 2 = 3.0
```

Range of `base_score`: `[1 × 1 ÷ 3 ≈ 0.33, 3 × 3 ÷ 1 = 9.0]`. Higher is better.

## Strategy-alignment tiebreaker

When `STRATEGY.md` was loaded successfully in Phase 1 GROUND, an alignment bonus is computed per candidate:

```
alignment_bonus =
  (premise plausibly advances a Tracks bullet ? 0.5 : 0)
+ (premise/persona references Target problem or Our approach ? 0.25 : 0)
```

The maximum possible bonus is **`+0.75`** (`0.5 + 0.25`). When `STRATEGY.md` is absent or invalid, `alignment_bonus` is `0` for every candidate and this section is skipped entirely.

### Bounded application

The bonus is a **tiebreaker, not a multiplier**:

- Compute `base_score` for every candidate.
- Sort by `base_score` descending.
- For each adjacent pair where `|base_score_n − base_score_{n-1}| ≤ 0.05`, apply the alignment bonus to break the tie:
  - `final_score = base_score + alignment_bonus` for the candidate whose pair-mate is within `0.05`.
  - The bonus is added to BOTH candidates in the tie window; the higher final score wins.
- For pairs where `|Δbase_score| > 0.05`, the base score determines order — the bonus is recorded in the artifact for transparency but does NOT change the rank.

The `0.05` threshold mirrors `harness-roadmap-pilot`'s tiebreaker contract intentionally — same bounded-tiebreaker shape, different domain (ranking ideas vs. ranking roadmap candidates). Aligning the threshold keeps users from learning two different "close enough" rules for two adjacent skills.

### Anti-patterns the bonded cap rejects

| Failure mode                                                                      | Why the cap rejects it                                                                                                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| "Idea A scores 2.0, Idea B scores 5.0; B aligns with strategy, A doesn't"         | `                                                                                                                                                                           | 5.0 − 2.0 | = 3.0`, way outside the `0.05` window. No bonus applied. Base score wins. Cap protects rankings from over-fitting to strategy. |
| "Every idea aligns; I'll add `+0.75` to all and call it ranked"                   | Bonus is only applied within tie windows. Universal alignment yields the same final ordering as the base score. The cap forces ranking to come from the base formula first. |
| "STRATEGY.md exists but is invalid; I should still apply the bonus heuristically" | Soft-fail: `alignment_bonus = 0` for every candidate when strategy is absent OR invalid. The skill never invents alignment when it cannot read the source.                  |
| "I'll widen the threshold to `0.5` so more ideas qualify"                         | Threshold is a constant in this file, NOT a parameter. Widening means updating this reference and re-justifying the change in an ADR (mirrors the roadmap-pilot decision).  |

## Persistence — what lands in the artifact

For every candidate the persisted `docs/ideation/<slug>-YYYY-MM-DD.md` records, at minimum:

- `base_score` (always)
- `alignment_bonus` (records the bonus value; `0` when strategy is absent or no signals matched)
- `final_score` (equals `base_score + alignment_bonus` IF the bonus was applied for tiebreak; otherwise equals `base_score` — the artifact MUST note which case applies via a one-line rationale)
- Whichever `Tracks` bullet or `Target problem` / `Our approach` phrase the alignment cited (verbatim) — citations are mandatory when `alignment_bonus > 0`

The artifact's frontmatter records `ranking_formula` verbatim so a future reader reproduces the order without rerunning the skill.

## Boundary with `harness-roadmap-pilot`

| Aspect                  | `harness-ideate`                                                                                            | `harness-roadmap-pilot`                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| What it ranks           | Fresh candidate ideas generated in-skill                                                                    | Existing roadmap entries from `docs/roadmap.md`                         |
| Base formula            | `(impact × confidence) ÷ effort` (1/2/3 mapping)                                                            | `position × 0.5 + dependents × 0.3 + affinity × 0.2`                    |
| Tiebreaker threshold    | `0.05`                                                                                                      | `0.05`                                                                  |
| Max alignment bonus     | `+0.75`                                                                                                     | `+0.75`                                                                 |
| When STRATEGY is absent | Skip alignment entirely; rank by base score only; record `strategy_grounded: false` in artifact frontmatter | Skip alignment entirely; rank by base score only; no rationale citation |

The two skills share the bounded-tiebreaker contract on purpose. If the threshold or max bonus changes in one, update both — and add an ADR explaining why.
