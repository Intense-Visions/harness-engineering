// packages/cli/src/responsive/probe.ts
//
// Mechanical responsive gate for the design-craft award-bar verdict.
//
// This is a FLOOR-layer detector (sibling of src/drift, src/brand,
// src/audit) — pure, mechanical, no LLM. It turns a target's rendered
// layout metrics at a mobile width into a pass/fail gate result that
// `awardBar` composes with its aesthetic verdict (see
// design-craft/phases/award-bar.ts:applyResponsiveGate).
//
// Why metrics, not a screenshot: the defects this catches — horizontal
// overflow, an unreachable primary nav — are layout facts (scrollWidth,
// element visibility) that a pixel image cannot answer. The CLI ships no
// browser; callers (or the Playwright MCP) render the target at the mobile
// width and emit these metrics as a JSON manifest.
//
// Spec: docs/changes/design-craft-responsive-gate/proposal.md (Decisions D1–D4).

export type ResponsiveDefectKind = 'horizontal-overflow' | 'unreachable-nav';

export interface ResponsiveDefect {
  kind: ResponsiveDefectKind;
  /** Human-readable specifics, e.g. "content overflows 47px at 390px width". */
  detail: string;
  /** The viewport width (px) the defect was observed at. */
  viewport: number;
}

export type ResponsiveStatus = 'clean' | 'defective' | 'not-evaluated';

export interface ResponsiveGateResult {
  status: ResponsiveStatus;
  /** Width evaluated (px). Absent when `not-evaluated`. */
  viewport?: number;
  defects: ResponsiveDefect[];
}

/**
 * One target's rendered layout metrics — the manifest entry a caller (or the
 * Playwright MCP) emits per benchmarked file. Matched to a target by `file`.
 */
export interface ResponsiveMetrics {
  file: string;
  /** Width the target was rendered at (px). */
  viewport: number;
  /** `document.documentElement.scrollWidth` at that width. */
  documentScrollWidth: number;
  /** The viewport width itself (px) — echoed so overflow is self-contained. */
  viewportWidth: number;
  /** Whether a primary navigation is visibly rendered at this width. */
  primaryNavVisible: boolean;
  /** Whether a visible menu/hamburger control exists at this width. */
  menuToggleVisible: boolean;
}

export interface ResponsiveGateConfig {
  /** Mobile width to evaluate (px). */
  viewport: number;
  /** Overflow above this many px counts as a defect (absorbs sub-pixel rounding). */
  overflowTolerancePx: number;
}

export const DEFAULT_RESPONSIVE_GATE_CONFIG: ResponsiveGateConfig = {
  viewport: 390,
  overflowTolerancePx: 1,
};

/** The gate result when no metrics were supplied — used as the AwardBar default. */
export const NOT_EVALUATED_RESPONSIVE: ResponsiveGateResult = {
  status: 'not-evaluated',
  defects: [],
};

/** Merge a partial config over the defaults. */
export function resolveResponsiveGateConfig(
  partial?: Partial<ResponsiveGateConfig>
): ResponsiveGateConfig {
  return { ...DEFAULT_RESPONSIVE_GATE_CONFIG, ...(partial ?? {}) };
}

/**
 * Compute the responsive gate for one target from its rendered layout metrics.
 *
 * @param metrics The target's metrics, or `undefined` when no render was
 *                supplied (→ `not-evaluated`).
 * @param config  Partial config merged over {@link DEFAULT_RESPONSIVE_GATE_CONFIG}.
 */
export function computeResponsiveGate(
  metrics: ResponsiveMetrics | undefined,
  config?: Partial<ResponsiveGateConfig>
): ResponsiveGateResult {
  if (metrics === undefined) {
    return { ...NOT_EVALUATED_RESPONSIVE };
  }
  const cfg = resolveResponsiveGateConfig(config);

  // Trust guard: a malformed manifest entry (missing/NaN numbers, non-boolean
  // visibility flags) must never masquerade as a defect OR a pass. The probe
  // command path validates field types, but direct `responsiveMetrics` callers
  // are only TS-checked — stay robust at the floor.
  if (
    !Number.isFinite(metrics.documentScrollWidth) ||
    !Number.isFinite(metrics.viewportWidth) ||
    typeof metrics.primaryNavVisible !== 'boolean' ||
    typeof metrics.menuToggleVisible !== 'boolean'
  ) {
    return { ...NOT_EVALUATED_RESPONSIVE };
  }

  // Width guard: the gate certifies MOBILE behavior, so the metrics must have
  // been rendered at (or below) the configured mobile viewport. A desktop-width
  // render that reports no overflow is not "mobile-clean" — it is
  // `not-evaluated`. (A narrower-than-configured render is still mobile and is
  // accepted; overflow there is a real defect.) This is what makes `cfg.viewport`
  // load-bearing rather than advisory.
  if (metrics.viewportWidth > cfg.viewport) {
    return { ...NOT_EVALUATED_RESPONSIVE };
  }

  const defects: ResponsiveDefect[] = [];
  const viewport = metrics.viewport;

  const overflowPx = Math.max(0, metrics.documentScrollWidth - metrics.viewportWidth);
  if (overflowPx > cfg.overflowTolerancePx) {
    defects.push({
      kind: 'horizontal-overflow',
      detail: `content overflows ${overflowPx}px at ${viewport}px width`,
      viewport,
    });
  }

  if (!metrics.primaryNavVisible && !metrics.menuToggleVisible) {
    defects.push({
      kind: 'unreachable-nav',
      detail: `primary navigation is not reachable at ${viewport}px width (no visible nav and no menu toggle)`,
      viewport,
    });
  }

  return {
    status: defects.length > 0 ? 'defective' : 'clean',
    viewport,
    defects,
  };
}
