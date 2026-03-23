import { describe, it, expect } from 'vitest';
import {
  generateSlashCommandsDefinition,
  handleGenerateSlashCommands,
} from '../../../src/mcp/tools/generate-slash-commands';

describe('generate_slash_commands tool', () => {
  it('has correct definition', () => {
    expect(generateSlashCommandsDefinition.name).toBe('generate_slash_commands');
  });

  it('has all expected properties', () => {
    const props = generateSlashCommandsDefinition.inputSchema.properties;
    expect(props).toHaveProperty('platforms');
    expect(props).toHaveProperty('global');
    expect(props).toHaveProperty('output');
    expect(props).toHaveProperty('skillsDir');
    expect(props).toHaveProperty('dryRun');
  });

  it('returns success response with dryRun', async () => {
    const response = await handleGenerateSlashCommands({ dryRun: true });
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
  });

  it('returns response with empty skillsDir in dryRun mode', async () => {
    const response = await handleGenerateSlashCommands({ skillsDir: '', dryRun: true });
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
  });
});
