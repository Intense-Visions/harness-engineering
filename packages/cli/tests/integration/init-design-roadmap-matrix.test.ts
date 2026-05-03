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
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../src/commands/init';
import { runValidate } from '../../src/commands/validate';
import { serializeRoadmap } from '@harness-engineering/core';

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

function nowIso(): string {
  return new Date().toISOString();
}

describe('harness init — design × roadmap matrix (6 paths)', () => {
  for (const scenario of scenarios) {
    it(`validates: ${scenario.name}`, async () => {
      const slug = scenario.name.replace(/[=,\s]/g, '-');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-matrix-${slug}-`));

      try {
        // Step 1: scaffold base project
        const initResult = await runInit({ cwd: tmpDir, name: 'matrix-test', level: 'basic' });
        expect(initResult.ok).toBe(true);
        if (!initResult.ok) return;

        // Step 2: simulate post-step-5b config mutation
        const configPath = path.join(tmpDir, 'harness.config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (scenario.design === 'yes') {
          config.design = { ...(config.design ?? {}), enabled: true, platforms: ['web'] };
        } else if (scenario.design === 'no') {
          config.design = { ...(config.design ?? {}), enabled: false };
        }
        // not-sure: leave config.design untouched (no `enabled` field).
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Step 3: simulate post-step-4 roadmap creation
        if (scenario.roadmap === 'yes') {
          const docsDir = path.join(tmpDir, 'docs');
          fs.mkdirSync(docsDir, { recursive: true });
          const features = scenario.expectDesignItemInRoadmap
            ? [
                {
                  name: 'Set up design system',
                  status: 'planned' as const,
                  spec: null,
                  plans: [],
                  blockedBy: [],
                  summary:
                    'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens.',
                  assignee: null,
                  priority: null,
                  externalId: null,
                  updatedAt: null,
                },
              ]
            : [];
          const roadmapContent = serializeRoadmap({
            frontmatter: {
              project: 'matrix-test',
              version: 1,
              lastSynced: nowIso(),
              lastManualEdit: nowIso(),
            },
            milestones: [
              {
                name: 'Current Work',
                isBacklog: false,
                features,
              },
            ],
            assignmentHistory: [],
          });
          fs.writeFileSync(path.join(docsDir, 'roadmap.md'), roadmapContent);
        }

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
        expect(fs.existsSync(path.join(tmpDir, 'docs', 'roadmap.md'))).toBe(
          scenario.expectRoadmapFile
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
});
