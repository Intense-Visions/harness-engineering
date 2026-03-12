import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import { generateId } from '../../shared/uuid';
import type {
  ActionType,
  AgentAction,
  ActionContext,
  ActionResult,
  ActionEventType,
  ActionEvent,
  ActionEventHandler,
  ActionTracker,
  FeedbackError,
} from '../types';
import { getFeedbackConfig } from '../config';

export class AgentActionEmitter {
  private listeners = new Map<ActionEventType, Set<ActionEventHandler>>();

  on(eventType: ActionEventType, handler: ActionEventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    return () => this.off(eventType, handler);
  }

  once(eventType: ActionEventType, handler: ActionEventHandler): () => void {
    const wrappedHandler: ActionEventHandler = (event) => {
      this.off(eventType, wrappedHandler);
      return handler(event);
    };
    return this.on(eventType, wrappedHandler);
  }

  off(eventType: ActionEventType, handler: ActionEventHandler): void {
    this.listeners.get(eventType)?.delete(handler);
  }

  emit(event: ActionEvent): void {
    // Emit to specific listeners
    this.listeners.get(event.type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error('Error in action event handler:', e);
      }
    });

    // Emit to wildcard listeners
    if (event.type !== 'action:*') {
      this.listeners.get('action:*')?.forEach((handler) => {
        try {
          handler(event);
        } catch (e) {
          console.error('Error in wildcard action event handler:', e);
        }
      });
    }
  }

  listenerCount(eventType: ActionEventType): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// Global emitter instance
let globalEmitter: AgentActionEmitter | null = null;

export function getActionEmitter(): AgentActionEmitter {
  if (!globalEmitter) {
    globalEmitter = new AgentActionEmitter();
  }
  return globalEmitter;
}

export async function logAgentAction(
  action: Omit<AgentAction, 'id' | 'timestamp'>
): Promise<Result<AgentAction, FeedbackError>> {
  const fullAction: AgentAction = {
    ...action,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };

  const config = getFeedbackConfig();

  // Emit event
  if (config.emitEvents) {
    const eventType: ActionEventType =
      action.status === 'completed'
        ? 'action:completed'
        : action.status === 'failed'
          ? 'action:failed'
          : 'action:started';

    getActionEmitter().emit({
      type: eventType,
      action: fullAction,
      timestamp: fullAction.timestamp,
    });
  }

  // Write to sinks
  if (config.sinks) {
    for (const sink of config.sinks) {
      await sink.write(fullAction);
    }
  }

  return Ok(fullAction);
}

export function trackAction(
  type: ActionType,
  context: ActionContext
): ActionTracker {
  const startTime = Date.now();
  const action: AgentAction = {
    id: generateId(),
    type,
    timestamp: new Date().toISOString(),
    status: 'started',
    context,
  };

  // Log start
  const config = getFeedbackConfig();
  if (config.emitEvents) {
    getActionEmitter().emit({
      type: 'action:started',
      action,
      timestamp: action.timestamp,
    });
  }

  return {
    get action() {
      return action;
    },

    async complete(result: ActionResult): Promise<Result<AgentAction, FeedbackError>> {
      action.status = 'completed';
      action.duration = Date.now() - startTime;
      action.result = result;

      return logAgentAction(action);
    },

    async fail(error: { code: string; message: string }): Promise<Result<AgentAction, FeedbackError>> {
      action.status = 'failed';
      action.duration = Date.now() - startTime;
      action.error = error;

      return logAgentAction(action);
    },
  };
}
