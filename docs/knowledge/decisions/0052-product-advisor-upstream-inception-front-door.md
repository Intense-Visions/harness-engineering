---
number: 0052
title: Product Advisor as the upstream client-inception front door
date: 2026-07-01
status: accepted
tier: medium
source: docs/changes/product-advisor/proposal.md
---

## Context

The harness lifecycle begins at `STRATEGY.md` and `harness-brainstorming` — both of
which assume a project already exists and a human is ready to think about design. There
is no supported step _before_ that: the point where a solution architect / pre-sales
engineer sits with a client, a rough idea, and a diagram, and must turn conversation into
structured requirements.

Teams supporting sales do this by hand today — reading a diagram, writing a Business
Requirements Document (BRD), and chasing missing information across follow-up calls. None
of that output is machine-usable; it is re-keyed by hand to enter the harness pipeline,
and the "what we still don't know" list lives in someone's head.

The originating request was explicit: _"take in a diagram and spit out a BRD and a list
of missing information … start on a project at its inception with the client, gather the
requirement using AI … then feed those in … and have everything continue as it does
today."_

Two framings were considered: (A) an upstream extension of harness that reuses the
existing substrate, and (C) a separate product that merely exports into harness later. A
distinct "inception track" with its own conventions was also considered and deferred.

## Decision

Add `product-advisor` as an **upstream extension of the harness pipeline** — the
pre-inception front door — rather than a separate product or a new lifecycle track.

- It establishes a new artifact class, the **BRD**, under `docs/inception/<engagement>/`
  (`brd.md` + `gaps.md`), distinct from `docs/changes/<feature>/proposal.md` specs.
- It targets a **secondary persona** — the solution architect / pre-sales engineer — who
  is named explicitly in `STRATEGY.md` (amendment tracked separately) rather than
  silently folded into the existing tech-lead persona. The BRD is written in a
  client-legible register as a consequence.
- It **reuses** the shipped substrate: the v4.0 Business Knowledge System diagram/vision
  ingestion, `read_strategy`, `gather_context`, and `manage_roadmap`. It builds no new
  diagram parser.
- It holds two hard boundaries: it **reads but never writes `STRATEGY.md`** (that is
  `harness-strategy`'s job) and it **never authors a spec** (that is
  `harness-brainstorming`'s job). It stops at BRD + roadmap seeding.

A formal multi-skill "inception track" is deferred until a second inception skill is
justified; `product-advisor` is designed so its fan-out step can later extract into a
composed step (e.g. via `harness-ideate`) without rework.

## Consequences

**Positive:**

- The harness gains a coherent entry point one notch earlier than `STRATEGY.md`, turning
  a manual sales-support activity into a machine-usable artifact that grounds everything
  downstream. This directly serves the "Upstream grounding" strategy track.
- Maximum reuse: no new ingestion engine, no new persistence, no new conventions. The
  skill is `skill.yaml` + `SKILL.md` plus two boundary rules.
- The BRD becomes traceable evidence: requirements cite their source, and the gap-list is
  an explicit, shippable record of what is still unknown.

**Negative:**

- It stretches the harness persona to include the solution-architect / pre-sales role.
  Mitigated by naming that persona explicitly in `STRATEGY.md` rather than pretending the
  engineer runs it.
- A new artifact class (`docs/inception/`) adds a directory convention future inception
  skills must respect.
- Deferring the inception track means a second inception skill will force a revisit of
  whether the fan-out belongs in `product-advisor` or in a shared upstream step.
