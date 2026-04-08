import * as fs from 'fs';
import * as path from 'path';

export interface TomlMcpServerEntry {
  command: string;
  args?: string[];
  enabled?: boolean;
}

/**
 * Write an MCP server entry to a TOML config file (e.g. .codex/config.toml).
 * Uses read-then-merge pattern: preserves all existing TOML content, only
 * adds/replaces the [mcp_servers.<name>] block. Inline serializer — no toml
 * parser dependency.
 *
 * Atomic write: writes to .tmp then renames to avoid corruption on interrupt.
 */
export function writeTomlMcpEntry(filePath: string, name: string, entry: TomlMcpServerEntry): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

  const blockHeader = `[mcp_servers.${name}]`;
  const newBlock = serializeTomlMcpBlock(name, entry);

  let updated: string;

  if (existing.includes(blockHeader)) {
    // Replace the existing block
    updated = replaceTomlBlock(existing, blockHeader, newBlock);
  } else {
    // Append a blank line separator if file is non-empty, then add block
    const separator = existing.length > 0 && !existing.endsWith('\n\n') ? '\n' : '';
    updated = existing + separator + newBlock;
  }

  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, updated);
  fs.renameSync(tmp, filePath);
}

/**
 * Serialize a single [mcp_servers.<name>] TOML block.
 */
function serializeTomlMcpBlock(name: string, entry: TomlMcpServerEntry): string {
  const lines: string[] = [`[mcp_servers.${name}]`];
  lines.push(`command = ${JSON.stringify(entry.command)}`);
  if (entry.args !== undefined) {
    const argsLiteral = '[' + entry.args.map((a) => JSON.stringify(a)).join(', ') + ']';
    lines.push(`args = ${argsLiteral}`);
  }
  if (entry.enabled !== undefined) {
    lines.push(`enabled = ${entry.enabled}`);
  }
  return lines.join('\n') + '\n';
}

/** Find the index where a TOML block ends (next top-level section or EOF), trimming trailing blanks. */
function findBlockEnd(lines: string[], startIdx: number): number {
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i]?.match(/^\[(?!\[)/)) {
      endIdx = i;
      break;
    }
  }
  while (endIdx > startIdx + 1 && lines[endIdx - 1]?.trim() === '') {
    endIdx--;
  }
  return endIdx;
}

/**
 * Replace an existing TOML block (from blockHeader to the next top-level
 * section header or end-of-file) with newBlock.
 */
function replaceTomlBlock(content: string, blockHeader: string, newBlock: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === blockHeader);
  if (startIdx === -1) return content + newBlock;

  const endIdx = findBlockEnd(lines, startIdx);

  const newBlockLines = newBlock.trimEnd().split('\n');
  const result = [
    ...lines.slice(0, startIdx),
    ...newBlockLines,
    ...(endIdx < lines.length ? ['', ...lines.slice(endIdx)] : []),
  ];
  return result.join('\n') + (content.endsWith('\n') ? '\n' : '');
}
