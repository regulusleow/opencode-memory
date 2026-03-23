import { EventEmitter } from "node:events";
import type { EventBus, MemoryEvent } from "../types.js";

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  const EVENT_NAME = "memory:event";

  return {
    emit(event: MemoryEvent): void {
      emitter.emit(EVENT_NAME, event);
    },

    on(handler: (event: MemoryEvent) => void): () => void {
      emitter.on(EVENT_NAME, handler);
      return () => {
        emitter.off(EVENT_NAME, handler);
      };
    },

    off(handler: (event: MemoryEvent) => void): void {
      emitter.off(EVENT_NAME, handler);
    },

    connectionCount(): number {
      return emitter.listenerCount(EVENT_NAME);
    },
  };
}
