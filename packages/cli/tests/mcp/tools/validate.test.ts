import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runValidateMock } = vi.hoisted(() => ({ runValidateMock: vi.fn() }));
vi.mock('../../../src/commands/validate', () => ({ runValidate: runValidateMock }));

import { validateToolDefinition, handleValidateProject } from '../../../src/mcp/tools/validate';

describe('validate tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct definition', () => {
    expect(validateToolDefinition.name).toBe('validate_project');
    expect(validateToolDefinition.inputSchema.required).toContain('path');
    // Exposes the affected-mode surface.
    expect(validateToolDefinition.inputSchema.properties).toHaveProperty('scope');
    expect(validateToolDefinition.inputSchema.properties).toHaveProperty('changed');
    expect(validateToolDefinition.inputSchema.properties).toHaveProperty('since');
  });

  it('returns error for missing config', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    expect(response.content).toHaveLength(1);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.valid).toBe(false);
    expect(parsed.checks.config).toBe('fail');
    expect(Array.isArray(parsed.errors)).toBe(true);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('returns structured result with checks and errors fields', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveProperty('valid');
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('errors');
    expect(parsed.checks).toHaveProperty('config');
    expect(parsed.checks).toHaveProperty('structure');
    expect(parsed.checks).toHaveProperty('agentsMap');
  });

  it('does NOT delegate to runValidate in the default (full) path — byte-identical', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    expect(runValidateMock).not.toHaveBeenCalled();
    // Still the thin default shape.
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.checks).toHaveProperty('config');
  });

  it('delegates to the shared runValidate with changed:true in affected mode', async () => {
    runValidateMock.mockResolvedValue({
      ok: true,
      value: {
        valid: true,
        complete: true,
        checks: {},
        issues: [],
        unavailableChecks: [],
        scope: {
          mode: 'affected',
          ref: 'abc123',
          changedFileCount: 3,
          scopedChecks: ['driftDetection', 'brandCompliance'],
        },
      },
    });

    const response = await handleValidateProject({ path: '/some/project', changed: true });
    expect(runValidateMock).toHaveBeenCalledOnce();
    expect(runValidateMock).toHaveBeenCalledWith(expect.objectContaining({ changed: true }));
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.scope.mode).toBe('affected');
    expect(parsed.scope.scopedChecks).toEqual(['driftDetection', 'brandCompliance']);
  });

  it('treats scope:"affected" and a since ref as affected mode', async () => {
    runValidateMock.mockResolvedValue({
      ok: true,
      value: { valid: true, scope: { mode: 'affected' } },
    });

    await handleValidateProject({ path: '/p', scope: 'affected' });
    expect(runValidateMock).toHaveBeenCalledWith(expect.objectContaining({ changed: true }));

    runValidateMock.mockClear();
    await handleValidateProject({ path: '/p', since: 'origin/main' });
    expect(runValidateMock).toHaveBeenCalledWith(
      expect.objectContaining({ changed: true, since: 'origin/main' })
    );
  });

  it('scope:"full" keeps the default path (no delegation)', async () => {
    await handleValidateProject({ path: '/nonexistent/path', scope: 'full' });
    expect(runValidateMock).not.toHaveBeenCalled();
  });

  it('surfaces a runValidate config error as isError in affected mode', async () => {
    runValidateMock.mockResolvedValue({ ok: false, error: { message: 'Config not found' } });
    const response = await handleValidateProject({ path: '/p', changed: true });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Config not found');
  });
});
