// FIXTURE (deliberately broken): rehearse against `harness check-arch`.
// Planted failure mode: dependency-cycle. See ../rehearsal.json.

// PLANTED DEFECT (the other half of the cycle): customer imports invoice, and
// invoice imports customer. Break this by extracting the shared piece into a
// third module both can depend on.
import { invoiceTotal, type Invoice } from './invoice';

export function customerLabel(customerId: string): string {
  return `customer:${customerId}`;
}

export function customerBalance(invoices: Invoice[]): number {
  return invoices.reduce((sum, inv) => sum + invoiceTotal(inv), 0);
}
