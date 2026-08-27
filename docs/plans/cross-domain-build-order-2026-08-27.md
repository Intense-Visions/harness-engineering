# Cross-Domain Roadmap — Build Order

**Date:** 2026-08-27 · **Scope:** the 117 roadmap items filed by the cross-domain ideation program
(issues #1522–#1569, #1604–#1624, #1628–#1635, #1638–#1650, #1653–#1664, #1666–#1674, #1676–#1681)
· **Purpose:** turn the backlog from a library into a program — a dependency-ordered wave plan.

## How to read this

Waves are dependency layers, not sprints: everything in a wave can start once the prior wave's
items it cites are usable. Waves 1–2 run in parallel after Wave 0. Waves 3 and 4 are parallel
tracks. Item detail (wiring, adopter usage, dogfooding, acceptance) lives in each linked issue.

## The unlock list

Ten items carry the most downstream dependency weight. Building these first unblocks the most:

| Unlock                               | Issue        | Unblocks                                                                    |
| ------------------------------------ | ------------ | --------------------------------------------------------------------------- |
| Denominator declaration              | #1530        | every metric item                                                           |
| Provenance trailer                   | #1531        | cost attribution, autonomy ratio, idiom tracing, realization, double-entry  |
| Intent as unit of record             | #1538        | briefback, realization, forecasting, Kelly, derivation loops                |
| Rework-rate instrumentation          | #1528        | intent coding, moral hazard, MDL, compaction validation, briefback evidence |
| Metrology calibration chains         | #1645        | Goodhart sentinel, Kalman fusion, judge trust, spaced repetition            |
| Causal-inference toolkit             | #1566        | skill P&L, MDL pruning, moral hazard, realization, economic thresholds      |
| Unified admission control            | #1548        | every governor, DBR, shadow pricing, crisis modes, fuzzing budget           |
| Mutation testing + capture-recapture | #1554, #1553 | NNR, Goodhart truth pairs, drills corpus, portfolio verification            |
| Transparency log                     | #1556        | passports, threshold auth, safety-case evidence, audit sampling statements  |
| Queueing model                       | #1555        | DBR, newsvendor, bullwhip, cavitation context, capacity governor            |

## Wave 0 — Measurement floor (7)

Nothing downstream is trustworthy without these. All are schema/instrumentation work, small to medium.

| Item                                                        | Issue |
| ----------------------------------------------------------- | ----- |
| Denominator declaration in metric outputs                   | #1530 |
| Provenance trailer on agent commits                         | #1531 |
| Stability gate on ranked outputs                            | #1529 |
| Rework-rate instrumentation                                 | #1528 |
| Metrology calibration chains                                | #1645 |
| Harness SLOs + alarm rationalization (alarm registry first) | #1643 |
| Intent as the unit of record                                | #1538 |

## Wave 1 — Quick wins (8)

Small, mostly independent, immediate ROI; they pay for the rest of the program and build trust.

| Item                                 | Issue | Why here                                            |
| ------------------------------------ | ----- | --------------------------------------------------- |
| Stability-ordered context layout     | #1634 | P1; token savings on every request, content-neutral |
| Content-addressed gate memoization   | #1639 | P1; compute/token savings, proven pattern           |
| Model-update regression sentinel     | #1617 | P1; standalone; trust event every firing            |
| Mission-command briefback            | #1658 | P1; one round-trip kills the largest rework source  |
| Taguchi loss (distance emission)     | #1673 | one schema field; recovers the leading indicator    |
| Autonomy-ratio benchmark             | #1638 | nearly free; the credibility artifact               |
| Cost-per-merged-PR attribution       | #1522 | needs #1531; the unit-cost number                   |
| Scoped validation to changed surface | #1523 | CI time drop, immediate                             |

## Wave 2 — Ground truth (9)

The instruments that keep every later proxy honest. Protect the metric estate before scaling it.

| Item                                              | Issue |
| ------------------------------------------------- | ----- |
| Mutation testing the gate stack                   | #1554 |
| Capture-recapture defect estimation               | #1553 |
| Judge calibration against outcomes                | #1560 |
| Observational causal-inference toolkit            | #1566 |
| Goodhart sentinel (activates as truth pairs land) | #1642 |
| Number-needed-to-run gate accounting              | #1659 |
| Known-answer pipeline drills                      | #1616 |
| Near-miss ledger + leading indicators             | #1565 |
| Basal token metabolism                            | #1628 |

## Wave 3 — Control plane (18)

Governors, admission, and flow control. Parallel track with Wave 4.

Admission & budgets: unified admission control #1548 · budget governor #1525 · team capacity
governor #1537 · rate-limit fan-out governor #1532 · context-replay budget #1524.
Flow models & controllers: queueing model #1555 · scalability-law fit #1552 · AIMD concurrency
#1606 · feedback control for governors #1567 · Nyquist oversight bound #1618 · bullwhip dampening
#1666 · drum-buffer-rope #1676 · cavitation detection #1611 · crisis standards / degraded modes #1654.
Economics: value-per-spend routing #1542 · capacity shadow pricing #1569 · Kelly staking #1668 ·
newsvendor provisioning #1679.

## Wave 4 — Safe autonomy (13)

The authorization stack for unattended operation; the safety case is the capstone that cites the rest.

Contracts & authority: unattended-safe contract #1533 · policy-level human control #1534 ·
separation of duties #1661 · threshold m-of-n authorization #1650.
Runtime integrity: agent apoptosis + lineage hygiene #1605 · adversarial input hardening #1559 ·
unattended work decomposition #1536.
Evidence & audit: transparency log #1556 · model-check the orchestration protocol #1562 ·
normal-accidents coupling audit #1669.
Operations: sterile cockpit #1672 · incident command structure #1667.
Capstone: **unattended-operation safety case #1674**.

## Wave 5 — Throughput & review economics (19)

Landing at scale, and spending review attention where it matters. Needs Waves 3–4 partially.

Landing: speculative merge queue #1647 · concurrent-change coordination #1539 · stigmergic
coordination #1623 · interface futures #1615 · speculative execution #1622 · SMED changeover #1671.
Review attention: typicality triage #1561 · **risk-tiered review gate #1527** · standards of review
#1663 · precedent / stare decisis #1660 · design intent as executable constraint #1543.
Verification composition: redundancy dial #1563 · portfolio-diverse verification #1631 ·
outcrossing #1619 · verification by construction #1535 · spec back-translation #1662 ·
Toulmin justifications #1681 · double-entry work ledger #1655 · statistical audit sampling #1664.

> **Pull-forward note:** the review-attention cluster (#1527, #1561) answers "how much attention
> does this PR deserve" and depends only on blast-radius tooling that already exists plus Wave-2
> outcome data. It is deliberately pullable into Wave 2 if human review attention is the current
> binding constraint — see the pre-existing `risk-forecasting-not-estimation` shard and the
> pre-merge-brief "Worth your eyes" section, which these items upgrade from heuristic to calibrated.

## Wave 6 — Knowledge & compression (15)

Compounding layers: what the system knows, and what it costs to say.

Knowledge: compiled comprehension substrate #1558 · MDL pruning #1630 · rejection ledger #1620 ·
spaced-repetition re-verification #1680 · IRT difficulty/ability model #1657 · intent coding theory
#1614 · reference-class forecasting #1670 · Kalman signal fusion #1677.
Compression: rate-distortion compaction #1633 · trained dictionaries #1635 · progressive encoding
#1632 · semantic canonicalization #1646.
Codebase dynamics: idiom contagion epidemiology #1612 · dependency percolation margin #1608 ·
immune detector population #1613.

## Wave 7 — Production loop & program economics (15)

Closing the loop with production, and auditing the program itself.

Production: intent derivation from signal #1540 · closed-loop remediation #1541 · metric-gated
progressive delivery #1644 · continuous fuzzing fleet #1640.
Risk & learning: Gutenberg–Richter failure scaling #1629 · desire-path mining #1641 · situational
digests #1564 · operator proficiency #1568 · moral-hazard instrumentation #1678.
Program audit: controlled experiments on its own effect #1551 · strategy realization accounting
#1649 · skill value ledger #1621 · economic injury thresholds #1656 · flow Reynolds number #1610 ·
merged-but-unreleased inventory #1526.

## Wave 8 — Ecosystem & adoption (13)

Network effects last: they need the base to win on standalone merit first.

Inbound: contribution triage at scale #1544 · contributor trust tiering #1545 · machine pre-review
#1546 · semantic duplicate detection #1547 · provenance/authorship detection #1550 ·
cross-boundary collision detection #1549.
Federation: verification passports #1624 · federated gate calibration #1609 · standards interop
#1648 · commons governance #1653.
Adoption: counterfactual shadow trial #1607 · adoption-funnel telemetry #1604.

(Autonomy ratio, though adoption-facing, ships in Wave 1 because it is measurement-only.)

## Staging against capacity

- **First ten to build** (Wave 0 + the four P1 quick wins): #1530, #1531, #1538, #1528, #1645,
  #1643, #1529, then #1634, #1639, #1617. Everything else cites at least one of these.
- One build wave ≈ one fleet batch at current throughput; Waves 0–2 are dominated by
  schema/telemetry work and parallelize well; Waves 3–5 are the heavy engineering.
- Re-derive this ordering when the constraint moves: it assumes review attention is the binding
  resource. If token budget becomes binding first, Wave 1's compression items and Wave 6's
  compression cluster move up a wave.

## Provenance

Sequenced from the dependency declarations in each item's issue (Dependencies / Wiring sections),
2026-08-27. When items ship or dependencies change, regenerate the wave placement rather than
patching it by hand.
