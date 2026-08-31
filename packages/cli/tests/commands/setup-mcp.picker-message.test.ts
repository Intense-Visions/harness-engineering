import { describe, it, expect, beforeEach, type MockedFunction } from 'vitest';
import { vi } from 'vitest';
import * as clack from '@clack/prompts';
import { runCursorToolPicker, CURSOR_CURATED_TOOLS } from '../../src/commands/setup-mcp';

/**
 * bug-fleet HUNT candidate (cli-config-surface area).
 *
 * `runCursorToolPicker`'s multiselect prompt hardcodes the recommended-tool
 * count in its message string ("25 recommended"), but `CURSOR_CURATED_TOOLS`
 * — the array that message is describing, and that seeds `initialValues` —
 * actually has 26 entries (already pinned by
 * `tests/commands/setup-mcp.test.ts`'s `toHaveLength(26)` assertion). The
 * copy has drifted from the data it documents: a user running
 * `setup-mcp --client cursor --pick` is told 25 tools are pre-selected when
 * 26 actually are.
 */
vi.mock('@clack/prompts', () => ({
  multiselect: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}));

describe('runCursorToolPicker — recommended-count copy', () => {
  const mockMultiselect = clack.multiselect as MockedFunction<typeof clack.multiselect>;

  beforeEach(() => {
    mockMultiselect.mockReset();
    mockMultiselect.mockResolvedValue(CURSOR_CURATED_TOOLS as never);
  });

  it('states the actual CURSOR_CURATED_TOOLS count in the prompt message', async () => {
    await runCursorToolPicker();

    const call = mockMultiselect.mock.calls[0]?.[0] as { message: string } | undefined;
    expect(call).toBeDefined();
    expect(call!.message).toContain(`${CURSOR_CURATED_TOOLS.length} recommended`);
  });
});
