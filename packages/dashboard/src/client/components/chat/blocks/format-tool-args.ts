export function formatToolArgs(tool: string, args?: string): string {
  if (!args) return '';
  const toolLower = tool.toLowerCase();
  try {
    const parsed = JSON.parse(args);
    if (toolLower.includes('todo') && parsed.todos && Array.isArray(parsed.todos)) {
      return `Updating ${parsed.todos.length} tasks`;
    }
    if (toolLower === 'bash' && (parsed.command || parsed.args)) {
      const cmd = parsed.command || parsed.args;
      // If we have a description, the command itself is now the "args preview"
      return cmd.replace(/cd\s+("[^"]+"|'[^']+'|[^\s]+)\s*&&\s*/g, '').slice(0, 100);
    }
    if (toolLower === 'agent' || toolLower === 'subagent' || parsed.subagent_type) {
      const type = parsed.subagent_type || parsed.type;
      if (type && parsed.description) {
        return `${type}: ${parsed.description}`.slice(0, 100);
      }
      if (parsed.description) {
        return parsed.description.slice(0, 100);
      }
    }
    if (parsed.path || parsed.file_path || parsed.filePath) {
      const p = parsed.path || parsed.file_path || parsed.filePath;
      return p.split('/').slice(-2).join('/');
    }
    return JSON.stringify(parsed).slice(0, 100);
  } catch {
    return args.slice(0, 100);
  }
}
