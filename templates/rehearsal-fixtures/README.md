# Rehearsal fixtures

Deliberately-broken, self-contained code and docs samples. Each fixture plants
**one** failure mode that a real harness check is designed to catch. Point an
agent (or a persona you are about to trust in production) at a fixture, ask it
to detect and repair the planted problem, then score the recovery with
`harness rehearse`.

Why rehearse? Free-soloing a change in production is how a small planted defect
becomes an incident. A fixture lets an agent practise the crux move — notice the
defect, reach for the right gate, fix it without breaking anything else — on a
rope first. The same fixtures double as a regression test for the harness's own
gates: if `check-security` stops catching a leaked secret, the leaked-secret
fixture's rehearsal score drops.

## The set

| Fixture            | Failure mode     | Exercised check          |
| ------------------ | ---------------- | ------------------------ |
| `hardcoded-secret` | leaked-secret    | `harness check-security` |
| `layer-violation`  | layer-violation  | `harness check-arch`     |
| `dependency-cycle` | dependency-cycle | `harness check-arch`     |
| `broken-doc-link`  | broken-doc-link  | `harness check-docs`     |

Each fixture directory carries a `rehearsal.json` manifest: what was planted,
where, which check should catch it, what a good fix looks like, and the scoring
rubric. The manifest is the ground truth; the scorer is the referee.

## Usage

```sh
harness rehearse list                 # list fixtures + planted failure modes
harness rehearse show <fixture-id>    # print one fixture's manifest + rubric
harness rehearse score \              # score a recovery attempt (0-100 + tier)
  --fixture <fixture-id> \
  --recovery ./recovery.json
```

A recovery record is a small JSON document describing the outcome of one
attempt:

```json
{
  "fixtureId": "hardcoded-secret",
  "detected": true,
  "identifiedFailureMode": "leaked-secret",
  "checkCited": "harness check-security",
  "fixed": true,
  "collateralDamage": false
}
```

The `harness:rehearse` skill drives the whole loop for you: it copies a fixture
into a scratch workspace, has the agent attempt recovery, assembles the recovery
record, and calls `harness rehearse score`.

## Scoring rubric

Four independently-credited dimensions (weights sum to 100):

| Dimension      | Weight | Credited when                                                         |
| -------------- | ------ | --------------------------------------------------------------------- |
| `detected`     | 30     | The planted failure mode is identified (a named diagnosis must match) |
| `correctCheck` | 20     | The agent used/cited the harness check the fixture exercises          |
| `fixed`        | 35     | The planted defect is actually resolved                               |
| `noCollateral` | 15     | The fix introduced no unrelated breakage                              |

Tiers: **pass** at 80+, **partial** at 50-79, **fail** below 50.
