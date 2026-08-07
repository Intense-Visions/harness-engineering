// packages/cli/tests/responsive/probe.test.ts
//
// Unit tests for the mechanical responsive gate.

import { describe, it, expect } from 'vitest';
import {
  computeResponsiveGate,
  resolveResponsiveGateConfig,
  DEFAULT_RESPONSIVE_GATE_CONFIG,
} from '../../src/responsive/probe.js';
import type { ResponsiveMetrics } from '../../src/responsive/probe.js';

function metrics(overrides: Partial<ResponsiveMetrics> = {}): ResponsiveMetrics {
  return {
    file: 'Page.tsx',
    viewport: 390,
    documentScrollWidth: 390,
    viewportWidth: 390,
    primaryNavVisible: true,
    menuToggleVisible: false,
    ...overrides,
  };
}

describe('resolveResponsiveGateConfig', () => {
  it('defaults to 390 / 1px', () => {
    expect(resolveResponsiveGateConfig()).toEqual(DEFAULT_RESPONSIVE_GATE_CONFIG);
    expect(DEFAULT_RESPONSIVE_GATE_CONFIG).toEqual({ viewport: 390, overflowTolerancePx: 1 });
  });
  it('merges a partial', () => {
    expect(resolveResponsiveGateConfig({ viewport: 360 })).toEqual({
      viewport: 360,
      overflowTolerancePx: 1,
    });
  });
});

describe('computeResponsiveGate', () => {
  it('is not-evaluated when no metrics are supplied', () => {
    const r = computeResponsiveGate(undefined);
    expect(r.status).toBe('not-evaluated');
    expect(r.defects).toEqual([]);
    expect(r.viewport).toBeUndefined();
  });

  it('is clean when there is no overflow and nav is reachable', () => {
    const r = computeResponsiveGate(metrics({ documentScrollWidth: 390, primaryNavVisible: true }));
    expect(r.status).toBe('clean');
    expect(r.defects).toEqual([]);
    expect(r.viewport).toBe(390);
  });

  it('flags horizontal-overflow when scrollWidth exceeds viewport beyond tolerance', () => {
    const r = computeResponsiveGate(metrics({ documentScrollWidth: 437, viewportWidth: 390 }));
    expect(r.status).toBe('defective');
    const d = r.defects.find((x) => x.kind === 'horizontal-overflow');
    expect(d).toBeDefined();
    expect(d!.detail).toContain('47px');
    expect(d!.viewport).toBe(390);
  });

  it('does not flag overflow within tolerance (sub-pixel rounding)', () => {
    // 1px overflow with default tolerance 1 → not a defect (strictly greater).
    const r = computeResponsiveGate(metrics({ documentScrollWidth: 391, viewportWidth: 390 }));
    expect(r.status).toBe('clean');
  });

  it('flags unreachable-nav when neither a nav nor a menu toggle is visible', () => {
    const r = computeResponsiveGate(
      metrics({ primaryNavVisible: false, menuToggleVisible: false })
    );
    expect(r.status).toBe('defective');
    expect(r.defects.map((d) => d.kind)).toContain('unreachable-nav');
  });

  it('treats a hidden nav WITH a visible menu toggle as reachable (clean)', () => {
    const r = computeResponsiveGate(metrics({ primaryNavVisible: false, menuToggleVisible: true }));
    expect(r.status).toBe('clean');
    expect(r.defects).toEqual([]);
  });

  it('reports both defects together', () => {
    const r = computeResponsiveGate(
      metrics({
        documentScrollWidth: 465,
        viewportWidth: 390,
        primaryNavVisible: false,
        menuToggleVisible: false,
      })
    );
    expect(r.status).toBe('defective');
    expect(r.defects.map((d) => d.kind).sort()).toEqual(['horizontal-overflow', 'unreachable-nav']);
  });

  it('honors a custom overflow tolerance', () => {
    // 40px overflow with tolerance 50 → clean.
    const r = computeResponsiveGate(metrics({ documentScrollWidth: 430, viewportWidth: 390 }), {
      overflowTolerancePx: 50,
    });
    expect(r.status).toBe('clean');
  });

  it('is not-evaluated when the render was wider than the configured mobile viewport', () => {
    // A desktop-width render must not falsely pass as mobile-clean.
    const r = computeResponsiveGate(
      metrics({ viewport: 1280, viewportWidth: 1280, documentScrollWidth: 1280 })
    );
    expect(r.status).toBe('not-evaluated');
  });

  it('accepts a render narrower than the configured viewport', () => {
    const r = computeResponsiveGate(
      metrics({ viewport: 360, viewportWidth: 360, documentScrollWidth: 360 })
    );
    expect(r.status).toBe('clean');
  });

  it('is not-evaluated when metrics are malformed (NaN width)', () => {
    const bad = metrics({ documentScrollWidth: Number.NaN });
    expect(computeResponsiveGate(bad).status).toBe('not-evaluated');
  });
});
