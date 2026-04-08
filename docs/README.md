---
title: Express Package
---

# `@tsonic/express`

`@tsonic/express` is the canonical Express-style package for Tsonic.

## Current position

This package replaces the older public multi-repo packaging story that used to
describe Express through more than one public layer.

The active documentation model is simple:

- `@tsonic/express` is the package users depend on
- it is a first-party `tsonic-source-package`
- it lives alongside `@tsonic/js` and `@tsonic/nodejs`

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

## What it covers

The package owns:

- router pipeline
- route chaining
- mount/export behavior
- param handlers
- application settings and render hooks
- core response helpers
- host-bound request handling in the same canonical package
