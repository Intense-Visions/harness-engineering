import { describe, it, expect } from 'vitest';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

// Bug repro (bugfleet/cli-mcp-core hunt): `handleManageRoadmap` calls
// `sanitizePath(input.path)` OUTSIDE its own try/catch (see roadmap.ts, the
// line immediately after the function signature, before `loadProjectRoadmapMode`
// and before the `try {` block that wraps every other failure path in this
// file). Every other validation failure in this file — missing `feature`,
// missing `filter`, milestone not found, roadmap not found, etc. — resolves
// to a graceful `{ content: [...], isError: true }` McpResponse. A missing or
// non-string `path` instead makes `sanitizePath` call `path.resolve(undefined)`,
// which throws synchronously, so the returned Promise REJECTS instead of
// resolving to the same graceful error shape.
//
// The tool's own `inputSchema` marks `path` as `required`, but nothing in the
// dispatch chain (`dispatchTool` in server.ts, nor any of the injection-guard /
// compaction / context-budget middleware) validates arguments against that
// schema before calling the handler — confirmed by grepping those files for
// `inputSchema`/`validate` (none found). So a caller (any MCP client, or a
// bug in an upstream agent that composes tool args) that omits `path` reaches
// this handler directly and gets an unhandled rejection instead of the
// documented, consistent error-response contract.
describe('manage_roadmap handles a missing path without throwing (regression)', () => {
  it('resolves a graceful isError response instead of rejecting when path is omitted', async () => {
    await expect(
      handleManageRoadmap({ action: 'show' } as unknown as Parameters<
        typeof handleManageRoadmap
      >[0])
    ).resolves.toEqual(expect.objectContaining({ isError: true }));
  });
});
