import { describe, it, expect } from 'vitest';
import {
  HarnessConfigSchema,
  TelemetryConfigSchema,
  TelemetryExportOTLPSchema,
} from '../../src/config/schema';

// Phase 5 Task 8: harness.config.json must accept a `telemetry.export.otlp`
// section adjacent to the existing PostHog `telemetry.enabled` flag. The two
// systems are intentionally adjacent (single `telemetry` namespace, two
// independent sub-blocks) rather than duplicate top-level keys.

describe('TelemetryExportOTLPSchema', () => {
  it('accepts a minimal valid OTLP config (endpoint only)', () => {
    const result = TelemetryExportOTLPSchema.safeParse({
      endpoint: 'http://localhost:4318/v1/traces',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults populate when omitted.
      expect(result.data.enabled).toBe(true);
      expect(result.data.flushIntervalMs).toBe(2000);
      expect(result.data.batchSize).toBe(64);
    }
  });

  it('accepts a fully populated OTLP config with headers + tuned cadence', () => {
    const result = TelemetryExportOTLPSchema.safeParse({
      endpoint: 'https://collector.example.com/v1/traces',
      enabled: false,
      headers: { 'x-collector-auth': 'secret-token' },
      flushIntervalMs: 500,
      batchSize: 128,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headers).toEqual({ 'x-collector-auth': 'secret-token' });
      expect(result.data.flushIntervalMs).toBe(500);
      expect(result.data.batchSize).toBe(128);
    }
  });

  it('rejects an OTLP config missing endpoint', () => {
    const result = TelemetryExportOTLPSchema.safeParse({ enabled: true });
    expect(result.success).toBe(false);
  });

  it('rejects an OTLP config with non-URL endpoint', () => {
    const result = TelemetryExportOTLPSchema.safeParse({ endpoint: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects negative or zero flushIntervalMs / batchSize', () => {
    expect(
      TelemetryExportOTLPSchema.safeParse({
        endpoint: 'http://localhost:4318/v1/traces',
        flushIntervalMs: 0,
      }).success
    ).toBe(false);
    expect(
      TelemetryExportOTLPSchema.safeParse({
        endpoint: 'http://localhost:4318/v1/traces',
        batchSize: -1,
      }).success
    ).toBe(false);
  });
});

describe('TelemetryConfigSchema (PostHog + OTLP merge)', () => {
  it('keeps PostHog enabled flag and OTLP export as adjacent siblings', () => {
    const result = TelemetryConfigSchema.safeParse({
      enabled: true,
      export: {
        otlp: { endpoint: 'http://localhost:4318/v1/traces' },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.export?.otlp?.endpoint).toBe('http://localhost:4318/v1/traces');
    }
  });

  it('accepts the legacy shape (enabled flag only) — backward compatible', () => {
    const result = TelemetryConfigSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
      expect(result.data.export).toBeUndefined();
    }
  });

  it('accepts an empty telemetry block (defaults populate enabled=true)', () => {
    const result = TelemetryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });
});

describe('HarnessConfigSchema with telemetry.export.otlp', () => {
  it('accepts full harness config containing telemetry.export.otlp', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      telemetry: {
        enabled: true,
        export: {
          otlp: {
            endpoint: 'http://localhost:4318/v1/traces',
            headers: { authorization: 'Bearer xyz' },
            flushIntervalMs: 1000,
            batchSize: 32,
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.telemetry?.export?.otlp?.endpoint).toBe('http://localhost:4318/v1/traces');
      expect(result.data.telemetry?.export?.otlp?.batchSize).toBe(32);
    }
  });

  it('rejects harness config when telemetry.export.otlp omits endpoint', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      telemetry: {
        export: {
          // Endpoint missing — zod must reject because endpoint is required
          // even though the rest of the OTLP block is optional.
          otlp: { enabled: true },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts harness config with telemetry omitted entirely (no exporter)', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });
});
