import { describe, it, expect, mock } from "bun:test";
import type { MemoryEvent } from "../src/types.js";
import { createEventBus } from "../src/services/event-bus.js";

describe("EventBus", () => {
  const makeEvent = (type: MemoryEvent["type"] = "memory:added"): MemoryEvent => ({
    type,
    data: { id: "test-id" },
    timestamp: Date.now(),
  });

  it("emit() → subscribed handler receives event", () => {
    const bus = createEventBus();
    const handler = mock(() => {});
    
    bus.on(handler);
    const event = makeEvent();
    bus.emit(event);
    
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("multiple handlers all receive events", () => {
    const bus = createEventBus();
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});
    
    bus.on(handler1);
    bus.on(handler2);
    const event = makeEvent();
    bus.emit(event);
    
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it("off() removes handler — no longer called", () => {
    const bus = createEventBus();
    const handler = mock(() => {});
    
    bus.on(handler);
    bus.off(handler);
    const event = makeEvent();
    bus.emit(event);
    
    expect(handler).toHaveBeenCalledTimes(0);
  });

  it("on() returns unsubscribe function that removes handler", () => {
    const bus = createEventBus();
    const handler = mock(() => {});
    
    const unsubscribe = bus.on(handler);
    unsubscribe();
    const event = makeEvent();
    bus.emit(event);
    
    expect(handler).toHaveBeenCalledTimes(0);
  });

  it("connectionCount() returns number of active handlers", () => {
    const bus = createEventBus();
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});
    
    expect(bus.connectionCount()).toBe(0);
    
    bus.on(handler1);
    expect(bus.connectionCount()).toBe(1);
    
    bus.on(handler2);
    expect(bus.connectionCount()).toBe(2);
    
    bus.off(handler1);
    expect(bus.connectionCount()).toBe(1);
  });

  it("emit with no handlers — no error thrown", () => {
    const bus = createEventBus();
    const event = makeEvent();
    
    expect(() => bus.emit(event)).not.toThrow();
  });
});
