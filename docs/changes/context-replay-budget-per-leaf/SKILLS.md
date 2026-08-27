# Skill Advisor — context-replay-budget-per-leaf

Signals extracted from the spec: fleet, per-leaf context budget, fail-loud
enforcement at dispatch, pure/offline core primitive, zod schema shape in types,
canonical fleet-family doc section, provenance record.

## Apply

- **harness-autopilot** — chains plan → execute → verify → review for the
  enforcement-primitive slice (clear `## Implementation Order`).
- **harness-tdd** — the primitive is pure and fully unit-testable; author the
  over/under/boundary + malformed-input tests first.

## Reference

- **harness-planning** — task breakdown for the 5-step implementation order.
- **harness-code-review** — review the additive core/types module before land.

## Consider

- **harness-soundness-review** — spec-mode sanity pass (run during VALIDATE).
