#!/usr/bin/env node
import 'dotenv/config';
import { startServer } from '../mcp/index.js';

startServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
