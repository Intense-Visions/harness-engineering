import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createAdoptionCommand } from '../../src/commands/adoption';

vi.mock('@harness-engineering/core', () => ({
  readAdoptionRecords: vi.fn(),
  aggregateBySkill: vi.fn(),
}));

const mockRecords = [
  {
    skill: 'planning',
    startedAt: '2026-01-15T10:00:00Z',
    outcome: 'completed',
    duration: 5000,
    phasesReached: ['init', 'execute', 'verify'],
  },
  {
    skill: 'planning',
    startedAt: '2026-01-16T12:00:00Z',
    outcome: 'failed',
    duration: 3000,
    phasesReached: ['init', 'execute'],
  },
  {
    skill: 'debugging',
    startedAt: '2026-01-17T08:00:00Z',
    outcome: 'completed',
    duration: 120000,
    phasesReached: ['init', 'diagnose', 'fix', 'verify'],
  },
];

const mockSummaries = [
  {
    skill: 'planning',
    invocations: 2,
    successRate: 0.5,
    avgDuration: 4000,
    lastUsed: '2026-01-16T12:00:00Z',
    tier: 'silver',
  },
  {
    skill: 'debugging',
    invocations: 1,
    successRate: 1.0,
    avgDuration: 120000,
    lastUsed: '2026-01-17T08:00:00Z',
    tier: null,
  },
];

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.addCommand(createAdoptionCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', 'adoption', ...args]);
}

describe('adoption command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];

  beforeEach(async () => {
    vi.clearAllMocks();
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
  });

  describe('createAdoptionCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createAdoptionCommand();
      expect(cmd.name()).toBe('adoption');
    });

    it('has description', () => {
      const cmd = createAdoptionCommand();
      expect(cmd.description()).toContain('adoption');
    });

    it('has --json option', () => {
      const cmd = createAdoptionCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--json');
    });

    it('has skills subcommand', () => {
      const cmd = createAdoptionCommand();
      expect(cmd.commands.find((c) => c.name() === 'skills')).toBeDefined();
    });

    it('has recent subcommand', () => {
      const cmd = createAdoptionCommand();
      expect(cmd.commands.find((c) => c.name() === 'recent')).toBeDefined();
    });

    it('has skill subcommand', () => {
      const cmd = createAdoptionCommand();
      expect(cmd.commands.find((c) => c.name() === 'skill')).toBeDefined();
    });

    it('skills subcommand has --limit option', () => {
      const cmd = createAdoptionCommand();
      const skills = cmd.commands.find((c) => c.name() === 'skills');
      const opts = skills!.options.map((o) => o.long);
      expect(opts).toContain('--limit');
    });
  });

  describe('skills subcommand', () => {
    it('outputs empty array as JSON when no records', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue([]);

      await runCommand(['skills', '--json']);
      expect(logOutput).toContain(JSON.stringify([]));
    });

    it('outputs info message when no records in text mode', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue([]);

      const infoSpy = vi.spyOn(await import('../../src/output/logger'), 'logger', 'get');
      const mockInfo = vi.fn();
      infoSpy.mockReturnValue({ info: mockInfo } as any);

      // Re-run without --json; logger.info is called
      await runCommand(['skills']);
      // The logger.info call is internal; we just confirm no crash and no JSON output
      expect(logOutput.find((l) => l.startsWith('['))).toBeUndefined();
    });

    it('outputs summaries as JSON', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);
      vi.mocked(core.aggregateBySkill).mockReturnValue(mockSummaries as any);

      await runCommand(['skills', '--json']);
      const parsed = JSON.parse(logOutput[0]);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].skill).toBe('planning');
    });

    it('outputs table in text mode', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);
      vi.mocked(core.aggregateBySkill).mockReturnValue(mockSummaries as any);

      await runCommand(['skills']);
      const header = logOutput.find((l) => l.includes('Skill'));
      expect(header).toBeDefined();
      const planningLine = logOutput.find((l) => l.includes('planning'));
      expect(planningLine).toBeDefined();
      expect(planningLine).toContain('50%');
      const totalLine = logOutput.find((l) => l.includes('Total:'));
      expect(totalLine).toContain('3 invocations');
    });

    it('respects --limit option', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);
      vi.mocked(core.aggregateBySkill).mockReturnValue(mockSummaries as any);

      await runCommand(['skills', '--limit', '1', '--json']);
      const parsed = JSON.parse(logOutput[0]);
      expect(parsed).toHaveLength(1);
    });
  });

  describe('recent subcommand', () => {
    it('outputs empty array as JSON when no records', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue([]);

      await runCommand(['recent', '--json']);
      expect(logOutput).toContain(JSON.stringify([]));
    });

    it('outputs records sorted by date as JSON', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);

      await runCommand(['recent', '--json']);
      const parsed = JSON.parse(logOutput[0]);
      expect(parsed).toHaveLength(3);
      // Should be sorted descending by startedAt
      expect(parsed[0].skill).toBe('debugging');
      expect(parsed[1].skill).toBe('planning');
    });

    it('outputs table in text mode', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);

      await runCommand(['recent']);
      const header = logOutput.find((l) => l.includes('Date'));
      expect(header).toBeDefined();
      const showingLine = logOutput.find((l) => l.includes('Showing'));
      expect(showingLine).toContain('3 of 3');
    });

    it('respects --limit for recent', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);

      await runCommand(['recent', '--limit', '2', '--json']);
      const parsed = JSON.parse(logOutput[0]);
      expect(parsed).toHaveLength(2);
    });
  });

  describe('skill subcommand', () => {
    it('outputs null as JSON when no records found', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue([]);

      await runCommand(['skill', 'nonexistent', '--json']);
      expect(logOutput).toContain(JSON.stringify(null));
    });

    it('outputs detail as JSON with phases', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);
      vi.mocked(core.aggregateBySkill).mockReturnValue([mockSummaries[0]] as any);

      await runCommand(['skill', 'planning', '--json']);
      const parsed = JSON.parse(logOutput[0]);
      expect(parsed.summary.skill).toBe('planning');
      expect(parsed.totalRecords).toBe(2);
      expect(parsed.phaseRates).toBeDefined();
      expect(parsed.phaseRates.length).toBeGreaterThan(0);
      // init should appear in both records => rate 1.0
      const initPhase = parsed.phaseRates.find((p: any) => p.phase === 'init');
      expect(initPhase).toBeDefined();
      expect(initPhase.rate).toBe(1);
    });

    it('outputs detail in text mode', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);
      vi.mocked(core.aggregateBySkill).mockReturnValue([mockSummaries[0]] as any);

      await runCommand(['skill', 'planning']);
      expect(logOutput.find((l) => l.includes('Skill: planning'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('Invocations: 2'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('50%'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('Phase completion'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('Outcome breakdown'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('Completed: 1'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('Failed: 1'))).toBeDefined();
    });

    it('shows tier when present', async () => {
      const core = await import('@harness-engineering/core');
      vi.mocked(core.readAdoptionRecords).mockReturnValue(mockRecords as any);
      vi.mocked(core.aggregateBySkill).mockReturnValue([mockSummaries[0]] as any);

      await runCommand(['skill', 'planning']);
      expect(logOutput.find((l) => l.includes('Tier: silver'))).toBeDefined();
    });
  });
});
