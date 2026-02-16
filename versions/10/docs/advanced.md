# Advanced usage (`@tsonic/express`)

This doc covers patterns that go beyond “hello world”.

For known compatibility gaps vs Express/Node, see `docs/deviations.md`.

## Routers

Use routers to structure your app:

```ts
import { express } from "@tsonic/express/index.js";

export function main(): void {
  const app = express.create();

  const api = express.Router();
  api.get("/health", (_req, res) => res.send("ok"));

  app.use("/api", api);
  app.listen(3000);
}
```

## Middleware ordering

Middlewares run in the order you register them:

```ts
app.use((req, _res, next) => {
  // pre
  next();
  // post
});
```

## Error middleware

Error handlers have `(err, req, res, next)` shape:

```ts
app.useError((err, _req, res, _next) => {
  res.status(500).json({ error: `${err}` });
});
```

## Handler return types (sync vs async)

Handlers can be synchronous:

```ts
app.get("/", (_req, res) => {
  res.send("ok");
});
```

Or `async`:

```ts
app.get("/slow", async (_req, res) => {
  // await something
  res.send("done");
});
```

## Body parsing options

The built-in body parsers return request handlers:

```ts
app.use(express.json());
app.use(express.urlencoded());
app.use(express.text());
app.use(express.raw());
```

Most options types are exported from `@tsonic/express/index.js`:

```ts
import { express, JsonOptions } from "@tsonic/express/index.js";

const json = new JsonOptions();
// set options here
app.use(express.json(json));
```

## Static files

```ts
app.use(express.static("./public"));
```

## Response helpers

Common response patterns:

```ts
res.status(200).json({ ok: true });
res.sendStatus(204);
res.redirect("/login");
res.set("x-powered-by", "tsonic");
```

## Cookies

```ts
res.cookie("sid", "abc123");
res.clearCookie("sid");
```
