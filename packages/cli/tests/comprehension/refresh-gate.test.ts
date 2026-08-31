import { describe, it, expect } from 'vitest';
import {
  resolveRefreshJobGate,
  explainInactiveRefreshGate,
  type RefreshJobGateReason,
} from '../../src/comprehension/refresh-gate';

// #1689 / ADR 0110 §3 — the opt-in token-gated CI refresh gate. Three orthogonal
// signals AND-ed cheapest-first; the reported reason is the FIRST missing one.

describe('resolveRefreshJobGate — #1689 opt-in token gate', () => {
  const active = { ciMode: 'refresh' as const, isMainPass: true, credentialPresent: true };

  it('is ACTIVE only when refresh + main-pass + credential all hold', () => {
    expect(resolveRefreshJobGate(active)).toEqual({ active: true });
  });

  it("is OFF by default: ciMode 'verify' ⇒ inactive 'not-enabled' (before any other check)", () => {
    // Even with a credential on a main-pass, a default adopter never activates.
    expect(resolveRefreshJobGate({ ...active, ciMode: 'verify' })).toEqual({
      active: false,
      reason: 'not-enabled',
    });
  });

  it("ciMode 'off' ⇒ inactive 'not-enabled'", () => {
    expect(resolveRefreshJobGate({ ...active, ciMode: 'off' })).toEqual({
      active: false,
      reason: 'not-enabled',
    });
  });

  it("refresh but OFF the main-pass ⇒ inactive 'not-main-pass' (semantic belongs to main)", () => {
    expect(resolveRefreshJobGate({ ...active, isMainPass: false })).toEqual({
      active: false,
      reason: 'not-main-pass',
    });
  });

  it("refresh + main-pass but NO credential ⇒ inactive 'no-credential' (stays token-free)", () => {
    expect(resolveRefreshJobGate({ ...active, credentialPresent: false })).toEqual({
      active: false,
      reason: 'no-credential',
    });
  });

  it('reports the FIRST missing prerequisite when several are absent (not-enabled wins)', () => {
    expect(
      resolveRefreshJobGate({ ciMode: 'verify', isMainPass: false, credentialPresent: false })
    ).toEqual({ active: false, reason: 'not-enabled' });
  });

  it('reports not-main-pass before no-credential when enabled off the main-pass without a key', () => {
    expect(
      resolveRefreshJobGate({ ciMode: 'refresh', isMainPass: false, credentialPresent: false })
    ).toEqual({ active: false, reason: 'not-main-pass' });
  });
});

describe('explainInactiveRefreshGate — actionable, single-line reasons', () => {
  const reasons: RefreshJobGateReason[] = ['not-enabled', 'not-main-pass', 'no-credential'];

  it('returns a non-empty single-line message for every reason', () => {
    for (const r of reasons) {
      const msg = explainInactiveRefreshGate(r);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toContain('\n');
    }
  });

  it('the no-credential message names the provider-neutral secret options', () => {
    const msg = explainInactiveRefreshGate('no-credential');
    expect(msg).toContain('ANTHROPIC_API_KEY');
    expect(msg).toContain('HARNESS_ANALYSIS_BASE_URL');
    // Provider-neutral — never prescribes a single Claude model.
    expect(msg).toMatch(/OpenAI-compatible/);
  });

  it('the not-enabled message points at the comprehension.ci: refresh switch', () => {
    expect(explainInactiveRefreshGate('not-enabled')).toContain('comprehension.ci');
  });
});
