import * as fs from 'fs';
import * as path from 'path';

interface McpConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

interface IntegrationsSection {
  enabled: string[];
  dismissed: string[];
}

function readJsonSafe<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Read .mcp.json (or similar MCP config file).
 * Returns a valid object with mcpServers even if the file is missing or corrupt.
 */
export function readMcpConfig(filePath: string): McpConfig {
  const config = readJsonSafe<McpConfig>(filePath);
  if (!config) return { mcpServers: {} };
  if (!config.mcpServers) config.mcpServers = {};
  return config;
}

/**
 * Write an MCP server entry to an MCP config file.
 * Preserves all existing entries.
 */
export function writeMcpEntry(
  filePath: string,
  name: string,
  entry: { command: string; args?: string[]; env?: Record<string, string> }
): void {
  const config = readMcpConfig(filePath);
  config.mcpServers![name] = entry;
  writeJson(filePath, config);
}

/**
 * Remove an MCP server entry from an MCP config file.
 * Preserves all other entries. No-op if the file or entry doesn't exist.
 */
export function removeMcpEntry(filePath: string, name: string): void {
  if (!fs.existsSync(filePath)) return;
  const config = readMcpConfig(filePath);
  delete config.mcpServers![name];
  writeJson(filePath, config);
}

/**
 * Read the integrations section from harness.config.json.
 * Returns defaults if the file or section is missing.
 */
export function readIntegrationsConfig(configPath: string): IntegrationsSection {
  const raw = readJsonSafe<Record<string, unknown>>(configPath);
  if (!raw || !raw.integrations) return { enabled: [], dismissed: [] };
  const integ = raw.integrations as Partial<IntegrationsSection>;
  return {
    enabled: Array.isArray(integ.enabled) ? integ.enabled : [],
    dismissed: Array.isArray(integ.dismissed) ? integ.dismissed : [],
  };
}

/**
 * Write the integrations section to harness.config.json.
 * Preserves all other config fields. Creates the file if it doesn't exist.
 */
export function writeIntegrationsConfig(
  configPath: string,
  integrations: IntegrationsSection
): void {
  const raw = readJsonSafe<Record<string, unknown>>(configPath) ?? {};
  raw.integrations = integrations;
  writeJson(configPath, raw);
}
