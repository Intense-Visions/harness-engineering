#!/usr/bin/env node
import { createProgram, handleError } from '../index';
import { runUpdateCheckAtStartup, printUpdateNotification } from './update-check-hooks';

async function main(): Promise<void> {
  // Fire-and-forget: spawn background version check if cooldown elapsed
  runUpdateCheckAtStartup();

  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }

  // Show update notification from previous check's cached result
  printUpdateNotification();
}

void main();
