/**
 * Executes a structured workflow consisting of multiple steps.
 *
 * @experimental Internal workflow runner — has tests but no CLI/MCP consumers.
 * Consider wiring into a CLI command or removing if superseded by skill-based execution.
 */
export { executeWorkflow, type StepExecutor } from './runner';
