import { express } from "@tsonic/express/index.js";

let started = false;

export function main(): void {
  if (started) return;
  started = true;

  const app = express.create();
  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });
  app.param("id", (request, _response, next, value) => {
    request.params.set("checked", value);
    return next();
  });
  app.get("/users/:id", (request, response) => {
    response.send(`user:${request.params.get("id")}:${request.params.get("checked")}`);
  });
  app.get("/route", async (_request, _response, next) => {
    await next("route");
  }, (_request, response) => response.send("unreachable"));
  app.get("/route", (_request, response) => response.send("selected"));
  const child = express.create();
  child.get("/child", (_request, response) => response.send("mounted"));
  app.use("/mounted", child);
  app.get("/cookie", (_request, response) => {
    response.cookie("token", "native", { httpOnly: true, sameSite: "strict" });
    response.send("cookie");
  });
  app.get("/jsonp", (_request, response) => response.jsonp({ ok: true }));
  app.engine("native", (_view, _locals, callback) => callback(null, "rendered"));
  app.set("view engine", "native");
  app.get("/render", (_request, response) => response.render("proof.native"));
  app.use("/assets", express.static("assets", { fallthrough: false }));
  app.post("/upload", express.multipart({ maxFileSizeBytes: 8 }).single("file"), async (request, response) => {
    const file = request.file;
    if (file === undefined) throw new Error("missing upload");
    response.send(await file.text());
  });
  app.get("/failure", () => { throw new Error("route failure"); });
  app.get("/stop", (_request, response) => {
    response.send("stopped");
    server.close();
  });
  app.useError((error, _request, response) => {
    response.status(500).send(error instanceof Error ? error.message : "unexpected failure");
  });

  const server = app.listen(0, "127.0.0.1", () => {
    if (server.port === undefined) {
      throw new Error("server did not report its bound port");
    }
    console.log(`TSONIC_EXPRESS_PORT:${server.port}`);
  });
}

main();
