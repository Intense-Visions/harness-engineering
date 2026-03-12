import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type { ActionSink, FeedbackError } from '../types';

export class NoOpSink implements ActionSink {
  readonly name = 'noop';

  async write(): Promise<Result<void, FeedbackError>> {
    return Ok(undefined);
  }
}
