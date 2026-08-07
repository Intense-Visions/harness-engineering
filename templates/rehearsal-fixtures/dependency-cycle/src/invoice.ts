// FIXTURE (deliberately broken): rehearse against `harness check-arch`.
// Planted failure mode: dependency-cycle. See ../rehearsal.json.

// PLANTED DEFECT (one half of the cycle): invoice imports customer, and
// customer imports invoice — an A<->B import cycle.
import { customerLabel } from './customer';

export interface Invoice {
  id: string;
  customerId: string;
  totalCents: number;
}

export function invoiceSummary(invoice: Invoice): string {
  return `Invoice ${invoice.id} for ${customerLabel(invoice.customerId)}: ${invoice.totalCents}c`;
}

export function invoiceTotal(invoice: Invoice): number {
  return invoice.totalCents;
}
