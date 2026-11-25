# Attribution Rubric

Every `critical` or `important` finding carries two labels: what kind of miss it is
(`findingClass`) and the earliest pipeline stage that should have caught it (`escapedFrom`).
The labels are a reviewer's estimate. They are read as a ranking of stages across many
findings, not as exact counts, so choose quickly and consistently.

## `findingClass`

| Class         | Use it when                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stale-claim` | A spec, ADR, README, changeset, comment or skill text states something that the shipped code or another document contradicts.                              |
| `edge-case`   | Behaviour is wrong for an input the happy path does not exercise: empty or zero input, ties, an unknown enum value, an out-of-domain value, an error path. |
| `weak-test`   | A test exists and cannot fail for the defect it claims to cover: a vacuous assertion, a mock that mirrors the implementation, a skipped test.              |
| `collateral`  | The change broke or degraded something outside its stated scope: a generated artifact, a sibling caller, unrelated behaviour.                              |
| `design`      | The approach is wrong or crosses an architectural boundary, and no local fix restores it.                                                                  |
| `other`       | None of the above. Say what it is in `rationale`.                                                                                                          |

When two classes fit, take the first that applies in the order of the table.

## `escapedFrom`

The **earliest stage** that had what it needed to catch the finding.

| Stage          | The finding escaped from here when                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec`         | The spec is wrong, contradicts itself, or is silent where it had to decide.                                                                    |
| `plan`         | The spec was right and the plan did not carry it into a task: a missing task, a file left off the file map, an unlisted document or edge case. |
| `execution`    | The plan asked for it and the implementation did not do it, or did it wrong.                                                                   |
| `verification` | It was implemented as planned, and a check that exists (a test, `harness validate`, EXISTS / SUBSTANTIVE / WIRED) should have failed.          |
| `none`         | Only a review could reasonably have found it.                                                                                                  |

Rules:

1. Work from the top of the table down and take the first stage that applies. A document nobody
   listed for update is `plan`, even though execution also missed it.
2. If there is no spec or plan to read (a standalone review of a hand-built change), start at
   `execution`.
3. If you cannot tell, use `none` and say so in `rationale`. Do not guess a stage to fill the field.

`suggestion` findings need neither label.
