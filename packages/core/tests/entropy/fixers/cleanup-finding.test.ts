import { describe, it, expect } from 'vitest';
import {
  classifyFinding,
  applyHotspotDowngrade,
  markProtectedFindings,
  deduplicateCleanupFindings,
} from '../../../src/entropy/fixers/cleanup-finding';
import { createRegionMap } from '../../../src/annotations';
import type { CleanupFinding, HotspotContext } from '../../../src/entropy/types';

describe('classifyFinding', () => {
  it('should classify dead export as safe when non-public', () => {
    const finding = classifyFinding({
      concern: 'dead-code',
      file: 'src/utils.ts',
      type: 'dead-export',
      description: 'unusedHelper has zero importers',
      isPublicApi: false,
    });

    expect(finding.safety).toBe('safe');
    expect(finding.hotspotDowngraded).toBe(false);
  });

  it('should classify dead export as unsafe when public API', () => {
    const finding = classifyFinding({
      concern: 'dead-code',
      file: 'src/index.ts',
      type: 'dead-export',
      description: 'exported from entry point',
      isPublicApi: true,
    });

    expect(finding.safety).toBe('unsafe');
  });

  it('should classify forbidden import with alternative as probably-safe', () => {
    const finding = classifyFinding({
      concern: 'architecture',
      file: 'src/service.ts',
      type: 'forbidden-import',
      description: "forbidden import 'node:fs'",
      hasAlternative: true,
    });

    expect(finding.safety).toBe('probably-safe');
  });

  it('should classify upward dependency as unsafe', () => {
    const finding = classifyFinding({
      concern: 'architecture',
      file: 'src/repo.ts',
      type: 'upward-dependency',
      description: 'repo imports from UI',
      hasAlternative: false,
    });

    expect(finding.safety).toBe('unsafe');
  });
});

describe('applyHotspotDowngrade', () => {
  it('should downgrade safe to probably-safe for high-churn files', () => {
    const finding: CleanupFinding = {
      id: 'dc-1',
      concern: 'dead-code',
      file: 'src/hot-file.ts',
      type: 'dead-export',
      description: 'test',
      safety: 'safe',
      safetyReason: 'zero importers, non-public',
      hotspotDowngraded: false,
      suggestion: 'Remove export',
    };

    const hotspot: HotspotContext = {
      churnMap: new Map([['src/hot-file.ts', 50]]),
      topPercentileThreshold: 30,
    };

    const result = applyHotspotDowngrade(finding, hotspot);
    expect(result.safety).toBe('probably-safe');
    expect(result.hotspotDowngraded).toBe(true);
  });

  it('should not downgrade already unsafe findings', () => {
    const finding: CleanupFinding = {
      id: 'dc-2',
      concern: 'dead-code',
      file: 'src/hot-file.ts',
      type: 'dead-internal',
      description: 'test',
      safety: 'unsafe',
      safetyReason: 'cannot determine callers',
      hotspotDowngraded: false,
      suggestion: 'Manual review',
    };

    const hotspot: HotspotContext = {
      churnMap: new Map([['src/hot-file.ts', 50]]),
      topPercentileThreshold: 30,
    };

    const result = applyHotspotDowngrade(finding, hotspot);
    expect(result.safety).toBe('unsafe');
    expect(result.hotspotDowngraded).toBe(false);
  });
});

describe('deduplicateCleanupFindings', () => {
  it('should merge dead import that is also a forbidden import into one finding', () => {
    const findings: CleanupFinding[] = [
      {
        id: 'dc-1',
        concern: 'dead-code',
        file: 'src/service.ts',
        line: 3,
        type: 'unused-import',
        description: "Unused import from '../mcp-server'",
        safety: 'safe',
        safetyReason: 'zero references',
        hotspotDowngraded: false,
        fixAction: 'remove import',
        suggestion: 'Remove unused import',
      },
      {
        id: 'arch-1',
        concern: 'architecture',
        file: 'src/service.ts',
        line: 3,
        type: 'forbidden-import',
        description: "Forbidden import '../mcp-server'",
        safety: 'unsafe',
        safetyReason: 'no alternative configured',
        hotspotDowngraded: false,
        fixAction: undefined,
        suggestion: 'Restructure to avoid this import',
      },
    ];

    const deduped = deduplicateCleanupFindings(findings);
    expect(deduped.length).toBe(1);
    expect(deduped[0].concern).toBe('dead-code');
    expect(deduped[0].description).toContain('also violates architecture');
  });
});

describe('markProtectedFindings', () => {
  it('should mark finding in protected region as protected', () => {
    const findings: CleanupFinding[] = [
      {
        id: 'dc-1',
        concern: 'dead-code',
        file: 'src/compliance.ts',
        line: 5,
        type: 'dead-export',
        description: 'unusedFn has zero importers',
        safety: 'safe',
        safetyReason: 'zero importers, non-public',
        hotspotDowngraded: false,
        suggestion: 'Remove export',
      },
    ];

    const regions = createRegionMap([
      {
        file: 'src/compliance.ts',
        startLine: 3,
        endLine: 10,
        scopes: ['entropy'],
        reason: 'SOX audit requirement',
        type: 'block',
      },
    ]);

    const result = markProtectedFindings(findings, regions);
    expect(result).toHaveLength(1);
    expect(result[0].safety).toBe('protected');
    expect(result[0].safetyReason).toContain('SOX audit requirement');
  });

  it('should not mark finding outside protected region', () => {
    const findings: CleanupFinding[] = [
      {
        id: 'dc-2',
        concern: 'dead-code',
        file: 'src/utils.ts',
        line: 5,
        type: 'dead-export',
        description: 'unused',
        safety: 'safe',
        safetyReason: 'zero importers',
        hotspotDowngraded: false,
        suggestion: 'Remove export',
      },
    ];

    const regions = createRegionMap([
      {
        file: 'src/other.ts',
        startLine: 1,
        endLine: 10,
        scopes: ['entropy'],
        reason: 'protected',
        type: 'block',
      },
    ]);

    const result = markProtectedFindings(findings, regions);
    expect(result[0].safety).toBe('safe');
  });

  it('should not modify findings when no regions match', () => {
    const findings: CleanupFinding[] = [
      {
        id: 'dc-3',
        concern: 'dead-code',
        file: 'src/utils.ts',
        line: 5,
        type: 'dead-export',
        description: 'unused',
        safety: 'safe',
        safetyReason: 'zero importers',
        hotspotDowngraded: false,
        suggestion: 'Remove export',
      },
    ];

    const regions = createRegionMap([]);

    const result = markProtectedFindings(findings, regions);
    expect(result[0].safety).toBe('safe');
  });

  it('should use architecture scope for architecture findings', () => {
    const findings: CleanupFinding[] = [
      {
        id: 'arch-1',
        concern: 'architecture',
        file: 'src/vendor.ts',
        line: 3,
        type: 'forbidden-import',
        description: 'forbidden import',
        safety: 'unsafe',
        safetyReason: 'no alternative',
        hotspotDowngraded: false,
        suggestion: 'Fix import',
      },
    ];

    const regions = createRegionMap([
      {
        file: 'src/vendor.ts',
        startLine: 1,
        endLine: 10,
        scopes: ['architecture'],
        reason: 'vendor-locked',
        type: 'block',
      },
    ]);

    const result = markProtectedFindings(findings, regions);
    expect(result[0].safety).toBe('protected');
  });
});
