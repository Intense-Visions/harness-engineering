/**
 * Generic VerifierRegistry — orchestrator iterates registered verifiers
 * via the just-extracted Verifier<F> interface. Adding a 5th verifier
 * requires only a registration call; zero orchestrator changes.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Verifier registry).
 */

import type { Verifier } from '../shared/verifier.js';

export interface VerifierRunInput {
  path: string;
  mode?: 'fast' | 'full';
  files?: string[];
  designStrictness?: 'strict' | 'standard' | 'permissive';
}

export type VerifierRunner<F = unknown> = (input: VerifierRunInput) => Promise<Verifier<F>>;

export interface RegisteredVerifier<F = unknown> {
  name: string;
  runner: VerifierRunner<F>;
}

export class VerifierRegistry {
  private verifiers: RegisteredVerifier[] = [];

  register<F>(name: string, runner: VerifierRunner<F>): void {
    this.verifiers.push({ name, runner: runner as VerifierRunner });
  }

  list(): readonly RegisteredVerifier[] {
    return this.verifiers;
  }

  size(): number {
    return this.verifiers.length;
  }
}
