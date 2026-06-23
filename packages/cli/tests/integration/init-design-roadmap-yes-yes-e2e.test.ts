// packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts
//
// Phase 5 verification — yes/yes end-to-end happy path.
// Spec: docs/changes/init-design-roadmap-config/proposal.md (item #14).
// Plan: docs/changes/init-design-roadmap-config/plans/2026-05-03-phase5-verification-plan.md
//
// Asserts the four post-conditions of the (design=yes, roadmap=yes) branch:
//   (i)  design.enabled === true
//   (ii) docs/roadmap.md file exists
//   (iii) "Set up design system" feature is present
//   (iv) the milestone is `Current Work` and the entry's status is `planned`
//
// parseRoadmap is used for the structural check (more robust than substring).
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { parseRoadmap } from '@harness-engineering/core';
import { scaffoldInitFixture } from './_helpers/init-fixture';

describe('harness init — yes/yes end-to-end (spec #14)', () => {
  it('produces design.enabled=true, docs/roadmap.md, and a "Set up design system" planned entry under Current Work', async () => {
    const fixture = await scaffoldInitFixture({ design: 'yes', roadmap: 'yes' });
    const { configPath, roadmapPath, cleanup } = fixture;

    try {
      // Assertion (i): design.enabled === true
      const reReadConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(reReadConfig.design.enabled).toBe(true);
      expect(reReadConfig.design.platforms).toEqual(['web']);

      // Assertion (ii): docs/roadmap.md exists
      expect(fs.existsSync(roadmapPath)).toBe(true);

      // Assertion (iii) + (iv): structural roadmap parse
      const parseResult = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
      expect(parseResult.ok).toBe(true);
      if (!parseResult.ok) return;
      const roadmap = parseResult.value;

      const currentWork = roadmap.milestones.find((m) => m.name === 'Current Work');
      expect(currentWork).toBeDefined();

      const designItem = currentWork?.features.find((f) => f.name === 'Set up design system');
      expect(designItem).toBeDefined();
      expect(designItem?.status).toBe('planned');
    } finally {
      cleanup();
    }
  });
});
