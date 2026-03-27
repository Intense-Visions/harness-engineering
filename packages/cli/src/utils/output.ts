import { OutputMode, type OutputModeType } from '../output/formatter';

export function resolveOutputMode(globalOpts: {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}): OutputModeType {
  if (globalOpts.json) return OutputMode.JSON;
  if (globalOpts.quiet) return OutputMode.QUIET;
  if (globalOpts.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}
