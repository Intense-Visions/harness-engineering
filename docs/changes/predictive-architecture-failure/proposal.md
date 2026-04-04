# Predictive Architecture Failure

**Keywords:** prediction, decay-trends, regression, extrapolation, forecasting, roadmap-impact, thresholds, stability

## Overview

Extrapolate architectural decay trends from the timeline plus planned roadmap features to predict which constraints will break and when. A standalone `PredictionEngine` consumes `TimelineFile` snapshots and roadmap data, applies weighted linear regression with recency bias per metric category, overlays spec-derived impact estimates for planned features, and produces per-category forecasts with tiered confidence. Surfaced via `harness predict` CLI command and `predict_failures` MCP tool.

### Goals

1. Per-category threshold crossing predictions — "complexity projected to exceed threshold by 2026-06-12 at current rate"
2. Roadmap-aware forecasting — "shipping features X, Y, Z accelerates coupling threshold crossing from week 14 to week 9"
3. Tiered confidence (high/medium/low) based on regression fit (R²) and snapshot count — transparent uncertainty
4. Spec-derived structural impact estimation — mechanical extraction of file count, layer references, dependency mentions, phase count from proposal files
5. Weighted linear regression with recency bias — recent snapshots matter more than old ones for trajectory estimation
6. CLI (`harness predict`) and MCP tool (`predict_failures`) surfaces matching existing `harness snapshot` / `get_decay_trends` pattern

### Out of Scope

- Multi-model regression selection (polynomial, exponential) — future upgrade path
- CI gate on predicted threshold crossings — defer until prediction accuracy is validated
- AI-assisted spec interpretation via Claude API — mechanical extraction only
- Prediction intervals / confidence ranges — tiered labels (high/medium/low) are sufficient for v1
- Historical analogy matching (using past feature outcomes as templates) — future enhancement

## Decisions

| #   | Decision                                                         | Rationale                                                                                                                                                                     |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Weighted linear regression with recency bias for extrapolation   | Balances simplicity with practical accuracy. Works with 3+ snapshots. Recency weighting handles trajectory changes (e.g., refactoring sprints). Upgrade to multi-model later. |
| D2  | Spec-derived structural heuristics for roadmap impact estimation | Mechanical extraction is deterministic, testable, auditable. No external LLM dependency. Follows harness pattern of preferring mechanical checks over AI inference.           |
| D3  | CLI + MCP tool surfaces (no CI gate initially)                   | Matches `harness snapshot` + `get_decay_trends` pattern. MCP tool makes agents architecture-aware during brainstorming/planning. CI gate deferred until accuracy validated.   |
| D4  | Tiered confidence (high/medium/low) via R² + snapshot count      | Always shows something useful. Transparent about uncertainty. High: R² >= 0.7 + 5 snapshots. Medium: R² >= 0.4 + 3 snapshots. Low: anything else.                             |
| D5  | Standalone PredictionEngine separate from TimelineManager        | Follows codebase pattern (adapters wrap stores). TimelineManager stays focused on capture/storage/trends. Regression math independently testable.                             |
| D6  | Regression math in its own module (`regression.ts`)              | Pure functions, no side effects, independently testable with synthetic data. Reusable if other features need trend fitting.                                                   |

## Technical Design

### 1. Core Types (`packages/core/src/architecture/prediction-types.ts`)

```typescript
/** Confidence tier for a prediction */
type ConfidenceTier = 'high' | 'medium' | 'low';

/** Regression result for a single metric category */
interface RegressionResult {
  slope: number; // rate of change per week
  intercept: number; // projected value at t=0
  rSquared: number; // goodness of fit (0-1)
  dataPoints: number; // snapshot count used
}

/** Per-category forecast */
interface CategoryForecast {
  category: ArchMetricCategory;
  current: number; // latest snapshot value
  threshold: number; // configured threshold
  projectedValue4w: number; // projected value in 4 weeks
  projectedValue8w: number; // projected value in 8 weeks
  projectedValue12w: number; // projected value in 12 weeks
  thresholdCrossingWeeks: number | null; // weeks until threshold crossed, null if never/improving
  confidence: ConfidenceTier;
  regression: RegressionResult;
  direction: 'improving' | 'stable' | 'declining';
}

/** Impact estimate from a single spec */
interface SpecImpactEstimate {
  specPath: string;
  featureName: string;
  signals: {
    newFileCount: number;
    affectedLayers: string[];
    newDependencies: number;
    phaseCount: number;
  };
  deltas: Partial<Record<ArchMetricCategory, number>>;
}

/** Roadmap-adjusted forecast for a single category */
interface AdjustedForecast {
  baseline: CategoryForecast;
  adjusted: CategoryForecast;
  contributingFeatures: Array<{
    name: string;
    specPath: string;
    delta: number;
  }>;
}

/** Full prediction result */
interface PredictionResult {
  generatedAt: string;
  snapshotsUsed: number;
  timelineRange: { from: string; to: string };
  stabilityForecast: {
    current: number;
    projected4w: number;
    projected8w: number;
    projected12w: number;
    confidence: ConfidenceTier;
    direction: 'improving' | 'stable' | 'declining';
  };
  categories: Record<ArchMetricCategory, AdjustedForecast>;
  warnings: PredictionWarning[];
}

/** Human-readable warning */
interface PredictionWarning {
  severity: 'critical' | 'warning' | 'info';
  category: ArchMetricCategory;
  message: string;
  weeksUntil: number;
  confidence: ConfidenceTier;
  contributingFeatures: string[];
}
```

### 2. Weighted Linear Regression (`packages/core/src/architecture/regression.ts`)

Pure math module with no harness type dependencies.

```typescript
interface DataPoint {
  t: number; // time (weeks from first snapshot)
  value: number; // metric value
  weight: number; // recency weight
}

interface RegressionFit {
  slope: number;
  intercept: number;
  rSquared: number;
  dataPoints: number;
}
```

**Functions:**

- `weightedLinearRegression(points: DataPoint[]): RegressionFit` — Weighted least squares. Weight decay: `w(i) = decay^(n - 1 - i)` where `i=0` is oldest, `i=n-1` is newest. Default decay = 0.85.
- `applyRecencyWeights(values, decay?): DataPoint[]` — Assign recency weights to time-ordered series.
- `projectValue(fit, t): number` — Project value at future time `t`.
- `weeksUntilThreshold(fit, currentT, threshold): number | null` — Weeks until projected value crosses threshold. Returns `null` if slope is zero/negative (improving or stable).
- `classifyConfidence(rSquared, dataPoints): ConfidenceTier` — High: R² >= 0.7 && 5+ points. Medium: R² >= 0.4 && 3+ points. Low: anything else.

**Weight decay:** For `n` snapshots, the newest gets weight 1.0, the second-newest gets 0.85, then 0.85², etc. A snapshot from 10 weeks ago has weight 0.85⁹ ~ 0.23 — still contributing but not dominating.

### 3. SpecImpactEstimator (`packages/core/src/architecture/spec-impact-estimator.ts`)

Mechanical extraction of structural signals from spec files.

```typescript
class SpecImpactEstimator {
  constructor(private rootDir: string, options?: EstimatorOptions);
  estimate(specPath: string): SpecImpactEstimate;
  estimateAll(features: Array<{ name: string; spec: string | null }>): SpecImpactEstimate[];
}
```

**Signal extraction rules:**

| Signal           | How Extracted                                                                             | Metric Mapping                                               |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| New files        | Count mentions of "new file", file paths in Technical Design sections not already on disk | `module-size` += count x 0.3, `complexity` += count x 1.5    |
| Affected layers  | Match layer names from `harness.config.json` mentioned in spec                            | `layer-violations` += cross-layer count x 0.5                |
| New dependencies | Count "import", "depend", "package" in dependency context                                 | `coupling` += count x 0.2, `dependency-depth` += count x 0.3 |
| Phase count      | Count H3/H4 headings under "Implementation" or numbered phases                            | `complexity` += (phases - 1) x 2.0                           |

Default coefficients are conservative estimates. Configurable via `harness.config.json` under `architecture.prediction.coefficients`.

### 4. PredictionEngine (`packages/core/src/architecture/prediction-engine.ts`)

Orchestrator combining regression and roadmap impact.

```typescript
class PredictionEngine {
  constructor(
    private rootDir: string,
    private timelineManager: TimelineManager,
    private estimator: SpecImpactEstimator
  );

  predict(options?: PredictionOptions): PredictionResult;
}

interface PredictionOptions {
  horizon?: number;                                    // weeks to forecast (default: 12)
  includeRoadmap?: boolean;                            // include roadmap impact (default: true)
  categories?: ArchMetricCategory[];                   // filter to specific categories
  thresholds?: Partial<Record<ArchMetricCategory, number>>;  // override thresholds
}
```

**Algorithm:**

1. Load timeline snapshots
2. For each category:
   a. Convert snapshots to time-series (weeks from first)
   b. Apply recency weights (decay = 0.85)
   c. Fit weighted linear regression
   d. Project values at 4w, 8w, 12w
   e. Compute threshold crossing date
   f. Classify confidence tier
3. If `includeRoadmap`:
   a. Parse roadmap for planned features with specs
   b. Estimate each feature's impact via SpecImpactEstimator
   c. Add impact deltas to baseline projections
   d. Recompute threshold crossings with adjusted trajectory
4. Generate warnings for any category projected to cross threshold
5. Compute composite stability forecast from category forecasts

**Warning severity rules:**

| Condition                                                | Severity                                |
| -------------------------------------------------------- | --------------------------------------- |
| Threshold crossing <= 4 weeks, confidence high or medium | `critical`                              |
| Threshold crossing <= 8 weeks, confidence high or medium | `warning`                               |
| Threshold crossing <= 12 weeks, any confidence           | `info`                                  |
| Roadmap feature accelerates crossing by >= 2 weeks       | Append contributing features to warning |

### 5. CLI Command (`packages/cli/src/commands/predict.ts`)

```bash
harness predict                        # Full prediction report
harness predict --category complexity  # Single category
harness predict --no-roadmap           # Baseline only (no spec impact)
harness predict --horizon 24           # 24-week forecast
harness predict --json                 # Machine-readable output
```

**Human-readable output:**

```
Architecture Prediction (12-week horizon, 8 snapshots)

  Stability: 82/100 -> projected 74/100 in 12w (medium confidence)

  Category          Current  Threshold  4w    8w    12w   Crossing    Confidence
  circular-deps         0        5       0     1      1   --          low
  layer-violations      2       10       3     4      5   --          medium
  complexity           47      100      55    63     71   ~14 weeks   high
  coupling           0.38        2    0.45  0.52   0.59   --          medium
  forbidden-imports     0        5       0     0      0   --          low
  module-size           1       10       2     2      3   --          medium
  dependency-depth      4       10       5     5      6   ~20 weeks   medium

  Warnings:
  [warning] complexity projected to exceed threshold (~14w, high confidence)
    Accelerated by: Spec-to-Implementation Traceability (+4.5), Skill Recommendation Engine (+3.0)
    Without planned features: ~18 weeks

  [info] dependency-depth projected to exceed threshold (~20w, medium confidence)
```

### 6. MCP Tool (`packages/cli/src/mcp/tools/predict-failures.ts`)

```typescript
{
  name: 'predict_failures',
  description: 'Predict which architectural constraints will break and when, based on decay trends and planned roadmap features',
  inputSchema: {
    path: string;                       // project root (required)
    horizon?: number;                   // weeks to forecast (default: 12)
    category?: ArchMetricCategory;      // filter to single category
    includeRoadmap?: boolean;           // include planned feature impact (default: true)
  }
}
```

Returns `PredictionResult` JSON. Agents use this during brainstorming to proactively surface architectural risk.

### 7. File Layout

```
packages/core/src/architecture/
  prediction-types.ts          # Types: PredictionResult, CategoryForecast, etc.
  regression.ts                # Pure math: weighted linear regression
  spec-impact-estimator.ts     # Structural signal extraction from specs
  prediction-engine.ts         # Orchestrator combining regression + roadmap
  index.ts                     # Updated barrel exports

packages/cli/src/commands/
  predict.ts                   # CLI command: harness predict

packages/cli/src/mcp/tools/
  predict-failures.ts          # MCP tool: predict_failures

packages/core/tests/architecture/
  regression.test.ts
  spec-impact-estimator.test.ts
  prediction-engine.test.ts

packages/cli/tests/commands/
  predict.test.ts

packages/cli/tests/mcp/tools/
  predict-failures.test.ts
```

## Success Criteria

1. `weightedLinearRegression` produces correct slope, intercept, and R² for known synthetic datasets (verified against hand-calculated values)
2. Recency weighting demonstrably shifts the regression line toward recent data points vs. unweighted regression on the same dataset
3. `classifyConfidence` returns `high` for R² >= 0.7 with 5+ points, `medium` for R² >= 0.4 with 3+ points, `low` otherwise
4. `weeksUntilThreshold` returns `null` for improving/stable trends and a positive number for declining trends
5. `SpecImpactEstimator` extracts correct signal counts from a spec with known structure (new files, layers, dependencies, phases)
6. Impact deltas are deterministic — same spec always produces same estimate
7. `PredictionEngine.predict()` returns baseline forecasts without roadmap when `includeRoadmap: false`
8. `PredictionEngine.predict()` returns adjusted forecasts that differ from baseline when planned features have specs
9. Warnings generated with correct severity: critical (<= 4w + high/medium confidence), warning (<= 8w), info (<= 12w)
10. `harness predict` CLI renders human-readable table with projections at 4w/8w/12w horizons
11. `harness predict --json` returns valid `PredictionResult` JSON
12. `predict_failures` MCP tool returns same `PredictionResult` structure as engine
13. Minimum viable: 3 snapshots produce a prediction (with low confidence); fewer than 3 returns an informative error
14. All 7 metric categories independently forecast — no category silently omitted

## Implementation Order

### Phase 1: Regression Math & Types

- `prediction-types.ts` — all type definitions with Zod schemas
- `regression.ts` — weighted linear regression, recency weights, projection, threshold crossing, confidence classification
- Full unit test suite with synthetic datasets

### Phase 2: PredictionEngine (Baseline)

- `prediction-engine.ts` — baseline prediction (no roadmap awareness)
- Loads timeline, regresses each category, produces `PredictionResult` with forecasts and warnings
- Unit tests with mock timeline data

### Phase 3: SpecImpactEstimator & Roadmap Integration

- `spec-impact-estimator.ts` — structural signal extraction and delta mapping
- Integrate into PredictionEngine for adjusted forecasts
- Tests with real and synthetic spec files

### Phase 4: CLI & MCP Surfaces

- `predict.ts` CLI command with table formatting and `--json` flag
- `predict-failures.ts` MCP tool registration
- Integration tests
