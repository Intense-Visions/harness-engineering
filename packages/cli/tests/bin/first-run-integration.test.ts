import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the first-run module to verify it is called
vi.mock('../../src/utils/first-run', () => ({
  printFirstRunWelcome: vi.fn(),
}));

// Mock update-check-hooks to prevent side effects
vi.mock('../../src/bin/update-check-hooks', () => ({
  runUpdateCheckAtStartup: vi.fn(),
  printUpdateNotification: vi.fn(),
}));

// Mock the index module to prevent Commander from parsing real argv
vi.mock('../../src/index', () => ({
  createProgram: vi.fn(() => ({
    parseAsync: vi.fn().mockResolvedValue(undefined),
  })),
  handleError: vi.fn(),
}));

import { printFirstRunWelcome } from '../../src/utils/first-run';
import { runUpdateCheckAtStartup } from '../../src/bin/update-check-hooks';

const mockPrintFirstRunWelcome = vi.mocked(printFirstRunWelcome);
const mockRunUpdateCheckAtStartup = vi.mocked(runUpdateCheckAtStartup);

describe('harness.ts entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls printFirstRunWelcome before runUpdateCheckAtStartup', async () => {
    const callOrder: string[] = [];
    mockPrintFirstRunWelcome.mockImplementation(() => {
      callOrder.push('firstRun');
    });
    mockRunUpdateCheckAtStartup.mockImplementation(() => {
      callOrder.push('updateCheck');
    });

    // Dynamically import to trigger main()
    await import('../../src/bin/harness');

    // Wait for the void main() promise to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockPrintFirstRunWelcome).toHaveBeenCalledTimes(1);
    expect(callOrder[0]).toBe('firstRun');
    expect(callOrder[1]).toBe('updateCheck');
  });
});
