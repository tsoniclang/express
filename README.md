# @tsonic/express

Express-style HTTP server APIs for **Tsonic**.

This package is part of Tsonic: https://tsonic.org.

Use this package to write Express-like apps in TypeScript and compile them to native binaries with `tsonic`.

## Prerequisites

- Install the .NET 10 SDK (required by Tsonic): https://dotnet.microsoft.com/download
- Verify: `dotnet --version`

## Quick Start (new project)

```bash
mkdir my-api && cd my-api
npx --yes tsonic@latest init

# Install Express runtime + bindings (installs required ASP.NET Core deps too)
npx --yes tsonic@latest add npm @tsonic/express

# Replace the default App.ts with a minimal API
cat > packages/my-api/src/App.ts <<'EOF'
import { express } from "@tsonic/express/index.js";

export function main(): void {
  const app = express.create();

  app.get("/", async (_req, res, _next) => {
    res.json({ ok: true });
  });

  app.listen(3000);
}
EOF

npm run dev
```

Then open `http://localhost:3000/`.

## Hello World

```ts
// packages/my-api/src/App.ts
import { express } from "@tsonic/express/index.js";

export function main(): void {
  const app = express.create();

  app.get("/", async (_req, res, _next) => {
    res.send("hello");
  });

  app.listen(3000);
}
```

## Basic API Surface

## Handler model (important)

This package is **Task-first** (like ASP.NET): route handlers and middleware should be written as **`async`** functions (even if you don't `await` anything).

This avoids “async-void” behavior and keeps execution/exception semantics deterministic.

Also, handlers use the **3-argument** signature: `(req, res, next)` (even for routes). If you don't need `next`, name it `_next`.

### Create an app / router

```ts
import { express } from "@tsonic/express/index.js";

const app = express.create();
const router = express.Router();

router.get("/ping", async (_req, res, _next) => {
  res.send("pong");
});

app.use("/api", router);
```

### Routing

Common verbs:

```ts
app.get("/health", async (_req, res, _next) => {
  res.send("ok");
});
app.post("/items", async (req, res, _next) => {
  res.json(req.body);
});
app.put("/items/:id", async (req, res, _next) => {
  res.send(req.params["id"] ?? "");
});
app.delete("/items/:id", async (_req, res, _next) => {
  res.sendStatus(204);
});
app.patch("/items/:id", async (_req, res, _next) => {
  res.sendStatus(204);
});
app.all("/anything", async (_req, res, _next) => {
  res.send("matched");
});
```

### Middleware

```ts
app.use(async (req, _res, next) => {
  // Do something with req
  await next();
});
```

### CORS

```ts
app.use(express.cors());

```

### Cookies

```ts
app.get("/set-cookie", async (_req, res, _next) => {
  res.cookie("sid", "abc");
  res.send("ok");
});

app.get("/read-cookie", async (req, res, _next) => {
  res.json({ sid: req.cookies["sid"] });
});
```

Error middleware:

```ts
app.useError(async (err, _req, res, _next) => {
  res.status(500).json({ error: `${err}` });
});
```

### Request / Response

`Request` highlights:

- `req.method`, `req.path`, `req.originalUrl`
- `req.query`, `req.params`, `req.cookies`, `req.signedCookies`
- `req.body` (when using body parsers)
- `req.get(name)` / `req.header(name)`

`Response` highlights:

- `res.status(code)`
- `res.send(body)`, `res.json(body)`, `res.sendStatus(code)`
- `res.redirect(path)` / `res.redirect(status, path)`
- `res.set(name, value)` / `res.header(name, value)`
- `res.cookie(name, value, options)` / `res.clearCookie(name, options)`

### Body parsing

```ts
app.use(express.json());
app.use(express.urlencoded());
app.use(express.text());
app.use(express.raw());

```

### Multipart / file uploads

```ts
const upload = express.multipart();

app.post("/upload", upload.single("avatar"), async (req, res, _next) => {
  res.json({
    filename: req.file?.originalname,
    fields: req.body,
  });
});
```

### Static files

```ts
app.use(express.static("./public"));

```

### Listen / close

```ts
const server = app.listen(3000);
server.close();

```

## Advanced docs

- [docs/advanced.md](docs/advanced.md) (routers, handlers, middleware patterns)
- [docs/deviations.md](docs/deviations.md) (known compatibility gaps / parity notes)
- [docs/generation.md](docs/generation.md) (how this package is generated)

## Versioning Model

This repo is versioned by runtime major:

- `10` -> `versions/10/` -> npm `@tsonic/express@10.x`

## License

MIT

