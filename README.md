# `@tsonic/express`

Express-style routing and middleware for Tsonic applications.

`@tsonic/express` is a first-party Tsonic source package. It is authored in
TypeScript, consumed through `tsonic.package.json`, and used with the
`@tsonic/js` surface plus `@tsonic/nodejs`.

## Install

```bash
tsonic init --surface @tsonic/js
tsonic add npm @tsonic/nodejs
tsonic add npm @tsonic/express
tsonic restore
```

## Quick start

```ts
import { express } from "@tsonic/express/index.js";

export async function main(): Promise<void> {
  const app = express.create();

  app.get("/", async (_req, res, _next) => {
    res.send("hello");
  });

  app.listen(3000, "127.0.0.1");
}
```

## Runtime model

The package owns the Express-style application model directly:

- application and router construction
- route registration and route chaining
- middleware and error-middleware dispatch
- mounted routers and mounted applications
- route parameter handlers
- request helpers for params, query, cookies, files, headers, and body
- response helpers such as `status`, `send`, `json`, `jsonp`, `cookie`,
  `redirect`, `render`, and `sendFile`
- bundled middleware for JSON, URL-encoded bodies, cookies, CORS, static files,
  and multipart uploads
- live `listen(...)` hosting through the Node-style package stack

The public package is a source package, not a generated CLR binding package.

## Imports

Use explicit ESM subpaths:

```ts
import { express, Router } from "@tsonic/express/index.js";
import type { Request, Response, NextFunction } from "@tsonic/express/index.js";
```

## Validation

```bash
npm run selftest
```

The selftest builds the TypeScript package, runs runtime tests, and compiles a
Tsonic source-package fixture.

## Documentation

- `docs/getting-started.md`
- `docs/runtime-model.md`
- `docs/implementation-scope.md`

## License

MIT
