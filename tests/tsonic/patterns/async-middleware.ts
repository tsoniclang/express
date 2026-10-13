import { express } from "@tsonic/express/index.js";

const app = express.create();
app.use(async (_request, _response, next) => {
  await next();
});
app.get("/ok", (_request, response) => {
  response.send("ok");
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
