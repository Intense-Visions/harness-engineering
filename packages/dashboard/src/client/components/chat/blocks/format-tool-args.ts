interface ParsedToolArgs {
  todos?: unknown;
  command?: string;
  args?: string;
  subagent_type?: string;
  type?: string;
  description?: string;
  path?: string;
  file_path?: string;
  filePath?: string;
}

function formatTodoArgs(toolLower: string, parsed: ParsedToolArgs): string | null {
  if (toolLower.includes('todo') && parsed.todos && Array.isArray(parsed.todos)) {
    return `Updating ${parsed.todos.length} tasks`;
  }
  return null;
}

function formatBashArgs(toolLower: string, parsed: ParsedToolArgs): string | null {
  if (toolLower !== 'bash') return null;
  const cmd = parsed.command || parsed.args;
  if (!cmd) return null;
  // If we have a description, the command itself is now the "args preview"
  return cmd.replace(/cd\s+("[^"]+"|'[^']+'|[^\s]+)\s*&&\s*/g, '').slice(0, 100);
}

function formatAgentArgs(toolLower: string, parsed: ParsedToolArgs): string | null {
  if (toolLower !== 'agent' && toolLower !== 'subagent' && !parsed.subagent_type) {
    return null;
  }
  const type = parsed.subagent_type || parsed.type;
  if (type && parsed.description) {
    return `${type}: ${parsed.description}`.slice(0, 100);
  }
  if (parsed.description) {
    return parsed.description.slice(0, 100);
  }
  return null;
}

function formatPathArgs(parsed: ParsedToolArgs): string | null {
  const p = parsed.path || parsed.file_path || parsed.filePath;
  if (!p) return null;
  return p.split('/').slice(-2).join('/');
}

function formatParsedToolArgs(toolLower: string, parsed: ParsedToolArgs): string | null {
  return (
    formatTodoArgs(toolLower, parsed) ??
    formatBashArgs(toolLower, parsed) ??
    formatAgentArgs(toolLower, parsed) ??
    formatPathArgs(parsed)
  );
}

export function formatToolArgs(tool: string, args?: string): string {
  if (!args) return '';
  const toolLower = tool.toLowerCase();
  try {
    const parsed = JSON.parse(args);
    return formatParsedToolArgs(toolLower, parsed) ?? JSON.stringify(parsed).slice(0, 100);
  } catch {
    return args.slice(0, 100);
  }
}
