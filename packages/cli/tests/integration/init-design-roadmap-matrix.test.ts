// packages/cli/tests/integration/init-design-roadmap-matrix.test.ts
//
// Phase 5 verification — design × roadmap 6-path matrix.
// Spec: docs/changes/init-design-roadmap-config/proposal.md (item #13).
// Plan: docs/changes/init-design-roadmap-config/plans/2026-05-03-phase5-verification-plan.md
//
// Approach (B): scaffold via runInit, then mutate harness.config.json + write
// docs/roadmap.md to simulate the post-step-5b / post-step-4 end state for
// each of the six (design × roadmap) answer combinations. Asserts the
// in-process runValidate returns ok+valid for every scenario.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { runValidate } from '../../src/commands/validate';
import { parseRoadmap } from '@harness-engineering/core';
import { scaffoldInitFixture } from './_helpers/init-fixture';

type DesignAnswer = 'yes' | 'no' | 'not-sure';
type RoadmapAnswer = 'yes' | 'no';

interface MatrixScenario {
  name: string;
  design: DesignAnswer;
  roadmap: RoadmapAnswer;
  expectedConfig: { enabled?: boolean; platforms?: string[] };
  expectRoadmapFile: boolean;
  expectDesignItemInRoadmap: boolean;
}

const scenarios: MatrixScenario[] = [
  {
    name: 'design=yes, roadmap=yes',
    design: 'yes',
    roadmap: 'yes',
    expectedConfig: { enabled: true, platforms: ['web'] },
    expectRoadmapFile: true,
    expectDesignItemInRoadmap: true,
  },
  {
    name: 'design=yes, roadmap=no',
    design: 'yes',
    roadmap: 'no',
    expectedConfig: { enabled: true, platforms: ['web'] },
    expectRoadmapFile: false,
    expectDesignItemInRoadmap: false,
  },
  {
    name: 'design=no, roadmap=yes',
    design: 'no',
    roadmap: 'yes',
    expectedConfig: { enabled: false },
    expectRoadmapFile: true,
    expectDesignItemInRoadmap: false,
  },
  {
    name: 'design=no, roadmap=no',
    design: 'no',
    roadmap: 'no',
    expectedConfig: { enabled: false },
    expectRoadmapFile: false,
    expectDesignItemInRoadmap: false,
  },
  {
    name: 'design=not-sure, roadmap=yes',
    design: 'not-sure',
    roadmap: 'yes',
    expectedConfig: {}, // no `enabled` field — absent
    expectRoadmapFile: true,
    expectDesignItemInRoadmap: false,
  },
  {
    name: 'design=not-sure, roadmap=no',
    design: 'not-sure',
    roadmap: 'no',
    expectedConfig: {}, // no `enabled` field — absent
    expectRoadmapFile: false,
    expectDesignItemInRoadmap: false,
  },
];

describe('harness init — design × roadmap matrix (6 paths)', () => {
  for (const scenario of scenarios) {
    it(`validates: ${scenario.name}`, async () => {
      const fixture = await scaffoldInitFixture({
        design: scenario.design,
        roadmap: scenario.roadmap,
      });
      const { tmpDir, configPath, roadmapPath, cleanup } = fixture;

      try {
        // Step 4: run in-process validate (use --configPath to anchor to tmpDir)
        const validateResult = await runValidate({ cwd: tmpDir, configPath });
        expect(validateResult.ok).toBe(true);
        if (!validateResult.ok) return;
        expect(validateResult.value.valid).toBe(true);

        // Step 5: structural assertions
        const reReadConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (scenario.expectedConfig.enabled === undefined) {
          expect(reReadConfig.design?.enabled).toBeUndefined();
        } else {
          expect(reReadConfig.design.enabled).toBe(scenario.expectedConfig.enabled);
        }
        if (scenario.expectedConfig.platforms) {
          expect(reReadConfig.design.platforms).toEqual(scenario.expectedConfig.platforms);
        }
        expect(fs.existsSync(roadmapPath)).toBe(scenario.expectRoadmapFile);

        // Step 6: roadmap-content assertions (spec #5: linked design item must
        // NOT appear when either answer is no/not-sure). For scenarios that
        // write a roadmap but should NOT contain the "Set up design system"
        // entry, parse the file and assert the feature is genuinely absent.
        // (For scenarios with no roadmap, file-existence assertion above
        // already proves absence.)
        if (scenario.expectRoadmapFile) {
          const parseResult = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
          expect(parseResult.ok).toBe(true);
          if (!parseResult.ok) return;
          const allFeatures = parseResult.value.milestones.flatMap((m) => m.features);
          const designItem = allFeatures.find((f) => f.name === 'Set up design system');
          if (scenario.expectDesignItemInRoadmap) {
            expect(designItem).toBeDefined();
          } else {
            expect(designItem).toBeUndefined();
          }
        }
      } finally {
        cleanup();
      }
    });
  }
});
