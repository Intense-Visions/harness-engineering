# Question-File Mode (shared interview convention)

This reference defines the **opt-in, file-based** variant of the interview shared by
`harness-strategy`, `harness-pulse`, and `harness-brainstorming`. The default remains the
interactive, one-question-at-a-time flow described in each skill's Process section.
Question-file mode is for **async, team-reviewable, durable** decision capture: the skill
writes its questions to a file, a human (or several) fills in answers over time, and the
skill reads them back and proceeds through the same pushback rules.

The convention is deliberately identical across the three interview skills so a reviewer
who has seen one answer file can read any of them. Adapted from the AI-DLC `[Answer]:`
question-file ritual and its mandatory cross-answer ambiguity pass.

## When to use file mode

- The decision needs more than one person — or review — before it is settled.
- The answers should be **durable and diff-able**: committed to the repo, revisited later,
  cited in a spec or a config change.
- The interview is happening **async** — nobody is at the keyboard for a live back-and-forth.

Use interactive mode (the default) for a solo, synchronous session. File mode is **opt-in**:
the human requests it (for example, "let's do this as a question file" or a `--file` hint).
It is never entered automatically.

## Answer-file location and naming

The **durable** location is **skill-specific**: each interview co-locates its answer file
with the artifact it produces, so the file is committable, team-reviewable, and archives
alongside that artifact — provenance is never lost. See each skill's "Question-File Mode"
section for the exact path. The three durable homes are:

- **harness-brainstorming** → `docs/changes/<feature>/interview.md` — the same `<feature>`
  directory that holds the `proposal.md`, `SKILLS.md`, and `plans/` the brainstorm produces,
  so the interview archives with the change it drove.
- **harness-strategy** → `docs/strategy/interviews/<topic>-questions.md` — a strategy-scoped
  home (strategy updates the root `STRATEGY.md`, so there is no per-change slug).
- **harness-pulse** → `docs/pulse/interviews/<topic>-questions.md` — a pulse-scoped home next
  to the pulse config it produces (no per-change slug).

Session-scoped (when a session slug is known, e.g. under autopilot):
`.harness/sessions/<slug>/interviews/<topic>-questions.md` — where `<topic>` is the skill's
subject (`strategy`, `pulse`, or the brainstorming feature slug).

The skill MUST create the parent directory if absent and MUST NOT overwrite an existing
answer file without explicit confirmation — a half-filled file is the human's in-progress
work.

## Answer convention: the `[Answer]:` tag

Each question is a block. The human writes their answer on the same line as, or below, the
`[Answer]:` tag. An **unanswered** question has an empty `[Answer]:` — only whitespace after
the tag.

```markdown
### Q1: <question text>

<optional context: a tradeoff table, or A/B/C options with one-line notes>

[Answer]:
```

Multiple-choice questions label options `A` / `B` / `C`; the human answers with the letter,
prose, or both:

```markdown
### Q2: In-app delivery mechanism?

|          | A) Poll every 30s | B) WebSocket |
| -------- | ----------------- | ------------ |
| **Pros** | Simple            | Real-time    |
| **Cons** | Latency           | More infra   |

[Answer]: A — polling is fine for now
```

A file header records provenance so a reviewer opening the file cold understands it:

```markdown
# <Skill> interview — <topic>

> Fill in each `[Answer]:` line, then re-run the skill (or tell it the file is ready).
> Leave a `[Answer]:` blank to skip a question. Generated <ISO-date>.
```

## The ritual

1. **WRITE.** The skill assembles its questions — the same questions it would ask
   interactively, in the same order — into the answer file, each with an empty `[Answer]:`.
   It then stops and reports the file path.
2. **FILL.** The human edits the file — over minutes or days, alone or with teammates —
   filling `[Answer]:` lines. This step is outside the skill.
3. **READ-BACK.** On the next run, the skill **re-reads the file from disk** (never a copy
   cached from a prior turn — the file is the source of truth) and treats each filled
   `[Answer]:` as that question's response.
4. **PUSH BACK.** Each answer runs through the skill's normal per-answer pushback rules. A
   failed answer is flagged **in the file** — append a `> ⚠ <rule>: …` note under the
   question — rather than in ephemeral chat, so the flag is as durable as the answer.
5. **CONTRADICTION PASS.** Run the cross-answer contradiction pass (below) over the full
   set of filled answers.
6. **UNANSWERED.** A question with an empty `[Answer]:` is treated exactly as an interactive
   skip — it routes to the skill's normal "no answer" handling (a pending entry, a `null`,
   a flagged section). The skill never invents an answer.
7. **PROCEED / CONFIRM.** With all answers in hand and contradictions surfaced, the skill
   continues to its normal confirm-and-write step. The write path is unchanged — file mode
   only changes how answers are gathered, never how the artifact is validated or written.

## Cross-answer contradiction detection

This is a pushback rule that **extends** each skill's existing rules. Unlike the per-answer
rules (which judge one answer in isolation), it judges answers **against each other**. It
runs in BOTH modes — in file mode after read-back, in interactive mode once enough answers
have accumulated (before the final confirm-and-write).

It is **instruction-level** (agent judgment), consistent with every other interview rule —
nothing in the codebase parses natural-language answers. The skill reads the collected
answers and looks for these contradiction categories:

| Category               | What it catches                                               | Example                                                          |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Scope                  | One answer scopes the work small, another scopes it large     | "just a config tweak" vs "touches every service"                 |
| Metric ⇄ approach      | A stated metric cannot be produced by the stated approach     | metric "p95 latency" but no tracing source or mechanism named    |
| Persona ⇄ approach     | The approach targets a different user than the stated persona | persona "non-technical admin" but approach ships a CLI-only flow |
| Constraint violation   | One answer violates a constraint asserted in another          | "no new dependencies" vs "use library X"                         |
| Strategy contradiction | An answer contradicts a captured `STRATEGY.md` section        | approach contradicts the `Our approach` bet                      |

On a hit, the skill MUST:

1. **Surface it explicitly** — never silently pick a side. Quote both source answers, e.g.
   `⚠ Contradiction (Scope): Q1 says "just a config tweak" but Q4 says "touches every service".`
2. **Ask the human to reconcile.** In file mode, append a clarification block under the
   later question with its own `[Answer]:` line and stop for a fill; in interactive mode,
   ask in plain text.
3. **Never auto-resolve.** Reconciliation is the human's call. The pass is mandatory to
   _run and surface_; it is not a hard gate that blocks the human from proceeding once they
   have acknowledged it (this matches the escalation-based, human-in-the-loop model — the
   harness deliberately does not adopt universal stop-and-approve gates).

The pass is bounded like the 2-round cap: surface each distinct contradiction at most twice.
After the human reconciles or explicitly accepts, record the outcome and proceed.

## Context hygiene

- Always re-read the answer file from disk at the start of a read-back — do not trust a copy
  held in context from a prior turn.
- The answer file is append-friendly: flags and clarification blocks are added under the
  relevant question, never by rewriting the human's answers.
- Treat the human's verbatim answers as source: quote, do not paraphrase, when flagging.
