/**
 * Executes a structured workflow consisting of multiple steps.
 *
 * @param workflow - The workflow definition to execute.
 * @param steps - A map of step names to their corresponding executor functions.
 * @returns A promise that resolves to the final workflow state.
 */
export { executeWorkflow, type StepExecutor } from './runner';
