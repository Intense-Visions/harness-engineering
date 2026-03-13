#!/usr/bin/env node
import { createProgram, handleError } from '../index';

async function main() {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }
}

main();
