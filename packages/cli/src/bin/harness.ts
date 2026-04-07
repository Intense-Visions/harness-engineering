#!/usr/bin/env node
import 'dotenv/config';
import { createProgram, handleError } from '../index';
import { runUpdateCheckAtStartup, printUpdateNotification } from './update-check-hooks';
import { printFirstRunWelcome } from '../utils/first-run';
import { sessionStartDispatch, formatDispatchBanner } from '../skill/dispatch-session';
import type { SessionDispatchResult } from '../skill/dispatch-session';

async function main(): Promise<void> {
  // Show welcome message on first run (before any other output)
  printFirstRunWelcome();

  // Fire-and-forget: spawn background version check if cooldown elapsed
  runUpdateCheckAtStartup();

  // Fire-and-forget: session-start skill dispatch (prints banner at end)
  const dispatchPromise: Promise<SessionDispatchResult> = sessionStartDispatch(process.cwd()).catch(
    () => ({ dispatched: false }) as SessionDispatchResult
  );

  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }

  // Show update notification from previous check's cached result
  printUpdateNotification();

  // Show skill dispatch recommendations if HEAD changed
  const dispatchResult = await dispatchPromise;
  const banner = formatDispatchBanner(dispatchResult);
  if (banner) {
    console.error(`\n${banner}\n`);
  }
}

void main();
