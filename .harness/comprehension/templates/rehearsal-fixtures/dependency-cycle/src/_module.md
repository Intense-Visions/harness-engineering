---
schemaVersion: 1
module: 'templates/rehearsal-fixtures/dependency-cycle/src'
sourceHash: '46ff7339be787be1cdd7a5bb4861471ce7b85f1b5d8d37086de475a940a50d60'
compiledAt: '2026-08-28T01:22:12.855Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['customer.ts', 'invoice.ts']
---

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
