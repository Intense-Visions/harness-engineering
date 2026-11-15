/** Injected inputs for `harness autonomy` (tests); production defaults are real process/terminal. */
export interface AutonomyCliDeps {
  cwd?: () => string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  now?: () => Date;
  /** True only when stdin AND stdout are TTYs. */
  isInteractive?: () => boolean;
  /** Ask a yes/no question; resolves true only on an explicit yes. */
  confirm?: (question: string) => Promise<boolean>;
}
