export type EventListener = (...args: unknown[]) => void;

export class Emitter {
  readonly #listeners: Record<string, EventListener[] | undefined> = {};

  on(eventName: string, listener: EventListener): Emitter {
    const listeners = readListeners(this.#listeners, eventName) ?? [];
    listeners.push(listener);
    this.#listeners[eventName] = listeners;
    return this;
  }

  emit(eventName: string, ...args: unknown[]): boolean {
    const listeners = readListeners(this.#listeners, eventName);
    if (!listeners || listeners.length === 0) {
      return false;
    }

    for (let index = 0; index < listeners.length; index += 1) {
      const listener = listeners[index]!;
      listener(...args);
    }

    return true;
  }
}

function readListeners(
  listenersByEvent: Record<string, EventListener[] | undefined>,
  eventName: string
): EventListener[] | undefined {
  for (const currentKey in listenersByEvent) {
    if (currentKey === eventName) {
      return listenersByEvent[currentKey];
    }
  }

  return undefined;
}
