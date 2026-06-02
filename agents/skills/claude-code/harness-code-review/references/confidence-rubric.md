# Confidence Rubric

> Anchored confidence rubric for `harness-code-review` conditional subagents. Numeric anchors avoid vague "high/medium/low" judgments. New subagents (`adversarial`, `typescript-strict`, `frontend-races`) populate `ReviewFinding.confidence` per this rubric. Existing 4 agents (compliance, bug, security, architecture) are not yet migrated.

## Anchors

| Score | Label                  | Definition                                                                                                                                      |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `100` | Mechanical             | Directly verifiable from the diff. The finding can be reproduced by quoting specific lines. No interpretation required.                         |
| `75`  | Constructible scenario | The agent can describe a concrete sequence of inputs and observable outputs that triggers the issue. Every step is traceable to specific lines. |
| `50`  | Judgment-based         | The issue is real but partly judgment. Depends on assumptions about behavior outside the diff.                                                  |
| `25`  | Speculative            | Not supported by what is in the diff. **Suppress.** Agents must not emit.                                                                       |

A finding with confidence below `25` must be discarded before it leaves the subagent.

## Per-agent worked examples

### `adversarial`

- **100 — Mechanical**: every step in the cascade is traceable to specific lines. _Example: a `useState` updater on line 32 schedules work that the cleanup on line 45 never cancels — both lines are quoted._
- **75 — Constructible scenario**: given specific input X, execution reaches line Y and produces wrong outcome Z. _Example: "If `parseDate('')` returns `null` (line 18), the chain at line 22 throws because there is no nullable check before `.toISOString()`."_
- **50 — Judgment-based**: scenario depends on external API behavior assumed but unverified. _Example: "If the remote service occasionally returns `5xx`, the retry loop at line 60 enters a tight spin." — the tight spin is real but the retry condition needs runtime evidence._
- **25 — Speculative**: "What if the caller ever does X?" with no diff evidence. _Suppress._

### `typescript-strict`

- **100 — Mechanical**: explicit `any`, `// @ts-ignore`, `as unknown as Foo`, or `unknown` assertion in the diff. _Example: `function load(x: any) { ... }` is quoted directly._
- **75 — Constructible scenario**: a refactor in the diff removes a guard that the type system relied on. _Example: "Removing the `if (user)` check on line 12 means line 14's access `user.id` is now reachable for `null`, but no test exercises this path."_
- **50 — Judgment-based**: naming or extraction quality calls. _Example: "Function `handleStuff` does three things — the five-second-rule fails for a future reader." — true but discretionary._
- **25 — Speculative**: "Could be improved someday." _Suppress._

### `frontend-races`

- **100 — Mechanical**: `setInterval` with no `clearInterval` in disconnect/unmount; `addEventListener` with no `removeEventListener`. _Example: `setInterval(tick, 1000)` on line 30 with no cleanup return in the `useEffect`._
- **75 — Constructible scenario**: race traceable to a specific interaction sequence. _Example: "Double-click on the submit button triggers two parallel network calls because `isSubmitting` is set inside an `await` (line 45) after the button stays clickable."_
- **50 — Judgment-based**: race depends on timing windows not fully forceable from diff. _Example: "If the server replies before the cleanup runs, the stale callback updates the new component instance." — possible but requires timing assumptions._
- **25 — Speculative**: "On a slow device this might race." _Suppress._

## How dedup uses confidence

Phase 6 DEDUP+MERGE prefers the higher-`severity` finding when two agents flag the same line. On a severity tie, the finding with explicit `confidence` set wins. When neither has confidence (the existing 4 agents), current dedup behavior is unchanged.

## Compatibility

The legacy security agent uses string values (`'high' | 'medium' | 'low'`). New subagents use numeric anchors (`25 | 50 | 75 | 100`). The `ReviewFinding.confidence` field accepts either. Future migration of the security agent to numeric anchors is opt-in and out of scope here.
