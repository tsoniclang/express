import { express } from "@tsonic/express/index.js";

let started = false;

export function main(): void {
  if (started) return;
  started = true;

  const app = express.create();
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });
  app.get("/stop", (_request, response) => {
    response.send("stopped");
    server.close();
  });

  const server = app.listen(0, "127.0.0.1", () => {
    if (server.port === undefined) {
      throw new Error("server did not report its bound port");
    }
    console.log(`TSONIC_EXPRESS_PORT:${server.port}`);
  });
}

main();
