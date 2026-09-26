---
title: Express Package
---

# `@tsonic/express`

`@tsonic/express` is the canonical Express-style package for Tsonic.

## Package model

- `@tsonic/express` is the package application code depends on.
- The package is ordinary ESM TypeScript source, exported through `package.json`.
- Applications select `surfaces: ["js"]` and install the Node capability for
  their target. Imports remain `@tsonic/express`.
- The package owns routing, middleware, request helpers, response helpers, and
  HTTP hosting integration.

## Quick start

```bash
npm create tsonic@latest my-app -- --target csharp --surface js
cd my-app
npm install --save-dev @tsonic/csharp-nodejs@^0.1.0
npm install @tsonic/express
npm start
```

```ts
import { express } from "@tsonic/express/index.js";

const app = express.create();
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.listen(3000, "127.0.0.1");
```

This entrypoint is for a C# executable. A Rust binary uses an exported
`main(): void` function around the same setup.

## Typical stack

For Node/HTTP-style applications, the normal authored stack is:

- `surfaces: ["js"]` in `tsonic.json`
- the target's `@tsonic/*-nodejs` package
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
