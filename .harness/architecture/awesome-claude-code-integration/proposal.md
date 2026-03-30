## Proposal: Awesome Claude Code Integration

**Date:** 2026-03-29

### Option A: Security-First Wave

**Summary:** Prioritize the 4 security/safety resources that align with harness's core "mechanical enforcement" philosophy, then follow with DX improvements.

**Wave 1 — Security & Safety:**

1. **parry** — Prompt injection scanning for hooks/MCP inputs
2. **Trail of Bits skills** — Professional security audit patterns
3. **Container Use** (Dagger) — Sandboxed agent execution for orchestrator
4. **Dippy** — AST-based command safety analysis

**Wave 2 — Developer Experience:** 5. **ccflare/CC Usage** — Cost tracking and usage dashboards 6. **agnix** — Agent config linting 7. **claude-hooks** — Hook authoring support

**Wave 3 — Pattern Mining:** 8. **Context Engineering Kit**, **Compound Engineering**, **Superpowers** — Ideas to backport

**Pros:**

- Aligns with harness's identity as a _constraints and safety_ framework
- Security gaps are genuine risks (prompt injection, unsandboxed execution)
- Builds trust with security-conscious adopters

**Cons:**

- Security work is less visible to end users — slower perceived progress
- Container integration (Dagger) has real complexity

**Effort:** Large (8-12 weeks across all waves)
**Risk:** Medium — Dagger integration is the highest-risk item
**Best when:** Security/trust is the primary adoption blocker

---

### Option B: DX-First Wave

**Summary:** Lead with developer experience improvements that have immediate user-visible impact, then harden security.

**Wave 1 — Developer Experience:**

1. **ccflare/CC Usage** — Cost tracking
2. **agnix** — Config linting
3. **claude-hooks** — Hook authoring
4. **CC Notify** — Desktop notifications
5. **recall** — Session search

**Wave 2 — Security:** 6. **parry** — Prompt injection defense 7. **Container Use** — Sandboxed execution 8. **Trail of Bits** — Security patterns

**Wave 3 — Pattern Mining:** Same as Option A

**Pros:**

- Faster visible value for existing users
- DX tools are lower-risk to integrate
- Usage tracking addresses a common user complaint

**Cons:**

- Defers security gaps that represent real risk
- DX improvements don't differentiate harness from competitors

**Effort:** Medium-Large (6-10 weeks across all waves)
**Risk:** Low for Wave 1, Medium for Wave 2
**Best when:** User adoption and retention is the primary goal

---

### Option C: Cherry-Pick Pattern Mining (No Direct Integration)

**Summary:** Don't integrate any external tools. Instead, study the top resources for patterns and ideas, then build native harness equivalents.

**Targets:**

1. Study **parry** → build `harness:prompt-guard` skill
2. Study **Dippy** → enhance orchestrator command approval with AST analysis
3. Study **Trail of Bits** → enhance `harness:security-scan`
4. Study **ccflare** → add `harness usage` CLI command
5. Study **agnix** → add `harness validate --agent-configs`
6. Study **Context Engineering Kit** → optimize `gather_context` token efficiency
7. Study **Compound Engineering** → enhance learnings store with error-to-lesson pipeline

**Pros:**

- No external dependencies
- Everything fits harness's architecture natively
- Full control over implementation quality

**Cons:**

- Slower — building from scratch vs. leveraging existing work
- May reinvent what already works well
- Misses opportunities for ecosystem collaboration

**Effort:** Large (10-16 weeks)
**Risk:** Low (no external dependency risk)
**Best when:** Independence and architectural purity matter most

---

### Comparison Matrix

| Criterion             | Option A: Security-First | Option B: DX-First     | Option C: Pattern Mining |
| --------------------- | ------------------------ | ---------------------- | ------------------------ |
| Complexity            | High                     | Medium                 | Medium-High              |
| User-visible impact   | Slow                     | Fast                   | Slow                     |
| Security posture      | Excellent                | Deferred               | Good (eventually)        |
| Maintainability       | Medium (external deps)   | Medium (external deps) | Excellent (all native)   |
| Effort to build       | Large (8-12 wk)          | Medium-Large (6-10 wk) | Large (10-16 wk)         |
| Effort to change      | Medium                   | Medium                 | Low                      |
| Risk                  | Medium                   | Low                    | Low                      |
| Fits harness identity | Excellent                | Good                   | Excellent                |

### Recommendation

Based on harness's identity as a **mechanical enforcement framework**, I lean toward **Option A (Security-First)** because:

- Prompt injection defense and sandboxed execution are genuine safety gaps
- "Constraints engine with no security constraints on its own inputs" is a credibility problem
- Trail of Bits patterns would immediately strengthen a core differentiator

However, if adoption velocity matters more right now, **Option B** delivers faster visible value. And if you want zero external dependencies, **Option C** is the purest path.

**Human decision required:** Which option (or hybrid) do you want to proceed with?

**Selected:** Option A — Security-First Wave (per human choice to document as ADR)
