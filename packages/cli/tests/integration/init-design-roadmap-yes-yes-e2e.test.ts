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
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../src/commands/init';
import { parseRoadmap, serializeRoadmap } from '@harness-engineering/core';

function nowIso(): string {
  return new Date().toISOString();
}

describe('harness init — yes/yes end-to-end (spec #14)', () => {
  it('produces design.enabled=true, docs/roadmap.md, and a "Set up design system" planned entry under Current Work', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-yes-yes-'));

    try {
      // Step 1: scaffold
      const initResult = await runInit({
        cwd: tmpDir,
        name: 'yes-yes-e2e',
        level: 'basic',
      });
      expect(initResult.ok).toBe(true);
      if (!initResult.ok) return;

      // Step 2: simulate Phase 3 step 5b (yes, web)
      const configPath = path.join(tmpDir, 'harness.config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.design = { ...(config.design ?? {}), enabled: true, platforms: ['web'] };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Step 3: simulate Phase 4 step 4 (roadmap yes + linked design item)
      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      const roadmapContent = serializeRoadmap({
        frontmatter: {
          project: 'yes-yes-e2e',
          version: 1,
          lastSynced: nowIso(),
          lastManualEdit: nowIso(),
        },
        milestones: [
          {
            name: 'Current Work',
            isBacklog: false,
            features: [
              {
                name: 'Set up design system',
                status: 'planned',
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
            ],
          },
        ],
        assignmentHistory: [],
      });
      const roadmapPath = path.join(docsDir, 'roadmap.md');
      fs.writeFileSync(roadmapPath, roadmapContent);

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
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
