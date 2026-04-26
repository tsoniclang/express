---
title: Getting Started
---

# Getting Started

The normal stack is:

```bash
tsonic init --surface @tsonic/js
tsonic add npm @tsonic/nodejs
tsonic add npm @tsonic/express
tsonic restore
```

Then author a normal Express-style app:

```ts
import { express } from "@tsonic/express/index.js";

export async function main(): Promise<void> {
  const app = express.create();

  app.get("/", async (_req, res, _next) => {
    res.send("hello");
  });

  app.get("/health", async (_req, res, _next) => {
    res.json({ ok: true });
  });

  app.listen(3000, "127.0.0.1");
}
```

## Why `@tsonic/nodejs` is part of the stack

`@tsonic/express` sits on top of the JS + Node authored package story:

- `@tsonic/js` supplies the ambient JS world
- `@tsonic/nodejs` supplies Node-style modules and server substrate
- `@tsonic/express` supplies routing, middleware, request/response helpers, and
  application semantics

## Practical expectation

Think of Express as one package you install and author against.

Application code imports the public Express surface from
`@tsonic/express/index.js`; host details remain package implementation details.
