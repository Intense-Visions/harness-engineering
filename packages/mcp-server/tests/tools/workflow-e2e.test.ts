import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

/**
 * Integration test: Full workflow end-to-end
 * Criterion 23: gather_context -> do work -> emit_interaction question ->
 *               assess_project -> emit_interaction transition + qualityGate
 */
describe('Workflow E2E: gather_context -> work -> emit_interaction -> assess_project -> transition', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-'));
    // Create minimal project structure
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'state.json'),
      JSON.stringify({ schemaVersion: 1, position: { phase: 'execute', task: 'Task 1' } })
    );
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'learnings.md'),
      '## 2026-03-22\n- [skill:test] [outcome:success] Test learning\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'handoff.json'),
      JSON.stringify({
        fromSkill: 'harness-planning',
        phase: 'VALIDATE',
        summary: 'Test handoff',
        timestamp: '2026-03-22T00:00:00Z',
      })
    );
  });

  it('gather_context returns state, learnings, and handoff in a single call', async () => {
    const { handleGatherContext } = await import('../../src/tools/gather-context');

    const result = await handleGatherContext({
      path: tmpDir,
      intent: 'Execute plan tasks',
      skill: 'harness-execution',
      include: ['state', 'learnings', 'handoff'],
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.state).toBeDefined();
    expect(parsed.learnings).toBeDefined();
    expect(parsed.handoff).toBeDefined();
    expect(parsed.meta).toBeDefined();
    expect(parsed.meta.errors).toHaveLength(0);
  });

  it('emit_interaction validates structured question with InteractionOption', async () => {
    const { handleEmitInteraction } = await import('../../src/tools/interaction');

    const result = await handleEmitInteraction({
      path: tmpDir,
      type: 'question',
      question: {
        text: 'Which approach should we use?',
        options: [
          {
            label: 'A) Approach One',
            pros: ['Simple', 'Fast'],
            cons: ['Limited'],
            risk: 'low',
            effort: 'low',
          },
          {
            label: 'B) Approach Two',
            pros: ['Flexible'],
            cons: ['Complex', 'Slow'],
            risk: 'medium',
            effort: 'high',
          },
        ],
        recommendation: {
          optionIndex: 0,
          reason: 'Simplicity wins for current scope',
          confidence: 'high',
        },
      },
    });

    // Should return rendered markdown with pros/cons table
    expect(result.content).toBeDefined();
    const text =
      typeof result.content === 'string' ? result.content : (result.content[0]?.text ?? '');
    expect(text).toContain('Approach One');
    expect(text).toContain('Approach Two');
    expect(text).toContain('Recommendation');
  });

  it('assess_project runs health checks and returns unified report', async () => {
    const { handleAssessProject } = await import('../../src/tools/assess-project');

    const response = await handleAssessProject({
      path: tmpDir,
      checks: ['validate'],
      mode: 'summary',
    });

    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveProperty('healthy');
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('assessedIn');
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it('emit_interaction transition includes qualityGate', async () => {
    const { handleEmitInteraction } = await import('../../src/tools/interaction');

    const result = await handleEmitInteraction({
      path: tmpDir,
      type: 'transition',
      transition: {
        completedPhase: 'execution',
        suggestedNext: 'verification',
        reason: 'All tasks complete',
        artifacts: ['/path/to/file.ts'],
        requiresConfirmation: false,
        summary: 'Completed 5 tasks. All quick gates passed.',
        qualityGate: {
          checks: [
            { name: 'all-tasks-complete', passed: true, detail: '5/5 tasks' },
            { name: 'harness-validate', passed: true },
            { name: 'tests-pass', passed: true },
          ],
          allPassed: true,
        },
      },
    });

    expect(result.content).toBeDefined();
    const text =
      typeof result.content === 'string' ? result.content : (result.content[0]?.text ?? '');
    expect(text).toContain('verification');
  });

  it('full workflow sequence: gather -> question -> assess -> transition', async () => {
    const { handleGatherContext } = await import('../../src/tools/gather-context');
    const { handleEmitInteraction } = await import('../../src/tools/interaction');
    const { handleAssessProject } = await import('../../src/tools/assess-project');

    // Step 1: Gather context
    const contextResult = await handleGatherContext({
      path: tmpDir,
      intent: 'Full workflow test',
      skill: 'harness-execution',
      include: ['state', 'learnings', 'handoff'],
    });
    const context = JSON.parse(contextResult.content[0].text);
    expect(context.meta.errors).toHaveLength(0);

    // Step 2: Do work (simulated -- nothing to do in test)

    // Step 3: Ask a structured question
    const question = await handleEmitInteraction({
      path: tmpDir,
      type: 'question',
      question: {
        text: 'Proceed with implementation?',
        options: [
          {
            label: 'Yes, proceed',
            pros: ['Keeps momentum'],
            cons: ['None identified'],
            risk: 'low',
            effort: 'low',
          },
        ],
        recommendation: {
          optionIndex: 0,
          reason: 'No blockers identified',
          confidence: 'high',
        },
      },
    });
    expect(question.content).toBeDefined();

    // Step 4: Assess project health
    const assessResponse = await handleAssessProject({
      path: tmpDir,
      checks: ['validate'],
      mode: 'summary',
    });
    const assessment = JSON.parse(assessResponse.content[0].text);
    expect(assessment).toHaveProperty('healthy');

    // Step 5: Emit transition with qualityGate
    const transition = await handleEmitInteraction({
      path: tmpDir,
      type: 'transition',
      transition: {
        completedPhase: 'execution',
        suggestedNext: 'verification',
        reason: 'All tasks complete',
        artifacts: [],
        requiresConfirmation: false,
        summary: 'Workflow complete.',
        qualityGate: {
          checks: [
            { name: 'assess-project', passed: assessment.healthy ?? false },
            { name: 'harness-validate', passed: true },
          ],
          allPassed: assessment.healthy ?? false,
        },
      },
    });
    expect(transition.content).toBeDefined();
  });
});
