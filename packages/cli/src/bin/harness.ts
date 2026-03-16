#!/usr/bin/env node
import { createProgram, handleError } from '../index';

async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }
}

void main();
