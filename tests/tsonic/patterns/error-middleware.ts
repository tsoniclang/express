import { express } from "@tsonic/express/index.js";

const app = express.create();
app.get("/error", async () => {
  throw new Error("route failure");
});
app.get("/stop", (_request, response) => {
  response.send("stopped");
  server.close();
});
app.useError((error, _request, response) => {
  response.status(500).send(error instanceof Error ? error.message : "failure");
});

const server = app.listen(0, "127.0.0.1", () => {
  if (server.port === undefined) {
    throw new Error("server did not report its bound port");
  }
  console.log(`TSONIC_EXPRESS_PORT:${server.port}`);
});
