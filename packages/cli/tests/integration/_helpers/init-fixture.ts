// packages/cli/tests/integration/_helpers/init-fixture.ts
//
// Shared scaffold for the design × roadmap integration tests
// (init-design-roadmap-matrix.test.ts × 6, init-design-roadmap-yes-yes-e2e.test.ts × 1).
//
// Extracted from the inline mkdtemp + writeFileSync('harness.config.json') +
// writeFileSync('docs/roadmap.md') blocks that were duplicated across both tests
// before init-design-roadmap-polish Phase 3 (FINAL-S1).
//
// The helper produces the post-step-5b config state and post-step-4 roadmap state
// for a given (design, roadmap) scenario. No mutation logic beyond what the inline
// scaffolds did. Returns a cleanup() callback for the test's finally block.
//
// Spec: docs/changes/init-design-roadmap-polish/proposal.md (FINAL-S1, D6, D7).
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../../src/commands/init';
import { serializeRoadmap } from '@harness-engineering/core';

export interface InitFixtureScenario {
  design: 'yes' | 'no' | 'not-sure';
  roadmap: 'yes' | 'no';
}

export interface InitFixtureHandle {
  tmpDir: string;
  configPath: string;
  roadmapPath: string;
  cleanup: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function scaffoldInitFixture(
  scenario: InitFixtureScenario
): Promise<InitFixtureHandle> {
  const slug = `${scenario.design}-${scenario.roadmap}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-init-fixture-${slug}-`));

  // Step 1: scaffold base project (parity with matrix Step 1 + e2e Step 1).
  const initResult = await runInit({ cwd: tmpDir, name: 'init-fixture', level: 'basic' });
  if (!initResult.ok) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(
      `scaffoldInitFixture: runInit failed for scenario ${slug}: ${JSON.stringify(initResult)}`
    );
  }

  // Step 2: simulate post-step-5b config mutation (parity with matrix Step 2).
  const configPath = path.join(tmpDir, 'harness.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (scenario.design === 'yes') {
    config.design = { ...(config.design ?? {}), enabled: true, platforms: ['web'] };
  } else if (scenario.design === 'no') {
    config.design = { ...(config.design ?? {}), enabled: false };
  }
  // 'not-sure': leave config.design untouched (no `enabled` field).
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Step 3: simulate post-step-4 roadmap creation (parity with matrix Step 3).
  const roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
  if (scenario.roadmap === 'yes') {
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    const includeDesignItem = scenario.design === 'yes';
    const features = includeDesignItem
      ? [
          {
            name: 'Set up design system',
            status: 'planned' as const,
            spec: null,
            plans: [],
            blockedBy: [],
            summary:
              'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens. Deferred from project init — fires on first design-touching feature via on_new_feature.',
            assignee: null,
            priority: null,
            externalId: null,
            updatedAt: null,
          },
        ]
      : [];
    const roadmapContent = serializeRoadmap({
      frontmatter: {
        project: 'init-fixture',
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
    fs.writeFileSync(roadmapPath, roadmapContent);
  }

  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { tmpDir, configPath, roadmapPath, cleanup };
}
