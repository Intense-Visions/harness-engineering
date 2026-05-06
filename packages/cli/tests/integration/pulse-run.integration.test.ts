/**
 * End-to-end integration test for `harness pulse run`.
 *
 * Exercises the full sanitization chain by registering a custom adapter that
 * intentionally emits PII (`email: 'x@y.com'`) as raw output. Verifies that:
 *   - The report file is written under the configured outputDir.
 *   - All 4 sections (Headlines, Usage, System performance, Followups) appear.
 *   - The report is <=40 lines.
 *   - Zero references to `email` or the PII value survive into the report —
 *     proving the three-layer sanitization (adapter.sanitize allowlist +
 *     orchestrator assertSanitized + final regex sweep) holds end-to-end.
 *   - The returned PulseRunStatus has the expected non-interactive shape.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerPulseAdapter,
  clearPulseAdapters,
  registerMockAdapter,
  ALLOWED_FIELD_KEYS,
  PII_FIELD_DENYLIST,
} from '@harness-engineering/core';
import type { PulseAdapter, SanitizedResult } from '@harness-engineering/types';
import { runPulseRunCommand } from '../../src/commands/pulse/run';

describe('pulse run end-to-end integration', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pulse-run-e2e-'));
    clearPulseAdapters();
    // Re-register the mock so consumers can still resolve 'mock' if needed.
    registerMockAdapter();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    clearPulseAdapters();
  });

  function writeConfig(adapterName: string): string {
    const path = join(tmp, 'harness.config.json');
    writeFileSync(
      path,
      JSON.stringify(
        {
          version: 1,
          name: 'integration-test',
          layers: [],
          forbiddenImports: [],
          pulse: {
            enabled: true,
            lookbackDefault: '24h',
            primaryEvent: 'click',
            valueEvent: 'value',
            completionEvents: [],
            qualityScoring: false,
            qualityDimension: null,
            sources: {
              analytics: adapterName,
              tracing: null,
              payments: null,
              db: { enabled: false },
            },
            metricSourceOverrides: {},
            pendingMetrics: [],
            excludedMetrics: [],
          },
        },
        null,
        2
      )
    );
    return path;
  }

  it('produces a sanitized report file with all 4 sections, <=40 lines, and zero PII', async () => {
    // Register an adapter that intentionally plants PII in its raw output.
    // The sanitize() function correctly drops PII (allowlist + denylist),
    // exercising the first two sanitization layers; the final report sweep is
    // the third.
    const ALLOWED = new Set(ALLOWED_FIELD_KEYS);
    const leakyButCleaningAdapter: PulseAdapter = {
      query: async () => ({
        event_name: 'planted-event',
        count: 7,
        email: 'x@y.com', // <- planted PII
        user_id: 'u-planted', // <- planted PII
      }),
      sanitize: (raw: unknown): SanitizedResult => {
        const fields: Record<string, unknown> = {};
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (PII_FIELD_DENYLIST.test(k)) continue;
            if (!ALLOWED.has(k)) continue;
            fields[k] = v;
          }
        }
        return { fields: fields as SanitizedResult['fields'], distributions: {} };
      },
    };
    registerPulseAdapter('planted', leakyButCleaningAdapter);

    const configPath = writeConfig('planted');
    const outputDir = join(tmp, 'reports');

    const status = await runPulseRunCommand({
      configPath,
      outputDir,
      nonInteractive: true,
      lookback: '24h',
    });

    // Status shape
    expect(status.status).toBe('success');
    expect(status.path).toBeDefined();
    expect(status.sourcesQueried).toEqual(['planted']);
    expect(status.sourcesSkipped).toEqual([]);
    expect(typeof status.durationMs).toBe('number');
    expect(typeof status.headlinesSummary).toBe('string');

    // File exists with expected naming pattern
    const files = readdirSync(outputDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md$/);

    // Report content
    const body = readFileSync(status.path!, 'utf-8');
    const lines = body.split('\n');
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(body).toContain('## Headlines');
    expect(body).toContain('## Usage');
    expect(body).toContain('## System performance');
    expect(body).toContain('## Followups');

    // Zero PII references survive end-to-end.
    expect(body).not.toMatch(/email/i);
    expect(body).not.toMatch(/x@y\.com/);
    expect(body).not.toMatch(/user_id/i);
    expect(body).not.toMatch(/u-planted/);
  });
});
