#!/usr/bin/env node
import { startServer } from '../src/index.js';

startServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
