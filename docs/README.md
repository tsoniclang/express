---
title: Express Package
---

# `@tsonic/express`

`@tsonic/express` is the canonical Express-style package for Tsonic.

## Package model

- `@tsonic/express` is the package application code depends on.
- The package is a first-party `tsonic-source-package`.
- Applications use it with the `@tsonic/js` surface and `@tsonic/nodejs`.
- The package owns routing, middleware, request helpers, response helpers, and
  HTTP hosting integration.

## Quick start

```bash
tsonic init --surface @tsonic/js
tsonic add npm @tsonic/nodejs
tsonic add npm @tsonic/express
tsonic run
```

```ts
import { express } from "@tsonic/express/index.js";

export async function main(): Promise<void> {
  const app = express.create();
  app.get("/health", async (_req, res, _next) => {
    res.json({ ok: true });
  });
  app.listen(3000, "127.0.0.1");
}
```

## Typical stack

For Node/HTTP-style applications, the normal authored stack is:

- `@tsonic/js`
- `@tsonic/nodejs`
- `@tsonic/express`

## Pages

- [Getting Started](getting-started.md)
- [Runtime Model](runtime-model.md)
- [Implementation Scope](implementation-scope.md)

## What it covers

The package owns:

- router pipeline
- route chaining
- mount/export behavior
- param handlers
- application settings and render hooks
- core response helpers
- host-bound request handling in the same canonical package
