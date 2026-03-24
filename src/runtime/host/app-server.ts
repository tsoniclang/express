type CloseCallback = (error?: Error) => void;
type CloseAction = (callback?: CloseCallback) => void;

/**
 * Represents a running server instance returned by `app.listen()`.
 *
 * Mirrors the Express `Server` surface: `port`, `host`, `path`,
 * `listening`, and `close()`.
 */
export class AppServer {
  readonly #closeAction: CloseAction | undefined;
  #port: number | undefined;
  host: string | undefined;
  path: string | undefined;

  #listening: boolean;

  /** @internal */
  constructor(
    port: number | undefined,
    host: string | undefined,
    path: string | undefined,
    closeAction?: CloseAction
  ) {
    this.#port = port;
    this.host = host;
    this.path = path;
    this.#closeAction = closeAction;
    this.#listening = true;
  }

  get port(): number | undefined {
    return this.#port;
  }

  get listening(): boolean {
    return this.#listening;
  }

  /** @internal */
  updateBinding(
    port: number | undefined,
    host: string | undefined,
    path: string | undefined
  ): void {
    this.#port = port;
    this.host = host;
    this.path = path;
  }

  close(callback?: (error?: Error) => void): void {
    if (!this.#listening) {
      if (callback) {
        callback(undefined);
      }
      return;
    }

    try {
      if (this.#closeAction) {
        this.#closeAction((error) => {
          if (error) {
            if (callback) {
              callback(error);
            }
            return;
          }

          this.#listening = false;
          if (callback) {
            callback(undefined);
          }
        });
        return;
      }

      this.#listening = false;
      if (callback) {
        callback(undefined);
      }
    } catch (ex) {
      if (callback) {
        callback(
          ex instanceof Error ? ex : new Error(String(ex))
        );
      }
    }
  }
}
