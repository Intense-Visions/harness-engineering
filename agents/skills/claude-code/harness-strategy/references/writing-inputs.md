# What a Good Strategy Input Looks Like

The strategy interview is only as good as the answers it gets. This guide shows
**worked examples of high-quality inputs** so you can calibrate before (or during)
the interview. Read it when a prompt asks for a section and you are not sure how
concrete the answer needs to be — copy the shape of the closest example, then
substitute your own facts.

These are _examples of good input_, not templates to fill blindly. The interview
still applies its three pushback rules (`Fluff detection`, `Goal-as-strategy`,
`Feature-list-as-strategy`) and the cross-answer contradiction pass to whatever
you write. The examples below are written to clear all four — study _why_ they
clear them (the "Why this input works" notes), not just the words.

## The four quadrants

Two axes decide how much you write and where the answers come from:

| Axis                  | Left                                                     | Right                                                                     |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Depth**             | **Minimal** — the least that is still concrete and valid | **Full** — every required section plus the optional ones, richly answered |
| **Codebase maturity** | **Greenfield** — a new product, no code yet              | **Brownfield** — an existing system you are changing                      |

- **Minimal** is the honest floor: five required sections, one to three sentences
  each, every one concrete enough to survive pushback. Use it when the strategy is
  young and you would rather commit to a little that is true than a lot that is
  aspirational. A minimal `STRATEGY.md` is a real anchor — not a placeholder.
- **Full** adds the optional sections (`Milestones`, `Not working on`,
  `Marketing`) and more texture in the required ones. Use it once the bet is
  settled enough to defend in detail.
- **Greenfield** inputs describe a problem you _believe_ exists and a bet you are
  about to place. They are hypotheses stated concretely.
- **Brownfield** inputs describe a problem you have _observed_ in a running system
  and a bet about what to change. Anchor them in what the current system actually
  does and fails to do — brownfield strategy earns its authority from evidence, so
  a `Not working on` section that protects the migration is especially valuable.

Pick the quadrant that matches your situation and read that example first. All
four produce a schema-valid `STRATEGY.md`.

## The quality bar, per section

Every example below meets this bar. Use it as a pre-flight check on your own
answers:

- **Target problem** — a _diagnosis_, not an aspiration. Names what is broken, for
  whom, in a way you could verify. "Be the best at X" and "grow revenue 20%" both
  fail; the first is fluff, the second is a goal.
- **Our approach** — the _bet_: the distinctive choice about _how_, not a list of
  features and not a restatement of the goal. If it reads as "first X, then Y,
  then Z," it is a roadmap, not an approach.
- **Who it's for** — a _specific persona_ in a context, with the alternative they
  use today. "Developers" is not a persona; "backend engineers 3–6 months into
  adopting an AI agent, still relying on a code-review checklist" is.
- **Key metrics** — 1–5 bullets, each naming _what_ is measured and _where the
  number lives_. A metric with no measurement site is a wish.
- **Tracks** — 1–5 bullets, each an _investment direction_ ("collapse three
  widgets into one surface"), not a feature name ("Dashboard").
- **Optional sections** — `Milestones` may be dated targets (that is what they are
  for). `Not working on` is your best defense against drift. `Marketing` is
  usually downstream of Target problem + Our approach.

---

## A. Greenfield · Full

**Situation:** A founder is starting a new product and has no code yet. The bet is
settled enough to write in detail.

```markdown
---
name: Cadence
last_updated: '2026-01-15'
version: 1
---

# Cadence Strategy

## Target problem

Solo freelancers — designers, writers, consultants — lose real income to invoices
that go out late or never get chased. The tools built for them are full accounting
suites: double-entry ledgers, tax modules, chart-of-accounts setup a one-person
shop will never touch. So most freelancers fall back to a spreadsheet and manual
bank transfers, forget to follow up on a late payer, and only notice the gap when
the month closes short. The work of _getting paid_ is separate from the work of
_doing the work_, and nobody is doing the first job.

## Our approach

We bet on **invoicing that runs itself** rather than a lighter accounting app. The
distinctive choice: the product's core is the follow-up cadence, not the ledger.
Once a freelancer sends an invoice, Cadence owns the entire chase — reminders on a
schedule the freelancer never has to think about, escalating tone, a payment link
in every message — and reports only the outcome. We are betting that the unpaid
work freelancers most want to hand off is the awkward follow-up, and that owning
that one loop end to end beats being a cheaper version of the accounting suites.

## Who it's for

A solo freelancer billing 3–10 clients a month, no bookkeeper, no finance
background. Today they track invoices in a spreadsheet or a Notes doc and send
payment nudges by hand — when they remember. They have tried a full accounting
tool and abandoned the onboarding. They are not a small agency with an ops person;
they are the person who does the client work _and_ the billing, and resents the
billing.

## Key metrics

- **Paid-on-time rate:** share of invoices marked paid on or before their due date,
  computed from payment-webhook timestamps and shown on the account dashboard.
- **Time to first invoice:** minutes from sign-up to a new user's first invoice
  sent, measured in the onboarding funnel and reported weekly.
- **Recovered revenue:** dollar value of invoices paid _after_ a Cadence reminder
  fired, attributed via reminder-to-payment correlation and surfaced in the monthly
  account summary.

## Tracks

- **Reminder engine:** make the automated follow-up sequence something a freelancer
  configures once and never revisits — cadence, tone, stop-on-payment.
- **Zero-friction onboarding:** collapse setup to "connect a payout account, send
  one invoice" so a new user reaches value before they can lose interest.
- **Payment rails:** integrate the payment methods this persona's clients actually
  use, so the payment link in a reminder always just works.

## Milestones

- 2026-03: private beta with 25 freelancers recruited from two design communities.
- 2026-06: public launch with the reminder engine and one payment integration live.
- 2026-09: recovered-revenue reporting shipped and validated against beta cohort.

## Not working on

Full accounting: no double-entry ledger, no tax filing, no chart of accounts, no
expense tracking. The moment we add a general ledger we become the heavy suite we
are displacing. We integrate with accounting tools; we do not become one.

## Marketing

You do the work. Cadence gets you paid for it. Send an invoice once and we chase
it — polite, persistent, on schedule — until the money lands, so you never write
another "just following up on this" email.
```

**Why this input works**

- _Target problem_ is a verifiable diagnosis (freelancers abandon heavy suites,
  fall back to spreadsheets, lose income to un-chased invoices) — no "be the best,"
  no revenue target. Clears **Fluff** and **Goal-as-strategy**.
- _Our approach_ states one coherent bet ("own the follow-up loop, not the
  ledger") and names what it is _not_ (a cheaper accounting app). It is a thesis,
  not a feature list or a "first X then Y" roadmap. Clears **Feature-list**.
- _Key metrics_ each name a measurement site (webhook timestamps, onboarding
  funnel, monthly summary), so none is a bare wish.
- _Not working on_ actively defends the bet — the sharpest signal that the strategy
  is real.

---

## B. Greenfield · Minimal

**Situation:** Same product, same founder, but early — the bet is only a few weeks
old and they would rather commit to a little that is true. Five required sections,
short, every one still concrete.

```markdown
---
name: Cadence
last_updated: '2026-01-15'
version: 1
---

# Cadence Strategy

## Target problem

Solo freelancers lose income to invoices that go out late or never get chased.
The tools built for them are heavy accounting suites, so they fall back to
spreadsheets and manual follow-up — and forget.

## Our approach

We bet on invoicing that runs itself: the product's core is the automated
follow-up cadence, not the ledger. We own the awkward chase from send to paid,
rather than being a lighter accounting app.

## Who it's for

Solo freelancers billing 3–10 clients a month, no bookkeeper, tracking invoices in
a spreadsheet and chasing payments by hand today.

## Key metrics

- **Paid-on-time rate:** share of invoices paid by their due date, from payment
  webhooks, on the account dashboard.
- **Time to first invoice:** minutes from sign-up to first invoice sent, in the
  onboarding funnel.

## Tracks

- **Reminder engine:** the automated follow-up sequence a freelancer sets once.
- **Zero-friction onboarding:** setup collapsed to "connect payout, send one
  invoice."
```

**Why this input works**

- It is _short but not vague_. Every sentence still names something concrete — this
  is the floor, not a placeholder. A reader could act on it.
- Two metrics and two tracks are enough; the schema allows 1–5. Do not pad to hit a
  count.
- No optional sections, and that is fine — they are genuinely optional. Add them in
  a later `version` when the bet has earned the detail.
- The approach is still one bet, not a feature list, so it clears the same pushback
  the full version does.

---

## C. Brownfield · Full

**Situation:** A team owns a six-year-old internal system and is modernizing it.
The problem is _observed_, not hypothesized, and the strategy has to protect a
migration.

```markdown
---
name: Atlas Expense
last_updated: '2026-01-15'
version: 1
---

# Atlas Expense Strategy

## Target problem

Our internal expense-reimbursement app, Atlas, is six years old and so slow and
confusing that employees delay submitting expenses — the median expense is now
submitted 18 days after it was incurred, and 30% are submitted only at quarter
close in a rushed batch. Finance then chases missing receipts by email, and
reimbursement takes three to five weeks. The desktop form has fourteen fields, most
optional but none obviously so, and there is no mobile path, so a receipt captured
on a trip has to be re-entered at a desk days later. The delay is not a policy
problem; it is a friction problem in the tool we already run.

## Our approach

We bet on **capture at the moment of spend** rather than rebuilding the desktop
form. The distinctive choice: the primary surface becomes a phone camera — snap the
receipt, we OCR and auto-categorize it, the employee confirms in one tap — and the
desktop form becomes the fallback, not the entry point. We are betting that the
delay comes from _when and where_ capture happens, not from missing fields, so
moving capture to the moment and place of spend removes the delay at its source.
We are explicitly not rebuilding the approvals engine this cycle.

## Who it's for

Two personas on the existing system. Primary: traveling and field employees who
incur 5–20 expenses a month and today hoard paper receipts until they are back at a
desk. Secondary: the four-person finance-ops team who approve and reconcile, and
who currently spend most of a day each week chasing receipts by email. Both use
Atlas today and actively avoid it.

## Key metrics

- **Submission-to-reimbursement time:** median days from expense incurred to
  reimbursement paid, from the existing Atlas audit log, reported monthly to
  finance.
- **Same-day capture rate:** share of expenses captured within 24 hours of the
  transaction date, from receipt-upload timestamps versus transaction dates.
- **Finance manual-touch rate:** share of expenses requiring a finance follow-up
  email before approval, tracked in the approvals queue.

## Tracks

- **Mobile capture:** a phone-first capture path that replaces re-entry at a desk.
- **Auto-categorization:** OCR plus a category model so the employee confirms
  rather than fills, cutting the fourteen-field form to a one-tap confirm.
- **Approval simplification:** reduce the finance follow-up loop by validating
  receipts at capture time, not at approval time.

## Milestones

- 2026-02: instrument the current Atlas to baseline submission-to-reimbursement
  time before any change ships.
- 2026-05: mobile capture in pilot with one traveling-heavy department.
- 2026-08: auto-categorization live and same-day capture rate measured against
  baseline.

## Not working on

The approvals engine and policy rules stay as they are this cycle — they work, and
touching them would balloon the migration and risk finance's trust. We are also not
migrating the six years of historical expense data into any new store; the existing
audit log remains the system of record. Reporting and analytics dashboards are out
of scope until capture is fixed.

## Marketing

(internal) Stop saving receipts for later. Snap it when you spend it, confirm in
one tap, and get reimbursed in days instead of weeks — no more quarter-end
expense marathons.
```

**Why this input works**

- _Target problem_ cites observed numbers from the running system (18-day median,
  30% at quarter close, fourteen fields, no mobile path). Brownfield diagnosis
  earns authority from evidence, not belief.
- _Our approach_ makes one bet ("capture at the moment of spend") and states the
  causal claim behind it (delay comes from _when/where_ capture happens). It names
  a boundary ("not rebuilding the approvals engine") — a hallmark of good
  brownfield strategy.
- _Not working on_ is doing heavy lifting: it protects the migration by fencing off
  the approvals engine, the historical-data migration, and analytics. This is where
  brownfield strategy most often succeeds or fails.
- _Milestones_ begin with "baseline the current system before changing it" — a
  brownfield discipline that makes the metrics meaningful.

---

## D. Brownfield · Minimal

**Situation:** Same system, but the team wants a lean anchor now and will deepen it
later. Five required sections, anchored in observed reality, short.

```markdown
---
name: Atlas Expense
last_updated: '2026-01-15'
version: 1
---

# Atlas Expense Strategy

## Target problem

Our six-year-old internal expense app is slow and desktop-only, so employees delay
submitting — median 18 days after the expense, many batched at quarter close.
Finance chases receipts by email and reimbursement takes weeks.

## Our approach

We bet on capture at the moment of spend: a phone-first receipt path with OCR and
auto-categorization becomes the primary surface, and the desktop form becomes the
fallback. We are not rebuilding the approvals engine this cycle.

## Who it's for

Traveling employees on the existing Atlas who hoard paper receipts until they are
back at a desk, and the finance-ops team who chase those receipts by email today.

## Key metrics

- **Submission-to-reimbursement time:** median days from expense incurred to paid,
  from the Atlas audit log.
- **Same-day capture rate:** share of expenses captured within 24h of the
  transaction, from upload versus transaction timestamps.

## Tracks

- **Mobile capture:** a phone-first path that replaces desk re-entry.
- **Auto-categorization:** OCR plus categorization so the employee confirms rather
  than fills.
```

**Why this input works**

- Still anchored in observed facts (18-day median, desktop-only) — a minimal
  brownfield input stays evidence-based even when short.
- Keeps the single most valuable brownfield boundary inline in _Our approach_ ("not
  rebuilding the approvals engine"), even without a full `Not working on` section.
- Two metrics, two tracks, no optional sections — a valid, honest floor to grow
  from.

---

## After you write

Whichever quadrant you started from, the interview still runs the pushback rules
and the cross-answer contradiction pass over your answers before it writes. If a
rule fires, the examples above are the reference for what the fixed answer should
look like. The anti-pattern fixtures (the _weak_ inputs each rule catches) live in
`references/interview.md`; this guide is their positive counterpart.
