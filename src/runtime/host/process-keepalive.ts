/**
 * Keeps the Node.js process alive as long as at least one server is
 * listening.
 *
 * In the CLR build this spawns a non-background thread. In Node.js we
 * use a `setInterval` timer whose `ref()` / `unref()` state mirrors
 * the same semantics: while the interval is ref'd the event loop
 * stays open; once all servers close we unref it and the process can
 * exit naturally.
 */

let activeServers = 0;
let keepAliveTimer: ReturnType<typeof setInterval> | undefined;

export interface Disposable {
  dispose(): void;
}

/**
 * Increment the active server count. Returns a `Disposable` whose
 * `dispose()` decrements the count and, when it reaches zero,
 * unrefs the keep-alive timer.
 */
export function acquire(): Disposable {
  activeServers += 1;

  if (activeServers === 1) {
    // 2^31 - 1 ms ~ 24.8 days — effectively infinite.
    keepAliveTimer = setInterval(() => {
      /* keep-alive tick */
    }, 0x7fffffff);
  }

  let disposed = false;
  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      release();
    }
  };
}

/**
 * Current number of active servers. Useful for diagnostics / tests.
 */
export function activeServerCount(): number {
  return activeServers;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function release(): void {
  if (activeServers <= 0) {
    return;
  }

  activeServers -= 1;

  if (activeServers === 0 && keepAliveTimer !== undefined) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = undefined;
  }
}
