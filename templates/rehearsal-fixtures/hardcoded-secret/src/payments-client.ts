// FIXTURE (deliberately broken): rehearse against `harness check-security`.
// Planted failure mode: leaked-secret. See ../rehearsal.json.

// PLANTED DEFECT: a live-looking API key is committed directly into source
// instead of being read from the environment. The value below is a fabricated
// placeholder, NOT a real credential.
const PAYMENTS_API_KEY = 'sk_live_REDACTED_EXAMPLE_not_a_real_key_000000000000';

export interface Charge {
  amountCents: number;
  currency: string;
}

export class PaymentsClient {
  constructor(private readonly apiKey: string) {}

  charge(charge: Charge): { ok: boolean } {
    // A real client would send the key in an Authorization header here.
    if (this.apiKey.length === 0) return { ok: false };
    return { ok: charge.amountCents > 0 };
  }
}

// PLANTED DEFECT: the hardcoded secret is passed straight in at module load.
export const paymentsClient = new PaymentsClient(PAYMENTS_API_KEY);
