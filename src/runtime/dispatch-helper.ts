import type { Application } from "./application.js";
import type { TransportContext } from "./types.js";

export async function dispatch(app: Application, context: TransportContext): Promise<void> {
  await app.handle(context, app);
}
