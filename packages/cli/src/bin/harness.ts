#!/usr/bin/env node
import { createProgram, handleError } from '../index';

async function main() {
  const program = createProgram();

  // Commands will be registered here as we implement them
  // For now, just parse and show help if no command

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }
}

main();
