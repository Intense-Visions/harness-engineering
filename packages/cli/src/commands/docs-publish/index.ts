import { Command } from 'commander';
import { createDraftCommand } from './draft';
import { createAttachMediaCommand } from './attach-media';
import { createVerifyRenderCommand } from './verify-render';
import { createPageTreeCommand } from './page-tree';

/**
 * Creates the `docs-publish` command group: draft-first publishing to a
 * connector configured via the `docsPublish` block in `harness.config.json`.
 *
 * @returns A Commander instance for the 'docs-publish' command.
 */
export function createDocsPublishCommand(): Command {
  const command = new Command('docs-publish').description(
    'Publish docs to a configured provider (draft-first)'
  );
  command.addCommand(createDraftCommand());
  command.addCommand(createAttachMediaCommand());
  command.addCommand(createVerifyRenderCommand());
  command.addCommand(createPageTreeCommand());
  return command;
}
