---
schemaVersion: 1
module: "templates/rehearsal-fixtures/dependency-cycle/src"
sourceHash: "46ff7339be787be1cdd7a5bb4861471ce7b85f1b5d8d37086de475a940a50d60"
compiledAt: "2026-08-28T01:22:12.855Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["customer.ts", "invoice.ts"]
---

## Summary

This is a rehearsal fixture (templates/rehearsal-fixtures/dependency-cycle/src) — deliberately broken code designed to test harness architecture validation. It models a customer-invoice ledger with two modules that calculate balances and summaries.

**The planted defect**: A circular import cycle between `customer.ts` and `invoice.ts`:
- `customer.ts` imports `invoiceTotal` and `Invoice` from invoice
- `invoice.ts` imports `customerLabel` from customer

The fixture rehearses detecting this cycle via `harness check-arch`, which should flag the A↔B dependency violation and suggest extracting the shared piece into a third module.

## Invariants

- No circular imports: customer and invoice must form a DAG, not a cycle — breaking this violates module boundaries and creates runtime brittleness.
- Shared types belong in a neutral third module: The Invoice type and summary/total logic are used by both; extracting these into a shared module (e.g., types.ts or shared.ts) breaks the cycle.
- Fixture premise holds: The rehearsal fixture must remain broken until resolved correctly — if hand-edited to fake a pass, the rehearsal loses its purpose as a teaching example.

## Interface Contract

```ts
export customerBalance
export customerLabel
export invoiceSummary
export invoiceTotal
```

## Dependency Slice

```
import { customerLabel } from './customer'
import { Invoice, invoiceTotal } from './invoice'
```
