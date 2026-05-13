import { describe, it, expect } from 'vitest';
import { WHATWG_BAD_PORTS, isBadPort, assertPortUsable } from '../../src/shared/port';

describe('WHATWG_BAD_PORTS', () => {
  it('contains canonical entries from the WHATWG fetch spec', () => {
    expect(WHATWG_BAD_PORTS).toContain(22); // ssh
    expect(WHATWG_BAD_PORTS).toContain(25); // smtp
    expect(WHATWG_BAD_PORTS).toContain(6000); // X11
    expect(WHATWG_BAD_PORTS).toContain(10080); // amanda — the port that broke #287
  });

  it('is frozen so callers cannot mutate it', () => {
    expect(Object.isFrozen(WHATWG_BAD_PORTS)).toBe(true);
  });
});

describe('isBadPort', () => {
  it('returns true for ports on the WHATWG list', () => {
    expect(isBadPort(10080)).toBe(true);
    expect(isBadPort(6666)).toBe(true);
  });

  it('returns false for ports not on the list', () => {
    expect(isBadPort(10081)).toBe(false);
    expect(isBadPort(8080)).toBe(false);
    expect(isBadPort(3000)).toBe(false);
    expect(isBadPort(65535)).toBe(false);
  });
});

describe('assertPortUsable', () => {
  it('returns without throwing for a usable port', () => {
    expect(() => assertPortUsable(8080)).not.toThrow();
    expect(() => assertPortUsable(10081, 'orchestrator')).not.toThrow();
  });

  it('throws with an actionable message for a bad port', () => {
    expect(() => assertPortUsable(10080, 'orchestrator')).toThrowError(
      /Refusing to bind orchestrator to port 10080/
    );
    expect(() => assertPortUsable(10080, 'orchestrator')).toThrowError(/bad-ports list/);
    expect(() => assertPortUsable(10080, 'orchestrator')).toThrowError(
      /fetch.spec.whatwg.org\/#port-blocking/
    );
  });

  it('uses the default label when none is provided', () => {
    expect(() => assertPortUsable(10080)).toThrowError(/Refusing to bind server to port 10080/);
  });
});
